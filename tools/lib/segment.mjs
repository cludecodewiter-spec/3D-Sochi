import { toLines } from './pdf.mjs';

/** 全角数字などを半角に寄せる（比較・番号解釈用。問題文の保存には使わない） */
export function normalizeDigits(s) {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

const FOOTER_RE = /^[－\-‐―ー]\s*\d+\s*[－\-‐―ー]$/;
const COPYRIGHT_RE = /^©|^Copyright|独立行政法人情報処理推進機構$/;

/**
 * ページの行を、ヘッダ・フッタ・ルビを除いた本文行に整える。
 * ルビ（振り仮名）は本文より小さいフォントで別行として拾われるため、
 * 文字高さの中央値を基準に落とす。残すと本文に異物が混ざる。
 */
export function bodyLines(page) {
  const lines = toLines(page).map((l) => ({
    ...l,
    maxH: Math.max(...l.items.map((i) => i.h)),
  }));
  const heights = lines.map((l) => l.maxH).filter((h) => h > 0).sort((a, b) => a - b);
  const median = heights.length ? heights[Math.floor(heights.length / 2)] : 0;
  return lines.filter((l) => {
    const t = l.text.trim();
    if (!t) return false;
    if (FOOTER_RE.test(t)) return false;
    if (COPYRIGHT_RE.test(t)) return false;
    if (median && l.maxH < median * 0.8) return false; // ルビ
    return true;
  });
}

/**
 * 「問N」の行を検出する。左端に寄っている行のみをアンカーとみなす
 * （本文中に出てくる「問1」のような文字列を拾わないため）。
 */
export function findAnchors(pages) {
  const all = [];
  for (const page of pages) {
    for (const line of bodyLines(page)) {
      all.push({ ...line, page: page.page });
    }
  }
  const xs = all.map((l) => l.x);
  const leftMargin = xs.length ? Math.min(...xs) : 0;

  const anchors = [];
  all.forEach((line, i) => {
    const t = normalizeDigits(line.text);
    const m = t.match(/^問\s*(\d{1,3})(?!\d)/);
    if (!m) return;
    if (line.x > leftMargin + 8) return; // 字下げされた行は本文の一部
    anchors.push({ no: Number(m[1]), lineIndex: i, page: line.page, y: line.y });
  });
  return { lines: all, anchors, leftMargin };
}

const CHOICE_KEYS = ['ア', 'イ', 'ウ', 'エ'];

/**
 * 1 問ぶんの行群を、問題文と 4 択に切り分ける。
 * 選択肢は「1 行に 1 つ」「1 行に 2 つ」「1 行に 4 つ」のいずれもあり得るため、
 * ア → イ → ウ → エ の順に前から探す方式にする（本文中の「ア」を誤検出しない）。
 */
export function splitQuestion(lines) {
  // 選択肢が始まる行を探す：字下げ位置に「ア 」で始まる行
  let choiceStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^ア[\s　]/.test(lines[i].text.trim())) {
      choiceStart = i;
      break;
    }
  }
  if (choiceStart === -1) return null;

  const bodyPart = lines.slice(0, choiceStart);
  const choicePart = lines.slice(choiceStart);

  const body = joinJapanese(bodyPart.map((l) => l.text))
    .replace(/^問\s*[0-9０-９]{1,3}[\s　]*/, '')
    .trim();

  const blob = joinJapanese(choicePart.map((l) => l.text));
  const choices = {};
  let cursor = 0;
  const positions = [];
  for (const key of CHOICE_KEYS) {
    // キーの直後は空白（全角/半角）である必要がある
    const re = new RegExp(`${key}[\\s　]`, 'g');
    re.lastIndex = cursor;
    const m = re.exec(blob);
    if (!m) return null;
    positions.push({ key, start: m.index, contentStart: m.index + m[0].length });
    cursor = m.index + m[0].length;
  }
  for (let i = 0; i < positions.length; i++) {
    const end = i + 1 < positions.length ? positions[i + 1].start : blob.length;
    const text = blob.slice(positions[i].contentStart, end).trim();
    if (!text) return null;
    choices[positions[i].key] = text;
  }

  if (!body) return null;
  return { body, choices, bodyLines: bodyPart, choiceLines: choicePart };
}

/**
 * 日本語 PDF の行は折り返しなので、原則そのまま連結する。
 * ただし ASCII 同士が隣接する場合だけ空白を入れて単語がくっつくのを防ぐ。
 */
export function joinJapanese(texts) {
  let out = '';
  for (const raw of texts) {
    const t = raw.trim();
    if (!t) continue;
    if (out && /[A-Za-z0-9]$/.test(out) && /^[A-Za-z0-9]/.test(t)) out += ' ';
    out += t;
  }
  return out.replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * 解答例 PDF から「問番号 → 正解（＋分野）」を取り出す。
 * 例) 問 1 エ問 21 イ Ｔ問 41 イ Ｔ / 問 1 ウ問 11 エ
 */
export function parseAnswers(pages) {
  const map = new Map();
  for (const page of pages) {
    for (const line of toLines(page)) {
      const t = normalizeDigits(line.text);
      const re = /問\s*(\d{1,3})\s*([アイウエ])\s*([ＴＭＳTMS])?/g;
      let m;
      while ((m = re.exec(t)) !== null) {
        const no = Number(m[1]);
        if (!map.has(no)) map.set(no, { answer: m[2], field: m[3] ?? null });
      }
    }
  }
  return map;
}

export const FIELD_LABEL = {
  Ｔ: 'テクノロジ系',
  Ｍ: 'マネジメント系',
  Ｓ: 'ストラテジ系',
  T: 'テクノロジ系',
  M: 'マネジメント系',
  S: 'ストラテジ系',
};
