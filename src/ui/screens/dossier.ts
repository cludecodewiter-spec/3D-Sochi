/**
 * The dossier. DESIGN_v12.md §9.2.
 *
 * Nothing here is stored — every entry is computed from the event log at draw
 * time. The consequence chain under each tip is a graph walk over `causedBy`,
 * not authored text, which is why it can never disagree with what happened.
 */

import type { GameEvent } from '../../engine/events.js'
import { caseFile, dayCards, informantEntries, vehicleEntries } from '../../systems/dossier.js'
import { heatOf, showsCaseFile } from '../../systems/heat.js'
import { reputationTone } from '../../systems/intel.js'
import { vehicleDef } from '../../content/vehicles.js'
import { h, money, pct, svg } from '../dom.js'
import { photoTile } from '../art/photo.js'
import { informantDef } from '../../content/informants.js'
import { carSvg } from '../art/car.js'
import { panel } from '../panels.js'
import type { Ui } from '../app.js'
import * as docs from '../docs/index.js'

const TABS = [
  { id: 'people', label: '人物' },
  { id: 'intel', label: '情报' },
  { id: 'days', label: '日记' },
  { id: 'cars', label: '车辆' },
  { id: 'case', label: '案卷' },
]

const box = (...children: (Node | string | null)[]): HTMLElement =>
  h('div', { class: 'sunken', style: 'padding:6px;margin-bottom:5px' }, ...children)

function chainOf(
  nodes: { event: { summary: string; tone: string }; depth: number }[],
): HTMLElement | null {
  if (nodes.length === 0) return null
  return h(
    'div',
    { class: 'small', style: 'margin-top:4px' },
    ...nodes.map((node) =>
      h(
        'div',
        {
          class: node.event.tone === 'bad' ? 'red' : node.event.tone === 'good' ? 'green' : 'faint',
          style: `padding-left:${node.depth * 12}px;font-family:var(--mono)`,
        },
        `└─ ${node.event.summary}`,
      ),
    ),
  )
}

