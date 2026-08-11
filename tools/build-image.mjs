#!/usr/bin/env node
/**
 * スキャン PDF（本試験 午前・修了試験）の取り込み。
 *
 * 方針:
 *   OCR は「問N がページのどこにあるか」を突き止めるためだけに使い、
 *   出題時に見せるのは PDF の該当領域を切り出した画像そのもの。
 *   これにより OCR の誤読が問題文に混入する余地をなくす。
 *   正解は公式「解答例」PDF（テキストが取れる）から取る。
 *
 * 検証ゲート:
 *   検出したアンカーが 1..N の連番になっていない回は、まるごと隔離する。
 *   「たぶんこの位置だろう」で切った問題は出さない。
 */
import { mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { getCached, sha256 } from './lib/http.mjs';
import { extractPdf } from './lib/pdf.mjs';
import { parseAnswers, FIELD_LABEL, normalizeDigits } from './lib/segment.mjs';

const run = promisify(execFile);

const OUT_DIR = 'data/questions';
const IMG_DIR = 'data/figures';
const QUARANTINE_DIR = 'data/quarantine';
const WORK = '.cache/render';

const DPI = Number(process.env.RENDER_DPI ?? 150);
/** 取り込む回数の上限（0 = 制限なし）。段階的に増やすための安全弁 */
const MAX_EXAMS = Number(process.env.MAX_EXAMS ?? 0);
const ONLY = process.env.ONLY ?? '';

/** ページを PNG に描画する（poppler-utils はランナーに入っている） */
async function renderPages(pdfPath, outPrefix) {
  await run('pdftoppm', ['-r', String(DPI), '-gray', '-png', pdfPath, outPrefix], {
    maxBuffer: 1024 * 1024 * 64,
  });
  const dir = outPrefix.split('/').slice(0, -1).join('/');
  const base = outPrefix.split('/').pop();
  const files = (await readdir(dir))
    .filter((f) => f.startsWith(base + '-') && f.endsWith('.png'))
    .sort((a, b) => pageNoOf(a) - pageNoOf(b));
  return files.map((f) => `${dir}/${f}`);
}

const pageNoOf = (f) => Number(f.match(/-(\d+)\.png$/)?.[1] ?? 0);

/** tesseract の TSV から単語ボックスを得る */
async function ocrPage(pngPath) {
  const { stdout } = await run(
    'tesseract',
    [pngPath, 'stdout', '-l', 'jpn', '--psm', '6', '--dpi', String(DPI), 'tsv'],
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
 * 「問N」を左マージン付近から探す。
 * OCR は「問 1」と分かち書きしたり「間1」と誤読したりするので、
 * 同じ行の先頭 2 語をつないで判定し、誤読しやすい字も許容する。
 */
function findAnchorsOnPage(words, pageWidth) {
  const leftZone = pageWidth * 0.28;
  const byLine = new Map();
  for (const w of words) {
    const lineKey = Math.round(w.y / 12);
    if (!byLine.has(lineKey)) byLine.set(lineKey, []);
    byLine.get(lineKey).push(w);
  }
  const anchors = [];
  for (const line of byLine.values()) {
    line.sort((a, b) => a.x - b.x);
    const head = line[0];
    if (!head || head.x > leftZone) continue;
    const joined = normalizeDigits(line.slice(0, 2).map((w) => w.text).join('')).replace(/\s/g, '');
    const m = joined.match(/^[問問間間]\s*(\d{1,3})/);
    if (!m) continue;
    const no = Number(m[1]);
    if (no < 1 || no > 100) continue;
    anchors.push({ no, x: head.x, y: head.y, conf: head.conf });
  }
  anchors.sort((a, b) => a.y - b.y);
  return anchors;
}

/** 1..expected の連番になっているかを厳しく見る */
function anchorsAreSane(anchors, expected) {
  if (anchors.length !== expected) return { ok: false, why: `アンカー ${anchors.length} 件 ≠ 期待 ${expected} 件` };
  for (let i = 0; i < anchors.length; i++) {
    if (anchors[i].no !== i + 1) {
      return { ok: false, why: `${i + 1} 番目のアンカーが 問${anchors[i].no}（連番でない）` };
    }
  }
  return { ok: true };
}

function sourceLabel(src, no) {
  const era = src.era || (src.year ? `${src.year}年度` : '');
  const season = src.season ? ` ${src.season}` : '';
  const section = src.legacySection ? ` ${src.legacySection}` : '';
  const date = src.date && src.legacySection === '修了試験' ? `（${src.date} 実施）` : '';
  return `出典：${era}${season} 基本情報技術者試験${section}${date} 問${no}`.replace(/\s{2,}/g, ' ');
}

async function main() {
  const { sources } = JSON.parse(await readFile('data/sources.json', 'utf8'));
  const scan = JSON.parse(await readFile('data/probe/text-scan.json', 'utf8'));
  const routeOf = new Map(scan.filter((s) => s.ok).map((s) => [s.url, s.route]));

  const questionsSrc = sources.filter(
    (s) => s.role === 'questions' && routeOf.get(s.url) === 'image' && s.subject === 'kamokuA',
  );
  const answersSrc = sources.filter((s) => s.role === 'answers');

  let targets = questionsSrc;
  if (ONLY) targets = targets.filter((s) => s.url.includes(ONLY));
  if (MAX_EXAMS) targets = targets.slice(0, MAX_EXAMS);

  console.log(`画像経路の対象: ${targets.length} 回 (画像経路の科目A問題 PDF は全 ${questionsSrc.length} 本)`);
  for (const t of targets) console.log(`  - ${t.url.split('/').pop()} (${t.pool}, ${t.legacySection ?? '-'})`);
  if (targets.length === 0) {
    console.log('対象が 0 件です。text-scan.json の route 判定を確認してください。');
  }

  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(QUARANTINE_DIR, { recursive: true });
  await mkdir(WORK, { recursive: true });

  const shards = [];
  const quarantined = [];
  const report = [];

  for (const [i, q] of targets.entries()) {
    const qName = q.url.split('/').pop();
    const expected = qName.replace(/_qs\.pdf$/i, '_ans.pdf').replace(/^tokurei_Mondai_/i, 'tokurei_ans_');
    const a = answersSrc.find((x) => x.url.split('/').pop() === expected);
    console.log(`\n[${i + 1}/${targets.length}] ${qName}`);

    if (!a || routeOf.get(a.url) !== 'text') {
      console.log('  ! 解答例 PDF が無い／テキストが取れない → 隔離');
      quarantined.push({ pdf: q.url, reason: 'answer pdf unavailable' });
      continue;
    }

    const qFile = await getCached(q.url, `data/pdf-cache/${qName}`);
    const aFile = await getCached(a.url, `data/pdf-cache/${expected}`);
    if (!qFile.body || !aFile.body) {
      quarantined.push({ pdf: q.url, reason: 'download failed' });
      continue;
    }

    const answers = parseAnswers((await extractPdf(aFile.body)).pages);
    const expectedCount = answers.size;
    console.log(`  解答例: ${expectedCount} 問`);
    if (expectedCount === 0) {
      quarantined.push({ pdf: q.url, reason: 'answer pdf yielded no answers' });
      continue;
    }

    const examKey = qName.replace(/\.pdf$/i, '').replace(/_qs$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const workDir = `${WORK}/${examKey}`;
    await rm(workDir, { recursive: true, force: true });
    await mkdir(workDir, { recursive: true });
    await rm(`${OUT_DIR}/${examKey}.json`, { force: true });
    const pngs = await renderPages(`data/pdf-cache/${qName}`, `${workDir}/p`);
    console.log(`  描画: ${pngs.length} ページ @${DPI}dpi`);

    // 全ページを OCR してアンカーを集める
    const pageAnchors = [];
    for (const png of pngs) {
      const meta = await sharp(png).metadata();
      const words = await ocrPage(png);
      const anchors = findAnchorsOnPage(words, meta.width ?? 1);
      pageAnchors.push({ png, page: pageNoOf(png), height: meta.height ?? 0, width: meta.width ?? 0, anchors });
    }
    const flat = pageAnchors.flatMap((p) => p.anchors.map((x) => ({ ...x, page: p.page, pageInfo: p })));
    const sanity = anchorsAreSane(flat, expectedCount);
    console.log(`  OCR アンカー: ${flat.length} 件 → ${sanity.ok ? 'OK' : '不採用: ' + sanity.why}`);
    console.log(`    検出した問番号: ${flat.map((x) => x.no).join(',').slice(0, 300)}`);
    const missing = [];
    for (let n = 1; n <= expectedCount; n++) if (!flat.some((x) => x.no === n)) missing.push(n);
    if (missing.length) console.log(`    見つからなかった問番号: ${missing.join(',').slice(0, 200)}`);
    report.push({ exam: examKey, pages: pngs.length, anchors: flat.length, expected: expectedCount, ok: sanity.ok, why: sanity.why });

    if (!sanity.ok) {
      quarantined.push({ pdf: q.url, reason: sanity.why, anchors: flat.map((x) => ({ no: x.no, page: x.page })) });
      await rm(workDir, { recursive: true, force: true });
      continue;
    }

    // アンカー間を切り出す
    const outImgDir = `${IMG_DIR}/${examKey}`;
    await mkdir(outImgDir, { recursive: true });
    const questions = [];

    for (let k = 0; k < flat.length; k++) {
      const cur = flat[k];
      const next = flat[k + 1];
      const pad = Math.round(DPI * 0.06); // 上下の余白
      const pieces = [];

      const startPage = cur.page;
      const endPage = next ? next.page : pageAnchors[pageAnchors.length - 1].page;

      for (let p = startPage; p <= endPage; p++) {
        const info = pageAnchors.find((x) => x.page === p);
        if (!info) continue;
        const top = p === startPage ? Math.max(0, cur.y - pad) : Math.round(info.height * 0.08);
        const bottom =
          next && p === endPage
            ? Math.max(top + 1, next.y - pad)
            : Math.round(info.height * 0.93);
        const height = Math.max(1, bottom - top);
        if (height < DPI * 0.15) continue; // 実質空の切れ端は捨てる
        const file = `${examKey}-q${String(cur.no).padStart(2, '0')}${pieces.length ? `-${pieces.length + 1}` : ''}.webp`;
        await sharp(info.png)
          .extract({ left: 0, top, width: info.width, height })
          .trim({ threshold: 12 })
          .webp({ quality: 78 })
          .toFile(`${outImgDir}/${file}`);
        pieces.push(`figures/${examKey}/${file}`);
      }

      const key = answers.get(cur.no);
      if (!key || pieces.length === 0) {
        quarantined.push({ pdf: q.url, no: cur.no, reason: !key ? 'no answer' : 'empty crop' });
        continue;
      }

      questions.push({
        id: `${examKey}-q${String(cur.no).padStart(2, '0')}`,
        pool: q.pool,
        exam: {
          year: q.year ?? 0,
          era: q.era ?? String(q.year ?? ''),
          ...(q.season ? { season: q.season } : {}),
          subject: 'kamokuA',
          ...(q.legacySection ? { legacySection: q.legacySection } : {}),
        },
        no: cur.no,
        format: 'image',
        images: pieces,
        ...(key.field && FIELD_LABEL[key.field] ? { category: FIELD_LABEL[key.field] } : {}),
        answer: key.answer,
        source: {
          label: sourceLabel(q, cur.no),
          questionPdf: q.url,
          answerPdf: a.url,
          page: cur.page,
          sha256: qFile.sha256 ?? sha256(qFile.body),
        },
        verified: true,
        modified: false,
      });
    }

    await rm(workDir, { recursive: true, force: true });

    if (questions.length === 0) continue;
    const file = `${examKey}.json`;
    await writeFile(`${OUT_DIR}/${file}`, JSON.stringify(questions, null, 1));
    shards.push({ file, pool: q.pool, examKey, label: sourceLabel(q, 1).replace(/ 問1$/, ''), count: questions.length });
    console.log(`  → ${questions.length} 問を取り込み`);
  }

  await writeFile(`${QUARANTINE_DIR}/image-route.json`, JSON.stringify(quarantined, null, 1));
  await writeFile('data/probe/image-route-report.json', JSON.stringify(report, null, 1));

  // index.json を既存分とマージして更新
  let existing = { shards: [] };
  try {
    existing = JSON.parse(await readFile(`${OUT_DIR}/index.json`, 'utf8'));
  } catch {
    /* まだ無い */
  }
  const merged = [...existing.shards.filter((s) => !shards.some((n) => n.file === s.file)), ...shards];
  await writeFile(
    `${OUT_DIR}/index.json`,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), totalQuestions: merged.reduce((n, s) => n + s.count, 0), shards: merged },
      null,
      1,
    ),
  );

  const okCount = report.filter((r) => r.ok).length;
  console.log(`\n=== 画像経路: ${okCount}/${report.length} 回が検証通過、${shards.reduce((n, s) => n + s.count, 0)} 問を取り込み`);
  for (const r of report.filter((x) => !x.ok).slice(0, 20)) console.log(`  不採用 ${r.exam}: ${r.why}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
