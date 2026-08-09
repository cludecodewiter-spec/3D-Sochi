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
import { decayHeat } from './heat.js'
import { processUnlocks } from './unlocks.js'
import type { UnlockEvent } from './unlocks.js'

export interface TurnReport {
  turn: number
  unlocks: UnlockEvent[]
  heatDelta: number
  debt: DebtSettlement | null
  failure: FailureKind | null
  recovered: boolean
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
    summary: `第 ${state.turn} 天结束。现金 $${state.cash}，热度 ${state.heat}`,
    tone: 'neutral',
    payload: { cash: state.cash, heat: state.heat, heatDelta },
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

  return { turn: state.turn, unlocks, heatDelta, debt, failure, recovered }
}

const FAILURE_SUMMARY: Record<FailureKind, string> = {
  bankrupt: '你身上一分钱都没有了，也没有任何能变现的东西。',
  arrested: '他们在你家门口等着。',
  alone: '现在只剩下你和一根铁丝。',
  liquidated: '他们不再打电话了。',
}

function checkFailure(state: GameState, debt: DebtSettlement | null): FailureKind | null {
  if (debt?.liquidated || state.debt.missed >= DEBT.defaultsUntilLiquidation) {
    return 'liquidated'
  }
  if (state.heat >= 100) return 'arrested'
  if (state.cash < 0 && state.garage.length === 0) {
    const streak = (state.flags['brokeStreak'] ?? 0) + 1
    state.flags['brokeStreak'] = streak
    if (streak >= 3) return 'bankrupt'
  } else {
    state.flags['brokeStreak'] = 0
  }
  return null
}
