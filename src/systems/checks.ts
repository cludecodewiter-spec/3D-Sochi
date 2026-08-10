/**
 * The single probability formula. DESIGN_v12.md §5.3.
 *
 *   p = 0.50
 *     + (skill - defense) / 200      技能差，±0.50
 *     + optionModifier               选项自带
 *     + intelModifier                情报：真 +0.15 / 半真 +0.05 / 无 0 / 假 -0.10
 *     - heat / 500                   热度，最多 -0.20
 *     - stateVarPenalty              持续状态量
 *     - injuryPenalty
 *   clamp(p, 0.05, 0.95)  then apply the difficulty adjustment
 *
 * Every check in the game runs through `resolve`. Nothing rolls dice anywhere
 * else — that is what makes the whole thing testable with a fixed seed.
 */

import type { Rng } from '../engine/rng.js'
import { clamp } from '../engine/types.js'
import type { Difficulty } from '../engine/types.js'
import { DIFFICULTIES, INJURY_PENALTY, P_CEILING, P_FLOOR } from '../content/balance.js'

export interface CheckInput {
  skill: number
  defense: number
  optionModifier: number
  intelModifier: number
  heat: number
  /** Accumulated penalty from run state vars (noise, elapsed time…). */
  statePenalty: number
  injured: boolean
  difficulty: Difficulty
}

export interface CheckBreakdown {
  probability: number
  /** Pre-difficulty, pre-clamp — useful for tests and the debug overlay. */
  raw: number
  terms: {
    base: number
    skillGap: number
    option: number
    intel: number
    heat: number
    state: number
    injury: number
  }
}

export function probability(input: CheckInput): CheckBreakdown {
  const terms = {
    base: 0.5,
    skillGap: (input.skill - input.defense) / 200,
    option: input.optionModifier,
    intel: input.intelModifier,
    heat: -input.heat / 500,
    state: -input.statePenalty,
    injury: input.injured ? -INJURY_PENALTY : 0,
  }
  const raw =
    terms.base +
    terms.skillGap +
    terms.option +
    terms.intel +
    terms.heat +
    terms.state +
    terms.injury

  const adjusted = DIFFICULTIES[input.difficulty].adjustProbability(
    clamp(raw, P_FLOOR, P_CEILING),
  )
  return { probability: clamp(adjusted, P_FLOOR, P_CEILING), raw, terms }
}

export interface CheckResult extends CheckBreakdown {
  success: boolean
  roll: number
}

export function resolve(input: CheckInput, rng: Rng): CheckResult {
  const breakdown = probability(input)
  const roll = rng.next()
  return { ...breakdown, success: roll < breakdown.probability, roll }
}
