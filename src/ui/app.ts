/**
 * The UI controller. Owns the window frame, the panel layout and the modal
 * queue. All rules live in `systems/`; this layer only calls the facade.
 */

import type { FailureKind } from '../engine/state.js'
import type { Session } from '../engine/save.js'
import { fromJSON, toJSON } from '../engine/save.js'
import type { Difficulty } from '../engine/types.js'
import { SLICE_END } from '../content/script.js'
import type { TurnReport } from '../systems/turn.js'
import { ActionError, endTurn as advanceTurn, newGame } from '../systems/game.js'
import { caseFile as caseFileData, dayCards } from '../systems/dossier.js'
import { heatOf, tierFor } from '../systems/heat.js'
import { clear, h, money, photo } from './dom.js'
import { play } from './audio.js'
import { photoTile } from './art/photo.js'
import * as docs from './docs/index.js'
import type { DocKind } from './docs/index.js'
import {
  characterPanel,
  contextPanel,
  garagePanel,
  informantRack,
  intelPickerBody,
  intelRack,
  logPanel,
  mapPanel,
  panel,
  statusStrip,
  verifyPickerBody,
  wantedStrip,
} from './panels.js'
import { renderTitle } from './screens/title.js'
import { renderHeistPanel } from './screens/heist.js'
import { renderDossier } from './screens/dossier.js'

export type Mode = 'map' | 'heist' | 'dossier' | 'ending'

/**
 * Phone layout. The three-column desktop grid is a desktop idea — stacked on a
 * phone it becomes one endless scroll where the map, the thing you just tapped
 * and the buttons that act on it are never on screen together.
 *
 * So on narrow screens the panels regroup into tabs, and the core loop
 * (see the map → tap a pin → read it → act on it) all lives in one of them.
 */
export type Tab = 'map' | 'me' | 'stuff' | 'log'

export const NARROW_AT = 900
export type Selection = { kind: 'vehicle' | 'informant'; id: string }

const SAVE_KEY = 'gtt.save.v1'

/** ⚠️ real person — prototype only, see assets/CREDITS.md */
const SOLOMON_PHOTO = 'people/p07'

export interface HeistBeat {
  text: string
  failed: boolean
}

export class Ui {
  session: Session | null = null
  mode: Mode = 'map'
  selected: Selection | null = null
  /** Garage slot currently expanded for fencing. */
  fencing: string | null = null
  dossierTab = 'people'
  tab: Tab = 'map'
  beats: HeistBeat[] = []
  heistEnded = false
  readonly rotation = new docs.FormRotation()

  #root: HTMLElement
  #modals: (() => Node)[] = []
  #seenAdvisor = new Set<string>()
  #wasNarrow = false

  constructor(root: HTMLElement) {
    this.#root = root
    this.#wasNarrow = this.narrow
    // Only redraw when the layout actually has to change shape — a rotate
    // matters, the address bar sliding away does not.
    window.addEventListener('resize', () => {
      if (this.narrow !== this.#wasNarrow) {
        this.#wasNarrow = this.narrow
        if (this.session) this.render()
      }
    })
  }

  get narrow(): boolean {
    return window.innerWidth <= NARROW_AT
  }

  get game(): Session {
    if (!this.session) throw new Error('还没有开始游戏')
    return this.session
  }

  // ── lifecycle ───────────────────────────────────────────────────────

  start(
    difficulty: Difficulty,
    seed?: number,
    profile: { name: string; face: number } = { name: 'MARCO', face: 2 },
  ): void {
    this.session = newGame({
      difficulty,
      playerName: profile.name,
      ...(seed !== undefined ? { seed } : {}),
    })
    this.game.state.flags['face'] = profile.face
    this.mode = 'map'
    this.selected = null
    this.beats = []
    this.flushAdvisor()
    this.render()
  }

  // ── modals ──────────────────────────────────────────────────────────

  push(build: () => Node): void {
    this.#modals.push(build)
  }

  closeModal(): void {
    this.#modals.shift()
    this.render()
  }

  modalCount(): number {
    return this.#modals.length
  }

  /**
   * Runs a facade action and persists the result. Every player action goes
   * through here — scouting, buying, fencing and verifying used to be lost on
   * a refresh because only turn ends and heists remembered to save.
   */
  act(action: () => void): void {
    try {
      action()
    } catch (error) {
      this.toast(error instanceof ActionError ? error.message : String(error))
    }
    this.autosave()
    this.render()
  }

  toast(message: string): void {
    this.push(() => h('div', { style: 'padding:10px' }, h('p', { class: 'red' }, message)))
  }

  openIntelPicker(informantId: string): void {
    this.push(() => intelPickerBody(this, informantId))
    this.render()
  }

  openVerifyPicker(intelId: string, excludeId: string): void {
    this.push(() => verifyPickerBody(this, intelId, excludeId))
    this.render()
  }

