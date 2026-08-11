#!/usr/bin/env node
/**
 * 画像経路の問題（スキャン PDF から切り出したもの）に OCR テキストを付ける。
 *
 * なぜ必要か:
 *   IPA は「修了試験の 60% 以上は本試験の過去問そのまま」と説明している。
 *   ところが画像の問題には比較できるテキストが無いため、名寄せが 1 件も動かず、
 *   同じ問題が何度も出題される状態になっていた。
 *
 * なぜページ全体ではなく切り出し画像を OCR するのか:
 *   ページ全体だと 1 回あたり数分かかり、98 回ぶんでは現実的でない。
 *   切り出し画像はページの 1/3 程度なので 1 枚 1〜2 秒で済む。
 *
 * 重要:
 *   ここで得たテキストは名寄せ・検索・解説作成にだけ使う。
 *   出題時に表示するのは常に原本の切り出し画像であって、この OCR 結果ではない。
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { ocrWords, wordsToText } from './lib/ocr.mjs';

const DIR = 'data/questions';
const DATA = 'data';

const SHARD_INDEX = Number(process.env.SHARD_INDEX ?? 0);
const SHARD_TOTAL = Number(process.env.SHARD_TOTAL ?? 1);
/** すでに ocrText がある問題もやり直すか */
const FORCE = process.env.FORCE === '1';
/** 実行時間の上限（秒）。0 で無制限 */
const TIME_BUDGET_SEC = Number(process.env.TIME_BUDGET_SEC ?? 0);

async function main() {
  const files = (await readdir(DIR))
    .filter((f) => f.endsWith('.json') && !['index.json', 'dedup.json', 'manifest.json'].includes(f))
    .sort();

  // 回ごとにシャードを割り当てる（1 ファイルを複数ジョブで書き換えると衝突するため）
  const mine = files.filter((_, i) => i % SHARD_TOTAL === SHARD_INDEX);
  console.log(`担当: ${mine.length} ファイル / 全 ${files.length}`);

  const startedAt = Date.now();
  let done = 0;
  let skipped = 0;
  let failed = 0;
  let touchedFiles = 0;
  let stoppedEarly = false;

  for (const file of mine) {
    if (TIME_BUDGET_SEC && (Date.now() - startedAt) / 1000 > TIME_BUDGET_SEC) {
      console.log(`時間の上限に達したので中断（残り ${mine.length - touchedFiles} ファイル）`);
      stoppedEarly = true;
      break;
    }

    const questions = JSON.parse(await readFile(`${DIR}/${file}`, 'utf8'));
    let changed = false;

    for (const q of questions) {
      if (q.format !== 'image') continue;
      if (!FORCE && q.ocrText) {
        skipped++;
        continue;
      }
      const images = q.images ?? [];
      if (images.length === 0) continue;

      try {
        const parts = [];
        for (const rel of images) {
          const words = await ocrWords(`${DATA}/${rel}`, { psm: '6' });
          const text = wordsToText(words);
          if (text) parts.push(text);
        }
        const ocrText = parts.join('\n').replace(/[ \t]+/g, ' ').trim();
        // 短すぎるものは名寄せの材料にならないうえ、誤検出の元になる
        if (ocrText.length >= 20) {
          q.ocrText = ocrText;
          changed = true;
          done++;
        } else {
          failed++;
        }
      } catch (e) {
        console.log(`  ! ${q.id}: ${String(e).slice(0, 100)}`);
        failed++;
      }
    }

    if (changed) {
      await writeFile(`${DIR}/${file}`, JSON.stringify(questions, null, 1));
      touchedFiles++;
      console.log(`  ${file}: OCR 済み ${done} 問 (累計)`);
    } else {
      touchedFiles++;
    }
  }

  console.log(`\n=== OCR: ${done} 問に付与 / ${skipped} 問はスキップ（既にあり） / ${failed} 問は失敗`);
  if (stoppedEarly) console.log('※ 途中で打ち切ったので、もう一度実行すると続きから進みます');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
