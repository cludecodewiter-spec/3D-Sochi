/**
 * スキャン PDF から「問N」を拾う部分のテスト。
 * OCR そのものは動かせないので、tesseract が返す単語ボックスを模して検証する。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { anchorsFromWords, longestIncreasing, usableAnchors } from './lib/anchors.mjs';

const word = (text, x, y, w = 40, h = 30, conf = 90) => ({ text, x, y, w, h, conf });
const nos = (arr) => arr.map((a) => a.no);

test('1 語の「問12」を拾える', () => {
  const got = anchorsFromWords([word('問12', 60, 100), word('次の', 200, 100)], 700);
  assert.deepEqual(nos(got), [12]);
});

test('「問」と番号が別の語に割れていても拾える', () => {
  const got = anchorsFromWords([word('問', 60, 100, 30), word('3', 95, 100, 20)], 700);
  assert.deepEqual(nos(got), [3]);
});

test('全角数字でも拾える', () => {
  assert.deepEqual(nos(anchorsFromWords([word('問１', 60, 100)], 700)), [1]);
});

test('OCR が「問」を「間」と誤読しても拾える', () => {
  assert.deepEqual(nos(anchorsFromWords([word('間25', 60, 100)], 700)), [25]);
});

test('左マージンから離れた「問1」は拾わない（本文中の参照）', () => {
  const got = anchorsFromWords([word('問1', 600, 100)], 700);
  assert.deepEqual(nos(got), []);
});

test('ありえない番号は拾わない', () => {
  assert.deepEqual(nos(anchorsFromWords([word('問523', 60, 100)], 700)), []);
});

test('同じ番号が近い位置で二重に出たらまとめる', () => {
  const got = anchorsFromWords([word('問7', 60, 100), word('問7', 62, 110)], 700);
  assert.deepEqual(nos(got), [7]);
});

test('longestIncreasing は OCR の誤読を落とす', () => {
  const mk = (list) => list.map((no, i) => ({ no, y: i }));
  assert.deepEqual(nos(longestIncreasing(mk([1, 2, 3, 64, 4, 5, 6]))), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(nos(longestIncreasing(mk([1, 1, 3, 6, 7]))), [1, 3, 6, 7]);
  assert.deepEqual(longestIncreasing([]), []);
});

test('usableAnchors は連番のペアだけを採用する', () => {
  const mk = (list) => list.map((no, i) => ({ no, y: i, page: 1 }));
  // 3 の次が 5、5 の次が 7 なので、そのまま切ると 4 や 6 を巻き込む → 3 と 5 は不採用。
  // 8 は最終問なので次が無くても採用してよい。
  const r = usableAnchors(mk([1, 2, 3, 5, 7, 8]), 8);
  assert.deepEqual(nos(r.usable ?? []), [1, 2, 7, 8]);
});

test('usableAnchors は最終問だけ次が無くても採用する', () => {
  const mk = (list) => list.map((no, i) => ({ no, y: i, page: 1 }));
  const r = usableAnchors(mk([1, 2, 3]), 3);
  assert.ok(r.ok);
  assert.deepEqual(nos(r.usable), [1, 2, 3]);
});

test('usableAnchors は取れ高が低すぎる回を落とす', () => {
  const mk = (list) => list.map((no, i) => ({ no, y: i, page: 1 }));
  const r = usableAnchors(mk([1, 2]), 80);
  assert.equal(r.ok, false);
});

test('後ろに本文が続く「問53メモリ」も拾える', () => {
  assert.deepEqual(nos(anchorsFromWords([word('問53メモリインタリーブ', 60, 100)], 700)), [53]);
});

test('「問1」の次に本文の数字が来ても、繋げて誤読しない', () => {
  // 「問1」「16 進小数…」を連結すると 問116 になってしまうのを防ぐ
  const got = anchorsFromWords([word('問1', 60, 100, 40), word('16', 110, 100, 30)], 700);
  assert.deepEqual(nos(got), [1]);
});

test('「問」だけの語の右に本文の数字があっても、離れていれば拾わない', () => {
  const got = anchorsFromWords([word('問', 60, 100, 30), word('16', 500, 100, 30)], 700);
  assert.deepEqual(nos(got), []);
});

test('実際の OCR 出力から 問1 を拾い、見出しの「問1から問50まで」は拾わない', async () => {
  const fx = JSON.parse(await readFile('tools/fixtures/ocr-page3-strip.json', 'utf8'));
  const got = anchorsFromWords(fx.words, fx.stripWidth);
  assert.deepEqual(nos(got), [1]);

  // 本文マージン(x=241)ではなく字下げされた見出し(x=304)を拾っていないこと
  assert.equal(got[0].x, 241);
});
