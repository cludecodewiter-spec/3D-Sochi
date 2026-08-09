/**
 * Police heat. DESIGN_v12.md §5.4.
 *
 * At tier 专案 (60+) the dossier starts showing the player their own case
 * file, filling in line by line as heat climbs. Pressure rendered as a
 * document rather than a progress bar — surgery S3.
 */

import type { GameEvent } from '../engine/events.js'
import type { EventLog } from '../engine/events.js'
import type { GameState } from '../engine/state.js'
import { clamp } from '../engine/types.js'
import { CASEFILE_THRESHOLD, HEAT, HEAT_TIERS } from '../content/balance.js'

export interface HeatTier {
  min: number
  label: string
  checkPenalty: number
  salePenalty: number
}

export function tierFor(heat: number): HeatTier {
  let current: HeatTier = HEAT_TIERS[0] as HeatTier
  for (const tier of HEAT_TIERS) {
    if (heat >= tier.min) current = tier
  }
  return current
}

export const checkPenalty = (heat: number): number => tierFor(heat).checkPenalty

export const showsCaseFile = (heat: number): boolean => heat >= CASEFILE_THRESHOLD

export interface HeatChangeOptions {
  causedBy?: string
  actors?: string[]
}

export function addHeat(
  state: GameState,
  log: EventLog,
  amount: number,
  reason: string,
  options: HeatChangeOptions = {},
): GameEvent | null {
  if (amount === 0) return null
  const before = state.heat
  state.heat = clamp(state.heat + amount, 0, HEAT.max)
  const delta = state.heat - before
  if (delta === 0) return null

  const beforeTier = tierFor(before)
  const afterTier = tierFor(state.heat)
  const crossed = beforeTier.label !== afterTier.label

  return log.append({
    turn: state.turn,
    type: 'heat_change',
    actors: options.actors ?? [],
    summary: crossed
      ? `热度上升到「${afterTier.label}」（${reason}）`
      : `热度 ${delta > 0 ? '+' : ''}${delta}（${reason}）`,
    tone: delta > 0 ? 'bad' : 'good',
    payload: { before, after: state.heat, reason, tier: afterTier.label },
    ...(options.causedBy ? { causedBy: options.causedBy } : {}),
  })
}

/** Called once per turn end. Idle turns cool off faster. */
export function decayHeat(state: GameState, committedCrime: boolean): number {
  const amount = committedCrime ? HEAT.decayActive : HEAT.decayIdle
  const before = state.heat
  state.heat = clamp(state.heat - amount, 0, HEAT.max)
  return state.heat - before
}
