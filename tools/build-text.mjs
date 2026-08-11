#!/usr/bin/env node
/**
 * テキストが取り出せる PDF（CBT 公開問題・サンプル問題）を構造化して
 * data/questions/*.json を作る。
 *
 * 原則:
 *  - 問題文・選択肢は PDF のテキストをそのまま使う。要約も補完もしない。
 *  - 正解は必ず公式「解答例」PDF 由来。推測しない。
 *  - 検証に通らなかった問題は data/quarantine/ に隔離し、本題庫には入れない。
 */
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { getCached, sha256 } from './lib/http.mjs';
import { extractPdf } from './lib/pdf.mjs';
import { findAnchors, splitQuestion, parseAnswers, questionDefects, FIELD_LABEL } from './lib/segment.mjs';
import { resolveEra } from './lib/era.mjs';

const OUT_DIR = 'data/questions';
const QUARANTINE_DIR = 'data/quarantine';

/** 解答例 PDF を、対応する問題 PDF に結び付ける */
function pairSources(sources) {
  const questions = sources.filter((s) => s.role === 'questions');
  const answers = sources.filter((s) => s.role === 'answers');
  const pairs = [];
  for (const q of questions) {
    const qName = q.url.split('/').pop();
    const expected = qName
      .replace(/_qs\.pdf$/i, '_ans.pdf')
      .replace(/^tokurei_Mondai_/i, 'tokurei_ans_')
      .replace(/_sample\.pdf$/i, '_sample_ans.pdf');
    const a = answers.find((x) => x.url.split('/').pop() === expected);
    pairs.push({ q, a: a ?? null, qName, expected });
  }
  return pairs;
}

/** 出典ラベル: 出典：令和5年度 基本情報技術者試験 公開問題 科目A 問1 */
function sourceLabel(src, no) {
  const era = resolveEra(src);
  const parts = ['出典：'];
  if (era?.era) parts.push(`${era.era} `);
  if (era?.season) parts.push(`${era.season} `);
  parts.push('基本情報技術者試験 ');
  if (src.legacySection) parts.push(`${src.legacySection} `);
  if (src.subject === 'kamokuA') parts.push('科目A ');
  else if (src.subject === 'kamokuB') parts.push('科目B ');
  parts.push(`問${no}`);
  return parts.join('').replace(/\s+/g, ' ').replace('出典： ', '出典：');
}

/**
 * 年度を決める。ファイル名に年が無いサンプル問題は、
 * 新制度サンプルが公開された 2022 年度として扱う（推測ではなく公開年）。
 */
