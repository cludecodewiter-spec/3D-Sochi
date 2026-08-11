/**
 * 「この 2 問は同じ問題か」を判定する。
 *
 * 修了試験は 60% 以上が本試験の使い回しだと IPA 自身が説明しているので、
 * 名寄せしないと同じ問題が練習中に何度も出てくる。
 *
 * 判定を難しくしているのは次の 3 つで、実データを読んで分かったこと:
 *
 *  1. スキャン画像から OCR したテキストには必ず誤読がある。
 *     Jaccard 係数は誤読が「和集合」を膨らませるので、同じ問題でも 0.4 まで落ちる。
 *     分母を小さい方に取る重なり係数なら、同じ問題は 0.6 以上に収まる。
 *
 *  2. 選択肢は問題をまたいで使い回される。
 *     「ディジタルカメラの記録媒体は」と「電源を切っても保持できるメモリは」は
 *     別問題だが、選択肢 4 つ（DRAM/SRAM/フラッシュメモリ/マスクROM）が同一なので
 *     全文で比べると似て見える。だから問題文（選択肢の手前）で比べる。
 *
 *  3. ページ末尾の定型文（「試験問題に記載されている会社名又は製品名は…」
 *     「メモ用紙」など）と、「～として、適切なものはどれか」という定型の問い方は
 *     どの問題にも出るので、識別には使えない。落としてから比べる。
 */

/** ページ末尾の定型文。ここから先は問題の中身ではない */
const FOOTER =
  /(試験問題に記載されている会社名|メモ\s*用\s*紙|独立行政法人情報処理推進機構|途中で退室|以下\s*余白|次の問題)/;

/**
 * 行頭の選択肢記号。
 * 「ア」の直後がカタカナかどうかでは判定できない。
 * 選択肢の中身自体がカタカナで始まることが多いため（アクライアント…、アストライピング…）。
 * 代わりに「ア で始まる行の後に イ で始まる行が来る」という並びで見つける。
 */
function choiceStartIndex(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (!/^ア/.test(lines[i])) continue;
    // 「ア」の後ろに「イ」で始まる行が続けば、そこが選択肢の先頭
    for (let j = i + 1; j < lines.length; j++) {
      if (/^[イィ]/.test(lines[j])) return i;
    }
    // 1 行に「アｘｘ イｘｘ ウｘｘ エｘｘ」と続けて印刷されている回もある
    if (/^ア.*[イ].*[ウ].*[エ]/.test(lines[i])) return i;
  }
  return -1;
}

/** 「～はどれか」式の問い方。どの問題にも付くので識別力が無い */
const FORMULAIC =
  /(に関する記述のうち|として|のうち|について|に関して)?\s*(最も)?\s*(適切|正しい|妥当|不適切)?\s*な?\s*(もの|説明|記述)?\s*(は|を説明したもの)?\s*どれ?か$/;

/**
 * 問題文（選択肢の手前）だけを取り出す。
 * 選択肢が問題をまたいで使い回されるため、ここが実質的な識別子になる。
 */
export function questionStem(raw) {
  const lines = [];
  for (const line of String(raw ?? '').split('\n')) {
    const t = line.trim();
    if (FOOTER.test(t)) break;
    lines.push(t);
  }
  const cut = choiceStartIndex(lines);
  return (cut > 0 ? lines.slice(0, cut) : lines).join('');
}

