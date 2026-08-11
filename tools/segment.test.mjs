/**
 * ネットワーク無しで走る回帰テスト。
 * 取り込みパイプラインのバグは Actions 上でしか気づけないことが多いので、
 * 純粋関数の部分だけでもローカルで守る。
 *
 *   node --test tools/segment.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  findAnchors,
  splitQuestion,
  parseAnswers,
  questionDefects,
  joinJapanese,
  normalizeDigits,
} from './lib/segment.mjs';

/** probe のダンプ（行だけ）から、pdf.mjs が返すのと同じ形のページを組み立てる */
function pagesFromDump(dump) {
  return dump.map((p) => ({
    page: p.page,
    width: p.size?.[0] ?? 595,
    height: p.size?.[1] ?? 842,
    items: p.lines.map((l) => ({ str: l.text, x: l.x, y: l.y, w: l.text.length * 10, h: 10 })),
  }));
}

test('normalizeDigits は全角数字を半角にする', () => {
  assert.equal(normalizeDigits('問１０'), '問10');
  assert.equal(normalizeDigits('問3'), '問3');
});

test('joinJapanese は折り返しをそのまま繋ぎ、ASCII 同士だけ空白を入れる', () => {
  assert.equal(joinJapanese(['適切なもの', 'はどれか。']), '適切なものはどれか。');
  assert.equal(joinJapanese(['abc', 'def']), 'abc def');
});

test('parseAnswers は分野つき・分野なしの解答例をどちらも読める', () => {
  const withField = [{ page: 1, items: [{ str: '問 1 エ Ｔ問 21 イ Ｔ', x: 50, y: 100, w: 200, h: 10 }] }];
  const m1 = parseAnswers(withField);
  assert.equal(m1.get(1).answer, 'エ');
  assert.equal(m1.get(1).field, 'Ｔ');
  assert.equal(m1.get(21).answer, 'イ');

  const noField = [{ page: 1, items: [{ str: '問 1 ウ問 11 エ', x: 50, y: 100, w: 200, h: 10 }] }];
  const m2 = parseAnswers(noField);
  assert.equal(m2.get(1).answer, 'ウ');
  assert.equal(m2.get(11).answer, 'エ');
  assert.equal(m2.get(1).field, null);
});

test('questionDefects は正常な問題を通す', () => {
  assert.deepEqual(
    questionDefects({
      body: 'エッジコンピューティングの説明として，最も適切なものはどれか。',
      choices: {
        ア: '画面生成やデータ処理をクライアント側で実行すること',
        イ: 'データが送信されてきたときだけサーバを立ち上げること',
        ウ: '複数のサーバを仮想化して統合すること',
        エ: 'データ発生源に近い場所で一次処理すること',
      },
    }),
    [],
  );
});

test('questionDefects は選択肢の混入を検出する', () => {
  const d = questionDefects({
    body: 'パリティチェック方式の記述として，適切なものはどれか。',
    choices: {
      ア: '1 ビットの誤りを検出できる。イ 1 ビットの誤りを訂正できる。',
      イ: 'ふつうの選択肢',
      ウ: 'ふつうの選択肢',
      エ: 'ふつうの選択肢',
    },
  });
  assert.ok(d.some((x) => x.includes('混入')), `検出できていない: ${JSON.stringify(d)}`);
});

test('questionDefects は 1 文字ずつ分断された日本語を検出する', () => {
  const d = questionDefects({
    body: '通信回線の伝送誤りに対処する方式の記述として適切なものはどれか。',
    choices: {
      ア: '１ ビ ッ ト の 誤 り を 検 出 で き る 。イ１ビットの誤りを訂正でき',
      イ: 'ふつうの選択肢',
      ウ: 'ふつうの選択肢',
      エ: 'ふつうの選択肢',
    },
  });
  assert.ok(d.some((x) => x.includes('分断')), `検出できていない: ${JSON.stringify(d)}`);
});

test('公開問題 PDF のダンプから 問N を全て見つけ、選択肢に切り分けられる', async (t) => {
  let dump;
  try {
    dump = JSON.parse(await readFile('data/probe/koukai-2023r05-a-qs.json', 'utf8')).dump;
  } catch {
    t.skip('data/probe のダンプが無い（Actions で probe を走らせると生成される）');
    return;
  }

  const pages = pagesFromDump(dump);
  const { lines, anchors } = findAnchors(pages);

  // ダンプは先頭 6 ページぶん。問1〜問5 あたりが入っている
  assert.ok(anchors.length >= 4, `アンカーが少なすぎる: ${anchors.map((a) => a.no)}`);
  // 全角数字の問1〜問9 を取りこぼしていないこと（過去に取りこぼしたバグがある）
  assert.ok(anchors.some((a) => a.no === 1), `問1 を検出できていない: ${anchors.map((a) => a.no)}`);
  // 文書順に増えていること
  for (let i = 1; i < anchors.length; i++) {
    assert.ok(anchors[i].no > anchors[i - 1].no, `問番号が増えていない: ${anchors.map((a) => a.no)}`);
  }

  // 最初の問題をきちんと切り分けられること
  const span = lines.slice(anchors[0].lineIndex, anchors[1].lineIndex);
  const split = splitQuestion(span);
  assert.ok(split, '問1 を本文と選択肢に切り分けられない');
  assert.deepEqual(Object.keys(split.choices).sort(), ['ア', 'イ', 'ウ', 'エ'].sort());
  assert.deepEqual(questionDefects(split), [], '切り出した問1 に不備がある');
  assert.ok(!split.body.startsWith('問'), '本文の先頭に問番号が残っている');
});
