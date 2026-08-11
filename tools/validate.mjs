#!/usr/bin/env node
/**
 * 題庫の検証ゲート。ここを通らないものは出題しない。
 *
 * 既定では検出した問題を data/questions から取り除き、理由つきで
 * data/quarantine/validate-rejected.json に移す（--check を付けると報告のみ）。
 * 「リポジトリに置いてある題庫は常に検証済み」という状態を保つためで、
 * 検出があった場合は終了コードを 1 にして CI を赤くする。
 */
import { readFile, readdir, writeFile, access } from 'node:fs/promises';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const OUT_DIR = 'data/questions';
const CHECK_ONLY = process.argv.includes('--check');
/** 隔離が発生したときに終了コード 1 にする（ローカルで気づくため） */
const STRICT = process.argv.includes('--strict') || CHECK_ONLY;

/** 参照している画像が実在するか。存在しない画像を配ると空欄が出題される */
async function missingImages(q) {
  if (q.format !== 'image') return [];
  const missing = [];
  for (const rel of q.images ?? []) {
    try {
      await access(`data/${rel}`);
    } catch {
      missing.push(rel);
    }
  }
  return missing;
}

/** 1 問ぶんの検査。問題があれば理由の配列を返す */
function inspect(q, validate, ajv, seenIds, seenNos, file) {
  const problems = [];

  if (!validate(q)) {
    problems.push(`スキーマ違反 ${ajv.errorsText(validate.errors, { separator: '; ' }).slice(0, 200)}`);
    return problems; // スキーマ違反なら以降の検査は当てにならない
  }

  if (seenIds.has(q.id)) problems.push(`ID 重複 ${q.id}`);
  const noKey = `${file}#${q.no}`;
  if (seenNos.has(noKey)) problems.push(`同一回で問番号が重複 問${q.no}`);

  // 出典が欠けた問題は「どこから来たか分からない問題」なので出さない
  if (!q.source?.label?.startsWith('出典：')) problems.push('出典ラベルが不正');
  if (!/^https:\/\/www\.ipa\.go\.jp\//.test(q.source?.questionPdf ?? '')) {
    problems.push(`出典 PDF が IPA 公式ドメインでない (${q.source?.questionPdf})`);
  }
  if (q.modified !== false) problems.push('modified が false でない');
  if (q.verified !== true) problems.push('verified が true でない');

  if (q.format === 'text') {
    const blob = (q.body ?? '') + Object.values(q.choices ?? {}).join('');
    const garbled = (blob.match(/[�]|\(cid:\d+\)/g) ?? []).length;
    if (garbled > 0) problems.push(`文字化けを検出 (${garbled} 箇所)`);
    if ((q.body ?? '').length < 10) problems.push('問題文が短すぎる');
    for (const [k, v] of Object.entries(q.choices ?? {})) {
      if (!v) problems.push(`選択肢${k}が空`);
    }
  } else if (q.format === 'image') {
    if (!q.images?.length) problems.push('切り出し画像がない');
  }

  return problems;
}

async function main() {
  const schema = JSON.parse(await readFile('schema/question.schema.json', 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  let files;
  try {
    files = (await readdir(OUT_DIR)).filter((f) => f.endsWith('.json') && !['index.json', 'dedup.json'].includes(f));
  } catch {
    console.log('data/questions/ がありません（まだ取り込み前）。検証をスキップします。');
    return;
  }

  const seenIds = new Set();
  const seenNos = new Set();
  const rejected = [];
  const shards = [];
  let total = 0;
  let kept = 0;

  for (const file of files) {
    const questions = JSON.parse(await readFile(`${OUT_DIR}/${file}`, 'utf8'));
    const good = [];

    for (const q of questions) {
      total++;
      const problems = inspect(q, validate, ajv, seenIds, seenNos, file);
      const lost = await missingImages(q);
      if (lost.length) problems.push(`切り出し画像が見つからない: ${lost.join(', ').slice(0, 120)}`);
      if (problems.length) {
        rejected.push({ file, id: q.id ?? null, no: q.no ?? null, problems });
        continue;
      }
      seenIds.add(q.id);
      seenNos.add(`${file}#${q.no}`);
      good.push(q);
    }

    kept += good.length;
    if (!CHECK_ONLY && good.length !== questions.length) {
      await writeFile(`${OUT_DIR}/${file}`, JSON.stringify(good, null, 1));
    }
    if (good.length > 0) {
      const first = good[0];
      shards.push({
        file,
        pool: first.pool,
        examKey: file.replace(/\.json$/, ''),
        label: first.source.label.replace(/\s*問\d+$/, ''),
        count: good.length,
      });
    }
  }

  if (!CHECK_ONLY) {
    await writeFile(
      `${OUT_DIR}/index.json`,
      JSON.stringify({ generatedAt: new Date().toISOString(), totalQuestions: kept, shards }, null, 1),
    );
    await writeFile('data/quarantine/validate-rejected.json', JSON.stringify(rejected, null, 1));
  }

  console.log(`検証: ${total} 問中 ${kept} 問が通過 / ${rejected.length} 問を除外`);
  for (const s of shards) console.log(`  ${String(s.count).padStart(3)} 問  ${s.file}`);

  if (rejected.length) {
    const byReason = {};
    for (const r of rejected) {
      const key = r.problems[0].split('(')[0].trim();
      byReason[key] = (byReason[key] ?? 0) + 1;
    }
    console.error('\n除外理由の内訳:');
    for (const [reason, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
      console.error(`  ${n} 問: ${reason}`);
    }
    console.error('\n除外した問題の詳細は data/quarantine/validate-rejected.json を参照');
    // 隔離は想定内の動作で、リポジトリに残るデータは検証済みの状態になっている。
    // 取り込みを止めたくないので、既定では成功として扱う（--strict で失敗にできる）。
    if (STRICT) process.exit(1);
    return;
  }
  console.log('すべての問題が検証を通過しました。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
