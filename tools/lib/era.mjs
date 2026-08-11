/**
 * IPA のファイル名・URL から和暦の年度を復元する。
 *
 * IPA の命名は `2023r05`（令和5年度）、`2019h31`（平成31年度）、
 * `2019r01a`（令和元年度 秋期）のようになっている。
 * 出典表記は IPA の利用条件で求められるものなので、
 * 「2023年度」ではなく実際の表記「令和5年度」を使う。
 */
const SEASON = { h: '春期', a: '秋期' };

export function eraFromKey(key) {
  const m = String(key).match(/(\d{4})([hr])(\d{2})([ha])?/);
  if (!m) return null;
  const [, western, gengoCode, numStr, seasonCode] = m;
  const num = Number(numStr);
  const gengo = gengoCode === 'r' ? '令和' : '平成';
  // 元年は「1年度」ではなく「元年度」と書く
  const yearLabel = num === 1 ? '元' : String(num);
  return {
    era: `${gengo}${yearLabel}年度`,
    year: Number(western),
    season: seasonCode ? SEASON[seasonCode] : null,
  };
}

/**
 * 修了試験（特例措置）は実施日で公開されている。
 * 年度は 4〜3 月区切りなので、1〜3 月実施は前年度扱いにする。
 */
export function eraFromDate(dateStr) {
  const m = String(dateStr).match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const fiscalYear = month <= 3 ? year - 1 : year;
  // 令和は 2019 年 5 月 1 日から。2019 年度は令和元年度
  const gengo = fiscalYear >= 2019 ? '令和' : '平成';
  const num = gengo === '令和' ? fiscalYear - 2018 : fiscalYear - 1988;
  const yearLabel = num === 1 ? '元' : String(num);
  return { era: `${gengo}${yearLabel}年度`, year: fiscalYear, season: null };
}

/** 問題 PDF の情報から出典表記に使う年度を決める */
export function resolveEra(src) {
  const fromKey = eraFromKey(src.url.split('/').pop() ?? '');
  if (fromKey) return fromKey;
  if (src.date) return eraFromDate(src.date);
  if (/sample/i.test(src.url)) return { era: '2022年公開', year: 2022, season: null };
  return null;
}

/**
 * プールごとの試験名。出典表記に使う。
 *
 * IPA の利用条件は出典明示を求めているので、応用情報や
 * 情報セキュリティマネジメントの問題を「基本情報技術者試験」と
 * 書いてしまうと出典の偽りになる。プールから機械的に決める。
 */
const EXAM_NAMES = {
  'ext-ap': '応用情報技術者試験',
  'ext-sg': '情報セキュリティマネジメント試験',
};

export function examName(pool) {
  return EXAM_NAMES[pool] ?? '基本情報技術者試験';
}
