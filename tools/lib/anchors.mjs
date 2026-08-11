import { normalizeDigits } from './segment.mjs';

/**
 * 「問N」を探す。
 *
 * 問題番号は必ず左マージンに置かれるので、ページ全体ではなく左端の帯だけを
 * OCR する。文字数が少ないぶん誤読が減り、速度も上がる。
 *
 * 行にまとめてから見ると、300dpi では 1 行が 2 つの行に割れてしまうことがある。
 * そこで行を作らず、単語を直接見る:
 *   - 「問12」のように 1 語で来る場合
 *   - 「問」「12」と 2 語に割れる場合（近くにある数字を拾う）
 * OCR は「問」を「間」「悶」などに誤読するので、紛らわしい字も受け入れる。
 */
const MON = '問間悶闇門';

/**
 * 語をまたいで数字を繋げないのが肝。
 * 「問1」「16 進小数…」と割れている行で連結すると「問116」になってしまい、
 * 範囲外として捨てられる（実際にそれで取りこぼしていた）。
 */
function numberFromWord(text) {
  const t = normalizeDigits(text).replace(/[\s.．,，:：]/g, '');
  // 「問53」だけ／「問53メモリ…」のように後ろに本文が続く場合
  const attached = t.match(new RegExp(`^[${MON}](\\d{1,3})(?!\\d)`));
  if (attached) return Number(attached[1]);
  return null;
}

const isLoneMon = (text) => new RegExp(`^[${MON}]$`).test(normalizeDigits(text).replace(/[\s.．,，:：]/g, ''));

const centerY = (w) => w.y + w.h / 2;

/**
 * そのページの本文の左マージンを求める。
 * 「問1から問50まで」のような見出し行は一段字下げされているので、
 * 本文マージンに揃っているものだけをアンカーとみなすために使う。
 */
function bodyMarginX(words) {
  if (words.length === 0) return 0;
  const xs = words.map((w) => w.x).sort((a, b) => a - b);
  // 外れ値（罫線のかけら等）に引きずられないよう下位 10% 点を使う
  return xs[Math.floor(xs.length * 0.1)];
}

export function anchorsFromWords(words, stripWidth) {
  const candidates = words.filter((w) => w.x <= stripWidth * 0.55 && w.conf >= 20 && w.text.trim());
  const marginX = bodyMarginX(candidates);

  const anchors = [];
  for (const w of candidates) {
    // 本文マージンから字下げされている「問」は見出しなので拾わない
    if (w.x > marginX + 35) continue;

    let no = numberFromWord(w.text);
    if (no === null && isLoneMon(w.text)) {
      // 「問」と番号が別の語に分かれている。番号の外接矩形は「問」より縦に長いことがあり、
      // 上端 y で並べると番号が先に来てしまうので、位置関係だけで探す（並び順に頼らない）。
      const near = words.find(
        (n) =>
          n !== w &&
          n.conf >= 20 &&
          Math.abs(centerY(n) - centerY(w)) < Math.max(w.h, 20) * 0.9 &&
          n.x > w.x &&
          n.x - (w.x + w.w) < Math.max(w.w, 20) * 2 &&
          /^\d/.test(normalizeDigits(n.text)),
      );
      const digits = near && normalizeDigits(near.text).match(/^(\d{1,3})(?!\d)/);
      if (digits) no = Number(digits[1]);
    }

    if (no === null || no < 1 || no > 100) continue;
    anchors.push({ no, x: w.x, y: w.y, conf: w.conf });
  }
  anchors.sort((a, b) => a.y - b.y);

  anchors.sort((a, b) => a.y - b.y);
  // 同じ番号が近い位置で二重に拾われることがある
  return anchors.filter((a, i, arr) => i === 0 || !(arr[i - 1].no === a.no && Math.abs(arr[i - 1].y - a.y) < 40));
}

/**
 * OCR の誤読（本来ありえない番号が紛れ込む）を落とすため、
 * 文書順に並べたアンカー列から最長増加部分列だけを残す。
 * 消したことで問題が 2 問ぶん繋がってしまう心配は、
 * この後の「連番でなければ採用しない」判定が引き受ける。
 */
export function longestIncreasing(anchors) {
  if (anchors.length === 0) return [];
  const tails = []; // tails[L] = 長さ L+1 の増加列の末尾になれる要素の index
  const prev = new Array(anchors.length).fill(-1);

  for (let i = 0; i < anchors.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (anchors[tails[mid]].no < anchors[i].no) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = i;
  }

  const out = [];
  for (let k = tails[tails.length - 1]; k !== -1; k = prev[k]) out.push(anchors[k]);
  return out.reverse();
}

/**
 * OCR で拾ったアンカーが使えるかを判定する。
 *
 * 全問そろっていることは求めない（OCR は必ずどこかで読み落とす）。
 * 代わりに「切り出した画像に 2 問ぶんが入ってしまう」ことを防ぐ:
 *   問N を採用するのは、問N と 問N+1 の両方のアンカーが見つかっているときだけ。
 * 最後の問題は、その回の最終問番号と一致しているときだけ採用する。
 */
export function usableAnchors(flat, expectedCount) {
  // 文書順に番号が増えていない＝OCR が混乱している。その回は捨てる
  for (let i = 1; i < flat.length; i++) {
    if (flat[i].no <= flat[i - 1].no) {
      return { ok: false, why: `問番号が文書順に増えていない (問${flat[i - 1].no} の次が 問${flat[i].no})` };
    }
  }
  if (flat.length === 0) return { ok: false, why: 'アンカーを 1 つも検出できない' };

  const usable = [];
  for (let i = 0; i < flat.length; i++) {
    const cur = flat[i];
    const next = flat[i + 1];
    if (next) {
      // 次のアンカーが連番でないなら、cur の切り出し範囲に次の問題が入り込む
      if (next.no === cur.no + 1) usable.push({ ...cur, next });
    } else if (cur.no === expectedCount) {
      usable.push({ ...cur, next: null });
    }
  }
  const coverage = expectedCount ? usable.length / expectedCount : 0;
  if (coverage < 0.5) {
    return { ok: false, why: `使える問題が ${usable.length}/${expectedCount} 問しかない`, usable };
  }
  return { ok: true, usable, coverage };
}

