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
import { wantedTotal } from '../engine/state.js'
import { clamp } from '../engine/types.js'
import { CASEFILE_THRESHOLD, HEAT, HEAT_TIERS } from '../content/balance.js'

export interface HeatTier {
  min: number
  label: string
}

export function tierFor(heat: number): HeatTier {
  let current: HeatTier = HEAT_TIERS[0] as HeatTier
  for (const tier of HEAT_TIERS) {
    if (heat >= tier.min) current = tier
  }
  return current
}

export const showsCaseFile = (heat: number): boolean => heat >= CASEFILE_THRESHOLD

/** The number every rule reads. §3.3 */
export const heatOf = (state: GameState): number => wantedTotal(state.wanted)

/** §2.1 — over 90 and the city closes around you. */
export const LOCKDOWN_THRESHOLD = 90

export interface HeatChangeOptions {
  causedBy?: string
  actors?: string[]
  /**
   * A major crime raises the *base* — that part never decays and a bribe
   * cannot buy it back. Everything else only stirs up `current`.
   */
  permanent?: boolean
}

export function addHeat(
  state: GameState,
  log: EventLog,
  amount: number,
  reason: string,
  options: HeatChangeOptions = {},
): GameEvent | null {
  if (amount === 0) return null
  const before = heatOf(state)
  const w = state.wanted

  if (options.permanent && amount > 0) {
    w.base = clamp(w.base + amount, 0, HEAT.max)
  } else {
    w.current = clamp(w.current + amount, 0, HEAT.max)
  }

  const after = heatOf(state)
  const delta = after - before
  if (delta === 0) return null

  const crossed = tierFor(before).label !== tierFor(after).label
  if (after > LOCKDOWN_THRESHOLD && !w.locked) {
    w.locked = true
    log.append({
      turn: state.turn,
      type: 'heat_change',
      actors: [],
      summary: '巡逻车封了这一带。想接着做事，得先离开这座城。',
      tone: 'bad',
      payload: { locked: true, total: after },
    })
  } else if (after <= LOCKDOWN_THRESHOLD && w.locked) {
    w.locked = false
  }

  return log.append({
    turn: state.turn,
    type: 'heat_change',
    actors: options.actors ?? [],
    summary: crossed
      ? `热度上升到「${tierFor(after).label}」（${reason}）`
      : options.permanent
        ? `底案 +${delta}（${reason}）—— 这一段消不掉`
        : `热度 ${delta > 0 ? '+' : ''}${delta}（${reason}）`,
    tone: delta > 0 ? 'bad' : 'good',
    payload: { before, after, reason, tier: tierFor(after).label, permanent: !!options.permanent },
    ...(options.causedBy ? { causedBy: options.causedBy } : {}),
  })
}

/** Called once per turn end. Idle turns cool off faster. */
/** Only the accumulated half cools off. The base is what the file remembers. */
export function decayHeat(state: GameState, committedCrime: boolean): number {
  const amount = committedCrime ? HEAT.decayActive : HEAT.decayIdle
  const before = heatOf(state)
  state.wanted.current = clamp(state.wanted.current - amount, 0, HEAT.max)
  if (heatOf(state) <= LOCKDOWN_THRESHOLD) state.wanted.locked = false
  return heatOf(state) - before
}

/**
 * §2.1 — a bribe halves the accumulated half and never touches the base.
 * That is the whole point of splitting them: money buys you this week, not
 * your record.
 */
export function bribe(
  state: GameState,
  log: EventLog,
  amount: number,
  rollBelow: number,
): boolean {
  if (amount <= 0) throw new Error('贿赂金额必须为正')
  if (amount > state.cash) throw new Error('现金不够')
  state.cash -= amount
  const chance = Math.min(85, (amount / 5000) * 41)
  const worked = rollBelow * 100 < chance
  if (worked) state.wanted.current = Math.floor(state.wanted.current / 2)
  log.append({
    turn: state.turn,
    type: 'heat_change',
    actors: ['police'],
    summary: worked
      ? `你付了 $${amount}。累积那一段砍掉一半。`
      : `你付了 $${amount}。他收下了，什么也没做。`,
    tone: worked ? 'good' : 'bad',
    payload: { amount, worked, chance },
  })
  return worked
}
