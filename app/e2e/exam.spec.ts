import { test, expect, type Page } from '@playwright/test';

/**
 * CBT 画面の一通りの操作を確認する。
 * 使う問題はテスト用ダミー（e2e/fixtures）で、本物の題庫には触れない。
 * 出題順はシャッフルされるので、問題文から正解を引いて操作する。
 */
const KEYS = ['ア', 'イ', 'ウ', 'エ'] as const;

/** ダミー問題の「問題文の一部 → 正解」対応 */
const ANSWER_BY_BODY: [string, (typeof KEYS)[number]][] = [
  ['1 + 1 はいくつか', 'イ'],
  ['最も大きい数はどれか', 'エ'],
  ['マーカーを引く操作', 'ア'],
];

async function expectedKey(page: Page) {
  const body = (await page.locator('.markable').innerText()).replace(/\s+/g, ' ');
  const hit = ANSWER_BY_BODY.find(([needle]) => body.includes(needle));
  if (!hit) throw new Error(`想定外の問題文: ${body.slice(0, 60)}`);
  return hit[1];
}

async function pick(page: Page, key: (typeof KEYS)[number]) {
  await page.locator('.choice').nth(KEYS.indexOf(key)).locator('.choice-main').click();
}

test('科目Aモードを最後まで通す（解答・消し込み・見直し・一覧・採点）', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /CBT 模擬試験/ })).toBeVisible();
  await expect(page.getByText(/収録問題数：3 問/)).toBeVisible();

  await page.getByRole('button', { name: /科目A試験（本番形式）/ }).click();

  await expect(page.locator('.cbt-header')).toBeVisible();
  await expect(page.locator('.cbt-timer .value')).toHaveText(/\d?\d:\d\d/);
  await expect(page.locator('.qno')).toContainText('1');

  // 1 問目：正解を選ぶ
  await pick(page, await expectedKey(page));
  await expect(page.locator('.choice.selected')).toHaveCount(1);

  // 選択肢の消し込み（選んでいない選択肢を消す）
  const selectedIndex = await page.locator('.choice').evaluateAll((els) =>
    els.findIndex((el) => el.classList.contains('selected')),
  );
  await page.locator('.choice').nth((selectedIndex + 1) % 4).locator('.choice-strike').click();
  await expect(page.locator('.choice.struck')).toHaveCount(1);
  await expect(page.locator('.choice.selected')).toHaveCount(1); // 消し込みで解答は消えない

  // 見直しチェック
  await page.getByLabel('見直しチェック').check();
  await expect(page.locator('.flag.on')).toBeVisible();

  // 2 問目：正解を選ぶ
  await page.getByRole('button', { name: /次の問題/ }).click();
  await expect(page.locator('.qno')).toContainText('2');
  await pick(page, await expectedKey(page));

  // 問題一覧から 3 問目へ
  await page.getByRole('button', { name: '問題一覧' }).click();
  await expect(page.locator('.modal .grid-item')).toHaveCount(3);
  await expect(page.locator('.grid-item.answered')).toHaveCount(2);
  await expect(page.locator('.grid-item.flagged')).toHaveCount(1);
  await page.locator('.grid-item').nth(2).click();
  await expect(page.locator('.qno')).toContainText('3');

  // 3 問目は未解答のまま終了
  await page.getByRole('button', { name: '試験終了' }).click();
  await expect(page.locator('.modal.confirm')).toContainText('1');
  await page.getByRole('button', { name: '採点して終了' }).click();

  // 採点結果：2 問正解、未解答 1 問が復習に出る
  await expect(page.getByRole('heading', { name: '採点結果' })).toBeVisible();
  await expect(page.locator('.score-main .num')).toHaveText('2');
  await expect(page.locator('.review-item')).toHaveCount(1);
  await expect(page.locator('.review-item .badge')).toHaveText('未解答');
  await expect(page.locator('.cite').first()).toContainText('出典：');
});

test('マーカーで問題文をハイライトできる', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /クイック演習/ }).click();
  await page.getByRole('button', { name: 'マーカー', exact: true }).click();

  // 問題文の先頭 10 文字を選択する
  await page.evaluate(() => {
    const el = document.querySelector('.markable');
    if (!el?.firstChild) return;
    const range = document.createRange();
    range.setStart(el.firstChild, 0);
    range.setEnd(el.firstChild, 10);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  await expect(page.locator('.markable mark')).toHaveCount(1);
  await page.getByRole('button', { name: 'マーカー消去' }).click();
  await expect(page.locator('.markable mark')).toHaveCount(0);
});

test('残り時間が減っていく', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /クイック演習/ }).click();
  const first = await page.locator('.cbt-timer .value').textContent();
  await page.waitForTimeout(1500);
  const second = await page.locator('.cbt-timer .value').textContent();
  expect(first).not.toEqual(second);
});

test('ヒントは答えを漏らさず、解説は公式の解答例と区別して表示される', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /科目A試験（本番形式）/ }).click();

  // ヒントのある問題（1 + 1 のダミー問題）まで進む
  let found = false;
  for (let i = 0; i < 3; i++) {
    const body = (await page.locator('.markable').innerText()).replace(/\s+/g, ' ');
    if (body.includes('1 + 1 はいくつか')) {
      found = true;
      break;
    }
    await page.getByRole('button', { name: /次の問題/ }).click();
  }
  expect(found).toBe(true);

  // 押すまではヒントの中身が出ていない
  await expect(page.locator('.hint-body')).toHaveCount(0);
  await page.getByRole('button', { name: 'ヒントを見る' }).click();
  const hint = page.locator('.hint-body');
  await expect(hint).toBeVisible();

  // ヒントは答えも解説も出さない
  const hintText = await hint.innerText();
  expect(hintText).not.toMatch(/正解|答えは/);
  expect(hintText).not.toContain('1 に 1 を足すと 2 になります');
  // 解説本体は解答中には出ない
  await expect(page.locator('.explanation')).toHaveCount(0);

  await hint.getByRole('button', { name: '閉じる' }).click();
  await expect(page.locator('.hint-body')).toHaveCount(0);

  // 採点まで進める
  await pick(page, await expectedKey(page));
  await page.getByRole('button', { name: '試験終了' }).click();
  await page.getByRole('button', { name: '採点して終了' }).click();
  await expect(page.getByRole('heading', { name: '採点結果' })).toBeVisible();

  await page.getByRole('button', { name: /全問/ }).click();
  const item = page.locator('.review-item', { hasText: '1 + 1 はいくつか' });

  // 公式の解答例と、非公式の解説が、別の枠で区別されている
  await expect(item.locator('.official-tag')).toHaveText('公式の解答例');
  await expect(item.locator('.explanation .unofficial')).toHaveText('非公式');
  await expect(item.locator('.explanation-body')).toContainText('1 に 1 を足すと 2 になります');
  await expect(item.locator('.explanation .why li')).toHaveCount(3);
});
