import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

/** pdfjs は Node では legacy ビルドを使う。日本語 PDF は cMap が必須 */
export async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pkgPath = require.resolve('pdfjs-dist/package.json');
  const root = dirname(pkgPath);
  return {
    pdfjs,
    cMapUrl: join(root, 'cmaps') + '/',
    standardFontDataUrl: join(root, 'standard_fonts') + '/',
  };
}

/**
 * PDF から座標つきテキスト片を取り出す。
 * 座標を保持するのは、問題番号「問1」の位置や図の領域を判定するため。
 */
export async function extractPdf(buffer, { detectGraphics = false } = {}) {
  const { pdfjs, cMapUrl, standardFontDataUrl } = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    cMapUrl,
    cMapPacked: true,
    standardFontDataUrl,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;

  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent({ includeMarkedContent: false });
    const items = content.items
      .filter((it) => 'str' in it)
      .map((it) => ({
        str: it.str,
        x: Math.round(it.transform[4] * 10) / 10,
        // PDF 座標は下原点。上原点に変換しておくと行の並べ替えが素直になる
        y: Math.round((viewport.height - it.transform[5]) * 10) / 10,
        w: Math.round((it.width ?? 0) * 10) / 10,
        h: Math.round((it.height ?? 0) * 10) / 10,
        font: it.fontName,
        eol: !!it.hasEOL,
      }));

    // 図形（罫線・図）の有無。スキャン PDF では演算子リストの取得が画像デコードを伴い
    // 非常に重いので、必要なときだけ調べる
    let hasGraphics = false;
    if (detectGraphics) try {
      const ops = await page.getOperatorList();
      const OPS = pdfjs.OPS;
      const drawOps = new Set([OPS.fill, OPS.stroke, OPS.eoFill, OPS.fillStroke, OPS.paintImageXObject, OPS.paintInlineImageXObject]);
      hasGraphics = ops.fnArray.some((fn) => drawOps.has(fn));
    } catch {
      /* 図形判定はベストエフォート */
    }

    pages.push({ page: p, width: viewport.width, height: viewport.height, items, hasGraphics });
    page.cleanup();
  }
  await doc.destroy();
  return { numPages: doc.numPages, pages };
}

/** 同じ行（y が近い）のテキスト片をまとめ、読み順に並べる */
export function toLines(page, yTolerance = 3) {
  const sorted = [...page.items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= yTolerance) {
      last.items.push(it);
      last.y = (last.y * (last.items.length - 1) + it.y) / last.items.length;
    } else {
      lines.push({ y: it.y, items: [it] });
    }
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.text = line.items.map((i) => i.str).join('');
    line.x = line.items[0]?.x ?? 0;
    line.xEnd = Math.max(...line.items.map((i) => i.x + i.w));
  }
  return lines;
}
