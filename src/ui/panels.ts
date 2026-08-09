/**
 * The fixed panels of the main screen. Layout follows the reference build:
 * a character/context column on the left, the map in the middle, slot racks
 * on the right, a wanted-level strip and a message log along the bottom.
 *
 * Everything the player needs is on one screen at once — that density is the
 * point, and it is why nothing here scrolls the page as a whole.
 */

import type { GameEvent } from '../engine/events.js'
import { getInformant } from '../engine/state.js'
import { ERA_LABELS, SKILL_LABELS } from '../engine/types.js'
import type { SkillKey } from '../engine/types.js'
import { DIFFICULTIES } from '../content/balance.js'
import { HEIST_CONFIG } from '../content/heist.js'
import { INFORMANTS, informantDef } from '../content/informants.js'
import { vehicleDef } from '../content/vehicles.js'
import { VENUE_BADGE, VENUE_LABELS } from '../content/types.js'
import { TUTORIAL_TARGET } from '../content/script.js'
import { availableChannels, fencePrice } from '../systems/economy.js'
import { heatOf, tierFor } from '../systems/heat.js'
import { observedReliability, reputationTone } from '../systems/intel.js'
import { recall } from '../systems/dossier.js'
import {
  VERIFY_FEE,
  buyIntel,
  fence,
  rest,
  scout,
  startHeist,
  verify,
} from '../systems/game.js'
import { carSvg } from './art/car.js'
import { photoTile, portraitKey } from './art/photo.js'
import { ROLE_GLYPHS, VENUE_GLYPHS, iconSvg } from './art/icons.js'
import { venueScene } from './art/scene.js'
import { buildMap } from './art/map.js'
import type { MapPin } from './art/map.js'
import { h, money, pct, photo, svg } from './dom.js'
import { play } from './audio.js'
import type { Ui } from './app.js'

// ── shared bits ──────────────────────────────────────────────────────

export function panel(
  title: string,
  body: Node,
  options: { flex?: boolean; help?: string; cls?: string } = {},
): HTMLElement {
  return h(
    'section',
    { class: `panel ${options.flex ? 'flex' : ''} ${options.cls ?? ''}` },
    h(
      'div',
      { class: 'cap' },
      h('span', {}, title),
      options.help ? h('span', { class: 'q', title: options.help }, '?') : null,
    ),
    h('div', { class: 'in' }, body),
  )
}

export function bar(value: number, max = 100, cls = ''): HTMLElement {
  const ratio = Math.max(0, Math.min(1, value / max))
  const tone = cls || (ratio > 0.6 ? '' : ratio > 0.3 ? 'mid' : 'bad')
  return h('div', { class: `bar ${tone}` }, h('span', { style: `width:${ratio * 100}%` }))
}

// ── left: character sheet ────────────────────────────────────────────

export function characterPanel(ui: Ui): HTMLElement {
  const { state } = ui.game
  const body = h('div', {})

  body.appendChild(
    h(
      'div',
      { class: 'row', style: 'gap:8px;align-items:flex-start;margin-bottom:6px' },
      // §2.3 人物档案用真实照片。⚠️ people/* 仅原型可用，见 assets/CREDITS.md
      // §2.3 人物档案用真实照片。⚠️ people/* 仅原型可用，见 assets/CREDITS.md
      photo(photoTile(portraitKey(state.flags['face'] ?? 2), 68, 68)),
      h(
        'div',
        { style: 'flex:1;min-width:0' },
        h('div', { style: 'font-weight:700' }, state.playerName),
        h('div', { class: 'small faint' }, '47 岁 · 二十年手艺'),
        h(
          'div',
          { class: 'small', style: 'margin-top:4px' },
          state.marco.injuryTurns > 0
            ? h('span', { class: 'red' }, `受伤 · 还需 ${state.marco.injuryTurns} 回合`)
            : h('span', { class: 'green' }, '状态良好'),
        ),
      ),
    ),
  )

  for (const key of Object.keys(SKILL_LABELS) as SkillKey[]) {
    const value = state.marco.skills[key]
    body.appendChild(
      h(
        'div',
        { class: 'stat' },
        h('span', {}, SKILL_LABELS[key]),
        bar(value),
        h('span', { class: 'num' }, String(value)),
      ),
    )
  }

  const total = heatOf(state)
  if (state.unlocked.includes('heat')) {
    const tier = tierFor(total)
    body.appendChild(
      h(
        'div',
        { class: 'stat', style: 'margin-top:6px' },
        h('span', {}, '热度'),
        bar(total, 100, 'heat'),
        // §3.3 双段显示："底案+累积"，不要合成一个数
        h('span', { class: 'num' }, `${state.wanted.base}+${state.wanted.current}`),
      ),
    )
    body.appendChild(
      h('div', { class: 'small faint', style: 'margin-top:2px' }, `等级：${tier.label}`),
    )
  }

  return panel('人物档案', body, { help: '技能决定每一次判定。机械是他的骄傲，电子是他的坟墓。' })
}

