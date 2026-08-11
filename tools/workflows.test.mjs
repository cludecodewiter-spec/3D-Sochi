/**
 * ワークフロー YAML が壊れていないかを push 前に確かめる。
 * YAML が壊れると GitHub は「実行はされたが失敗」の形で返してきて、
 * 原因が分かりにくいので、ここで落とす。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const DIR = '.github/workflows';

/**
 * 依存を増やしたくないので、YAML の完全なパーサは持たない。
 * 実際に踏んだ壊し方（`run: cmd "text: with colon"` が
 * マッピングと解釈される）を検出できれば十分。
 */
function unquotedColonInPlainScalar(line) {
  const m = line.match(/^\s*(run|name|if):\s+(.*)$/);
  if (!m) return false;
  const value = m[2].trim();
  if (!value || value.startsWith('|') || value.startsWith('>')) return false;
  // 値全体が引用符で囲まれていれば安全
  if (/^'.*'$/.test(value) || /^".*"$/.test(value)) return false;
  return /:\s/.test(value);
}

test('ワークフロー YAML に、マッピングと誤解される値が無い', async () => {
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  assert.ok(files.length > 0, 'ワークフローが 1 つも無い');

  for (const file of files) {
    const text = await readFile(`${DIR}/${file}`, 'utf8');
    text.split('\n').forEach((line, i) => {
      assert.ok(
        !unquotedColonInPlainScalar(line),
        `${file}:${i + 1} の値に引用符の無い ": " があります（YAML がマッピングと解釈します）\n  ${line.trim()}`,
      );
    });
  }
});

test('取り込みワークフローが同じ並行グループを共有していない', async () => {
  const groups = new Map();
  for (const file of ['import-ipa.yml', 'import-scanned.yml']) {
    const text = await readFile(`${DIR}/${file}`, 'utf8');
    const m = text.match(/concurrency:\s*\n\s*group:\s*(\S+)/);
    assert.ok(m, `${file} に concurrency.group がない`);
    // 同じグループだと、片方がもう片方のキュー待ちを取り消してしまう
    assert.ok(!groups.has(m[1]), `${file} と ${groups.get(m[1])} が同じ並行グループ ${m[1]} を使っている`);
    groups.set(m[1], file);
  }
});
