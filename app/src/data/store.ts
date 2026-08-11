import type { ExamResult, Question, QuestionIndex } from '../types';

const BASE = import.meta.env.BASE_URL;

let indexCache: QuestionIndex | null = null;
const shardCache = new Map<string, Question[]>();

export async function loadIndex(): Promise<QuestionIndex> {
  if (indexCache) return indexCache;
  const res = await fetch(`${BASE}data/questions/index.json`);
  if (!res.ok) {
    // 取り込み前は空の題庫として扱う（勝手に問題を作らない）
    indexCache = { generatedAt: '', totalQuestions: 0, shards: [] };
    return indexCache;
  }
  indexCache = (await res.json()) as QuestionIndex;
  return indexCache;
}

export async function loadShard(file: string): Promise<Question[]> {
  const cached = shardCache.get(file);
  if (cached) return cached;
  const res = await fetch(`${BASE}data/questions/${file}`);
  if (!res.ok) throw new Error(`問題ファイルを読み込めません: ${file}`);
  const data = (await res.json()) as Question[];
  shardCache.set(file, data);
  return data;
}

/** 指定プール・科目の問題をすべて集める */
export async function loadQuestions(pools: string[], subject: string): Promise<Question[]> {
  const index = await loadIndex();
  const shards = index.shards.filter((s) => pools.includes(s.pool));
  const all: Question[] = [];
  for (const shard of shards) {
    const qs = await loadShard(shard.file);
    all.push(...qs.filter((q) => q.exam.subject === subject));
  }
  return all;
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