  /** Solomon speaks whenever a system opens up. §8.1 */
  flushAdvisor(): void {
    for (const event of this.game.log.byType('advisor')) {
      if (this.#seenAdvisor.has(event.id)) continue
      this.#seenAdvisor.add(event.id)
      const text = String(event.payload['text'] ?? '')
      this.push(() =>
        h(
          'div',
          { class: 'advisor' },
          photo(photoTile(SOLOMON_PHOTO, 78, 78)),
          h('div', {}, h('div', { class: 'who' }, 'SOLOMON'), h('div', { class: 'said' }, text)),
        ),
      )
    }
  }

  // ── turn ────────────────────────────────────────────────────────────

  endTurn(): void {
    const report = advanceTurn(this.game)
    play('tick')
    this.presentTurn(report)
    this.announceFailure(report.failure)
    this.flushAdvisor()
    this.fencing = null
    this.autosave()
    if (this.game.state.turn > SLICE_END.turn) this.mode = 'ending'
    this.render()
  }

  /**
   * §7 — three of the four failures are not game over, but every one of them
   * has to be said out loud. Silently setting a flag and carrying on is the
   * one thing that is definitely wrong.
   */
  private announceFailure(kind: FailureKind | null): void {
    if (!kind) return
    const { state } = this.game
    play('siren')
    this.rotation.record(state.turn, 'casefile')
    const copy = FAILURE_COPY[kind]
    this.push(() =>
      h(
        'div',
        { style: 'padding:8px' },
        docs.caseFile(copy.stamp, heatOf(state), copy.lines),
        h('p', { class: 'red' }, copy.tail),
      ),
    )
    if (state.failure?.terminal) this.mode = 'ending'
  }

  private presentTurn(report: TurnReport): void {
    const { state, log } = this.game

    if (report.debt) {
      const debt = report.debt
      play(debt.missed ? 'fail' : 'cash')
      this.rotation.record(state.turn, 'calllog')
      this.push(() =>
        h(
          'div',
          { style: 'padding:8px' },
          docs.callLog(debt.callTitle, debt.callBody),
          debt.missed
            ? h('p', { class: 'red' }, `利息 +${money(debt.interestAdded)}。`)
            : h('p', { class: 'green' }, `你交了 ${money(debt.paid)}。`),
          debt.crewDisabledTurns > 0
            ? h('p', { class: 'red' }, `戴安娜 ${debt.crewDisabledTurns} 个回合内动不了。`)
            : null,
        ),
      )
    }

    if (report.recovered) {
      this.rotation.record(state.turn, 'note')
      this.push(() =>
        h('div', { style: 'padding:8px' }, docs.note('医生', '肩膀好了。\n还会疼，但能用了。')),
      )
    }

    // One card per turn, kept forever — also the raw material for the montage.
    const card = dayCards(log).find((c) => c.turn === report.turn - 1)
    if (card && card.events.length > 1) {
      const kind: DocKind = card.cashDelta !== 0 ? 'ledger' : 'surveillance'
      this.rotation.record(state.turn, kind)
      this.push(() =>
        h(
          'div',
          { style: 'padding:8px' },
          kind === 'ledger'
            ? docs.ledger(
                `第 ${card.turn} 天 · 流水`,
                card.events
                  .filter((e) => ['sale', 'intel_received', 'debt_payment'].includes(e.type))
                  .map((e) => ({
                    label: e.summary,
                    amount:
                      Number(e.payload['payout'] ?? 0) -
                      Number(e.payload['cost'] ?? 0) -
                      Number(e.payload['paid'] ?? 0),
                  })),
                card.cashDelta,
              )
            : docs.surveillance(`第 ${card.turn} 天`, tierFor(heatOf(state)).label, card.headline),
        ),
      )
    }
  }

  // ── persistence ─────────────────────────────────────────────────────

  autosave(): void {
    try {
      localStorage.setItem(SAVE_KEY, toJSON(this.game))
    } catch {
      /* private browsing or quota — a lost autosave must not break a turn */
    }
  }

  hasSave(): boolean {
    try {
      return localStorage.getItem(SAVE_KEY) !== null
    } catch {
      return false
    }
  }

  loadSave(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) return false
      this.session = fromJSON(raw)
      this.mode = this.game.state.activeRun ? 'heist' : 'map'
      this.render()
      return true
    } catch {
      return false
    }
  }

  // ── render ──────────────────────────────────────────────────────────

  render(): void {
    clear(this.#root)
    const frame = h('div', { class: 'window' }, this.titlebar())

    if (!this.session) {
      frame.appendChild(h('div', { style: 'flex:1;overflow-y:auto' }, renderTitle(this)))
      this.#root.appendChild(frame)
      return
    }

    if (this.narrow) {
      frame.appendChild(this.tabBar())
      frame.appendChild(h('div', { class: 'body mobile' }, h('div', { class: 'col scroll' }, ...this.tabContent())))
    } else {
      frame.appendChild(
        h(
          'div',
          { class: 'body' },
          h('div', { class: 'col scroll' }, characterPanel(this), contextPanel(this)),
          h('div', { class: 'col' }, ...this.centre()),
          h('div', { class: 'col scroll' }, garagePanel(this), informantRack(this), intelRack(this)),
        ),
      )
      frame.appendChild(h('div', { class: 'footer' }, logPanel(this)))
    }
    this.#root.appendChild(frame)

    const next = this.#modals[0]
    if (next) {
      this.#root.appendChild(
        h(
          'div',
          { class: 'modal', onclick: () => this.closeModal() },
          h(
            'div',
            { class: 'window win2', onclick: (e: Event) => e.stopPropagation() },
            h('div', { class: 'titlebar' }, h('span', { class: 'grow' }, '消息'),
              h('span', { class: 'box' }, '✕')),
            next(),
            h(
              'div',
              { class: 'row end', style: 'padding:6px' },
              h('button', { class: 'act', onclick: () => this.closeModal() }, '确定'),
            ),
          ),
        ),
      )
    }
  }

  private tabBar(): HTMLElement {
    const bar = h('div', { class: 'tabbar' })
    const tabs: [Tab, string][] = [
      ['map', '地图'],
      ['me', '人物'],
      ['stuff', '物资'],
      ['log', '消息'],
    ]
    for (const [id, label] of tabs) {
      bar.appendChild(
        h(
          'button',
          {
            class: this.tab === id ? 'on' : '',
            onclick: () => {
              this.tab = id
              this.render()
            },
          },
          label,
        ),
      )
    }
    return bar
  }

  /** A heist or the dossier takes over the whole screen — no tabs to lose. */
  private tabContent(): (HTMLElement | null)[] {
    if (this.mode !== 'map') return this.centre()
    switch (this.tab) {
      case 'me':
        return [characterPanel(this)]
      case 'stuff':
        return [garagePanel(this), informantRack(this), intelRack(this)]
      case 'log':
        return [logPanel(this)]
      default:
        // The whole loop on one screen: what's out there, what you tapped,
        // what you can do about it, and the button that ends the day.
        return [statusStrip(this), mapPanel(this), contextPanel(this), wantedStrip(this)]
    }
  }

  private centre(): HTMLElement[] {
    if (this.mode === 'heist') return [statusStrip(this), renderHeistPanel(this)]
    if (this.mode === 'dossier') return [statusStrip(this), renderDossier(this), wantedStrip(this)]
    if (this.mode === 'ending') return [statusStrip(this), this.ending()]
    return [statusStrip(this), mapPanel(this), wantedStrip(this)]
  }

  private titlebar(): HTMLElement {
    const label = this.session
      ? `GRAND THEFT: TEXT — 第一纪·手艺 — 第 ${this.game.state.turn} 天`
      : 'GRAND THEFT: TEXT'
    const canDossier =
      this.session && this.game.state.unlocked.includes('dossier') && this.mode !== 'heist'

    return h(
      'div',
      { class: 'titlebar' },
      h('span', { class: 'grow' }, label),
      canDossier
        ? h(
            'button',
            {
              style: 'font-size:11px;padding:1px 8px',
              onclick: () => {
                this.mode = this.mode === 'dossier' ? 'map' : 'dossier'
                this.render()
              },
            },
            this.mode === 'dossier' ? '回到地图' : '档案库 [F]',
          )
        : null,
      h('span', { class: 'box' }, '_'),
      h('span', { class: 'box' }, '▭'),
      h('span', { class: 'box' }, '✕'),
    )
  }

  private ending(): HTMLElement {
    const { state, log } = this.game
    const file = caseFileData(state, log)
    const body = h('div', { style: 'padding:6px' })
    for (const line of SLICE_END.body) body.appendChild(h('p', {}, line || ' '))
    body.appendChild(
      docs.newspaper(
        state.failure ? '本地男子涉多起盗车案被捕' : '本市盗车案数量持续上升',
        dayCards(log).map((c) => `第 ${c.turn} 天：${c.headline}`).join(' '),
        `第 ${state.turn} 天`,
      ),
    )
    if (file.visible) body.appendChild(docs.caseFile(file.tier, file.heat, file.entries))
    body.appendChild(
      h(
        'div',
        { class: 'row', style: 'margin-top:10px' },
        h(
          'button',
          {
            class: 'act go',
            onclick: () => {
              this.session = null
              this.render()
            },
          },
          '重新开始',
        ),
      ),
    )
    return panel(SLICE_END.title, body, { flex: true })
  }
}

/** §7 — what each failure looks like when it lands on the player's desk. */
const FAILURE_COPY: Record<FailureKind, { stamp: string; lines: string[]; tail: string }> = {
  bankrupt: {
    stamp: '资不抵债',
    lines: ['你身上一分钱都没有了。', '也没有任何能卖掉的东西。'],
    tail: '接下来你只能接别人指定的活了。',
  },
  arrested: {
    stamp: '已被拘留',
    lines: ['他们在你家门口等着。', '你没跑，跑也没用。'],
    tail: '审讯室里只有一个问题：你说出谁的名字？',
  },
  alone: {
    stamp: '孤身一人',
    lines: ['没有人可以叫了。'],
    tail: '现在只剩下你和一根铁丝。',
  },
  liquidated: {
    stamp: '结清',
    lines: ['他们不再打电话了。'],
    tail: '这件事到此为止。',
  },
}
