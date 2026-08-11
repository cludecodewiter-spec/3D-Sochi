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
import { parseAnswers, FIELD_LABEL } from './lib/segment.mjs';
import { anchorsFromWords, longestIncreasing, usableAnchors } from './lib/anchors.mjs';
import { resolveEra } from './lib/era.mjs';

const run = promisify(execFile);

const OUT_DIR = 'data/questions';
const IMG_DIR = 'data/figures';
const QUARANTINE_DIR = 'data/quarantine';
const WORK = '.cache/render';

// 日本語 OCR は 150dpi では読み落としが多い。300dpi で描画し、
// 保存する切り出し画像だけ縮小する。
const DPI = Number(process.env.RENDER_DPI ?? 300);
/** 保存する切り出し画像の最大幅（ピクセル） */
const OUT_MAX_WIDTH = Number(process.env.OUT_MAX_WIDTH ?? 1400);
/** 「問N」を探すためだけに OCR する左端の帯の幅（ページ幅に対する比） */
const LEFT_STRIP_RATIO = Number(process.env.LEFT_STRIP_RATIO ?? 0.3);
/** 取り込む回数の上限（0 = 制限なし）。段階的に増やすための安全弁 */
const MAX_EXAMS = Number(process.env.MAX_EXAMS ?? 0);
const ONLY = process.env.ONLY ?? '';
/** OCR の生出力を data/probe に残す（検出不良の原因調査用） */
const DEBUG_OCR = process.env.DEBUG_OCR === '1';
/** 1 回ぶんの処理にかける時間の上限（秒）。0 で無制限 */
const TIME_BUDGET_SEC = Number(process.env.TIME_BUDGET_SEC ?? 0);

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
async function ocrImage(pngPath, psm = '6') {
  const { stdout } = await run(
    'tesseract',
    [pngPath, 'stdout', '-l', 'jpn', '--oem', '1', '--psm', psm, '--dpi', String(DPI), 'tsv'],
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

function sourceLabel(src, no) {
  const resolved = resolveEra(src);
  const era = resolved?.era ?? '';
  const season = resolved?.season ? ` ${resolved.season}` : '';
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
  const ocrSamples = [];

  const startedAt = Date.now();
  for (const [i, q] of targets.entries()) {
    if (TIME_BUDGET_SEC && (Date.now() - startedAt) / 1000 > TIME_BUDGET_SEC) {
      console.log(`時間の上限 ${TIME_BUDGET_SEC}s に達したのでここまでにする（${i}/${targets.length} 回を処理）`);
      break;
    }
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
      const width = meta.width ?? 1;
      const height = meta.height ?? 1;

      // 左端の帯だけを OCR して「問N」を拾う
      const stripWidth = Math.round(width * LEFT_STRIP_RATIO);
      const stripPath = png.replace(/\.png$/, '-strip.png');
      await sharp(png).extract({ left: 0, top: 0, width: stripWidth, height }).normalize().toFile(stripPath);
      const stripWords = await ocrImage(stripPath);
      const anchors = anchorsFromWords(stripWords, stripWidth);

      // 検出できない原因を推測で潰さないよう、最初の数ページの生の OCR 出力を残す
      if (DEBUG_OCR && ocrSamples.length < 3) {
        ocrSamples.push({
          pdf: qName,
          page: pageNoOf(png),
          pageWidth: width,
          stripWidth,
          wordCount: stripWords.length,
          words: stripWords.slice(0, 40),
          anchors,
        });
      }

      pageAnchors.push({ png, page: pageNoOf(png), height, width, anchors, words: [] });
    }
    const rawFlat = pageAnchors.flatMap((p) => p.anchors.map((x) => ({ ...x, page: p.page, pageInfo: p })));
    // OCR の誤読を落としてから連番チェックにかける
    const flat = longestIncreasing(rawFlat);
    if (flat.length !== rawFlat.length) {
      console.log(`  OCR 誤読とみなして除外: ${rawFlat.length - flat.length} 件`);
    }
    const sanity = usableAnchors(flat, expectedCount);
    console.log(
      `  OCR アンカー: ${flat.length} 件 / 使える問題: ${sanity.usable?.length ?? 0} 件 → ${sanity.ok ? `OK (${Math.round((sanity.coverage ?? 0) * 100)}%)` : '不採用: ' + sanity.why}`,
    );
    console.log(`    検出した問番号: ${flat.map((x) => x.no).join(',').slice(0, 300)}`);
    const missing = [];
    for (let n = 1; n <= expectedCount; n++) if (!flat.some((x) => x.no === n)) missing.push(n);
    if (missing.length) console.log(`    見つからなかった問番号: ${missing.join(',').slice(0, 200)}`);
    report.push({
      exam: examKey,
      pages: pngs.length,
      anchors: flat.length,
      usable: sanity.usable?.length ?? 0,
      expected: expectedCount,
      ok: sanity.ok,
      why: sanity.why,
    });

    if (!sanity.ok) {
      quarantined.push({ pdf: q.url, reason: sanity.why, anchors: flat.map((x) => ({ no: x.no, page: x.page })) });
      await rm(workDir, { recursive: true, force: true });
      continue;
    }

    // アンカー間を切り出す
    const outImgDir = `${IMG_DIR}/${examKey}`;
    await mkdir(outImgDir, { recursive: true });
    const questions = [];

    for (const cur of sanity.usable) {
      const next = cur.next;
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
          .resize({ width: Math.min(info.width, OUT_MAX_WIDTH), withoutEnlargement: true })
          .webp({ quality: 78 })
          .toFile(`${outImgDir}/${file}`);
        pieces.push(`figures/${examKey}/${file}`);
      }

      // 重複判定用の OCR テキストは、ページ全体を OCR する必要があり
      // 1 回あたり数分かかる。88 回ぶんでは現実的でないので今は取らない。
      // （画像経路どうしの名寄せは後日の課題。重複が残っても出題内容は正しい）
      const key = answers.get(cur.no);
      if (!key || pieces.length === 0) {
        quarantined.push({ pdf: q.url, no: cur.no, reason: !key ? 'no answer' : 'empty crop' });
        continue;
      }

      questions.push({
        id: `${examKey}-q${String(cur.no).padStart(2, '0')}`,
        pool: q.pool,
        exam: {
          year: resolveEra(q)?.year ?? q.year ?? 0,
          era: resolveEra(q)?.era ?? String(q.year ?? ''),
          ...(resolveEra(q)?.season ? { season: resolveEra(q).season } : q.season ? { season: q.season } : {}),
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
  if (DEBUG_OCR) {
    await writeFile('data/probe/ocr-words-sample.json', JSON.stringify(ocrSamples, null, 1));
    console.log(`OCR の生出力を data/probe/ocr-words-sample.json に保存（${ocrSamples.length} ページぶん）`);
  }
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
