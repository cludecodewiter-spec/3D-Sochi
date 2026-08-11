import type { ExamResult, Explanation, ExplanationIndex, Question } from '../types';

const BASE = import.meta.env.BASE_URL;

/**
 * 題庫は名寄せ済みの一意な問題だけをまとめた bank.json 1 本から読む。
 *
 * 回ごとのシャードは出典を追いやすく、取り込み側ではそちらが正しい形だが、
 * 出題のたびに 100 本近いファイルを順に取りに行くと開始が遅い。
 * bank.json は gzip で 130KB 程度なので、1 回の取得で済む。
 * （bank.json は配信用に app/scripts/copy-data.mjs が組み立てる）
 */
interface Bank {
  generatedAt: string;
  total: number;
  questions: Question[];
}

let bankPromise: Promise<Bank> | null = null;

export function loadBank(): Promise<Bank> {
  // 同時に呼ばれても取得は 1 回で済ませる
  if (!bankPromise) {
    bankPromise = fetch(`${BASE}data/questions/bank.json`)
      .then((res) => {
        // 取り込み前は空の題庫として扱う（勝手に問題を作らない）
        if (!res.ok) return { generatedAt: '', total: 0, questions: [] } as Bank;
        return res.json() as Promise<Bank>;
      })
      .catch(() => ({ generatedAt: '', total: 0, questions: [] }) as Bank);
  }
  return bankPromise;
}

/** ホーム画面に出す収録数（名寄せ後の一意な問題数） */
export async function loadTotalQuestions(): Promise<number> {
  return (await loadBank()).total;
}

/** 指定プール・科目の問題を集める */
export async function loadQuestions(pools: string[], subject: string): Promise<Question[]> {
  const bank = await loadBank();
  return bank.questions.filter((q) => pools.includes(q.pool) && q.exam.subject === subject);
}

// ------------------------------------------------------------ 履歴（端末内のみ）

const HISTORY_KEY = 'jpfetest.history.v1';

export function loadHistory(): ExamResult[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as ExamResult[];
  } catch {
    return [];
  }
}

export function saveResult(result: ExamResult): void {
  const history = loadHistory();
  history.unshift(result);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
}

/**
 * 復習対象の問題 ID。
 * 直近で間違えた問題を集め、その後に正解できた問題は外す。
 */
export function reviewQuestionIds(): string[] {
  const state = new Map<string, boolean>(); // id -> 要復習か
  // 履歴は新しい順なので、古い順に走査して最新の結果で上書きする
  for (const r of [...loadHistory()].reverse()) {
    const wrong = new Set(r.wrongIds ?? []);
    for (const id of r.questionIds) state.set(id, wrong.has(id));
  }
  return [...state.entries()].filter(([, needsReview]) => needsReview).map(([id]) => id);
}

// ------------------------------------------------------- 解説（非公式・任意読み込み）

let explanationIndexCache: ExplanationIndex | null = null;
const explanationFileCache = new Map<string, Record<string, Explanation>>();

/**
 * 解説の索引。まだ解説が無い問題のほうが多いので、
 * 索引を見てから必要なファイルだけ読む（開始を遅くしないため）。
 */
export async function loadExplanationIndex(): Promise<ExplanationIndex> {
  if (explanationIndexCache) return explanationIndexCache;
  try {
    const res = await fetch(`${BASE}data/explanations/index.json`);
    explanationIndexCache = res.ok
      ? ((await res.json()) as ExplanationIndex)
      : { generatedAt: '', entries: {} };
  } catch {
    explanationIndexCache = { generatedAt: '', entries: {} };
  }
  return explanationIndexCache;
}

/** 解説を 1 問ぶん取る。無ければ null（無いことは異常ではない） */
export async function loadExplanation(questionId: string): Promise<Explanation | null> {
  const index = await loadExplanationIndex();
  const entry = index.entries[questionId];
  if (!entry) return null;

  let file = explanationFileCache.get(entry.file);
  if (!file) {
    try {
      const res = await fetch(`${BASE}data/explanations/${entry.file}`);
      if (!res.ok) return null;
      file = (await res.json()) as Record<string, Explanation>;
      explanationFileCache.set(entry.file, file);
    } catch {
      return null;
    }
  }
  return file[questionId] ?? null;
}
