/**
 * 被发现之后的处理环节。
 *
 * 这是此前整个判定链上缺的一层。原先一次失败就直接收场（「你走掉了」），
 * 现在失败会把你推进一个新的局面：有人看见了、摄像头转过来了、警察到了。
 * 每种局面都有基于人物特长的出路，而每条出路都有它自己的代价。
 *
 * 最贵的两条——灭口和向警察开枪——抬的都是**底案**（§3.3）：
 * 那一段永不衰减，贿赂也买不回来。这是设计上有意的：
 * 钱能买通这个星期，买不通你的档案。
 */

import type { EventLog } from '../engine/events.js'
import type { GameState, IncidentState, SegmentRunState } from '../engine/state.js'
import type { Rng } from '../engine/rng.js'
import { clamp } from '../engine/types.js'
import type { IncidentKind, IncidentOption } from '../content/incidents.js'
import { INCIDENTS, SENTENCES, STRIKES_TO_LIFE, WITNESSES } from '../content/incidents.js'
import { DIFFICULTIES, P_CEILING, P_FLOOR } from '../content/balance.js'
import type { StepResult } from './segment-run.js'
import { addHeat } from './heat.js'

/**
 * 什么样的失败会把人推进「被发现」环节。
 * 动静炸了就是警察直接到场；否则是被人或者摄像头撞见。
 *
 * 注意它只在**失败**时返回值。顺利收工没有这一环——
 * 没人看见的犯罪，在这个游戏里等于没发生过。
 */
export function failureIncident(
  run: SegmentRunState,
  result: StepResult,
  rng: Rng,
): IncidentKind | null {
  const noise = run.vars['noise'] ?? 0
  // 动静炸了就没有中间环节，直接是警灯。
  if (result.brokeRule || noise >= 90) return 'police'
  if (result.success) return null

  // 搞砸一步不必然被看见。噪音越大越可能，而已经黄掉的那一步最容易——
  // 你在慌乱里退出去的时候，正是最不像个路人的时候。
  const ended = result.outcome?.result === 'failure'
  const chance = clamp(
    DISCOVERY.base + noise * DISCOVERY.perNoise + (ended ? DISCOVERY.whenBlown : 0),
    0,
    DISCOVERY.ceiling,
  )
  if (!rng.chance(chance)) return null
  return rng.chance(DISCOVERY.byHuman) ? 'witness' : 'camera'
}

/** 被发现的概率参数。调这张表就能整体改变这个游戏的紧张程度。 */
export const DISCOVERY = {
  base: 0.18,
  perNoise: 0.005,
  whenBlown: 0.32,
  ceiling: 0.92,
  /** 发现你的是人还是机器。人能被处理，机器不能。 */
  byHuman: 0.65,
} as const

/** 谁撞见了你，按场所抽。 */
export interface RaiseOptions {
  /** 出口是不是已经有人在等 */
  atRisk?: boolean
  brokeRule?: string | null
}

export function raiseIncident(
  state: GameState,
  log: EventLog,
  rng: Rng,
  kind: IncidentKind,
  pool = 'street',
  options: RaiseOptions = {},
): IncidentState {
  const who =
    kind === 'police'
      ? '一辆巡逻车停在路口，两个人下了车。'
      : kind === 'camera'
        ? '保安公司的探头，红灯是亮的。'
        : rng.pick(WITNESSES[pool] ?? WITNESSES['street']!)

  const incident: IncidentState = {
    kind,
    who,
    runEnded: state.activeRun?.finished != null,
    atRisk: options.atRisk === true,
    brokeRule: options.brokeRule ?? null,
    resolvedText: null,
  }
  state.incident = incident
  log.append({
    turn: state.turn,
    type: 'heist_segment',
    actors: [],
    summary:
      kind === 'police' ? '警察到了' : kind === 'camera' ? '被摄像头拍到' : `被${who}撞见`,
    tone: 'bad',
    payload: { incident: kind, who },
    ...(state.activeRun ? { causedBy: state.activeRun.startedEventId } : {}),
  })
  return incident
}

export interface IncidentOptionView extends IncidentOption {
  /** 没有判定的选项是 null——它必定发生。 */
  probability: number | null
  disabled: boolean
  disabledWhy?: string
}

