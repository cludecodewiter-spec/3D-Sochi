// dist をテスト用ダミー題庫と一緒に配信する簡易サーバ。
// 本物の題庫（data/questions）は取り込み前だと空なので、UI テストはダミーで行う。
// ダミー問題は data/ には決して置かない（出題対象に混ざらないようにするため）。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(import.meta.url), '..');
const dist = resolve(here, '../dist');
const fixtures = resolve(here, 'fixtures');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.png': 'image/png',
};

const INDEX = {
  generatedAt: new Date().toISOString(),
  totalQuestions: 3,
  shards: [{ file: 'fixture.json', pool: 'fe-koukai', examKey: 'fixture', label: 'テスト用ダミー', count: 3 }],
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let path = decodeURIComponent(url.pathname);

  if (path === '/data/questions/index.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(INDEX));
    return;
  }
  if (path === '/data/questions/fixture.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(await readFile(join(fixtures, 'questions.json')));
    return;
  }

  if (path === '/') path = '/index.html';
  const file = join(dist, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

const port = Number(process.env.PORT ?? 4173);
server.listen(port, () => console.log(`serving ${dist} on http://localhost:${port}`));
