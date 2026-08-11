import { useEffect, useState } from 'react';
import { loadExplanation, loadExplanationIndex } from '../../data/store';

/**
 * 解答中に見せる手がかり。
 *
 * 本試験にヒント機能は無いので、既定では閉じたまま置き、押したときだけ開く。
 * 出すのは hint だけで、解説や正解は出さない（解答後の復習で見るもの）。
 */
export function HintButton({ questionId }: { questionId: string }) {
  const [hint, setHint] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(false);

  // 問題が変わったら閉じる。前の問題のヒントが残って見えるのを防ぐ
  useEffect(() => {
    setOpen(false);
    setHint(null);
    let cancelled = false;
    loadExplanationIndex().then((index) => {
      if (!cancelled) setAvailable(Boolean(index.entries[questionId]?.hint));
    });
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  if (!available) return null;

  async function show() {
    if (!hint) {
      const ex = await loadExplanation(questionId);
      setHint(ex?.hint ?? null);
    }
    setOpen(true);
  }

  return (
    <div className="hint">
      {open && hint ? (
        <div className="hint-body" role="note">
          <span className="hint-tag">ヒント（非公式）</span>
          <p>{hint}</p>
          <button className="hint-close" onClick={() => setOpen(false)}>
            閉じる
          </button>
        </div>
      ) : (
        <button className="hint-open" onClick={show}>
          ヒントを見る
        </button>
      )}
    </div>
  );
}
