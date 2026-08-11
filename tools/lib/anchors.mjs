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

export function anchorsFromWords(words, stripWidth) {
  const left = words
    .filter((w) => w.x <= stripWidth * 0.55 && w.conf >= 30)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const anchors = [];
  for (let i = 0; i < left.length; i++) {
    const w = left[i];
    const text = normalizeDigits(w.text).replace(/[\s.．,，:：]/g, '');

    let no = null;
    const single = text.match(new RegExp(`^[${MON}](\\d{1,3})$`));
    if (single) {
      no = Number(single[1]);
    } else if (new RegExp(`^[${MON}]$`).test(text)) {
      // 「問」と番号が別の語に割れている場合、右隣の数字を探す
      const near = left
        .slice(i + 1, i + 4)
        .find((n) => Math.abs(n.y - w.y) < w.h * 1.2 && n.x > w.x && n.x - (w.x + w.w) < w.w * 2.5);
      const digits = near && normalizeDigits(near.text).match(/^(\d{1,3})[．.]?$/);
      if (digits) no = Number(digits[1]);
    }

    if (no === null || no < 1 || no > 100) continue;
    anchors.push({ no, x: w.x, y: w.y, conf: w.conf });
  }

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

