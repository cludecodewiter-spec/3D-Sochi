#!/usr/bin/env node
/**
 * IPA 公式サイトを巡回し、基本情報技術者試験（FE）に関する
 * 公開 PDF（問題冊子・解答例）をすべて列挙する。
 *
 * 出力:
 *   data/discovery-raw.json … 巡回で見つかった PDF リンク全件（分類前・調査用）
 *   data/sources.json       … FE 関連として分類できた取り込み対象一覧
 *
 * 「手書きの URL リストを使わない」ことが重要。手書きだと題源を取りこぼす。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { get, extractLinks } from './lib/http.mjs';

const ORIGIN = 'https://www.ipa.go.jp';
const INDEX = `${ORIGIN}/shiken/mondai-kaiotu/index.html`;
const MENJO = `${ORIGIN}/shiken/about/menjo-fe.html`;

/**
 * 追加で巡回するページ（年度ページは index から自動発見する）。
 * CBT 公開問題は /shiken/mondai-kaiotu/sg_fe/koukai/ 配下にあり、
 * 通常の年度ページからはリンクされていないため明示的に列挙する。
 */
const KOUKAI_YEARS = ['2023r05', '2024r06', '2025r07', '2026r08'];
const EXTRA_SEEDS = [
  MENJO,
  `${ORIGIN}/shiken/mondai-kaiotu/sg_fe/koukai/index.html`,
  ...KOUKAI_YEARS.map((y) => `${ORIGIN}/shiken/mondai-kaiotu/sg_fe/koukai/${y}.html`),
  `${ORIGIN}/shiken/syllabus/henkou/2022/index.html`,
  `${ORIGIN}/shiken/syllabus/index.html`,
  `${ORIGIN}/shiken/syllabus/henkou/2022/ssf7ph000000h5tb.html`,
];

/**
 * 巡回では届かない既知のサンプル問題 PDF。
 * 404 のものは fetch 段階で落ちるだけなので、候補として入れておく。
 */
const KNOWN_PDFS = [
  '/shiken/syllabus/henkou/2022/ssf7ph000000h5tb-att/fe_kamoku_a_set_sample_qs.pdf',
  '/shiken/syllabus/henkou/2022/ssf7ph000000h5tb-att/fe_kamoku_a_set_sample_ans.pdf',
  '/shiken/syllabus/henkou/2022/ssf7ph000000h5tb-att/fe_kamoku_b_set_sample_qs.pdf',
  '/shiken/syllabus/henkou/2022/ssf7ph000000h5tb-att/fe_kamoku_b_set_sample_ans.pdf',
  '/shiken/syllabus/ps6vr7000000oett-att/fe_kamoku_b_sample.pdf',
].map((p) => ({ url: ORIGIN + p, text: 'サンプル問題', heading: '新制度サンプル問題（2022）' }));

const log = (...a) => console.log(...a);

async function crawlPage(url) {
  const res = await get(url);
  if (!res.ok) {
    log(`  ! ${url} -> ${res.status}`);
    return { html: null, links: [] };
  }
  return { html: res.body, links: extractLinks(res.body, res.url) };
}

/** 年度ページ /shiken/mondai-kaiotu/2019h31.html などを index から拾う */
function yearPagesFrom(links) {
  const seen = new Set();
  for (const l of links) {
    if (/\/shiken\/mondai-kaiotu\/\d{4}[hr]\d{2}\.html$/.test(l.url)) seen.add(l.url);
  }
  return [...seen].sort();
}

/** CBT 公開問題ページ /shiken/mondai-kaiotu/sg_fe/koukai/2023r05.html など */
function koukaiPagesFrom(links) {
  const seen = new Set();
  for (const l of links) {
    if (/\/shiken\/mondai-kaiotu\/sg_fe\/koukai\/\d{4}[hr]\d{2}\.html$/.test(l.url)) seen.add(l.url);
  }
  return [...seen].sort();
}

// ---------------------------------------------------------------- 分類

const isPdf = (u) => /\.pdf($|\?)/i.test(u);

/**
 * ファイル名・リンクテキスト・見出しから FE 関連 PDF を分類する。
 * 判定できないものは kind:'unknown' として raw に残し、sources には入れない。
 */
