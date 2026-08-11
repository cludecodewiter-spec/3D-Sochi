/**
 * 名寄せの判定を、手作業でラベル付けした実データで確かめる。
 *
 * tools/fixtures/dedup-pairs.json は、実際に取り込んだ問題から
 * 類似度の各帯域を満遍なく抜き出し、両方の原文を読んで
 * 「同じ問題か」を 1 組ずつ人手で判定したもの。
 * 判断が割れる組（選択肢も答えも同じで問い方だけ違う、など）は
 * しきい値をどちらにも引っ張らないよう、最初から入れていない。
 *
 * ここで守りたいのは精度であって再現率ではない。
 * 誤って統合すると本物の問題が練習から消えるが、
 * 取りこぼしても似た問題がもう一度出るだけで済むため。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isSameQuestion,
  similarity,
  questionStem,
  stripFormulaicTail,
  normalizeForCompare,
  overlap,
  ngrams,
} from './lib/similarity.mjs';

const FIXTURE = 'tools/fixtures/dedup-pairs.json';

async function pairs() {
  return JSON.parse(await readFile(FIXTURE, 'utf8'));
}

test('別問題を同じ問題だと判定しない（誤統合ゼロ）', async () => {
  const wrong = [];
  for (const p of await pairs()) {
    if (p.same) continue;
    if (isSameQuestion(p.aText, p.bText)) {
      const s = similarity(p.aText, p.bText);
      wrong.push(`${p.a} / ${p.b} (key=${s.key.toFixed(2)} full=${s.full.toFixed(2)}) — ${p.note ?? ''}`);
    }
  }
  assert.deepEqual(wrong, [], `別問題を統合してしまいました:\n  ${wrong.join('\n  ')}`);
});

test('同じ問題の 9 割以上を統合できる', async () => {
  const all = (await pairs()).filter((p) => p.same);
  const found = all.filter((p) => isSameQuestion(p.aText, p.bText));
  const recall = found.length / all.length;
  assert.ok(
    recall >= 0.9,
    `同一問題の統合率が ${(recall * 100).toFixed(0)}% しかありません（${found.length}/${all.length}）`,
  );
});

test('選択肢は問題文から切り離される', () => {
  const raw = [
    '問35分散データベースの説明として,適切なものはどれか。',
    'アクライアントのアプリケーションプログラムは,複数のサーバ上の…',
    'イ別の選択肢',
  ].join('\n');
  const stem = questionStem(raw);
  assert.ok(stem.includes('分散データベース'), '問題文が取れていない');
  assert.ok(!stem.includes('クライアントのアプリケーション'), '選択肢が問題文に混ざっている');
});

test('ページ末尾の定型文は比較に使わない', () => {
  const raw = ['問80個人情報保護法の説明はどれか。', '試験問題に記載されている会社名又は製品名は,それぞれ各社の商標です。'].join('\n');
  assert.ok(!questionStem(raw).includes('商標'), 'ページ末尾の定型文が残っている');
});

test('「～はどれか」という定型の問い方は識別に使わない', () => {
  const a = stripFormulaicTail(normalizeForCompare('BPRを説明したものはどれか。'));
  const b = stripFormulaicTail(normalizeForCompare('コアコンピタンスを説明したものはどれか。'));
  assert.ok(a.length < 6, `定型句が落ちていない: ${a}`);
  assert.ok(!b.includes('どれか'), `定型句が落ちていない: ${b}`);
});

test('重なり係数は片側の OCR ごみで下がらない', () => {
  const clean = ngrams('あいうえおかきくけこ');
  const noisy = ngrams('あいうえおかきくけこ' + 'ノイズがたくさん入った誤読の文字列');
  // Jaccard だと和集合が膨らんで下がるが、重なり係数は下がらない
  assert.equal(overlap(clean, noisy), 1);
});

test('問番号は同じ問題でも回ごとに違うので比較から外す', () => {
  const a = normalizeForCompare('問35分散データベースの説明');
  const b = normalizeForCompare('問53分散データベースの説明');
  assert.equal(a, b);
});

test('短い問題文でも n-gram の大きさが揃う', () => {
  // 片側だけ 2-gram にすると 3-gram と一致せず、同じ問題が 0 になる
  const s = similarity('SQLの構文として,正しいものはどれか。\nアSELECT', 'SQLの構文として,正しいものはどれか。\nアSELECT');
  assert.ok(s.key > 0.9, `同一文なのに key=${s.key}`);
});
