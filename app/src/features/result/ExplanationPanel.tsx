import { useEffect, useState } from 'react';
import { CHOICE_KEYS, type ChoiceKey, type Explanation } from '../../types';
import { loadExplanation } from '../../data/store';

/**
 * 復習時に見せる解説。
 *
 * IPA は午前・科目A の逐題解説を公開していない。ここに出るのは
 * この教材のために書いたものなので、公式の解答例と取り違えられないよう
 * 「非公式」であることを常に添えて、公式の正解表示とは別の枠に置く。
 */
export function ExplanationPanel({ questionId, answer }: { questionId: string; answer: ChoiceKey }) {
  const [ex, setEx] = useState<Explanation | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadExplanation(questionId).then((e) => {
      if (cancelled) return;
      setEx(e);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  if (!loaded) return null;
  if (!ex) {
    return <p className="no-explanation">この問題の解説はまだありません。</p>;
  }

  const wrongKeys = CHOICE_KEYS.filter((k) => k !== answer && ex.why?.[k]);

  return (
    <section className="explanation">
      <h3>
        解説
        <span className="unofficial" title="IPA は科目A の逐題解説を公開していません">
          非公式
        </span>
      </h3>
      <p className="explanation-body">{ex.explanation}</p>

      {wrongKeys.length > 0 && (
        <>
          <h4>ほかの選択肢</h4>
          <ul className="why">
            {wrongKeys.map((k) => (
              <li key={k}>
                <b>{k}</b> {ex.why?.[k]}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
