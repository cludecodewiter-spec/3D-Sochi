#!/usr/bin/env node
/**
 * 題庫の検証ゲート。ここを通らないものは出題しない。
 * 「実在しない問題を出さない」ための最後の砦なので、判定は保守的にする。
 */
import { readFile, readdir } from 'node:fs/promises';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const OUT_DIR = 'data/questions';

async function main() {
  const schema = JSON.parse(await readFile('schema/question.schema.json', 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  let files;
  try {
    files = (await readdir(OUT_DIR)).filter((f) => f.endsWith('.json') && f !== 'index.json');
  } catch {
    console.log('data/questions/ がありません（まだ取り込み前）。検証をスキップします。');
    return;
  }

  const errors = [];
  const seenIds = new Set();
  let total = 0;

  for (const file of files) {
    const questions = JSON.parse(await readFile(`${OUT_DIR}/${file}`, 'utf8'));
    const nos = new Set();

    for (const q of questions) {
      total++;
      if (!validate(q)) {
        errors.push(`${file} ${q.id ?? '(no id)'}: スキーマ違反 ${ajv.errorsText(validate.errors, { separator: '; ' }).slice(0, 200)}`);
        continue;
      }
      if (seenIds.has(q.id)) errors.push(`${file}: ID 重複 ${q.id}`);
      seenIds.add(q.id);
      if (nos.has(q.no)) errors.push(`${file}: 同一回で問番号が重複 問${q.no}`);
      nos.add(q.no);

      // 出典は必須。ここが欠けた問題は「どこから来たか分からない問題」なので落とす
      if (!q.source?.label?.startsWith('出典：')) errors.push(`${file} ${q.id}: 出典ラベルが不正`);
      if (!/^https:\/\/www\.ipa\.go\.jp\//.test(q.source?.questionPdf ?? '')) {
        errors.push(`${file} ${q.id}: 出典 PDF が IPA 公式ドメインでない (${q.source?.questionPdf})`);
      }
      if (q.modified !== false) errors.push(`${file} ${q.id}: modified が false でない`);
      if (q.verified !== true) errors.push(`${file} ${q.id}: verified が true でない`);

      if (q.format === 'text') {
        // 文字化け（CID 欠落や置換文字）が混ざった問題は出題しない
        const blob = q.body + Object.values(q.choices ?? {}).join('');
        const bad = (blob.match(/[�]|\(cid:\d+\)/g) ?? []).length;
        if (bad > 0) errors.push(`${file} ${q.id}: 文字化けを検出 (${bad} 箇所)`);
        if ((q.body ?? '').length < 10) errors.push(`${file} ${q.id}: 問題文が短すぎる`);
        for (const [k, v] of Object.entries(q.choices ?? {})) {
          if (!v || v.length === 0) errors.push(`${file} ${q.id}: 選択肢${k}が空`);
        }
      }
    }
  }

  // index.json と実データの整合
  try {
    const index = JSON.parse(await readFile(`${OUT_DIR}/index.json`, 'utf8'));
    const sum = index.shards.reduce((n, s) => n + s.count, 0);
    if (sum !== index.totalQuestions) errors.push(`index.json: totalQuestions=${index.totalQuestions} だが shard 合計は ${sum}`);
    if (sum !== total) errors.push(`index.json: shard 合計 ${sum} と実データ ${total} が一致しない`);
  } catch {
    errors.push('index.json を読めません');
  }

  console.log(`検証対象: ${total} 問 / ${files.length} ファイル`);
  if (errors.length) {
    console.error(`\n検証エラー ${errors.length} 件:`);
    for (const e of errors.slice(0, 50)) console.error('  - ' + e);
    process.exit(1);
  }
  console.log('すべての問題が検証を通過しました。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
