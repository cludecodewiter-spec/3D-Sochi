/**
 * Every tunable number in one place. DESIGN_v12.md §5.
 * Changing balance should never require touching a system module.
 */

import type { Difficulty } from '../engine/types.js'

/** §5.3 — the check floor and ceiling. Always a chance; always a hope. */
export const P_FLOOR = 0.05
export const P_CEILING = 0.95

/** §5.3 — intel modifiers. */
export const INTEL_MODIFIER = {
  true: 0.15,
  partial: 0.05,
  none: 0,
  false: -0.1,
} as const

/** §5.4 — heat. */
export const HEAT = {
  perFailedEscape: 8,
  perWitness: 12,
  perViolence: 25,
  abortAtSegment: [0, 5, 12, 20],
  decayActive: 3,
  decayIdle: 5,
  restBonus: 5,
  max: 100,
} as const

export const HEAT_TIERS = [
  { min: 0, label: '平静', checkPenalty: 0, salePenalty: 0 },
  { min: 20, label: '留意', checkPenalty: 0, salePenalty: 0.08 },
  { min: 40, label: '关注', checkPenalty: 0.08, salePenalty: 0.08 },
  { min: 60, label: '专案', checkPenalty: 0.12, salePenalty: 0.08 },
  { min: 80, label: '通缉', checkPenalty: 0.16, salePenalty: 0.08 },
] as const

/** Heat at or above this reveals the player's own police file in the dossier. §5.4 */
export const CASEFILE_THRESHOLD = 60

/** §5.5 — fence channels. */
export interface FenceChannel {
  id: string
  label: string
  rate: number
  unlockTurn: number
  delayTurns: number
  heatDelta: number
  note: string
}

export const FENCE_CHANNELS: FenceChannel[] = [
  {
    id: 'chop',
    label: '街头拆车场',
    rate: 0.35,
    unlockTurn: 1,
    delayTurns: 0,
    heatDelta: 0,
    note: '即时到手。他们不问，你也不说。',
  },
  {
    id: 'contact',
    label: '熟人销赃',
    rate: 0.5,
    unlockTurn: 4,
    delayTurns: 0,
    heatDelta: 0,
    note: '价钱好得多，但你欠了一个人情。',
  },
  {
    id: 'export',
    label: '出口订单',
    rate: 0.7,
    unlockTurn: 15,
    delayTurns: 3,
    heatDelta: 0,
    note: '三天后到账。这三天里，货在别人手上。',
  },
]

/** §5.5 — same model twice in a row is worth less. Forces target rotation. */
export const MARKET = {
  decayPerSale: 0.08,
  decayCap: 0.4,
  recoveryPerTurn: 0.08 / 5,
} as const

/** §5.6 — the debt clock that drives the whole first hour. */
export const DEBT = {
  principal: 12_000,
  minimumPayment: 1_500,
  interestRate: 0.12,
  periodTurns: 7,
  defaultsUntilLiquidation: 4,
} as const

/** §8.2 — difficulty adjusts pressure and disclosure, never judgement. */
export interface DifficultyProfile {
  id: Difficulty
  label: string
  description: string
  /** Applied to the final probability. */
  adjustProbability: (p: number) => number
  debtMultiplier: number
  /** §8.2 — hardcore hides the reliability score, but nobody gets auto-triage. */
  showReliabilityScore: boolean
  advisorMode: 'always' | 'milestones' | 'off'
  permanentConsequences: boolean
}

export const DIFFICULTIES: Record<Difficulty, DifficultyProfile> = {
  story: {
    id: 'story',
    label: '故事',
    description: '失败可挽回，顾问常驻，资金压力减半。情报真假仍然由你判断。',
    adjustProbability: (p) => p + (1 - p) * 0.25,
    debtMultiplier: 0.5,
    showReliabilityScore: true,
    advisorMode: 'always',
    permanentConsequences: false,
  },
  standard: {
    id: 'standard',
    label: '标准',
    description: '推荐。关键节点有顾问提示。',
    adjustProbability: (p) => p,
    debtMultiplier: 1,
    showReliabilityScore: true,
    advisorMode: 'milestones',
    permanentConsequences: true,
  },
  hardcore: {
    id: 'hardcore',
    label: '硬核',
    description: '不显示可靠度评分，没有顾问，失败永久，资金曲线严苛。',
    adjustProbability: (p) => p - 0.05,
    debtMultiplier: 1.4,
    showReliabilityScore: false,
    advisorMode: 'off',
    permanentConsequences: true,
  },
}

/** §5.2 — the immobiliser term. See the table in the design doc. */
export const IMMOBILISER = {
  threshold: 40,
  factor: 3,
} as const

/** Injury:每回合判定的额外惩罚。 */
export const INJURY_PENALTY = 0.12

/** Run state vars translate into a check penalty. §5.3 stateVarPenalty */
export const RUN_PENALTY = {
  noisePerPoint: 1 / 300,
  timeThreshold: 8,
  timePerPoint: 0.02,
} as const
