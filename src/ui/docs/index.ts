/**
 * The document form library. DESIGN_v12.md §10, surgery S3.
 *
 * v11 planned to fight 30-hour fatigue with a background × weather × time-of-day
 * compositor — roughly 42 art layers. But the fatigue it diagnosed ("第 30 小时
 * 后我在读纯文字") is not about backgrounds repeating; it is about every screen
 * being one paragraph and three buttons. Swapping the *form* of the page is
 * both far cheaper and the thing that actually helps.
 *
 * Rule: no three consecutive turns without at least two different forms.
 */

import { h, money } from '../dom.js'

export type DocKind =
  | 'calllog'
  | 'ledger'
  | 'note'
  | 'casefile'
  | 'surveillance'
  | 'newspaper'

const shell = (
  kind: DocKind,
  label: string,
  ...body: (Node | string | null)[]
): HTMLElement =>
  h('article', { class: `doc doc-${kind}` }, h('div', { class: 'doc-kind' }, label), ...body)

/** 通话记录 — the loan shark, and every informant contact history. */
export const callLog = (title: string, lines: string[]): HTMLElement =>
  shell('calllog', title, ...lines.map((line) => h('div', { class: 'line' }, line)))

/** 账本 — money moving, rendered as bookkeeping rather than a number ticking. */
export const ledger = (
  title: string,
  rows: { label: string; amount: number }[],
  total?: number,
): HTMLElement =>
  shell(
    'ledger',
    title,
    h(
      'table',
      {},
      ...rows.map((row) =>
        h(
          'tr',
          {},
          h('td', {}, row.label),
          h('td', { class: row.amount >= 0 ? 'pos' : 'neg' }, money(row.amount)),
        ),
      ),
      total !== undefined
        ? h('tr', {}, h('td', { class: 'mono' }, '合计'), h('td', { class: 'mono' }, money(total)))
        : null,
    ),
  )

/** 手写便条 — Solomon's handwriting, a scrap an informant pushed across a table. */
export const note = (from: string, text: string): HTMLElement =>
  shell('note', from, h('div', {}, text))

/**
 * 警方案卷 — appears at heat ≥ 60 and fills in line by line.
 * Pressure rendered as a document the player reads about themselves.
 */
export const caseFile = (tier: string, heat: number, entries: string[]): HTMLElement =>
  shell(
    'casefile',
    `市警局 · 案卷 #4471 · ${tier}`,
    h('div', { class: 'stamp' }, tier),
    h('div', { class: 'faint' }, `威胁评估：${heat} / 100`),
    ...entries.map((entry) => h('div', { class: 'entry' }, entry)),
    entries.length === 0 ? h('div', { class: 'faint' }, '（暂无条目）') : null,
  )

/** 监控帧 — what scouting produced, or what caught you afterwards. */
export const surveillance = (
  location: string,
  timestamp: string,
  caption: string,
): HTMLElement =>
  shell(
    'surveillance',
    '监控截图',
    h('div', { class: 'frame' }, '［ 画 面 已 存 档 ］'),
    h('div', { class: 'ts' }, h('span', {}, location), h('span', {}, timestamp)),
    h('div', { style: 'margin-top:.6rem' }, caption),
  )

/** 报纸剪报 — your case made the news; and the ending montage. */
export const newspaper = (headline: string, body: string, dateline: string): HTMLElement =>
  shell(
    'newspaper',
    '剪报',
    h('div', { class: 'masthead' }, `本市晚报 · ${dateline}`),
    h('div', { class: 'headline' }, headline),
    h('div', { class: 'body' }, body),
  )

/**
 * Tracks which forms a run has shown, so the §10 variety rule can be checked
 * rather than merely hoped for.
 */
export class FormRotation {
  #recent: { turn: number; kind: DocKind }[] = []

  record(turn: number, kind: DocKind): void {
    this.#recent.push({ turn, kind })
  }

  /** Distinct forms shown in the last `window` turns. */
  varietyIn(turn: number, window = 3): number {
    const kinds = new Set(
      this.#recent.filter((r) => r.turn > turn - window).map((r) => r.kind),
    )
    return kinds.size
  }

  all(): DocKind[] {
    return [...new Set(this.#recent.map((r) => r.kind))]
  }
}
