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
 *   - 同一判定そのものは tools/lib/similarity.mjs に置き、
 *     人手でラベル付けした実データ（tools/fixtures/dedup-pairs.json）で
 *     しきい値を検証している。tools/dedup.test.mjs 参照。
 *   - 画像経路の問題は OCR テキストで比較する。
 *   - 迷ったら「別問題」に倒す。重複が残るのは実害が小さいが、
 *     誤った統合は本物の問題を練習から消してしまう。
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { isSamePrepared, prepare, DEFAULT_THRESHOLDS } from './lib/similarity.mjs';

const DIR = 'data/questions';

/**
 * 比較に使う原文。正規化はしない
 * （問題文と選択肢の切り分けに改行が要るため、similarity.mjs 側で行う）
 */
function comparableText(q) {
  if (q.format === 'text') {
    return [q.body, ...Object.entries(q.choices ?? {}).map(([k, v]) => `${k}${v}`)].join('\n');
  }
  return q.ocrText ?? '';
}

async function main() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.json') && !['index.json', 'dedup.json'].includes(f));
  const all = [];
  for (const f of files) {
    for (const q of JSON.parse(await readFile(`${DIR}/${f}`, 'utf8'))) all.push(q);
  }
  console.log(`対象: ${all.length} 問`);

  // 比較材料は 1 問につき一度だけ作る（総当たりは 100 万組を超える）
  const items = all.map((q) => {
    const text = comparableText(q);
    const prep = prepare(text);
    return { q, text, prep, len: prep.full.length };
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
    const norm = it.prep.full;
    const prev = exactMap.get(norm);
    if (prev) union(prev, it.q.id);
    else exactMap.set(norm, it.q.id);
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
        // 正解が違えば別問題。ここで落としておくと比較回数もかなり減る
        if (a.q.answer !== b.q.answer) continue;
        if (isSamePrepared(a.prep, b.prep)) {
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

  // 比較ロジックが壊れると「全部同じ問題」と判定して題庫を半分に削りかねない。
  // そうなったら書き出さずに失敗させる。
  const mergeRatio = all.length ? duplicates / all.length : 0;
  if (mergeRatio > 0.6) {
    console.error(
      `統合しすぎです: ${duplicates}/${all.length} 問 (${Math.round(mergeRatio * 100)}%)。` +
        '比較ロジックを確認してください。dedup.json は更新しません。',
    );
    process.exit(1);
  }

  await writeFile(`${DIR}/dedup.json`, JSON.stringify(dedup, null, 1));
  console.log(`完全一致＋類似で ${dedup.groups.length} グループ、重複 ${duplicates} 問`);
  console.log(`類似判定による統合: ${fuzzyPairs} 組（${JSON.stringify(DEFAULT_THRESHOLDS)}）`);
  console.log(`名寄せ後の一意な問題数: ${all.length - duplicates} 問`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
