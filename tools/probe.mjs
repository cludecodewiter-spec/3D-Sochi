#!/usr/bin/env node
/**
 * 解析器を設計するための調査用ダンプ。
 * 代表的な PDF を数本落として、行単位のテキストと座標を data/probe/ に書き出す。
 * （開発環境から ipa.go.jp に届かないため、Actions 上で実行してコミットさせる）
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { getCached } from './lib/http.mjs';
import { extractPdf, toLines } from './lib/pdf.mjs';

const TARGETS = [
  // 本試験 午前（現行科目Aの前身）
  { key: 'honshiken-2019r01a-am-qs', url: 'https://www.ipa.go.jp/shiken/mondai-kaiotu/2019r01a-att/2019r01a_fe_am_qs.pdf' },
  { key: 'honshiken-2019r01a-am-ans', url: 'https://www.ipa.go.jp/shiken/mondai-kaiotu/2019r01a-att/2019r01a_fe_am_ans.pdf' },
  // 科目A免除 修了試験
  { key: 'menjo-20240728-qs', url: 'https://www.ipa.go.jp/shiken/about/gmcbt800000077l9-att/tokurei_Mondai_20240728_FE.pdf' },
  { key: 'menjo-20240728-ans', url: 'https://www.ipa.go.jp/shiken/about/gmcbt800000077l9-att/tokurei_ans_20240728_FE.pdf' },
  // CBT 公開問題
  { key: 'koukai-2023r05-a-qs', url: 'https://www.ipa.go.jp/shiken/mondai-kaiotu/sg_fe/koukai/t6hhco0000003zx0-att/2023r05_fe_kamoku_a_qs.pdf' },
  { key: 'koukai-2023r05-a-ans', url: 'https://www.ipa.go.jp/shiken/mondai-kaiotu/sg_fe/koukai/t6hhco0000003zx0-att/2023r05_fe_kamoku_a_ans.pdf' },
];

const MAX_PAGES_DUMP = 6;

/** discovery 結果があれば、そこから正確な URL を引く */
async function resolveTargets() {
  let sources = [];
  try {
    sources = JSON.parse(await readFile('data/sources.json', 'utf8')).sources;
  } catch {
    return TARGETS;
  }
  const pick = (pred, key) => {
    const hit = sources.find(pred);
    return hit ? { key, url: hit.url } : null;
  };
  const found = [
    pick((s) => /2019r01a_fe_am_qs/.test(s.url), 'honshiken-2019r01a-am-qs'),
    pick((s) => /2019r01a_fe_am_ans/.test(s.url), 'honshiken-2019r01a-am-ans'),
    pick((s) => /tokurei_Mondai_20240728_FE/.test(s.url), 'menjo-20240728-qs'),
    pick((s) => /tokurei_ans_20240728_FE/.test(s.url), 'menjo-20240728-ans'),
    pick((s) => /2023r05_fe_kamoku_a_qs/.test(s.url), 'koukai-2023r05-a-qs'),
    pick((s) => /2023r05_fe_kamoku_a_ans/.test(s.url), 'koukai-2023r05-a-ans'),
  ].filter(Boolean);
  return found.length ? found : TARGETS;
}

async function main() {
  await mkdir('data/probe', { recursive: true });
  const targets = await resolveTargets();
  const summary = [];

  for (const t of targets) {
    console.log(`\n=== ${t.key}\n    ${t.url}`);
    const { body, status } = await getCached(t.url, `data/pdf-cache/${t.key}.pdf`);
    if (!body) {
      console.log(`    ! ダウンロード失敗 status=${status}`);
      summary.push({ ...t, ok: false, status });
      continue;
    }
    const doc = await extractPdf(body, { detectGraphics: true });
    console.log(`    ページ数: ${doc.numPages}`);

    const dump = [];
    for (const page of doc.pages.slice(0, MAX_PAGES_DUMP)) {
      const lines = toLines(page);
      dump.push({
        page: page.page,
        size: [page.width, page.height],
        hasGraphics: page.hasGraphics,
        lines: lines.map((l) => ({ y: Math.round(l.y), x: Math.round(l.x), text: l.text })),
      });
    }

    // 「問1」「問80」などのアンカー出現状況を全ページで数える
    const anchors = [];
    for (const page of doc.pages) {
      for (const line of toLines(page)) {
        const m = line.text.match(/^問\s*(\d{1,2})\b/);
        if (m) anchors.push({ page: page.page, no: Number(m[1]), x: Math.round(line.x), text: line.text.slice(0, 60) });
      }
    }
    const choiceLines = [];
    for (const page of doc.pages) {
      for (const line of toLines(page)) {
        if (/^[アイウエ]\s/.test(line.text) || /^[アイウエ]$/.test(line.text)) {
          choiceLines.push({ page: page.page, x: Math.round(line.x), text: line.text.slice(0, 60) });
        }
      }
    }

    console.log(`    「問N」行: ${anchors.length} 件 (no の範囲: ${anchors.length ? Math.min(...anchors.map(a=>a.no)) + '〜' + Math.max(...anchors.map(a=>a.no)) : '-'})`);
    console.log(`    選択肢行: ${choiceLines.length} 件`);
    console.log(`    図形を含むページ: ${doc.pages.filter((p) => p.hasGraphics).length}/${doc.numPages}`);

    await writeFile(`data/probe/${t.key}.json`, JSON.stringify({ url: t.url, numPages: doc.numPages, anchors, choiceLines: choiceLines.slice(0, 80), dump }, null, 2));
    summary.push({ ...t, ok: true, numPages: doc.numPages, anchorCount: anchors.length, choiceCount: choiceLines.length });

    // 最初の 2 ページを人が読める形でログにも出す
    for (const p of dump.slice(0, 2)) {
      console.log(`    --- page ${p.page} (${p.lines.length} 行, graphics=${p.hasGraphics}) ---`);
      for (const l of p.lines.slice(0, 40)) console.log(`      [x=${String(l.x).padStart(3)} y=${String(l.y).padStart(3)}] ${l.text}`);
    }
  }

  await writeFile('data/probe/summary.json', JSON.stringify(summary, null, 2));
  console.log('\n=== probe summary ===');
  console.table(summary.map(({ key, ok, numPages, anchorCount, choiceCount }) => ({ key, ok, numPages, anchorCount, choiceCount })));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
