#!/usr/bin/env node
/**
 * 解説の検査。
 *
 * IPA は午前・科目A の逐題解説を公開していない（公式の講評は午後の
 * _cmnt.pdf だけで、しかも大問単位）。したがってここにある解説はすべて
 * この教材のために書いたものであり、公式資料ではない。
 *
 * 間違った解説は、解説が無いことより悪い。人を誤って覚えさせるため。
 * そこで機械的に確かめられることは全部ここで確かめる:
 *
 *   - 解説が指す正解が、公式の解答例と一致しているか（最重要）
 *   - 存在しない問題に解説を書いていないか
 *   - ヒントが答えを漏らしていないか
 *   - 誤答理由が、正解の選択肢を「誤り」として説明していないか
 */
import { readFile, readdir } from 'node:fs/promises';
import Ajv from 'ajv';

const DIR = 'data/explanations';
const QUESTIONS = 'data/questions';
const CHOICES = ['ア', 'イ', 'ウ', 'エ'];

async function loadQuestions() {
  const map = new Map();
  const files = (await readdir(QUESTIONS)).filter(
    (f) => f.endsWith('.json') && !['index.json', 'dedup.json', 'manifest.json'].includes(f),
  );
  for (const f of files) {
    for (const q of JSON.parse(await readFile(`${QUESTIONS}/${f}`, 'utf8'))) map.set(q.id, q);
  }
  return map;
}

/** ヒントが答えを名指ししていないか */
function hintLeaksAnswer(hint, answer) {
  if (!hint) return false;
  // 「正解はエ」「答えは エ」「エが正しい」などを拾う
  const patterns = [
    new RegExp(`(正解|答え|解答)\\s*(は|が)?\\s*[「『]?${answer}`),
    new RegExp(`${answer}\\s*[」』]?\\s*(が|は)\\s*(正しい|正解|適切)`),
  ];
  return patterns.some((p) => p.test(hint));
}

async function main() {
  let files = [];
  try {
    files = (await readdir(DIR)).filter((f) => f.endsWith('.json'));
  } catch {
    console.log('data/explanations がまだありません。検査するものがないので終了します。');
    return;
  }

  const schema = JSON.parse(await readFile('schema/explanation.schema.json', 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  const questions = await loadQuestions();
  const problems = [];
  let total = 0;
  let withHint = 0;

  for (const file of files.sort()) {
    if (file === 'index.json') continue;
    const data = JSON.parse(await readFile(`${DIR}/${file}`, 'utf8'));

    if (!validate(data)) {
      for (const e of validate.errors ?? []) problems.push(`${file}${e.instancePath}: ${e.message}`);
      continue;
    }

    for (const [id, ex] of Object.entries(data)) {
      total++;
      if (ex.hint) withHint++;

      const q = questions.get(id);
      if (!q) {
        problems.push(`${file}: 「${id}」という問題は題庫にありません`);
        continue;
      }

      // これが本丸。公式の解答例と食い違う解説は絶対に出さない
      if (ex.answer !== q.answer) {
        problems.push(
          `${file}: ${id} の解説は「${ex.answer}」を正解としていますが、` +
            `公式の解答例は「${q.answer}」です`,
        );
      }

      if (hintLeaksAnswer(ex.hint, q.answer)) {
        problems.push(`${file}: ${id} のヒントが答えを明かしています`);
      }

      // 正解の選択肢を「誤りである理由」の側に書いていたら、説明が矛盾している
      if (ex.why && Object.prototype.hasOwnProperty.call(ex.why, q.answer)) {
        problems.push(`${file}: ${id} は正解「${q.answer}」を誤答理由の側に書いています`);
      }

      for (const key of Object.keys(ex.why ?? {})) {
        if (!CHOICES.includes(key)) problems.push(`${file}: ${id} に選択肢「${key}」は存在しません`);
      }

    }
  }

  console.log(`解説 ${total} 件（うちヒントあり ${withHint} 件）／ファイル ${files.length} 本`);

  if (problems.length > 0) {
    console.error(`\n問題 ${problems.length} 件:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log('すべての解説が公式の解答例と一致しています。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