// ── left: contextual info + actions on whatever is selected ──────────

export function contextPanel(ui: Ui): HTMLElement {
  const { state, log } = ui.game
  const selected = ui.selected

  if (!selected) {
    return panel(
      '地区信息',
      h(
        'div',
        { class: 'empty' },
        '点地图上的图标，看看那里有什么。',
      ),
    )
  }

  if (selected.kind === 'vehicle') {
    const target = state.targets.find((t) => t.id === selected.id)
    if (!target) return panel('目标信息', h('div', { class: 'empty' }, '没有了。'))
    const def = vehicleDef(target.defId)
    const body = h('div', {})

    // §2.3 — Info 大图是 152×110 的真实照片。下面那条是地点，用画的，
    // 因为照片库里没有「这辆车停在哪」这种镜头。
    body.appendChild(photo(photoTile(def.photo, 152, 110)))
    body.appendChild(
      photo(
        venueScene({
          venue: def.venue,
          car: {
            bodyType: def.bodyType,
            era: def.era,
            ...(target.stolen ? { gone: true } : {}),
          },
          height: 52,
        }),
      ),
    )
    body.appendChild(
      h(
        'div',
        { class: 'row', style: 'justify-content:space-between;margin:4px 0 2px' },
        h('span', { style: 'font-weight:700' }, `${def.name} ${def.year}`),
        h('span', { class: `tag era-${def.era}` }, ERA_LABELS[def.era].split('（')[0] ?? def.era),
      ),
    )
    body.appendChild(
      h(
        'div',
        { class: 'row small faint', style: 'gap:5px;align-items:center' },
        svg(iconSvg(VENUE_GLYPHS[def.venue], 14)),
        h('span', {}, def.location),
      ),
    )
    body.appendChild(h('div', { class: 'small', style: 'margin:4px 0' }, def.flavor))
    body.appendChild(
      h('div', { class: 'row small', style: 'margin-bottom:4px' }, '估值 ',
        h('b', { class: 'mono' }, money(def.basePrice))),
    )

    body.appendChild(
      h('div', { class: 'small faint', style: 'margin:6px 0 2px' }, '防御（条越长越好下手）'),
    )
    const defenses: [string, number][] = [
      ['曝光', def.defense.exposure],
      ['锁具', def.defense.lock],
      ['点火', def.defense.ignition],
      ['追缉', def.defense.pursuit],
    ]
    for (const [label, value] of defenses) {
      body.appendChild(
        h(
          'div',
          { class: 'stat' },
          h('span', {}, label),
          bar(100 - value),
          h('span', { class: 'num' }, String(value)),
        ),
      )
    }

    if (!target.stolen && !state.activeRun) {
      // Scouting is your own eyes: costs time, never lies. It appears from
      // day two — day one is Solomon walking you through the whole thing.
      if (state.turn > 1) {
        const scoutRow = h('div', { class: 'row', style: 'margin-top:6px' })
        for (const segment of HEIST_CONFIG.segments) {
          const done = target.scouted.includes(segment.id)
          scoutRow.appendChild(
            h(
              'button',
              {
                class: 'small',
                style: 'padding:2px 6px',
                disabled: done || state.ap < 1,
                onclick: () => ui.act(() => scout(ui.game, target.id, segment.id)),
              },
              done ? `✓${segment.title}` : segment.title,
            ),
          )
        }
        body.appendChild(h('div', { class: 'small faint', style: 'margin-top:6px' }, '踩点（1 行动点，看到的一定是真的）'))
        body.appendChild(scoutRow)
      }

      body.appendChild(
        h(
          'div',
          { class: 'row', style: 'margin-top:8px' },
          h(
            'button',
            {
              class: 'act go',
              disabled: state.ap < 2,
              onclick: () =>
                ui.act(() => {
                  startHeist(ui.game, target.id)
                  play('heart')
                  ui.beats = []
                  ui.heistEnded = false
                  ui.mode = 'heist'
                }),
            },
            '下 手',
          ),
          h('span', { class: 'small faint' }, '2 行动点'),
        ),
      )
    }
    return panel(`目标信息 · ${VENUE_LABELS[def.venue]}`, body)
  }

  // informant
  const def = informantDef(selected.id)
  const record = getInformant(state, def.id)
  const observed = observedReliability(state, def.id)
  const showScore = DIFFICULTIES[state.difficulty].showReliabilityScore
  const memory = record?.met ? recall(log, def.id) : null
  const body = h('div', {})

  if (memory) body.appendChild(h('div', { class: 'recall' }, memory))
  body.appendChild(photo(photoTile(def.photo, 152, 110)))
  body.appendChild(photo(venueScene({ venue: def.venue, height: 46 })))
  body.appendChild(
    h(
      'div',
      { class: 'row', style: 'gap:8px;align-items:flex-start;margin-top:5px' },
      photo(photoTile(def.photo, 44, 44)),
      h(
        'div',
        { style: 'flex:1;min-width:0' },
        h('div', { style: 'font-weight:700' }, def.name),
        h(
          'div',
          { class: 'row small faint', style: 'gap:4px;align-items:center' },
          svg(iconSvg(ROLE_GLYPHS[def.roleIcon], 13)),
          h('span', {}, def.role),
        ),
        h('div', { class: 'small' }, money(def.price), ' / 条'),
      ),
    ),
  )
  body.appendChild(
    h(
      'div',
      { class: 'row small faint', style: 'gap:5px;align-items:center;margin:4px 0' },
      svg(iconSvg(VENUE_GLYPHS[def.venue], 14)),
      h('span', {}, def.hangout),
    ),
  )
  body.appendChild(h('div', { class: 'small', style: 'margin-bottom:6px' }, def.intro))

  if (record?.met) {
    body.appendChild(
      h(
        'table',
        { class: 'rows' },
        h('tr', {}, h('td', {}, '给过'), h('td', { class: 'n' }, String(observed.offered))),
        h('tr', {}, h('td', {}, '准'), h('td', { class: 'n green' }, String(observed.accurate))),
        h('tr', {}, h('td', {}, '错'), h('td', { class: 'n red' }, String(observed.wrong))),
        h('tr', {}, h('td', {}, '说不好'), h('td', { class: 'n' }, String(observed.inconclusive))),
        h('tr', {}, h('td', {}, '没用过'), h('td', { class: 'n' }, String(observed.pending))),
        showScore && observed.accuracy !== null
          ? h('tr', {}, h('td', {}, '准确率'), h('td', { class: 'n' }, pct(observed.accuracy)))
          : null,
        h('tr', {}, h('td', {}, '花掉'), h('td', { class: 'n' }, money(observed.spent))),
        h('tr', {}, h('td', {}, '关系'), h('td', { class: 'n' }, String(record.relationship))),
      ),
    )
  }

  body.appendChild(
    h(
      'div',
      { class: 'row', style: 'margin-top:8px' },
      h(
        'button',
        {
          class: 'act go',
          disabled: state.ap < 1 || state.cash < def.price,
          onclick: () => ui.openIntelPicker(def.id),
        },
        '买 消 息',
      ),
      h('span', { class: 'small faint' }, '1 行动点'),
    ),
  )
  return panel(`人物信息 · ${VENUE_LABELS[def.venue]}`, body)
}

