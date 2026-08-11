/**
 * 題源の分類と出典表記の検査。
 *
 * IPA の利用条件は出典明示を求めている。応用情報の問題を
 * 「基本情報技術者試験」と書いてしまうと引用として成り立たないので、
 * プールと試験名の対応をここで固定する。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classify } from './discover.mjs';
import { examName } from './lib/era.mjs';

const AT = 'https://www.ipa.go.jp/shiken/mondai-kaiotu/2009h21/';
const link = (file, ctx = '基本情報技術者試験') => classify({ url: AT + file, heading: ctx, text: '問題' });

test('応用情報・情報セキュリティマネジメントの午前を拡張プールとして拾う', () => {
  assert.equal(link('2009h21a_ap_am_qs.pdf').pool, 'ext-ap');
  assert.equal(link('2009h21a_ap_am_qs.pdf').role, 'questions');
  assert.equal(link('2024r06h_ap_am_ans.pdf').role, 'answers');
  assert.equal(link('2016h28a_sg_am_qs.pdf').pool, 'ext-sg');
  // 科目A（現行制度）の綴りでも拾う
  assert.equal(link('2024r06h_sg_kamoku_a_qs.pdf').pool, 'ext-sg');
});

test('拡張プールも四肢択一なので科目A として扱う', () => {
  for (const f of ['2009h21a_ap_am_qs.pdf', '2016h28a_sg_am_qs.pdf']) {
    assert.equal(link(f).subject, 'kamokuA', f);
  }
});

test('午後は形式が違うので拡張プールに入れない', () => {
  assert.equal(link('2016h28a_sg_pm_qs.pdf').role, 'unknown');
  assert.equal(link('2009h21a_ap_pm_qs.pdf').role, 'unknown');
});

test('見出しに「基本情報」があっても他区分の PDF を FE として拾わない', () => {
  // 年度ページは複数区分を並べて載せているので、見出しだけでは判別できない
  const c = link('2009h21a_ap_am_qs.pdf', '基本情報技術者試験・応用情報技術者試験');
  assert.notEqual(c.pool, 'fe-honshiken');
  assert.equal(c.pool, 'ext-ap');
});

test('出典の試験名がプールごとに正しい', () => {
  assert.equal(examName('ext-ap'), '応用情報技術者試験');
  assert.equal(examName('ext-sg'), '情報セキュリティマネジメント試験');
  assert.equal(examName('fe-honshiken'), '基本情報技術者試験');
  assert.equal(examName('fe-menjo'), '基本情報技術者試験');
});

test('取り込み済みの問題は、出典の試験名がプールと一致している', async () => {
  const index = JSON.parse(await readFile('data/questions/index.json', 'utf8'));
  const wrong = [];
  for (const shard of index.shards ?? []) {
    const questions = JSON.parse(await readFile(`data/questions/${shard.file}`, 'utf8'));
    for (const q of questions) {
      const expected = examName(q.pool);
      if (!q.source?.label?.includes(expected)) {
        wrong.push(`${q.id}: pool=${q.pool} なのに「${q.source?.label}」`);
      }
    }
  }
  assert.deepEqual(wrong.slice(0, 5), [], `出典の試験名がプールと食い違っています:\n  ${wrong.slice(0, 5).join('\n  ')}`);
});
