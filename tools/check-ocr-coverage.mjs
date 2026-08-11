#!/usr/bin/env node
/**
 * 画像経路の問題に OCR テキストが付いているかを確かめる。
 *
 * なぜ要るか:
 *   一度、シャードの成果物をまとめる段階で 4,868 問中 4,086 問ぶんの OCR 結果を
 *   取りこぼしたのに、ワークフローは緑のまま完走した。
 *   この種の「静かに消える」事故は目視では気付けないので、機械的に落とす。
 */
import { readFile, readdir } from 'node:fs/promises';

const DIR = 'data/questions';
/** OCR できない問題（図版だけ・かすれ）が少しは出るので、そのぶんは許す */
const MIN_COVERAGE = Number(process.env.MIN_OCR_COVERAGE ?? 0.95);

const DERIVED = new Set(['index.json', 'dedup.json', 'manifest.json']);

async function main() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.json') && !DERIVED.has(f));

  let image = 0;
  let withText = 0;
  const worst = [];

  for (const file of files) {
    const questions = JSON.parse(await readFile(`${DIR}/${file}`, 'utf8'));
    const img = questions.filter((q) => q.format === 'image');
    if (img.length === 0) continue;
    const ok = img.filter((q) => typeof q.ocrText === 'string' && q.ocrText.length >= 20);
    image += img.length;
    withText += ok.length;
    if (ok.length < img.length) worst.push({ file, missing: img.length - ok.length, total: img.length });
  }

  if (image === 0) {
    console.log('画像経路の問題がないので確認をスキップします');
    return;
  }

  const coverage = withText / image;
  console.log(`画像問題 ${image} 問中 ${withText} 問に OCR テキストあり (${(coverage * 100).toFixed(1)}%)`);

  if (worst.length > 0) {
    console.log('不足している回:');
    for (const w of worst.sort((a, b) => b.missing - a.missing).slice(0, 15)) {
      console.log(`  ${w.file}: ${w.missing}/${w.total} 問が未取得`);
    }
  }

  if (coverage < MIN_COVERAGE) {
    console.error(
      `\nOCR テキストの網羅率が ${(MIN_COVERAGE * 100).toFixed(0)}% を下回っています。` +
        'シャードの成果物が取りこぼされていないか確認してください。',
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
