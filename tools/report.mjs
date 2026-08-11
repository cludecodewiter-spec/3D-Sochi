#!/usr/bin/env node
/**
 * 取り込み結果の人間向けレポートを作る。
 *
 * 目的は 2 つ:
 *   1) どの回から何問取れて、何問を隔離したかを一目で分かるようにする
 *   2) 無作為抽出した問題を「公式 PDF の何ページ」と並べて出し、
 *      人が原本と突き合わせて確認できるようにする
 *      （自動検証だけでは「本当に真題か」の最終確認にならないため）
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';

const DIR = 'data/questions';
const SAMPLE_SIZE = Number(process.env.SAMPLE_SIZE ?? 10);

/** 決定的に選ぶ（実行ごとにサンプルが変わると突き合わせ作業がやり直しになる） */
function pickDeterministic(items, n) {
  const sorted = [...items].sort((a, b) => (a.id < b.id ? -1 : 1));
  if (sorted.length <= n) return sorted;
  const step = sorted.length / n;
  return Array.from({ length: n }, (_, i) => sorted[Math.floor(i * step)]);
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function main() {
  const files = (await readdir(DIR).catch(() => [])).filter(
    (f) => f.endsWith('.json') && !['index.json', 'dedup.json'].includes(f),
  );
  const all = [];
  for (const f of files) all.push(...(await readJson(`${DIR}/${f}`, [])));

  const index = await readJson(`${DIR}/index.json`, { shards: [], totalQuestions: 0 });
  const dedup = await readJson(`${DIR}/dedup.json`, { groups: [] });
  const rejected = await readJson('data/quarantine/validate-rejected.json', []);
  const textQuarantine = await readJson('data/quarantine/text-route.json', []);
  const imageQuarantine = await readJson('data/quarantine/image-route.json', []);
  const imageReport = await readJson('data/probe/image-route-report.json', []);
  const scan = await readJson('data/probe/text-scan.json', []);

  const duplicates = dedup.groups.reduce((n, g) => n + g.duplicates.length, 0);
  const unique = all.length - duplicates;
  const byPool = {};
  const byFormat = {};
  for (const q of all) {
    byPool[q.pool] = (byPool[q.pool] ?? 0) + 1;
    byFormat[q.format] = (byFormat[q.format] ?? 0) + 1;
  }

  const lines = [];
  const p = (s = '') => lines.push(s);

  p('# 取り込みレポート');
  p();
  p(`生成: ${new Date().toISOString()}`);
  p();
  p('## 収録数');
  p();
  p('| 指標 | 値 |');
  p('|---|---|');
  p(`| 収録問題数（名寄せ前） | ${all.length} |`);
  p(`| 重複として統合された問題 | ${duplicates} |`);
  p(`| **出題される一意な問題数** | **${unique}** |`);
  p(`| 取り込んだ回数 | ${index.shards.length} |`);
  p();
  p('プール別: ' + Object.entries(byPool).map(([k, v]) => `${k}=${v}`).join(' / '));
  p('形式別: ' + Object.entries(byFormat).map(([k, v]) => `${k}=${v}`).join(' / '));
  p();

  p('## 回ごとの取り込み状況');
  p();
  p('| 回 | プール | 取り込み |');
  p('|---|---|---|');
  for (const s of [...index.shards].sort((a, b) => (a.file < b.file ? -1 : 1))) {
    p(`| ${s.examKey} | ${s.pool} | ${s.count} 問 |`);
  }
  p();

  p('## 隔離（出題しなかったもの）');
  p();
  const scanImage = scan.filter((s) => s.ok && s.role === 'questions' && s.route === 'image').length;
  p(`- スキャン PDF（画像経路）の問題冊子: ${scanImage} 本`);
  p(`- 画像経路で不採用になった回: ${imageReport.filter((r) => !r.ok).length} / ${imageReport.length}`);
  p(`- テキスト経路の隔離レコード: ${textQuarantine.length}`);
  p(`- 画像経路の隔離レコード: ${imageQuarantine.length}`);
  p(`- 検証ゲートで除外した問題: ${rejected.length}`);
  if (rejected.length) {
    const byReason = {};
    for (const r of rejected) {
      const key = r.problems[0].split('(')[0].trim();
      byReason[key] = (byReason[key] ?? 0) + 1;
    }
    p();
    for (const [reason, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
      p(`  - ${n} 問: ${reason}`);
    }
  }
  p();

  p('## 目視確認用サンプル');
  p();
  p('以下の問題を IPA 公式 PDF の該当ページと突き合わせてください。');
  p('自動検証は「形が整っているか」しか見ていないので、内容が本物かの確認はここで行います。');
  p();
  for (const q of pickDeterministic(all, SAMPLE_SIZE)) {
    p(`### ${q.id}`);
    p();
    p(`- ${q.source.label}`);
    p(`- 公式PDF: ${q.source.questionPdf} の **${q.source.page} ページ**`);
    p(`- 解答例PDF: ${q.source.answerPdf ?? '-'}`);
    p(`- 正解: **${q.answer}**`);
    if (q.format === 'text') {
      p();
      p('```');
      p(q.body ?? '');
      for (const k of ['ア', 'イ', 'ウ', 'エ']) p(`${k} ${q.choices?.[k] ?? ''}`);
      p('```');
    } else {
      p(`- 切り出し画像: ${(q.images ?? []).join(', ')}`);
    }
    p();
  }

  const md = lines.join('\n');
  await writeFile('data/import-report.md', md);
  console.log(md.slice(0, 4000));
  console.log(`\n(全文は data/import-report.md)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