// ── centre: status strip, map, wanted level ──────────────────────────

export function statusStrip(ui: Ui): HTMLElement {
  const { state } = ui.game
  const pips = h('span', { class: 'pips' })
  for (let i = 0; i < state.maxAp; i++) pips.appendChild(h('i', { class: i < state.ap ? '' : 'spent' }))

  const item = (k: string, v: Node | string, cls = ''): HTMLElement =>
    h('span', {}, h('span', { class: 'k' }, `${k} `), h('span', { class: `v ${cls}` }, v))

  return h(
    'div',
    { class: 'panel' },
    h(
      'div',
      { class: 'strip' },
      item('日', String(state.turn)),
      item('行动点', pips),
      item('现金', money(state.cash), state.cash < 500 ? 'red' : 'green'),
      item('负债', money(state.debt.principal), 'red'),
      item('下次还款', `第 ${state.debt.nextDueTurn} 天 · ${money(state.debt.minimumPayment)}`),
      state.debt.missed > 0 ? item('违约', `${state.debt.missed} 次`, 'red') : null,
    ),
  )
}

export function mapPanel(ui: Ui): HTMLElement {
  const { state } = ui.game
  const pins: MapPin[] = []

  // Day one shows one car and nothing else — §8.1.
  const tutorialOnly = state.turn === 1
  for (const target of state.targets) {
    const def = vehicleDef(target.defId)
    if (tutorialOnly && target.defId !== TUTORIAL_TARGET) continue
    pins.push({
      id: target.id,
      kind: 'vehicle',
      location: def.location,
      photo: def.photo,
      badge: 'car',
      label: `${def.name} ${def.year} · ${def.location}`,
      ...(target.stolen ? { gone: true } : {}),
      ...(state.intel.some((i) => i.targetInstanceId === target.id && !i.resolved)
        ? { flagged: true }
        : {}),
    })
  }
  if (state.unlocked.includes('informants')) {
    for (const def of INFORMANTS) {
      pins.push({
        id: `inf-${def.id}`,
        kind: 'informant',
        location: def.hangout,
        photo: def.photo,
        badge: VENUE_BADGE[def.venue],
        label: `${def.name} · ${def.role} · ${def.hangout}`,
      })
    }
  }

  const map = buildMap({
    pins,
    selectedId: ui.selected
      ? ui.selected.kind === 'vehicle'
        ? ui.selected.id
        : `inf-${ui.selected.id}`
      : null,
    heat: heatOf(state),
    onSelect: (id) => {
      ui.selected = id.startsWith('inf-')
        ? { kind: 'informant', id: id.slice(4) }
        : { kind: 'vehicle', id }
      play('tick')
      ui.render()
    },
  })

  return panel(tutorialOnly ? '本市 · 所罗门指的地方' : '本市', map, {
    flex: true,
    cls: 'mapPanel',
    help: '橙色是车，浅色是人。红点表示你手上有关于它的消息。',
  })
}

