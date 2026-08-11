import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * tesseract を呼んで単語ボックス（TSV）を得る。
 *
 * 注意: ここで得たテキストは「重複判定・検索・解説作成」にだけ使う。
 * OCR は必ずどこかで誤読するので、出題時に見せるのは常に原本の切り出し画像。
 */
export async function ocrWords(imagePath, { psm = '6', dpi = 300, lang = 'jpn' } = {}) {
  const { stdout } = await run(
    'tesseract',
    [imagePath, 'stdout', '-l', lang, '--oem', '1', '--psm', psm, '--dpi', String(dpi), 'tsv'],
    { maxBuffer: 1024 * 1024 * 64 },
  );
  const rows = stdout.split('\n').slice(1);
  const words = [];
  for (const row of rows) {
    const c = row.split('\t');
    if (c.length < 12) continue;
    const [, , , , , , left, top, width, height, conf, ...rest] = c;
    const text = rest.join('\t').trim();
    if (!text) continue;
    words.push({
      x: Number(left),
      y: Number(top),
      w: Number(width),
      h: Number(height),
      conf: Number(conf),
      text,
    });
  }
  return words;
}

/**
 * 単語を読み順に並べて 1 本のテキストにする。
 * 日本語は分かち書きしないので、行内はそのまま連結する。
 */
export function wordsToText(words, { minConf = 30, lineTolerance = 20 } = {}) {
  const kept = words.filter((w) => w.conf >= minConf);
  if (kept.length === 0) return '';

  const lines = [];
  for (const w of [...kept].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - w.y) <= lineTolerance) {
      last.words.push(w);
      last.y = (last.y * (last.words.length - 1) + w.y) / last.words.length;
    } else {
      lines.push({ y: w.y, words: [w] });
    }
  }
  return lines
    .map((l) =>
      l.words
        .sort((a, b) => a.x - b.x)
        .map((w) => w.text)
        .join(''),
    )
    .join('\n')
    .trim();
}
