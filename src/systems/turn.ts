/**
 * Turn advancement — the orchestrator. DESIGN_v12.md §3, §5.4, §5.6, §7.
 *
 * Lives in `systems/` rather than `engine/` on purpose: it has to know about
 * heat, debt and the market, and the dependency arrow only points downward.
 */

import type { EventLog } from '../engine/events.js'
import type { FailureKind, GameState } from '../engine/state.js'
import { resetAp } from '../engine/time.js'
import { DEBT } from '../content/balance.js'
import { recoverMarket, settleDebt } from './economy.js'
import type { DebtSettlement } from './economy.js'
import { decayHeat, heatOf } from './heat.js'
import { processUnlocks } from './unlocks.js'
import type { UnlockEvent } from './unlocks.js'

export interface TurnReport {
  turn: number
  unlocks: UnlockEvent[]
  heatDelta: number
  debt: DebtSettlement | null
  failure: FailureKind | null
  recovered: boolean
  /** 这一回合是在里面度过的，还剩几天 */
  jail: { remaining: number; released: boolean } | null
}

/** Did the player do anything this turn that the police would care about? */
function committedCrime(log: EventLog, turn: number): boolean {
  return log
    .byTurn(turn)
    .some((e) => e.type === 'heist_start' || e.type === 'heist_result' || e.type === 'sale')
}

export function endTurn(state: GameState, log: EventLog): TurnReport {
  if (state.activeRun && !state.activeRun.finished) {
    throw new Error('还有一次行动没结束')
  }
  if (state.incident) {
    throw new Error('有人正站在那儿看着你。这件事得先解决。')
  }

  // 人在里面的时候，日子照走，债照涨，通缉照凉——只是你什么都做不了。
  if (state.jailTurns > 0) return serveTime(state, log)

  const crime = committedCrime(log, state.turn)
  const heatDelta = decayHeat(state, crime)
  recoverMarket(state)

  let recovered = false
  if (state.marco.injuryTurns > 0) {
    state.marco.injuryTurns -= 1
    if (state.marco.injuryTurns === 0) recovered = true
  }

  log.append({
    turn: state.turn,
    type: 'turn_end',
    actors: [],
    summary: `第 ${state.turn} 天结束。现金 $${state.cash}，通缉 ${state.wanted.base}+${state.wanted.current}`,
    tone: 'neutral',
    payload: { cash: state.cash, wanted: { ...state.wanted }, heatDelta },
  })

  state.turn += 1
  resetAp(state)

  let debt: DebtSettlement | null = null
  if (state.turn >= state.debt.nextDueTurn) {
    debt = settleDebt(state, log)
  }

  const unlocks = processUnlocks(state, log)

  log.append({
    turn: state.turn,
    type: 'turn_start',
    actors: [],
    summary: `第 ${state.turn} 天开始`,
    tone: 'neutral',
    payload: { ap: state.ap },
  })

  const failure = checkFailure(state, debt)
  if (failure && !state.failure) {
    // §7 — only liquidation actually ends the game. The rest route into a coda.
    state.failure = { kind: failure, turn: state.turn, terminal: failure === 'liquidated' }
    log.append({
      turn: state.turn,
      type: 'debt_default',
      actors: ['creditor'],
      summary: FAILURE_SUMMARY[failure],
      tone: 'bad',
      payload: { failure },
    })
  }

  return { turn: state.turn, unlocks, heatDelta, debt, failure, recovered, jail: null }
}

/**
 * §7 —— 在里面的一天。
 *
 * 关在里面唯一的好处是通缉度在凉，唯一的坏处是别的一切都在往坏里走：
 * 债期照到、利息照滚、你手上一辆车都卖不出去。两次刑期之后，
 * 第三次没有刑期。
 */
function serveTime(state: GameState, log: EventLog): TurnReport {
  const heatDelta = decayHeat(state, false)
  recoverMarket(state)
  if (state.marco.injuryTurns > 0) state.marco.injuryTurns -= 1

  state.jailTurns -= 1
  state.turn += 1
  const released = state.jailTurns === 0

  let debt: DebtSettlement | null = null
  if (state.turn >= state.debt.nextDueTurn) debt = settleDebt(state, log)

  log.append({
    turn: state.turn,
    type: 'turn_start',
    actors: ['marco'],
    summary: released
      ? '出来了。外面的天气变了。'
      : `在里面。还剩 ${state.jailTurns} 天。`,
    tone: released ? 'neutral' : 'bad',
    payload: { jail: state.jailTurns },
  })

  if (released) {
    state.ap = state.maxAp
  } else {
    // 里面没有行动点。这是这套系统最诚实的一句话。
    state.ap = 0
  }

  const unlocks = released ? processUnlocks(state, log) : []
  const failure = checkFailure(state, debt)
  if (failure && !state.failure) {
    state.failure = { kind: failure, turn: state.turn, terminal: failure === 'liquidated' }
  }

  return {
    turn: state.turn,
    unlocks,
    heatDelta,
    debt,
    failure,
    recovered: false,
    jail: { remaining: state.jailTurns, released },
  }
}

const FAILURE_SUMMARY: Record<FailureKind, string> = {
  bankrupt: '你身上一分钱都没有了，也没有任何能变现的东西。',
  arrested: '他们在你家门口等着。',
  alone: '现在只剩下你和一根铁丝。',
  liquidated: '他们不再打电话了。',
  life: '第三次。这一次没有刑期。',
}

function checkFailure(state: GameState, debt: DebtSettlement | null): FailureKind | null {
  if (debt?.liquidated || state.debt.missed >= DEBT.defaultsUntilLiquidation) {
    return 'liquidated'
  }
  if (heatOf(state) >= 100) return 'arrested'
  if (state.cash < 0 && state.garage.length === 0) {
    const streak = (state.flags['brokeStreak'] ?? 0) + 1
    state.flags['brokeStreak'] = streak
    if (streak >= 3) return 'bankrupt'
  } else {
    state.flags['brokeStreak'] = 0
  }
  return null
}
