#!/usr/bin/env node
/**
 * 同一問題の名寄せ。
 *
 * 修了試験は「60% 以上が本試験の過去問そのまま」と IPA 自身が説明しているため、
 * 名寄せしないと同じ問題が何度も出題される。
 *
 * 方針:
 *   - 問題ファイルは書き換えない。名寄せ結果は data/questions/dedup.json に出す。
 *     （元データの出典をそのまま残しておきたいため）
 *   - 正規化テキストが完全一致 → 同一問題
 *   - 3-gram の Jaccard 係数が高く、かつ正解が同じ → 同一問題
 *   - 画像経路の問題は OCR テキストで比較する。OCR は誤読するので閾値は高めにする。
 *     迷ったら「別問題」に倒す（重複が残るのは実害が小さいが、誤った統合は問題を消してしまう）
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';

const DIR = 'data/questions';
const EXACT_THRESHOLD = 1;
const FUZZY_THRESHOLD = Number(process.env.DEDUP_THRESHOLD ?? 0.9);

/** 比較用に、表記ゆれ・OCR が壊しやすい要素を落とす */
export function normalizeForCompare(s) {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .replace(/[\s　]/g, '')
    .replace(/[，、,．。.・:：;；()（）「」『』【】\[\]{}"'’”“?？!！~〜ー\-—–_/／\\|]/g, '');
}

export function trigrams(s) {
  const out = new Set();
  for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3));
  return out;
}

export function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const g of small) if (large.has(g)) inter++;
  return inter / (a.size + b.size - inter);
}

function comparableText(q) {
  if (q.format === 'text') {
    return normalizeForCompare(q.body + Object.values(q.choices ?? {}).join(''));
  }
  return normalizeForCompare(q.ocrText ?? '');
}

async function main() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.json') && !['index.json', 'dedup.json'].includes(f));
  const all = [];
  for (const f of files) {
    for (const q of JSON.parse(await readFile(`${DIR}/${f}`, 'utf8'))) all.push(q);
  }
  console.log(`対象: ${all.length} 問`);

  const items = all.map((q) => {
    const text = comparableText(q);
    return { q, text, grams: trigrams(text), len: text.length };
  });

  // 比較回数を抑えるため、正解と長さでバケット分けする
  const buckets = new Map();
  for (const it of items) {
    if (it.len < 20) continue; // 比較材料が乏しいものは名寄せしない
    for (const d of [-1, 0, 1]) {
      const key = `${it.q.answer}:${Math.round(it.len / 40) + d}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(it);
    }
  }

  // Union-Find
  const parent = new Map(items.map((it) => [it.q.id, it.q.id]));
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const exactMap = new Map();
  for (const it of items) {
    if (it.len < 20) continue;
    const prev = exactMap.get(it.text);
    if (prev) union(prev, it.q.id);
    else exactMap.set(it.text, it.q.id);
  }

  let fuzzyPairs = 0;
  const seenPair = new Set();
  for (const bucket of buckets.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i];
        const b = bucket[j];
        if (a.q.id === b.q.id) continue;
        const pairKey = a.q.id < b.q.id ? `${a.q.id}|${b.q.id}` : `${b.q.id}|${a.q.id}`;
        if (seenPair.has(pairKey)) continue;
        seenPair.add(pairKey);
        if (find(a.q.id) === find(b.q.id)) continue;
        if (a.q.answer !== b.q.answer) continue;
        const sim = jaccard(a.grams, b.grams);
        if (sim >= FUZZY_THRESHOLD && sim < EXACT_THRESHOLD + 1) {
          union(a.q.id, b.q.id);
          fuzzyPairs++;
        }
      }
    }
  }

  // グループ化
  const groups = new Map();
  for (const it of items) {
    const root = find(it.q.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(it.q);
  }

  const dedup = { generatedAt: new Date().toISOString(), groups: [] };
  let duplicates = 0;
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    // 表示品質が高い順（テキスト経路優先）、次に新しい回を代表にする
    members.sort((a, b) => {
      if (a.format !== b.format) return a.format === 'text' ? -1 : 1;
      return (b.exam.year ?? 0) - (a.exam.year ?? 0);
    });
    const [canonical, ...rest] = members;
    duplicates += rest.length;
    dedup.groups.push({
      canonical: canonical.id,
      frequency: members.length,
      duplicates: rest.map((m) => ({ id: m.id, label: m.source.label, questionPdf: m.source.questionPdf, page: m.source.page })),
    });
  }

  await writeFile(`${DIR}/dedup.json`, JSON.stringify(dedup, null, 1));
  console.log(`完全一致＋類似で ${dedup.groups.length} グループ、重複 ${duplicates} 問`);
  console.log(`類似判定による統合: ${fuzzyPairs} 組（閾値 ${FUZZY_THRESHOLD}）`);
  console.log(`名寄せ後の一意な問題数: ${all.length - duplicates} 問`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