export function wantedStrip(ui: Ui): HTMLElement {
  const { state } = ui.game
  const total = heatOf(state)
  const tier = tierFor(total)
  const shown = state.unlocked.includes('heat')

  return h(
    'div',
    { class: 'panel' },
    h(
      'div',
      { class: 'strip', style: 'align-items:center;flex-wrap:nowrap;gap:10px' },
      shown
        ? h(
            'div',
            { class: 'row', style: 'flex:1;gap:6px;align-items:center;min-width:0' },
            h('span', { class: 'k' }, '警方通缉指数'),
            h('div', { style: 'flex:1;min-width:60px' }, bar(total, 100, 'heat')),
            h('span', { class: 'v' }, `${state.wanted.base}+${state.wanted.current}`),
            h('span', { class: total >= 60 ? 'v red' : 'v' }, tier.label),
            state.wanted.locked ? h('span', { class: 'v red' }, '· 区域封锁') : null,
          )
        : h('div', { style: 'flex:1' }, h('span', { class: 'k' }, '本市 · 第一纪')),
      state.ap > 0 && state.turn > 1
        ? h(
            'button',
            { onclick: () => ui.act(() => { rest(ui.game); ui.endTurn() }) },
            '休息',
          )
        : null,
      h('button', { class: 'act', onclick: () => ui.endTurn() }, '结束这一天 ▶▶'),
    ),
  )
}

