import { useState } from 'react';
import { CHOICE_KEYS, type ChoiceKey, type ExamMode, type ExamResult, type Question } from '../../types';
import { formatTime, useExam } from './useExam';
import { Markable } from './Markable';

const BASE = import.meta.env.BASE_URL;

interface Props {
  mode: ExamMode;
  questions: Question[];
  onFinish: (result: ExamResult) => void;
  onAbort: () => void;
}

export function ExamScreen({ mode, questions, onFinish, onAbort }: Props) {
  const exam = useExam(mode, questions, onFinish);
  const [listOpen, setListOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [markerOn, setMarkerOn] = useState(false);

  const q = exam.question;
  if (!q) return <div className="empty">問題がありません。</div>;

  const lowTime = exam.remainingSec <= 300;

  return (
    <div className="cbt">
      <header className="cbt-header">
        <div className="cbt-title">
          基本情報技術者試験　{mode.subject === 'kamokuA' ? '科目A試験' : '科目B試験'}
        </div>
        <div className={`cbt-timer ${lowTime ? 'low' : ''}`}>
          <span className="label">残り時間</span>
          <span className="value">{formatTime(exam.remainingSec)}</span>
        </div>
        <button className="btn-finish" onClick={() => setConfirmOpen(true)}>
          試験終了
        </button>
      </header>

      <div className="cbt-subbar">
        <div className="qno">
          問題 <strong>{exam.current + 1}</strong> / {questions.length}
        </div>
        <div className="subbar-actions">
          <label className={`flag ${exam.answer.flagged ? 'on' : ''}`}>
            <input type="checkbox" checked={exam.answer.flagged} onChange={exam.toggleFlag} />
            見直しチェック
          </label>
          <button
            className={`tool ${markerOn ? 'on' : ''}`}
            onClick={() => setMarkerOn((v) => !v)}
            title="問題文をドラッグして選択するとマーカーを引けます"
          >
            マーカー
          </button>
          <button className="tool" onClick={exam.clearMarks}>
            マーカー消去
          </button>
          <button className="tool" onClick={() => setListOpen(true)}>
            問題一覧
          </button>
        </div>
      </div>

      <main className="cbt-main">
        <section className="pane pane-question">
          {q.format === 'image' ? (
            <figure className="scan">
              {q.images?.map((src) => (
                <img key={src} src={`${BASE}data/${src}`} alt={`${q.source.label}（IPA 公開問題冊子の該当箇所）`} />
              ))}
              <figcaption>
                この問題は IPA 公開の問題冊子（スキャン PDF）の該当箇所をそのまま表示しています。
              </figcaption>
            </figure>
          ) : (
            <>
              <Markable
                text={q.body ?? ''}
                marks={exam.answer.marks}
                onMark={exam.addMark}
                markerOn={markerOn}
              />
              {q.figures?.map((f) => (
                <img key={f} className="figure" src={`${BASE}data/${f}`} alt="図表" />
              ))}
            </>
          )}
        </section>

        <section className="pane pane-choices">
          {CHOICE_KEYS.map((key) => {
            const struck = exam.answer.struck.includes(key);
            const selected = exam.answer.selected === key;
            return (
              <div key={key} className={`choice ${selected ? 'selected' : ''} ${struck ? 'struck' : ''}`}>
                <button className="choice-main" onClick={() => exam.select(key)}>
                  <span className="radio" aria-hidden />
                  <span className="key">{key}</span>
                  {q.format === 'text' && <span className="text">{q.choices?.[key as ChoiceKey]}</span>}
                </button>
                <button
                  className="choice-strike"
                  onClick={() => exam.toggleStrike(key)}
                  title="選択肢を消し込む"
                  aria-label={`選択肢${key}を消し込む`}
                >
                  ✕
                </button>
              </div>
            );
          })}
          {q.format === 'image' && (
            <p className="choice-hint">選択肢の内容は上の問題画像に含まれています。</p>
          )}
        </section>
      </main>

      <footer className="cbt-footer">
        <button className="nav" onClick={exam.prev} disabled={exam.current === 0}>
          ← 前の問題
        </button>
        <div className="progress">
          解答済 {exam.stats.answered} / 未解答 {exam.stats.unanswered} / 見直し {exam.stats.flagged}
        </div>
        <button className="nav" onClick={exam.next} disabled={exam.current === questions.length - 1}>
          次の問題 →
        </button>
      </footer>

      {listOpen && (
        <div className="modal-backdrop" onClick={() => setListOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>問題一覧</h2>
            <div className="legend">
              <span className="chip answered" /> 解答済
              <span className="chip unanswered" /> 未解答
              <span className="chip flagged" /> 見直し
            </div>
            <div className="grid">
              {questions.map((question, i) => {
                const a = exam.answers[question.id];
                const cls = [
                  a?.selected ? 'answered' : 'unanswered',
                  a?.flagged ? 'flagged' : '',
                  i === exam.current ? 'current' : '',
                ].join(' ');
                return (
                  <button
                    key={question.id}
                    className={`grid-item ${cls}`}
                    onClick={() => {
                      exam.setCurrent(i);
                      setListOpen(false);
                    }}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <button className="btn-primary" onClick={() => setListOpen(false)}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="modal-backdrop">
          <div className="modal confirm">
            <h2>試験を終了しますか</h2>
            <p>
              未解答が <strong>{exam.stats.unanswered}</strong> 問あります。
              終了すると解答を変更できません。
            </p>
            <div className="confirm-actions">
              <button className="btn-secondary" onClick={() => setConfirmOpen(false)}>
                試験に戻る
              </button>
              <button className="btn-primary" onClick={exam.finish}>
                採点して終了
              </button>
            </div>
            <button className="link-abort" onClick={onAbort}>
              採点せずに中断する
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
