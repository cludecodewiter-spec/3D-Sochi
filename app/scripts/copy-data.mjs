// data/ を app/public/data へコピーする（Vite の publicDir はプロジェクト外を参照できないため）
import { cp, rm, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../data');
const dest = resolve(here, '../public/data');

try {
  await access(src);
} catch {
  console.log('[copy-data] data/ が無いためスキップ（問題取り込み前）');
  process.exit(0);
}

await rm(dest, { recursive: true, force: true });
await mkdir(dirname(dest), { recursive: true });
await cp(src, dest, {
  recursive: true,
  filter: (p) => !/\/(pdf-cache|quarantine|discovery-raw\.json)/.test(p),
});
console.log(`[copy-data] ${src} -> ${dest}`);
