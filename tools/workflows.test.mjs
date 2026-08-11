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

/**
 * upload-artifact の `path:` に書かれたパスを列挙する。
 * `path: staged/` と、ブロックスカラーで複数行並べる書き方の両方を拾う。
 */
export function uploadArtifactPaths(text) {
  const lines = text.split('\n');
  const found = [];

  for (let i = 0; i < lines.length; i++) {
    if (!/uses:\s*actions\/upload-artifact@/.test(lines[i])) continue;

    for (let j = i + 1; j < lines.length; j++) {
      // 次のステップ（`- name:` / `- uses:`）に入ったら、このアップロードは終わり
      if (/^\s*-\s+(name|uses):/.test(lines[j])) break;

      const m = lines[j].match(/^(\s*)path:\s*(.*)$/);
      if (!m) continue;
      const [, indent, value] = m;

      if (value.trim() && value.trim() !== '|' && value.trim() !== '>') {
        found.push(value.trim().replace(/^['"]|['"]$/g, ''));
        break;
      }
      // ブロックスカラー: path: より深くインデントされた行がすべて値
      for (let k = j + 1; k < lines.length; k++) {
        if (!lines[k].trim()) continue;
        const lead = lines[k].match(/^\s*/)[0];
        if (lead.length <= indent.length) break;
        found.push(lines[k].trim().replace(/^-\s*/, ''));
      }
      break;
    }
  }
  return found;
}

/**
 * 実際に踏んだ事故:
 *   各シャードが `data/questions/*.json`（＝チェックアウトしたままの分も含む全 98 件）を
 *   アップロードし、download-artifact の merge-multiple が同名ファイルを後勝ちで
 *   上書きしたため、他シャードが OCR した結果が未変更の副本で潰された。
 *   4,868 問中 4,086 問を失ったのに、ワークフローは緑のまま完走した。
 *
 * 対策は「自分が変更したファイルだけを staged/ に集めて上げる」こと。
 * merge-multiple を使うジョブが生のパスを上げていないかをここで見張る。
 */
test('シャードのアップロードが merge-multiple と衝突しない', async () => {
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

  for (const file of files) {
    const text = await readFile(`${DIR}/${file}`, 'utf8');
    if (!text.includes('merge-multiple: true')) continue;

    const paths = uploadArtifactPaths(text);
    assert.ok(paths.length > 0, `${file} は merge-multiple を使うのに upload-artifact の path が読めない`);

    for (const p of paths) {
      assert.ok(
        p.startsWith('staged'),
        `${file}: merge-multiple を使うので、アップロードは変更ファイルだけを集めた staged/ にしてください（今は ${p}）。` +
          '生のパスを上げると、他シャードの成果が未変更の副本で上書きされます。',
      );
    }
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
