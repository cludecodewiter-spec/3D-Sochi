import { useState } from 'react';
import { CHOICE_KEYS, type ExamResult, type Question } from '../../types';
import { formatTime } from '../exam/useExam';
import { ScanImage } from '../exam/ScanImage';

interface Props {
  result: ExamResult;
  questions: Question[];
  onHome: () => void;
  onRetryWrong: () => void;
}

export function ResultScreen({ result, questions, onHome, onRetryWrong }: Props) {
  const [filter, setFilter] = useState<'all' | 'wrong'>('wrong');
  const rate = result.total ? Math.round((result.correctCount / result.total) * 100) : 0;
  const shown = filter === 'wrong' ? questions.filter((q) => result.wrongIds.includes(q.id)) : questions;

  return (
    <div className="result">
      <header className="result-head">
        <h1>採点結果</h1>
        <div className="score">
          <div className="score-main">
            <span className="num">{result.correctCount}</span>
            <span className="den">/ {result.total}</span>
          </div>
          <div className="score-rate">正答率 {rate}%</div>
          <div className="score-time">所要時間 {formatTime(result.elapsedSec)}</div>
        </div>
        <p className="note">
          本試験は IRT（項目応答理論）による 1,000 点満点・基準点 600 点で採点されるため、
          ここでの正答率はあくまで目安です。
        </p>
      </header>

      <section className="by-category">
        <h2>分野別</h2>
        {Object.entries(result.byCategory).map(([cat, v]) => {
          const pct = v.total ? Math.round((v.correct / v.total) * 100) : 0;
          return (
            <div key={cat} className="cat-row">
              <div className="cat-name">{cat}</div>
              <div className="cat-bar">
                <div className="cat-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="cat-num">
                {v.correct}/{v.total}（{pct}%）
              </div>
            </div>
          );
        })}
      </section>

      <section className="review">
        <div className="review-head">
          <h2>復習</h2>
          <div className="tabs">
            <button className={filter === 'wrong' ? 'on' : ''} onClick={() => setFilter('wrong')}>
              間違えた問題（{result.wrongIds.length}）
            </button>
            <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
              全問（{result.total}）
            </button>
          </div>
        </div>

        {shown.map((q) => {
          const picked = result.answers[q.id];
          const ok = picked === q.answer;
          return (
            <article key={q.id} className={`review-item ${ok ? 'ok' : 'ng'}`}>
              <div className="review-meta">
                <span className={`badge ${ok ? 'ok' : 'ng'}`}>{ok ? '正解' : picked ? '不正解' : '未解答'}</span>
                <span className="src">{q.source.label}</span>
                {q.frequency && q.frequency > 1 && (
                  <span className="freq">この問題は過去 {q.frequency} 回出題</span>
                )}
              </div>

              {q.format === 'image' ? (
                <ScanImage images={q.images ?? []} alt={q.source.label} />
              ) : (
                <>
                  <p className="body">{q.body}</p>
                  <ul className="choices">
                    {CHOICE_KEYS.map((k) => (
                      <li
                        key={k}
                        className={[k === q.answer ? 'correct' : '', k === picked && !ok ? 'picked' : ''].join(' ')}
                      >
                        <b>{k}</b> {q.choices?.[k]}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="answer-line">
                正解：<strong>{q.answer}</strong>
                {picked && !ok && <> ／ あなたの解答：{picked}</>}
                <a className="pdf-link" href={q.source.questionPdf} target="_blank" rel="noreferrer">
                  公式PDF（{q.source.page}ページ）
                </a>
              </div>

              <p className="cite">{q.source.label}</p>
              {q.appearances && q.appearances.length > 0 && (
                <details className="appearances">
                  <summary>同一問題の他の出題回（{q.appearances.length}）</summary>
                  <ul>
                    {q.appearances.map((a) => (
                      <li key={a.questionPdf + a.page}>{a.label}</li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          );
        })}
      </section>

      <div className="result-actions">
        <button className="btn-secondary" onClick={onHome}>
          ホームへ
        </button>
        <button className="btn-primary" onClick={onRetryWrong} disabled={result.wrongIds.length === 0}>
          間違えた問題だけ再挑戦
        </button>
      </div>
    </div>
  );
}