// ── right: slot racks ────────────────────────────────────────────────

function slotGrid(cells: (HTMLElement | null)[], size = 4): HTMLElement {
  const grid = h('div', { class: 'slots' })
  for (let i = 0; i < Math.max(size, cells.length); i++) {
    grid.appendChild(cells[i] ?? h('div', { class: 'slot' }))
  }
  return grid
}

export function garagePanel(ui: Ui): HTMLElement {
  const { state } = ui.game
  const cells = state.garage.map((car) => {
    const def = vehicleDef(car.defId)
    return h(
      'div',
      {
        class: `slot filled ${ui.fencing === car.instanceId ? 'on' : ''}`,
        title: `${def.name} · 车况 ${car.condition}`,
        onclick: () => {
          ui.fencing = ui.fencing === car.instanceId ? null : car.instanceId
          ui.render()
        },
      },
      svg(carSvg({ bodyType: def.bodyType, era: def.era, condition: car.condition, height: 42 })),
      h('span', { class: 'cap2' }, def.name),
    )
  })

  const body = h('div', {}, slotGrid(cells))
  const picked = state.garage.find((c) => c.instanceId === ui.fencing)
  if (picked) {
    body.appendChild(h('div', { class: 'small', style: 'margin-top:5px' }, `车况 ${picked.condition}`))
    for (const channel of availableChannels(state)) {
      const price = fencePrice(state, picked.defId, picked.condition, channel.id)
      body.appendChild(
        h(
          'button',
          {
            style: 'width:100%;margin-top:3px;text-align:left',
            title: channel.note,
            disabled: state.ap < 1,
            onclick: () =>
              ui.act(() => {
                fence(ui.game, picked.instanceId, channel.id)
                ui.fencing = null
                play('cash')
              }),
          },
          `${channel.label} ${money(price.final)}`,
        ),
      )
    }
  }
  return panel('停车库', body, { help: '点一辆车选中，再选销赃渠道。热度会压价。' })
}

export function informantRack(ui: Ui): HTMLElement | null {
  const { state } = ui.game
  if (!state.unlocked.includes('informants')) return null
  const cells = INFORMANTS.map((def) => {
    const record = getInformant(state, def.id)
    const observed = observedReliability(state, def.id)
    return h(
      'div',
      {
        class:
          `slot filled tone-${record?.met ? reputationTone(observed) : 'neutral'} ` +
          (ui.selected?.kind === 'informant' && ui.selected.id === def.id ? 'on' : ''),
        title: def.name,
        onclick: () => {
          ui.selected = { kind: 'informant', id: def.id }
          ui.render()
        },
      },
      photo(photoTile(def.photo, 56, 56)),
      h('span', { class: 'cap2' }, def.name.split(' ')[0] ?? def.name),
    )
  })
  return panel('线人', slotGrid(cells))
}

