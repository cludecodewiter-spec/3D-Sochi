import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname } from 'node:path';

const UA =
  'jpfetest-importer/0.1 (educational use of IPA published past exams; https://github.com/cludecodewiter-spec/3D-Sochi)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** IPA のサーバに負荷をかけないよう、逐次＋待機でアクセスする */
let lastHit = 0;
const MIN_INTERVAL_MS = 700;

async function polite() {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastHit);
  if (wait > 0) await sleep(wait);
  lastHit = Date.now();
}

export async function get(url, { binary = false, retries = 4 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(2000 * 2 ** (attempt - 1));
    await polite();
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
      if (!res.ok) {
        // 404 は再試行しても無駄
        if (res.status === 404) return { ok: false, status: 404, url };
        throw new Error(`HTTP ${res.status}`);
      }
      const body = binary
        ? Buffer.from(await res.arrayBuffer())
        : await res.text();
      return { ok: true, status: res.status, url: res.url, body };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`GET failed after retries: ${url} (${lastErr?.message})`);
}

/** キャッシュ付きダウンロード。同じ PDF を何度も IPA から取らない */
export async function getCached(url, cachePath) {
  try {
    await access(cachePath);
    const body = await readFile(cachePath);
    return { body, cached: true, sha256: sha256(body) };
  } catch {
    /* not cached */
  }
  const res = await get(url, { binary: true });
  if (!res.ok) return { body: null, cached: false, status: res.status };
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, res.body);
  return { body: res.body, cached: false, sha256: sha256(res.body) };
}

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** href と、その直前に現れた見出し・リンクテキストを拾う簡易 HTML リンク抽出 */
export function extractLinks(html, baseUrl) {
  const links = [];
  let currentHeading = '';
  const token = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>|<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = token.exec(html)) !== null) {
    if (m[1] !== undefined) {
      currentHeading = stripTags(m[1]);
      continue;
    }
    const href = m[2];
    let absolute;
    try {
      absolute = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    links.push({ url: absolute, text: stripTags(m[3]), heading: currentHeading });
  }
  return links;
}

export function stripTags(s) {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
