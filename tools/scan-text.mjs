#!/usr/bin/env node
/**
 * sources.json の全 PDF について「テキストが取り出せるか」を調べる。
 * 古い本試験・修了試験の問題冊子はスキャン画像の PDF で、テキストが一切入っていない。
 * どの回がテキスト経路（正確な構造化）で、どの回が画像経路（原本切り出し）になるかを
 * ここで確定させる。憶測で決めない。
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { getCached } from './lib/http.mjs';
import { extractPdf, toLines } from './lib/pdf.mjs';

const LIMIT = Number(process.env.SCAN_LIMIT ?? 0); // 0 = 全件

async function main() {
  const { sources } = JSON.parse(await readFile('data/sources.json', 'utf8'));
  let targets = sources.filter((s) => s.role === 'questions' || s.role === 'answers');
  if (LIMIT) targets = targets.slice(0, LIMIT);

  await mkdir('data/probe', { recursive: true });
  const results = [];

  for (const [i, s] of targets.entries()) {
    const name = s.url.split('/').pop();
    const { body, status } = await getCached(s.url, `data/pdf-cache/${name}`);
    if (!body) {
      results.push({ url: s.url, name, pool: s.pool, role: s.role, ok: false, status });
      console.log(`[${i + 1}/${targets.length}] ${name} … ダウンロード失敗 (${status})`);
      continue;
    }
    let r;
    try {
      const doc = await extractPdf(body);
      let chars = 0;
      let anchors = 0;
      const anchorNos = [];
      for (const page of doc.pages) {
        for (const line of toLines(page)) {
          chars += line.text.length;
          const m = line.text.match(/^問\s*(\d{1,2})[^\d]/);
          if (m) {
            anchors++;
            anchorNos.push(Number(m[1]));
          }
        }
      }
      r = {
        url: s.url,
        name,
        pool: s.pool,
        role: s.role,
        subject: s.subject,
        legacySection: s.legacySection,
        year: s.year,
        ok: true,
        pages: doc.numPages,
        chars,
        anchors,
        maxAnchor: anchorNos.length ? Math.max(...anchorNos) : 0,
        route: chars > 200 ? 'text' : 'image',
      };
    } catch (e) {
      r = { url: s.url, name, pool: s.pool, role: s.role, ok: false, error: String(e).slice(0, 120) };
    }
    results.push(r);
    console.log(
      `[${i + 1}/${targets.length}] ${name} … ${r.ok ? `${r.pages}p chars=${r.chars} anchors=${r.anchors} → ${r.route}` : 'ERROR'}`,
    );
  }

  await writeFile('data/probe/text-scan.json', JSON.stringify(results, null, 2));

  // 集計
  const agg = {};
  for (const r of results) {
    if (!r.ok) continue;
    const k = `${r.pool}/${r.role}/${r.route}`;
    agg[k] = (agg[k] ?? 0) + 1;
  }
  console.log('\n=== 経路の内訳 ===');
  for (const [k, v] of Object.entries(agg).sort()) console.log(`  ${k}: ${v} 件`);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log(`\n取得/解析失敗: ${failed.length} 件`);
    for (const f of failed.slice(0, 20)) console.log(`  ${f.name} ${f.status ?? f.error}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
