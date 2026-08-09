/**
 * New-game setup, laid out like the reference build's 重新开始游戏 dialog:
 * name field, a face you can flip through, and vertical option lists whose
 * selected entry turns red.
 */

import type { Difficulty } from '../../engine/types.js'
import { DIFFICULTIES } from '../../content/balance.js'
import { OPENING } from '../../content/script.js'
import { h, photo } from '../dom.js'
import { PORTRAIT_COUNT, photoTile, portraitKey } from '../art/photo.js'
import { panel } from '../panels.js'
import type { Ui } from '../app.js'

export const FACE_COUNT = PORTRAIT_COUNT

export function renderTitle(ui: Ui): HTMLElement {
  let difficulty: Difficulty = 'standard'
  let face = 2
  let seedText = ''
  let name = 'MARCO'

  const faceBox = h('div', { style: 'display:flex;justify-content:center' })
  const paintFace = (): void => {
    faceBox.replaceChildren(photo(photoTile(portraitKey(face), 104, 104)))
  }
  paintFace()

  const diffList = h('div', {})
  const diffNote = h('div', { class: 'small faint', style: 'min-height:44px;margin-top:4px' })
  const paintDiff = (): void => {
    for (const child of Array.from(diffList.children)) {
      const el = child as HTMLButtonElement
      el.classList.toggle('on', el.dataset['id'] === difficulty)
    }
    diffNote.textContent = DIFFICULTIES[difficulty].description
  }
  for (const profile of Object.values(DIFFICULTIES)) {
    diffList.appendChild(
      h(
        'button',
        {
          class: 'opt',
          'data-id': profile.id,
          onclick: () => {
            difficulty = profile.id
            paintDiff()
          },
        },
        profile.label,
      ),
    )
  }
  paintDiff()

  const step = (delta: number): void => {
    face = (face + delta + FACE_COUNT) % FACE_COUNT
    paintFace()
    counter.textContent = `相貌：${face + 1} / ${FACE_COUNT}`
  }
  const counter = h('div', { class: 'small', style: 'text-align:center' }, `相貌：${face + 1} / ${FACE_COUNT}`)

  const left = h(
    'div',
    {},
    h('div', { class: 'small' }, '主角姓名'),
    h('input', {
      class: 'sunken',
      value: name,
      style: 'width:100%;padding:3px 5px;font-family:var(--mono);background:var(--paper-sunken);color:var(--ink);border:2px solid;margin-bottom:8px',
      oninput: (e: Event) => {
        name = (e.target as HTMLInputElement).value
      },
    }),
    faceBox,
    counter,
    h(
      'div',
      { class: 'row', style: 'justify-content:center;margin-top:4px' },
      h('button', { onclick: () => step(-4) }, '«'),
      h('button', { onclick: () => step(-1) }, '‹'),
      h('button', { onclick: () => step(1) }, '›'),
      h('button', { onclick: () => step(4) }, '»'),
    ),
  )

  const right = h(
    'div',
    {},
    h('div', { class: 'small', style: 'margin-bottom:3px' }, '游戏难度'),
    diffList,
    diffNote,
    // §8.2 — the one promise that holds on every setting.
    h(
      'div',
      { class: 'small red', style: 'margin-top:6px' },
      '任何一档都不会替你判断情报的真假。那件事只有你能做。',
    ),
    h('div', { class: 'small', style: 'margin:10px 0 3px' }, '种子（可留空）'),
    h('input', {
      class: 'sunken',
      placeholder: '随机',
      style: 'width:100%;padding:3px 5px;font-family:var(--mono);background:var(--paper-sunken);color:var(--ink);border:2px solid',
      oninput: (e: Event) => {
        seedText = (e.target as HTMLInputElement).value
      },
    }),
    h('div', { class: 'small faint', style: 'margin-top:3px' }, '同一个种子会得到完全相同的一局。'),
  )

  const setup = panel(
    '重新开始游戏',
    h(
      'div',
      { style: 'display:grid;grid-template-columns:160px 1fr;gap:14px;padding:4px' },
      left,
      right,
    ),
  )

  const intro = panel(
    OPENING.subtitle,
    h(
      'div',
      { style: 'padding:2px 4px' },
      ...OPENING.body.map((line) => h('p', { style: 'margin:0 0 4px' }, line || ' ')),
    ),
  )

  const go = h(
    'div',
    { class: 'row', style: 'justify-content:center;gap:10px;padding:8px' },
    h(
      'button',
      {
        class: 'act go',
        onclick: () => {
          const parsed = Number.parseInt(seedText, 10)
          ui.start(difficulty, Number.isFinite(parsed) ? parsed : undefined, {
            name: name.trim() || 'MARCO',
            face,
          })
        },
      },
      '启 程 ！',
    ),
    ui.hasSave() ? h('button', { class: 'act', onclick: () => ui.loadSave() }, '继续上次') : null,
  )

  return h(
    'div',
    { style: 'max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:6px;padding:10px' },
    h('div', { style: 'text-align:center;font-size:22px;font-weight:700;letter-spacing:.08em' }, OPENING.title),
    intro,
    setup,
    go,
  )
}