/** 表記ゆれと、OCR が壊しやすい約物を落とす */
export function normalizeForCompare(s) {
  return String(s ?? '')
    .replace(/^問\s*[0-9０-９]{1,3}/, '') // 同じ問題でも回によって問番号が違う
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .replace(/[\s　]/g, '')
    .replace(/[，、,．。.・:：;；()（）「」『』【】\[\]{}"'’”“?？!！~〜ー\-—–_/／\\|]/g, '');
}

/** 定型の問い方を落として、その問題に固有の部分だけ残す */
/** 「～はどれか」を落とすと残る「～を説明した」なども、同じく定型 */
const FORMULAIC_RESIDUE = /(を説明したもの|を説明した|の説明|を説明|に関する記述|に関する|について|として)$/;

export function stripFormulaicTail(s) {
  let t = s;
  for (let i = 0; i < 4; i++) {
    const next = t.replace(FORMULAIC, '').replace(FORMULAIC_RESIDUE, '');
    if (next === t) break;
    t = next;
  }
  return t;
}

export function ngrams(s, n = 3) {
  const out = new Set();
  for (let i = 0; i + n <= s.length; i++) out.add(s.slice(i, i + n));
  return out;
}

/**
 * 重なり係数 |A∩B| / min(|A|,|B|)。
 * 片側にだけ OCR のごみが乗っても値が落ちないので、Jaccard より素直に効く。
 */
export function overlap(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const g of small) if (large.has(g)) inter++;
  return inter / Math.min(a.size, b.size);
}

/**
 * 短い文字列は 3-gram だと粒度が粗すぎるので n を落とす。
 * n は必ず両方の文字列から決める。片側だけ 2-gram にすると、
 * もう片方の 3-gram と 1 つも一致せず、同じ問題でも 0 になってしまう。
 */
function gramSize(a, b) {
  const len = Math.min(a.length, b.length);
  if (len < 6) return 1;
  if (len < 12) return 2;
  return 3;
}

/**
 * 2 問の類似度を、問題文（key）と全文（full）の 2 本立てで返す。
 *
 * key だけだと「BPR を説明したものはどれか」と
 * 「コアコンピタンスを説明したものはどれか」が定型句で似てしまう。
 * full だけだと選択肢の使い回しで別問題が似てしまう。両方見る。
 */
/**
 * 1 問ぶんの比較材料を先に作っておく。
 *
 * 5,182 問を総当たりすると 100 万組を超えるので、
 * 組ごとに正規化と n-gram 生成をやり直すと現実的な時間で終わらない。
 */
export function prepare(raw) {
  const full = normalizeForCompare(raw);
  const stem = normalizeForCompare(questionStem(raw));
  const stripped = stripFormulaicTail(stem);
  // 定型句を落とすと空になることがある（問題文が定型句だけの場合）。そのときは落とす前に戻す。
  return {
    full,
    fullGrams: ngrams(full),
    stem,
    stripped,
    gramCache: new Map(),
  };
}

/** key の n は相手の長さでも決まるので、n ごとに作って使い回す */
function keyGrams(p, keyText, n) {
  const cacheKey = `${keyText.length}:${n}`;
  let g = p.gramCache.get(cacheKey);
  if (!g) {
    g = ngrams(keyText, n);
    p.gramCache.set(cacheKey, g);
  }
  return g;
}

export function comparePrepared(a, b) {
  const useStripped = a.stripped.length > 0 && b.stripped.length > 0;
  const keyA = useStripped ? a.stripped : a.stem;
  const keyB = useStripped ? b.stripped : b.stem;
  const kn = gramSize(keyA, keyB);

  return {
    key: overlap(keyGrams(a, keyA, kn), keyGrams(b, keyB, kn)),
    full: overlap(a.fullGrams, b.fullGrams),
    lengthRatio:
      Math.max(a.full.length, b.full.length) === 0
        ? 0
        : Math.min(a.full.length, b.full.length) / Math.max(a.full.length, b.full.length),
  };
}

export function similarity(rawA, rawB) {
  return comparePrepared(prepare(rawA), prepare(rawB));
}

/**
 * 統合してよいかを、安い判定から順に見て早めに打ち切る。
 * ほとんどの組は問題文（key）の時点で落ちるので、全文の照合まで進まない。
 */
export function isSamePrepared(a, b, t = DEFAULT_THRESHOLDS) {
  const lengthRatio =
    Math.max(a.full.length, b.full.length) === 0
      ? 0
      : Math.min(a.full.length, b.full.length) / Math.max(a.full.length, b.full.length);
  if (lengthRatio < t.lengthRatio) return false;

  const useStripped = a.stripped.length > 0 && b.stripped.length > 0;
  const keyA = useStripped ? a.stripped : a.stem;
  const keyB = useStripped ? b.stripped : b.stem;
  const kn = gramSize(keyA, keyB);
  if (overlap(keyGrams(a, keyA, kn), keyGrams(b, keyB, kn)) < t.key) return false;

  return overlap(a.fullGrams, b.fullGrams) >= t.full;
}

/**
 * 既定のしきい値。手作業でラベル付けした tools/fixtures/dedup-pairs.json で調整した。
 *
 * 意図的に「取りこぼす方」に倒してある。
 * 誤って統合すると本物の問題が練習から消えてしまうのに対し、
 * 取りこぼしても似た問題がもう一度出るだけで実害が小さいため。
 */
export const DEFAULT_THRESHOLDS = { key: 0.45, full: 0.45, lengthRatio: 0.5 };

export function isSameQuestion(rawA, rawB, thresholds = DEFAULT_THRESHOLDS) {
  const s = similarity(rawA, rawB);
  return s.key >= thresholds.key && s.full >= thresholds.full && s.lengthRatio >= thresholds.lengthRatio;
}
