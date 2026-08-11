import { useCallback, useRef } from 'react';

interface Props {
  text: string;
  marks: [number, number][];
  onMark: (range: [number, number]) => void;
  markerOn: boolean;
}

/**
 * 問題文にマーカーを引けるコンポーネント。
 * 実際の CBT でも問題文へのマーカーと選択肢の消し込みが用意されている。
 */
export function Markable({ text, marks, onMark, markerOn }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseUp = useCallback(() => {
    if (!markerOn) return;
    const sel = window.getSelection();
    const root = ref.current;
    if (!sel || sel.isCollapsed || !root) return;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;

    const start = offsetOf(root, range.startContainer, range.startOffset);
    const end = offsetOf(root, range.endContainer, range.endOffset);
    if (start === null || end === null || start === end) return;
    onMark([Math.min(start, end), Math.max(start, end)]);
    sel.removeAllRanges();
  }, [markerOn, onMark]);

  return (
    <div
      ref={ref}
      className="markable"
      onMouseUp={handleMouseUp}
      onTouchEnd={handleMouseUp}
      data-marker={markerOn ? 'on' : 'off'}
    >
      {renderWithMarks(text, marks)}
    </div>
  );
}

/** ルート要素内の文字オフセットを求める */
function offsetOf(root: Node, node: Node, nodeOffset: number): number | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let current = walker.nextNode();
  while (current) {
    if (current === node) return total + nodeOffset;
    total += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }
  return null;
}

function renderWithMarks(text: string, marks: [number, number][]) {
  if (marks.length === 0) return text;
  const out: (string | JSX.Element)[] = [];
  let cursor = 0;
  marks.forEach(([start, end], i) => {
    if (start > cursor) out.push(text.slice(cursor, start));
    out.push(<mark key={i}>{text.slice(start, end)}</mark>);
    cursor = end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}
