import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnswerState, ChoiceKey, ExamMode, ExamResult, Question } from '../../types';

const emptyAnswer = (): AnswerState => ({ flagged: false, struck: [], marks: [] });

export interface ExamSession {
  questions: Question[];
  current: number;
  answers: Record<string, AnswerState>;
  remainingSec: number;
  finished: boolean;
}

export function useExam(mode: ExamMode, questions: Question[], onFinish: (r: ExamResult) => void) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, emptyAnswer()])),
  );
  const [remainingSec, setRemainingSec] = useState(mode.minutes * 60);
  const [finished, setFinished] = useState(false);
  const startedAt = useRef(new Date().toISOString());
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  const question = questions[current];

  const update = useCallback((id: string, patch: Partial<AnswerState>) => {
    setAnswers((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyAnswer()), ...patch } }));
  }, []);

  const select = useCallback(
    (key: ChoiceKey) => {
      if (!question) return;
      const state = answers[question.id] ?? emptyAnswer();
      // 消し込み済みの選択肢を選んだら消し込みを解除する（実機と同じ挙動）
      update(question.id, { selected: key, struck: state.struck.filter((k) => k !== key) });
    },
    [answers, question, update],
  );

  const toggleFlag = useCallback(() => {
    if (!question) return;
    update(question.id, { flagged: !(answers[question.id]?.flagged ?? false) });
  }, [answers, question, update]);

  const toggleStrike = useCallback(
    (key: ChoiceKey) => {
      if (!question) return;
      const state = answers[question.id] ?? emptyAnswer();
      const struck = state.struck.includes(key)
        ? state.struck.filter((k) => k !== key)
        : [...state.struck, key];
      update(question.id, { struck, selected: state.selected === key ? undefined : state.selected });
    },
    [answers, question, update],
  );

  const addMark = useCallback(
    (range: [number, number]) => {
      if (!question) return;
      const state = answers[question.id] ?? emptyAnswer();
      update(question.id, { marks: mergeRanges([...state.marks, range]) });
    },
    [answers, question, update],
  );

  const clearMarks = useCallback(() => {
    if (!question) return;
    update(question.id, { marks: [] });
  }, [question, update]);

  const finish = useCallback(() => {
    if (finished) return;
    setFinished(true);
    const wrongIds: string[] = [];
    const byCategory: Record<string, { correct: number; total: number }> = {};
    let correctCount = 0;
    for (const q of questions) {
      const picked = answers[q.id]?.selected;
      const ok = picked === q.answer;
      if (ok) correctCount++;
      else wrongIds.push(q.id);
      const cat = q.category ?? 'その他';
      byCategory[cat] ??= { correct: 0, total: 0 };
      byCategory[cat].total++;
      if (ok) byCategory[cat].correct++;
    }
    finishRef.current({
      modeId: mode.id,
      startedAt: startedAt.current,
      finishedAt: new Date().toISOString(),
      elapsedSec: mode.minutes * 60 - remainingSec,
      questionIds: questions.map((q) => q.id),
      answers: Object.fromEntries(questions.map((q) => [q.id, answers[q.id]?.selected])),
      wrongIds,
      byCategory,
      correctCount,
      total: questions.length,
    });
  }, [answers, finished, mode, questions, remainingSec]);

  // カウントダウン。0 で自動終了（実際の CBT と同じ）
  useEffect(() => {
    if (finished) return;
    const timer = setInterval(() => {
      setRemainingSec((s) => {
        if (s <= 1) {
          clearInterval(timer);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [finished]);

  useEffect(() => {
    if (remainingSec === 0 && !finished) finish();
  }, [remainingSec, finished, finish]);

  const stats = useMemo(() => {
    const answered = questions.filter((q) => answers[q.id]?.selected).length;
    const flagged = questions.filter((q) => answers[q.id]?.flagged).length;
    return { answered, unanswered: questions.length - answered, flagged };
  }, [answers, questions]);

  return {
    question,
    current,
    setCurrent,
    answers,
    answer: question ? answers[question.id] ?? emptyAnswer() : emptyAnswer(),
    remainingSec,
    finished,
    stats,
    select,
    toggleFlag,
    toggleStrike,
    addMark,
    clearMarks,
    finish,
    next: () => setCurrent((c) => Math.min(c + 1, questions.length - 1)),
    prev: () => setCurrent((c) => Math.max(c - 1, 0)),
  };
}

/** 重なり・隣接するマーカー範囲をまとめる */
export function mergeRanges(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = out[out.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else out.push([start, end]);
  }
  return out;
}

export function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
