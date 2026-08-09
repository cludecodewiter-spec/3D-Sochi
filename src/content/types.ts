/**
 * Content type definitions. DESIGN_v12.md §9.5.
 *
 * This layer is typed data with zero logic. It must never import from
 * `systems/` — the dependency arrow points content → engine only.
 */

import type { Era, SkillKey, VehicleDefense } from '../engine/types.js'

/** Side-profile silhouette used by the procedural art layer. */
export type BodyType = 'wagon' | 'sedan' | 'pickup' | 'coupe' | 'sleek'

export interface VehicleDef {
  id: string
  name: string
  year: number
  era: Era
  bodyType: BodyType
  /** Pre-fence value. The actual payout runs through §5.5. */
  basePrice: number
  defense: VehicleDefense
  /** Where it sits in the city — shown on the target list. */
  location: string
  flavor: string
  /** Legendary cars get a hand-drawn illustration and their own dossier entry. */
  legendary?: boolean
}

/**
 * §6.1 — the two hidden dimensions. The player never sees these numbers and
 * cannot see them on any difficulty; they can only be inferred from history.
 *
 *   honesty 高 / access 高 → 金矿
 *   honesty 高 / access 低 → 好人，但没用
 *   honesty 低 / access 高 → 最危险
 *   honesty 低 / access 低 → 吹牛的
 */
export interface InformantDef {
  id: string
  name: string
  role: string
  honesty: number
  access: number
  /** Asking price per tip. */
  price: number
  hangout: string
  intro: string
}

/** One line of intel the informant can offer, before truth is decided. */
export interface IntelTemplate {
  id: string
  segmentId: string
  /** `{target}` is substituted with the vehicle name. */
  trueText: string
  partialText: string
  falseText: string
}

// ── SegmentRun (§4) ────────────────────────────────────────────────────────

/** Which defense dimension an option is measured against. */
export type DefenseKey = keyof VehicleDefense | 'breachMechanical'

export interface VarDelta {
  var: string
  amount: number
}

export interface OptionDef {
  id: string
  label: string
  /** One-line hint of the trade-off, shown under the button. */
  hint: string
  skill: SkillKey
  defense: DefenseKey
  /** §5.3 optionModifier, -0.20 … +0.20. */
  modifier: number
  onSuccess: VarDelta[]
  onFailure: VarDelta[]
  successText: string
  failureText: string
  /** Failing this option ends the whole run (e.g. you never got the car open). */
  failureEndsRun?: boolean
}

export interface TellDef {
  /** Shown when the player has accurate information about this segment. */
  accurate: string
  /** Shown with no intel — deliberately vague. */
  vague: string
  /**
   * Shown when the covering intel is false. §4.3 rule 3: the tell states the
   * lie *confidently*. This is the single most important rule in the design —
   * it makes bad intel cost the player a wrong decision, not just a modifier.
   */
  misleading: string
  /** Extra line for high-nerve players: "……但这话他说得太顺了。" */
  nerveHint?: string
}

export interface SegmentDef {
  id: string
  title: string
  /** Narrative lead-in for the segment. */
  intro: string
  tell: TellDef
  options: OptionDef[]
  /** Abort cost at this segment. §4.4 */
  abortHeat: number
  abortText: string
}

export interface RunVarDef {
  init: number
  min: number
  max: number
  label: string
}

export interface SegmentRunConfig {
  id: string
  title: string
  segments: SegmentDef[]
  vars: Record<string, RunVarDef>
  /** Run fails immediately when any of these is true. */
  failWhen: { var: string; atLeast: number; text: string }[]
}

// ── Scripted beats ─────────────────────────────────────────────────────────

export interface AdvisorLine {
  /** The unlock (or story beat) that triggers it. */
  trigger: string
  speaker: string
  text: string
}

export interface UnlockDef {
  id: string
  label: string
  /** Earliest turn it may fire. §8.1 also enforces a 3-turn gap between unlocks. */
  turn: number
  description: string
}