export function intelRack(ui: Ui): HTMLElement | null {
  const { state } = ui.game
  if (!state.unlocked.includes('informants')) return null
  const open = state.intel.filter((i) => !i.resolved)
  const body = h('div', {})
  if (open.length === 0) {
    body.appendChild(h('div', { class: 'empty' }, '手上没有消息。'))
  }
  for (const item of open) {
    const source = informantDef(item.sourceId)
    const target = state.targets.find((t) => t.id === item.targetInstanceId)
    body.appendChild(
      h(
        'div',
        { class: 'sunken', style: 'padding:4px;margin-bottom:4px' },
        h('div', { class: 'small faint' }, `第 ${item.receivedTurn} 天 · ${source.name}`),
        h('div', { class: 'small', style: 'margin:2px 0' }, `「${item.text}」`),
        h('div', { class: 'small faint' }, target ? vehicleDef(target.defId).name : ''),
        item.verifiedSignal
          ? h(
              'div',
              { class: `small ${item.verifiedSignal === 'confirms' ? 'green' : 'red'}` },
              item.verifiedSignal === 'confirms' ? '有人说没问题' : '有人说不对',
            )
          : state.unlocked.includes('verify')
            ? h(
                'button',
                {
                  class: 'link small',
                  disabled: state.ap < 1 || state.cash < VERIFY_FEE,
                  onclick: () => ui.openVerifyPicker(item.id, item.sourceId),
                },
                `找人对一遍 ${money(VERIFY_FEE)}`,
              )
            : null,
      ),
    )
  }
  return panel('手上的消息', body)
}

// ── bottom: message log ──────────────────────────────────────────────

const LOG_SKIP = new Set(['turn_start', 'heist_segment'])

export function logPanel(ui: Ui): HTMLElement {
  const { log } = ui.game
  const body = h('div', {})
  const events = log
    .all()
    .filter((e: GameEvent) => !LOG_SKIP.has(e.type))
    .slice(-60)

  for (const event of events) {
    body.appendChild(
      h(
        'p',
        { class: `l ${event.tone === 'bad' ? 'bad' : event.tone === 'good' ? 'good' : ''}` },
        h('span', { class: 't' }, `[${event.turn}]`),
        event.summary,
      ),
    )
  }
  if (events.length === 0) body.appendChild(h('p', { class: 'l faint' }, '……'))

  const section = panel('消息', body, { cls: 'log' })
  queueMicrotask(() => {
    const inner = section.querySelector('.in')
    if (inner) inner.scrollTop = inner.scrollHeight
  })
  return section
}

export function verifyPickerBody(ui: Ui, intelId: string, excludeId: string): HTMLElement {
  const body = h(
    'div',
    { style: 'padding:8px' },
    h('p', {}, '找谁对一遍？'),
    // §6.4 — say it out loud: this does not buy certainty.
    h('p', { class: 'small faint' }, '第二个人也可能是错的。这不会给你真相，只会给你第二个数据点。'),
  )
  for (const def of INFORMANTS.filter((i) => i.id !== excludeId)) {
    body.appendChild(
      h(
        'button',
        {
          style: 'display:block;width:100%;text-align:left;margin-top:4px',
          onclick: () => {
            ui.act(() => verify(ui.game, intelId, def.id))
            ui.closeModal()
          },
        },
        `${def.name} — ${def.role}`,
      ),
    )
  }
  return body
}

export function intelPickerBody(ui: Ui, informantId: string): HTMLElement {
  const { state } = ui.game
  const body = h(
    'div',
    { style: 'padding:8px' },
    h('p', {}, `${informantDef(informantId).name} 能说点什么？`),
    h('p', { class: 'small faint' }, '挑一辆车。他会告诉你他知道的——或者他愿意让你以为的。'),
  )
  for (const target of state.targets.filter((t) => !t.stolen)) {
    const def = vehicleDef(target.defId)
    body.appendChild(
      h(
        'button',
        {
          style: 'display:block;width:100%;text-align:left;margin-top:4px',
          onclick: () => {
            ui.act(() => {
              buyIntel(ui.game, informantId, target.id)
              play('pick')
            })
            ui.closeModal()
          },
        },
        `${def.name} ${def.year} — ${def.location}`,
      ),
    )
  }
  return body
}