function yearOf(src) {
  if (src.year) return src.year;
  const m = src.url.match(/\/(\d{4})[hr]\d{2}/) || src.url.match(/henkou\/(\d{4})\//);
  if (m) return Number(m[1]);
  if (/sample/i.test(src.url)) return 2022;
  return 0;
}

function examKeyOf(src) {
  return src.url.split('/').pop().replace(/\.pdf$/i, '').replace(/_qs$/, '');
}

async function main() {
  const { sources } = JSON.parse(await readFile('data/sources.json', 'utf8'));
  let scan = [];
  try {
    scan = JSON.parse(await readFile('data/probe/text-scan.json', 'utf8'));
  } catch {
    console.error('data/probe/text-scan.json がありません。先に scan-text を実行してください。');
    process.exit(1);
  }
  const routeOf = new Map(scan.filter((s) => s.ok).map((s) => [s.url, s.route]));

  const textQuestionUrls = new Set(
    scan.filter((s) => s.ok && s.role === 'questions' && s.route === 'text').map((s) => s.url),
  );
  const pairs = pairSources(sources).filter((p) => textQuestionUrls.has(p.q.url));

  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(QUARANTINE_DIR, { recursive: true });

  const shards = [];
  const quarantined = [];
  let totalQuestions = 0;

  for (const { q, a, qName, expected: expectedAnsName } of pairs) {
    console.log(`\n=== ${qName}`);
    if (!a) {
      console.log(`  ! 解答例 PDF が見つからない (期待: ${expectedAnsName}) → 取り込まない`);
      quarantined.push({ pdf: q.url, reason: `answer pdf not found: ${expectedAnsName}` });
      continue;
    }
    if (routeOf.get(a.url) !== 'text') {
      console.log(`  ! 解答例 PDF からテキストが取れない → 取り込まない`);
      quarantined.push({ pdf: q.url, reason: 'answer pdf has no text layer' });
      continue;
    }

    const qFile = await getCached(q.url, `data/pdf-cache/${qName}`);
    const aFile = await getCached(a.url, `data/pdf-cache/${expectedAnsName}`);
    if (!qFile.body || !aFile.body) {
      quarantined.push({ pdf: q.url, reason: 'download failed' });
      continue;
    }

    const qDoc = await extractPdf(qFile.body);
    const aDoc = await extractPdf(aFile.body);
    const answers = parseAnswers(aDoc.pages);
    console.log(`  解答例: ${answers.size} 問ぶん`);

    const { lines, anchors } = findAnchors(qDoc.pages);
    console.log(`  問アンカー: ${anchors.length} 件 (${anchors.map((x) => x.no).join(',').slice(0, 60)}…)`);

    const examKey = examKeyOf(q);
    // 前回の生成物を先に消す。隔離すべき回の古い JSON が残ると、
    // 検証ゲートをすり抜けて出題されてしまう
    await rm(`${OUT_DIR}/${examKey}.json`, { force: true });
    const questions = [];
    const rejects = [];

    for (let i = 0; i < anchors.length; i++) {
      const from = anchors[i].lineIndex;
      const to = i + 1 < anchors.length ? anchors[i + 1].lineIndex : lines.length;
      const span = lines.slice(from, to);
      const no = anchors[i].no;
      const key = answers.get(no);
      const split = splitQuestion(span);

      const reject = (reason) => rejects.push({ no, reason, preview: span.map((l) => l.text).join(' ').slice(0, 120) });

      if (!split) {
        reject('選択肢ア〜エを検出できない');
        continue;
      }
      if (!key) {
        reject('解答例に該当する問番号がない');
        continue;
      }
      const defects = questionDefects(split);
      if (defects.length) {
        reject(defects.join(' / '));
        continue;
      }

      questions.push({
        id: `${examKey}-q${String(no).padStart(2, '0')}`.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        pool: q.pool,
        exam: {
          year: resolveEra(q)?.year ?? yearOf(q),
          era: resolveEra(q)?.era ?? `${yearOf(q)}年度`,
          ...(resolveEra(q)?.season ? { season: resolveEra(q).season } : q.season ? { season: q.season } : {}),
          subject: q.subject,
          ...(q.legacySection ? { legacySection: q.legacySection } : {}),
        },
        no,
        format: 'text',
        ...(key.field && FIELD_LABEL[key.field] ? { category: FIELD_LABEL[key.field] } : {}),
        body: split.body,
        choices: split.choices,
        answer: key.answer,
        source: {
          label: sourceLabel(q, no),
          questionPdf: q.url,
          answerPdf: a.url,
          page: anchors[i].page,
          sha256: qFile.sha256 ?? sha256(qFile.body),
        },
        verified: true,
        modified: false,
      });
    }

    // 回全体として壊れている PDF（テキスト層が破損したスキャン混在 PDF など）は
    // 部分的に拾えた問題も含めて丸ごと採用しない
    const expectedCount = answers.size;
    const acceptRate = expectedCount ? questions.length / expectedCount : 0;
    console.log(`  構造化できた問題: ${questions.length} / 解答例 ${expectedCount} 問 (${Math.round(acceptRate * 100)}%)`);
    if (expectedCount > 0 && acceptRate < 0.8) {
      console.log(`  ! 取りこぼしが多すぎる(${Math.round(acceptRate * 100)}%) → この回はまるごと隔離`);
      quarantined.push({ pdf: q.url, reason: `accept rate ${Math.round(acceptRate * 100)}% < 80%`, parsed: questions.length, expected: expectedCount });
      continue;
    }
    if (rejects.length) {
      console.log(`  隔離: ${rejects.length} 問`);
      for (const r of rejects.slice(0, 5)) console.log(`    問${r.no}: ${r.reason} | ${r.preview}`);
      quarantined.push({ pdf: q.url, rejects });
    }

    if (questions.length === 0) continue;

    const file = `${examKey}.json`;
    await writeFile(`${OUT_DIR}/${file}`, JSON.stringify(questions, null, 1));
    shards.push({
      file,
      pool: q.pool,
      examKey,
      label: sourceLabel(q, 1).replace(/ 問1$/, ''),
      count: questions.length,
    });
    totalQuestions += questions.length;
  }

  await writeFile(
    `${OUT_DIR}/index.json`,
    JSON.stringify({ generatedAt: new Date().toISOString(), totalQuestions, shards }, null, 1),
  );
  await writeFile(`${QUARANTINE_DIR}/text-route.json`, JSON.stringify(quarantined, null, 1));

  console.log(`\n=== 合計 ${totalQuestions} 問 / ${shards.length} ファイル`);
  for (const s of shards) console.log(`  ${s.count.toString().padStart(3)} 問  ${s.file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