export function incidentView(state: GameState): {
  kind: IncidentKind
  title: string
  intro: string
  options: IncidentOptionView[]
} {
  const incident = state.incident
  if (!incident) throw new Error('现在没有要处理的局面')
  const def = INCIDENTS[incident.kind]

  const options = def.options
    // 没枪的时候，开枪这件事根本不该出现在你面前。
    .filter((o) => !o.needsWeapon || state.marco.armed)
    .map((option) => {
      const poor = option.cashCost !== undefined && state.cash < option.cashCost
      return {
        ...option,
        probability:
          option.skill && option.difficulty !== undefined
            ? chance(state, option)
            : null,
        disabled: poor,
        ...(poor ? { disabledWhy: `你没有 $${option.cashCost}` } : {}),
      }
    })

  return {
    kind: incident.kind,
    title: def.title,
    intro: def.intro.replace('{who}', incident.who),
    options,
  }
}

function chance(state: GameState, option: IncidentOption): number {
  const skill = state.marco.skills[option.skill!]
  const raw = 0.5 + (skill - (option.difficulty ?? 50)) / 200
  const adjusted = DIFFICULTIES[state.difficulty].adjustProbability(
    clamp(raw, P_FLOOR, P_CEILING),
  )
  return clamp(adjusted, P_FLOOR, P_CEILING)
}

export interface IncidentResult {
  text: string
  success: boolean
  endsRun: boolean
  arrested: boolean
}

export function resolveIncident(
  state: GameState,
  log: EventLog,
  rng: Rng,
  optionId: string,
): IncidentResult {
  const incident = state.incident
  if (!incident) throw new Error('现在没有要处理的局面')
  const def = INCIDENTS[incident.kind]
  const option = def.options.find((o) => o.id === optionId)
  if (!option) throw new Error(`没有这个处理方式：${optionId}`)
  if (option.needsWeapon && !state.marco.armed) throw new Error('你手上没有枪')
  if (option.cashCost !== undefined && state.cash < option.cashCost) throw new Error('钱不够')

  if (option.cashCost) state.cash -= option.cashCost

  const success =
    !option.skill || option.difficulty === undefined ? true : rng.next() < chance(state, option)
  const effect = success ? option.onSuccess : (option.onFailure ?? option.onSuccess)

  if (effect.wanted) addHeat(state, log, effect.wanted, `${def.title}·${option.label}`)
  if (effect.wantedBase) {
    addHeat(state, log, effect.wantedBase, `${def.title}·${option.label}`, { permanent: true })
  }
  if (effect.health) {
    state.marco.health = clamp(state.marco.health + effect.health, 0, 100)
  }

  log.append({
    turn: state.turn,
    type: 'heist_result',
    actors: [],
    summary: `${def.title}：${option.label} — ${success ? '过去了' : '没过去'}`,
    tone: success ? 'neutral' : 'bad',
    payload: { incident: incident.kind, optionId, success, killed: !!effect.killed },
  })

  let arrested = false
  if (effect.arrest) arrested = true
  if (state.marco.health <= 0) {
    state.failure = { kind: 'arrested', turn: state.turn, terminal: true }
  }

  incident.resolvedText = effect.text
  return {
    text: effect.text,
    success,
    endsRun: !!effect.endsRun,
    arrested,
  }
}

export function clearIncident(state: GameState): void {
  state.incident = null
}

// ── 进局子 ──────────────────────────────────────────────────────────

export interface ArrestResult {
  days: number
  conviction: number
  life: boolean
  lostLoot: number
  text: string[]
}

/**
 * §7 —— 第三次是无期。前两次只是把你从时间线上拿掉一阵子，
 * 出来的时候债还在，利息也还在。
 */
export function arrest(state: GameState, log: EventLog): ArrestResult {
  state.convictions += 1
  const life = state.convictions >= STRIKES_TO_LIFE

  const lostLoot = state.stash.length
  state.stash = []
  state.activeRun = null
  state.incident = null
  state.ap = 0

  const days = life ? 0 : (SENTENCES[state.convictions - 1] ?? 18)
  state.jailTurns = days

  const text: string[] = []
  if (life) {
    state.failure = { kind: 'life', turn: state.turn, terminal: true }
    text.push('第三次。')
    text.push('这一次法官没有问你任何问题。')
  } else {
    text.push(`第 ${state.convictions} 次。${days} 天。`)
    if (lostLoot > 0) text.push(`身上的东西全被登记收走了（${lostLoot} 件）。`)
    text.push('外面的日子照走，债也照涨。')
  }

  log.append({
    turn: state.turn,
    type: 'debt_default',
    actors: ['police'],
    summary: life ? '第三次被捕——无期' : `被捕，第 ${state.convictions} 次，关 ${days} 天`,
    tone: 'bad',
    payload: { conviction: state.convictions, days, life, lostLoot },
  })

  return { days, conviction: state.convictions, life, lostLoot, text }
}