export function classify(link) {
  const url = link.url;
  const file = url.split('/').pop();
  const ctx = `${link.heading} ${link.text}`;

  // 1) 科目A免除 修了試験（特例措置）
  //    新しい回: tokurei_Mondai_20240728_FE.pdf（YYYYMMDD）
  //    古い回  : tokurei_Mondai_200906_FE.pdf （YYYYMM、2009〜2011 頃）
  let m = file.match(/^tokurei_(Mondai|ans)_(\d{4})(\d{2})(\d{2})?_FE\.pdf$/i);
  if (m) {
    const [, role, y, mo, d] = m;
    return {
      pool: 'fe-menjo',
      examKey: `fe-menjo-${y}${mo}${d ?? ''}`,
      role: /mondai/i.test(role) ? 'questions' : 'answers',
      subject: 'kamokuA',
      legacySection: '修了試験',
      year: Number(y),
      date: d ? `${y}-${mo}-${d}` : `${y}-${mo}`,
      era: link.heading || null,
      season: null,
      url,
    };
  }

  // 2) 本試験 年度ページの FE PDF: 2019h31h_fe_am_qs.pdf / ..._ans.pdf など
  //    命名は年度で揺れるため、要素を個別に拾う。
  const feInFile = /(^|[^a-z])fe([^a-z]|$)/i.test(file);
  const feInCtx = /基本情報技術者試験|基本情報/.test(ctx);
  if (isPdf(url) && (feInFile || feInCtx)) {
    const ym = file.match(/(\d{4})([hr])(\d{2})([ha])?/i) || url.match(/\/(\d{4})[hr]\d{2}\//);
    const isAns = /(_ans|kaito|kaitou|解答)/i.test(file) || /解答/.test(ctx);
    const isQs = /(_qs|mondai|問題)/i.test(file) || /問題/.test(ctx);
    const isPm = /_pm|午後/i.test(`${file} ${ctx}`);
    const isAm = /_am|午前/i.test(`${file} ${ctx}`);
    const isKamokuA = /kamoku_a|科目A/i.test(`${file} ${ctx}`);
    const isKamokuB = /kamoku_b|科目B/i.test(`${file} ${ctx}`);
    const isSample = /sample|サンプル/i.test(`${file} ${ctx}`);
    const isKoukai = /koukai|公開問題/i.test(`${url} ${ctx}`);

    // 採点講評・配点割合などは対象外
    if (/(kouhyou|cmnt|comment|haiten|講評|配点)/i.test(`${file} ${ctx}`)) {
      return { role: 'skip', reason: 'commentary/weights', url };
    }

    let subject = null;
    let legacySection = null;
    if (isKamokuA) { subject = 'kamokuA'; legacySection = isSample ? 'サンプル問題' : '公開問題'; }
    else if (isKamokuB) { subject = 'kamokuB'; legacySection = isSample ? 'サンプル問題' : '公開問題'; }
    else if (isAm) { subject = 'kamokuA'; legacySection = '午前'; }
    else if (isPm) { subject = 'kamokuB'; legacySection = '午後'; }

    if (subject) {
      const year = ym ? Number(ym[1]) : null;
      const seasonCode = ym && ym[4] ? ym[4].toLowerCase() : null;
      return {
        pool: isSample ? 'fe-sample' : isKoukai ? 'fe-koukai' : 'fe-honshiken',
        examKey: `fe-${file.replace(/\.pdf$/i, '')}`,
        role: isAns ? 'answers' : isQs ? 'questions' : 'unknown',
        subject,
        legacySection,
        year,
        season: seasonCode === 'h' ? '春期' : seasonCode === 'a' ? '秋期' : null,
        era: null,
        url,
      };
    }
  }

  return { role: 'unknown', url, file, ctx: ctx.slice(0, 120) };
}

// ---------------------------------------------------------------- main

async function main() {
  log('=== discover: IPA 公開 PDF の全件列挙 ===');

  log(`\n[1] index: ${INDEX}`);
  const index = await crawlPage(INDEX);
  const yearPages = yearPagesFrom(index.links);
  log(`  年度ページ ${yearPages.length} 件: ${yearPages.map((u) => u.split('/').pop()).join(', ')}`);

  const pages = [INDEX, ...yearPages, ...EXTRA_SEEDS];
  const allLinks = [...index.links];
  const visited = new Set([INDEX]);

  log(`\n[2] 各ページを巡回`);
  for (const page of pages) {
    if (visited.has(page)) continue;
    visited.add(page);
    const { links } = await crawlPage(page);
    log(`  ${page.replace(ORIGIN, '')} -> リンク ${links.length} 件 / PDF ${links.filter((l) => isPdf(l.url)).length} 件`);
    allLinks.push(...links);
  }

  // 公開問題ページ（年度ページから発見できることが多いが、直接も探す）
  const koukaiPages = koukaiPagesFrom(allLinks);
  log(`\n[3] CBT 公開問題ページ ${koukaiPages.length} 件`);
  for (const page of koukaiPages) {
    if (visited.has(page)) continue;
    visited.add(page);
    const { links } = await crawlPage(page);
    log(`  ${page.replace(ORIGIN, '')} -> PDF ${links.filter((l) => isPdf(l.url)).length} 件`);
    allLinks.push(...links);
  }

  // PDF リンクを一意化
  const pdfMap = new Map();
  for (const l of [...allLinks, ...KNOWN_PDFS]) {
    if (!isPdf(l.url)) continue;
    if (!pdfMap.has(l.url)) pdfMap.set(l.url, l);
  }
  const pdfs = [...pdfMap.values()];
  log(`\n[4] 一意な PDF リンク: ${pdfs.length} 件`);

  const raw = pdfs.map((l) => ({ ...l, classified: classify(l) }));
  const sources = raw
    .map((r) => r.classified)
    .filter((c) => c.role === 'questions' || c.role === 'answers');

  // 出力
  await mkdir('data', { recursive: true });
  await writeFile('data/discovery-raw.json', JSON.stringify({ crawledAt: new Date().toISOString(), pages: [...visited], pdfs: raw }, null, 2));
  await writeFile('data/sources.json', JSON.stringify({ crawledAt: new Date().toISOString(), sources }, null, 2));

  // レポート
  const byPool = {};
  for (const s of sources) byPool[s.pool] = (byPool[s.pool] || 0) + 1;
  log(`\n=== 分類結果 ===`);
  for (const [pool, n] of Object.entries(byPool).sort()) log(`  ${pool}: ${n} 件`);
  const unknown = raw.filter((r) => r.classified.role === 'unknown');
  log(`  未分類: ${unknown.length} 件`);
  log(`\n--- 未分類サンプル（分類器の改善用に最大 40 件） ---`);
  for (const u of unknown.slice(0, 40)) {
    log(`  ${u.url.replace(ORIGIN, '')}  |  ${u.heading} | ${u.text}`.slice(0, 200));
  }
  log(`\n--- 取り込み対象（最大 60 件表示） ---`);
  for (const s of sources.slice(0, 60)) {
    log(`  [${s.pool}/${s.role}] ${s.legacySection ?? '-'} ${s.year ?? '-'} ${s.season ?? ''} ${s.url.replace(ORIGIN, '')}`);
  }
  log(`\n合計 sources: ${sources.length} 件 → data/sources.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
