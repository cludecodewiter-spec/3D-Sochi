/**
 * Turn and action-point primitives. DESIGN_v12.md §5.7.
 *
 * 3 AP per turn is exactly "scout + steal + fence". Anything else the player
 * wants to do costs them a leg of that loop — AP is the main source of
 * tension in the whole design, so it stays deliberately tight.
 */

import type { GameState } from './state.js'

export const AP_COSTS = {
  meetInformant: 1,
  scout: 1,
  verifyIntel: 1,
  runHeist: 2,
  fence: 1,
} as const

export type ActionKey = keyof typeof AP_COSTS

export const canAfford = (state: GameState, action: ActionKey): boolean =>
  state.ap >= AP_COSTS[action]

export function spendAp(state: GameState, action: ActionKey): void {
  const cost = AP_COSTS[action]
  if (state.ap < cost) {
    throw new Error(`行动点不足：${action} 需要 ${cost}，剩余 ${state.ap}`)
  }
  state.ap -= cost
}

export function resetAp(state: GameState): void {
  state.ap = state.maxAp
}

/** 第 N 回合 → "第 3 天"。Turn 1 is day 1. */
export const dayLabel = (turn: number): string => `第 ${turn} 天`
