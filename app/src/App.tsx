import { useCallback, useEffect, useState } from 'react';
import { EXAM_MODES, type ExamMode, type ExamResult, type Question } from './types';
import { loadTotalQuestions, loadQuestions, saveResult, reviewQuestionIds } from './data/store';
import { ExamScreen } from './features/exam/ExamScreen';
import { ResultScreen } from './features/result/ResultScreen';

type Screen =
  | { name: 'home' }
  | { name: 'exam'; mode: ExamMode; questions: Question[] }
  | { name: 'result'; result: ExamResult; questions: Question[] };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadTotalQuestions()
      .then(setTotal)
      .catch(() => setTotal(0));
  }, []);

  const start = useCallback(async (mode: ExamMode, onlyIds?: string[]) => {
    setBusy(true);
    setError(null);
    try {
      const pool = await loadQuestions(mode.pools, mode.subject);
      const candidates = onlyIds ? pool.filter((q) => onlyIds.includes(q.id)) : pool;
      if (candidates.length === 0) {
        setError('この条件に該当する問題がまだ取り込まれていません。');
        return;
      }
      const picked = shuffle(candidates).slice(0, Math.min(mode.questionCount, candidates.length));
      setScreen({ name: 'exam', mode, questions: picked });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  if (screen.name === 'exam') {
    return (
      <ExamScreen
        mode={screen.mode}
        questions={screen.questions}
        onAbort={() => setScreen({ name: 'home' })}
        onFinish={(result) => {
          saveResult(result);
          setScreen({ name: 'result', result, questions: screen.questions });
        }}
      />
    );
  }

  if (screen.name === 'result') {
    return (
      <ResultScreen
        result={screen.result}
        questions={screen.questions}
        onHome={() => setScreen({ name: 'home' })}
        onRetryWrong={() => {
          const mode = EXAM_MODES.find((m) => m.id === screen.result.modeId) ?? EXAM_MODES[0];
          void start({ ...mode, questionCount: screen.result.wrongIds.length }, screen.result.wrongIds);
        }}
      />
    );
  }

  const reviewIds = reviewQuestionIds();

  return (
    <div className="home">
      <header className="home-head">
        <h1>基本情報技術者試験 CBT 模擬試験</h1>
        <p className="lead">
          出題は IPA が公式に公開している過去問題のみです。問題文は一切改変していません。
        </p>
        <p className="count">
          {total === null ? '題庫を読み込み中…' : `収録問題数：${total.toLocaleString()} 問`}
        </p>
      </header>

      {total === 0 && (
        <div className="notice">
          まだ問題が取り込まれていません。<code>.github/workflows/import-ipa.yml</code> を実行して
          IPA 公式 PDF から問題を取り込んでください。
          <br />
          （実在しない問題を自動生成することはありません。）
        </div>
      )}

      {error && <div className="notice error">{error}</div>}

      <section className="modes">
        {EXAM_MODES.map((mode) => (
          <button key={mode.id} className="mode-card" disabled={busy} onClick={() => void start(mode)}>
            <span className="mode-title">{mode.title}</span>
            <span className="mode-sub">{mode.subtitle}</span>
          </button>
        ))}
        <button
          className="mode-card review"
          disabled={busy || reviewIds.length === 0}
          onClick={() => {
            const base = EXAM_MODES[0];
            void start({ ...base, id: 'review', title: '復習', questionCount: Math.min(reviewIds.length, 60) }, reviewIds);
          }}
        >
          <span className="mode-title">間違えた問題の復習</span>
          <span className="mode-sub">{reviewIds.length} 問</span>
        </button>
      </section>

      <footer className="home-foot">
        <p>
          出典：IPA 独立行政法人情報処理推進機構が公開する情報処理技術者試験の過去問題。
          著作権は IPA に帰属します。本システムは学習用の非公式ツールです。
        </p>
      </footer>
    </div>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
