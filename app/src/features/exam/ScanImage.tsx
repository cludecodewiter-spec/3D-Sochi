import { useState } from 'react';

const BASE = import.meta.env.BASE_URL;

interface Props {
  images: string[];
  alt: string;
}

/**
 * スキャン PDF から切り出した問題画像。
 * スマートフォンでは縮小されて読みにくいので、タップで拡大表示できるようにする。
 */
export function ScanImage({ images, alt }: Props) {
  const [zoomed, setZoomed] = useState<string | null>(null);

  return (
    <>
      <div className="scan">
        {images.map((src) => (
          <button key={src} className="scan-thumb" onClick={() => setZoomed(src)} title="タップで拡大">
            <img src={`${BASE}data/${src}`} alt={alt} />
          </button>
        ))}
      </div>

      {zoomed && (
        <div className="zoom-backdrop" onClick={() => setZoomed(null)}>
          <div className="zoom-body" onClick={(e) => e.stopPropagation()}>
            <img src={`${BASE}data/${zoomed}`} alt={alt} />
          </div>
          <button className="zoom-close" onClick={() => setZoomed(null)}>
            閉じる
          </button>
        </div>
      )}
    </>
  );
}
