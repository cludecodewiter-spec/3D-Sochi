// data/ を app/public/data へコピーする（Vite の publicDir はプロジェクト外を参照できないため）。
//
// ここで 2 つ加工する:
//
//  1. ocrText を落とす。
//     スキャン問題の OCR テキストは名寄せ・検索・解説作成のための作業用データで、
//     出題時に表示することは無い。付けたまま配ると題庫の転送量が倍になる。
//
//  2. bank.json を作る。
//     回ごとのシャードは出典を追いやすいので取り込み側では正しい形だが、
//     アプリが 100 本近いファイルを順に読むと開始が遅い。
//     名寄せ済みの一意な問題だけを 1 本にまとめておけば、
//     取得は 1 回で済む（gzip で 130KB 程度）。
import { cp, rm, mkdir, access, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../data');
const dest = resolve(here, '../public/data');

try {
  await access(src);
} catch {
  console.log('[copy-data] data/ が無いためスキップ（問題取り込み前）');
  process.exit(0);
}

await rm(dest, { recursive: true, force: true });
await mkdir(dirname(dest), { recursive: true });
await cp(src, dest, {
  recursive: true,
  // pdf-cache と probe は取り込み作業の中間生成物で、アプリからは使わない
  filter: (p) => !/\/(pdf-cache|quarantine|probe|discovery-raw\.json)/.test(p),
});

// ---- 問題ファイルから ocrText を落とし、一意な問題を 1 本にまとめる

const DERIVED = new Set(['index.json', 'dedup.json', 'bank.json', 'manifest.json']);
const qDir = `${dest}/questions`;

let files = [];
try {
  files = (await readdir(qDir)).filter((f) => f.endsWith('.json') && !DERIVED.has(f));
} catch {
  console.log('[copy-data] 問題ファイルがまだありません');
  process.exit(0);
}

const byId = new Map();
for (const f of files) {
  const questions = JSON.parse(await readFile(`${qDir}/${f}`, 'utf8'));
  const stripped = questions.map(({ ocrText, ...rest }) => rest);
  await writeFile(`${qDir}/${f}`, JSON.stringify(stripped));
  for (const q of stripped) byId.set(q.id, q);
}

let dedup = { groups: [] };
try {
  dedup = JSON.parse(await readFile(`${qDir}/dedup.json`, 'utf8'));
} catch {
  // 名寄せ前でも動く（全問がそのまま出題対象になるだけ）
}

const duplicateIds = new Set();
const extra = new Map();
for (const g of dedup.groups ?? []) {
  for (const d of g.duplicates) duplicateIds.add(d.id);
  extra.set(g.canonical, {
    frequency: g.frequency,
    appearances: g.duplicates.map((d) => ({ label: d.label, questionPdf: d.questionPdf, page: d.page })),
  });
}

const bank = [];
for (const q of byId.values()) {
  if (duplicateIds.has(q.id)) continue;
  const e = extra.get(q.id);
  bank.push(e ? { ...q, frequency: e.frequency, appearances: e.appearances } : q);
}
// 並びを固定しておくと、差分が読みやすく、キャッシュも効きやすい
bank.sort((a, b) => a.id.localeCompare(b.id));

await writeFile(
  `${qDir}/bank.json`,
  JSON.stringify({ generatedAt: new Date().toISOString(), total: bank.length, questions: bank }),
);

console.log(`[copy-data] ${src} -> ${dest}`);
console.log(`[copy-data] bank.json: ${bank.length} 問（名寄せ前 ${byId.size} 問）`);
