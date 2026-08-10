/**
 * Content type definitions. DESIGN_v12.md §9.5.
 *
 * This layer is typed data with zero logic. It must never import from
 * `systems/` — the dependency arrow points content → engine only.
 */

import type { Era, SkillKey, VehicleDefense } from '../engine/types.js'

/** Side-profile silhouette used by the procedural art layer. */
export type BodyType = 'wagon' | 'sedan' | 'pickup' | 'coupe' | 'sleek'

/** The trade an informant is in. Drives which icon marks them on the map. */
export type RoleKey = 'dock' | 'nurse' | 'mechanic' | 'adjuster'

/** The kind of place something sits in. Drives the icon and the scene art. */
export type VenueKey =
  | 'alley'
  | 'warehouse'
  | 'store'
  | 'laundry'
  | 'apartment'
  | 'house'
  | 'lot'
  | 'atm'
  | 'gas'
  | 'deck'
  | 'bar'
  | 'diner'
  | 'shop'
  | 'cafe'

/** §2.4 地图角标：照片说明是哪一个，角标说明是哪一类。 */
export const VENUE_BADGE: Record<VenueKey, string> = {
  alley: 'mask',
  warehouse: 'house',
  store: 'cart',
  laundry: 'house',
  apartment: 'house',
  house: 'house',
  lot: 'P',
  atm: 'card',
  gas: 'fuel',
  deck: 'P',
  bar: 'glass',
  diner: 'fork',
  shop: 'wrench',
  cafe: 'fork',
}

/** 场所照片。素材有限，几处复用是有意的。 */
export const VENUE_PHOTO: Record<VenueKey, string> = {
  alley: 'scenes/alley',
  warehouse: 'places/junkyard',
  store: 'places/supermarket',
  laundry: 'places/motel',
  apartment: 'places/residential',
  house: 'places/residential',
  lot: 'places/parking',
  atm: 'places/atm',
  gas: 'places/gasstation',
  deck: 'places/parking',
  bar: 'places/nightclub',
  diner: 'places/diner',
  shop: 'places/junkyard',
  cafe: 'places/diner',
}

export const VENUE_LABELS: Record<VenueKey, string> = {
  alley: '巷子',
  warehouse: '仓库',
  store: '店面',
  laundry: '洗衣房',
  apartment: '公寓',
  house: '独栋',
  lot: '停车场',
  atm: '取款机',
  gas: '加油站',
  deck: '地下车库',
  bar: '酒吧',
  diner: '快餐店',
  shop: '修车铺',
  cafe: '咖啡馆',
}

export interface VehicleDef {
  id: string
  name: string
  year: number
  era: Era
  bodyType: BodyType
  /** Where it is parked — picks the location icon and the scene illustration. */
  venue: VenueKey
  /** Real photograph key under public/assets. §2.4 */
  photo: string
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
  /** Their trade, as an icon. */
  roleIcon: RoleKey
  /** Where they can be found. */
  venue: VenueKey
  /** ⚠️ people/* are real people — prototype only. See assets/CREDITS.md. */
  photo: string
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

/**
 * A place, rather than a car, resists you along three axes.
 * `exposure` is shared with vehicles — being seen is being seen.
 */
export interface LocationDefense {
  /** 被看见的容易程度 */
  exposure: number
  /** 锁、警报、柜台后面那个人 */
  security: number
  /** 出事之后多久会有人来 */
  response: number
}

/** Which defense dimension an option is measured against. */
export type DefenseKey =
  | keyof VehicleDefense
  | keyof LocationDefense
  | 'breachMechanical'

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