export function renderDossier(ui: Ui): HTMLElement {
  const { state, log } = ui.game
  const root = h('div', {})

  const tabs = h('div', { class: 'tabs', style: 'padding:0 0 5px' })
  for (const tab of TABS) {
    if (tab.id === 'case' && !showsCaseFile(heatOf(state))) continue
    tabs.appendChild(
      h(
        'button',
        {
          class: ui.dossierTab === tab.id ? 'on' : '',
          onclick: () => {
            ui.dossierTab = tab.id
            ui.render()
          },
        },
        tab.label,
      ),
    )
  }
  root.appendChild(tabs)

  const people = informantEntries(state, log)

  switch (ui.dossierTab) {
    case 'intel': {
      const all = people.flatMap((p) => p.intel.map((i) => ({ ...i, who: p.name })))
      if (all.length === 0) {
        root.appendChild(h('div', { class: 'empty' }, '还没有人跟你说过什么。'))
        break
      }
      for (const item of [...all].sort((a, b) => b.turn - a.turn)) {
        root.appendChild(
          box(
            h(
              'div',
              { class: 'small faint' },
              `第 ${item.turn} 天 · ${item.who} · `,
              h(
                'span',
                {
                  class:
                    item.verdict === 'wrong' ? 'red' : item.verdict === 'accurate' ? 'green' : 'faint',
                },
                VERDICT[item.verdict],
              ),
            ),
            h('div', { style: 'margin:3px 0' }, `「${item.text}」`),
            chainOf(item.consequences),
          ),
        )
      }
      break
    }

    case 'days': {
      const cards = dayCards(log)
      if (cards.length === 0) root.appendChild(h('div', { class: 'empty' }, '还没有过一天。'))
      for (const card of [...cards].reverse()) {
        root.appendChild(
          box(
            h(
              'div',
              { class: 'row', style: 'justify-content:space-between' },
              h('b', {}, `第 ${card.turn} 天`),
              h(
                'span',
                { class: `mono small ${card.cashDelta >= 0 ? 'green' : 'red'}` },
                card.cashDelta === 0 ? '' : money(card.cashDelta),
              ),
            ),
            h('div', { class: 'small', style: 'margin:2px 0' }, card.headline),
            h(
              'div',
              { class: 'small' },
              ...card.events
                .filter((e: GameEvent) => e.type !== 'turn_start' && e.type !== 'turn_end')
                .map((e: GameEvent) =>
                  h(
                    'div',
                    { class: e.tone === 'bad' ? 'red' : e.tone === 'good' ? 'green' : 'faint' },
                    e.summary,
                  ),
                ),
            ),
          ),
        )
      }
      break
    }

    case 'cars': {
      const cars = vehicleEntries(log)
      if (cars.length === 0) {
        root.appendChild(h('div', { class: 'empty' }, '你还没碰过任何一辆车。'))
        break
      }
      for (const car of cars) {
        const def = vehicleDef(car.defId)
        root.appendChild(
          box(
            h(
              'div',
              { class: 'row', style: 'gap:8px;align-items:center' },
              h(
                'div',
                { style: 'width:110px;flex:none' },
                svg(carSvg({ bodyType: def.bodyType, era: def.era, height: 40 })),
              ),
              h(
                'div',
                { style: 'flex:1;min-width:0' },
                h('b', {}, `${car.name} ${car.year}`),
                h('span', { class: 'small faint' }, ` · ${OUTCOME[car.outcome] ?? ''}`),
              ),
            ),
            h(
              'div',
              { class: 'small', style: 'margin-top:3px' },
              ...car.events.map((e: GameEvent) =>
                h(
                  'div',
                  { class: e.tone === 'bad' ? 'red' : e.tone === 'good' ? 'green' : 'faint' },
                  `第 ${e.turn} 天 · ${e.summary}`,
                ),
              ),
            ),
          ),
        )
      }
      break
    }

    case 'case': {
      const file = caseFile(state, log)
      root.appendChild(docs.caseFile(file.tier, file.heat, file.entries))
      root.appendChild(
        h(
          'div',
          { class: 'small faint' },
          '这份东西是他们写的，不是你写的。你能看到它，只说明你已经够格了。',
        ),
      )
      break
    }

    default: {
      if (people.length === 0) {
        root.appendChild(h('div', { class: 'empty' }, '你还没认识任何人。'))
        break
      }
      for (const person of people) {
        root.appendChild(
          box(
            h(
              'div',
              { class: 'row', style: 'gap:8px;align-items:flex-start' },
              h(
                'div',
                { class: `photo tone-${reputationTone(person)}` },
                h('span', { html: photoTile(informantDef(person.id).photo, 58, 58) }),
              ),
              h(
                'div',
                { style: 'flex:1;min-width:0' },
                h('b', {}, person.name),
                h('div', { class: 'small faint' }, person.role),
                h(
                  'div',
                  { class: 'small mono', style: 'margin-top:3px' },
                  `首次 第${person.firstContactTurn ?? '?'}天 · 给过 ${person.offered} · `,
                  h('span', { class: 'green' }, `准 ${person.accurate}`),
                  ' · ',
                  h('span', { class: 'red' }, `错 ${person.wrong}`),
                  ` · 说不好 ${person.inconclusive}`,
                  person.accuracy !== null ? ` · 准确率 ${pct(person.accuracy)}` : '',
                ),
                h(
                  'div',
                  { class: 'small mono faint' },
                  `花掉 ${money(person.totalSpent)} · 关系 ${person.relationship}`,
                ),
              ),
            ),
            ...person.intel.map((item) =>
              h(
                'div',
                { style: 'margin-top:6px;padding-left:8px;border-left:2px solid var(--rule)' },
                h('div', { class: 'small faint' }, `第 ${item.turn} 天`),
                h('div', { class: 'small' }, `「${item.text}」`),
                chainOf(item.consequences),
              ),
            ),
          ),
        )
      }
    }
  }

  return panel('档案库', root, { flex: true })
}

/**
 * 说不好 is the honest label for a tip that was acted on and still proved
 * nothing. The game never tells the player which way it actually fell.
 */
const VERDICT: Record<string, string> = {
  accurate: '准的',
  wrong: '错的',
  inconclusive: '说不好',
  pending: '还没用过',
}

const OUTCOME: Record<string, string> = {
  stolen: '已到手',
  sold: '已出手',
  failed: '没得手',
  untouched: '——',
}
