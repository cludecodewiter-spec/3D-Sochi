/**
 * The complete game state. DESIGN_v12.md §9.4.
 *
 * Everything here is plain JSON — no Map, no Set, no class instances — so a
 * save is `JSON.stringify(state)` and a load is `JSON.parse`. The event log
 * and the RNG state are stored alongside it, not inside it.
 */

import type { Difficulty, Skills } from './types.js'

/** §5.6 — the clock that drives the entire first hour. */
export interface DebtState {
  principal: number
  minimumPayment: number
  nextDueTurn: number
  /** Number of missed payments. 4 ⇒ 失败状态【被清算】. */
  missed: number
  interestRate: number
  periodTurns: number
}

export interface MarcoState {
  skills: Skills
  /** Turns of recovery remaining. > 0 applies a penalty to every check. */
  injuryTurns: number
}

/**
 * §6.1 — `honesty` and `access` live in content, not here, and are never
 * shown to the player. What the player accumulates is *history*, and history
 * lives in the event log. This record only tracks the bookkeeping.
 */
export interface InformantState {
  id: string
  met: boolean
  firstContactTurn: number | null
  /** -100..100. Moves when their intel pays off or gets someone hurt. */
  relationship: number
  totalSpent: number
}

/** §6 — one piece of intel. `truth` is hidden from the UI, always. */
export interface IntelItem {
  id: string
  sourceId: string
  receivedTurn: number
  targetInstanceId: string
  /** Which heist segment this intel speaks to. */
  segmentId: string
  text: string
  truth: 'true' | 'partial' | 'false'
  costPaid: number
  /** Set once the intel has been acted on and the outcome is known. */
  resolved: boolean
  /** §6.4 — a cross-check gives a *second data point*, not the truth. */
  verifiedBy?: string
  verifiedSignal?: 'confirms' | 'contradicts'
  /** Event id of the `intel_received` entry, so consequences can chain to it. */
  eventId: string
}

/** A concrete car sitting somewhere in the city, targetable this run. */
export interface VehicleInstance {
  id: string
  defId: string
  /** Segments the player has scouted first-hand (independent of informant intel). */
  scouted: string[]
  stolen: boolean
}

export interface GarageVehicle {
  instanceId: string
  defId: string
  /** 0-100, set by how the escape segment went. Multiplies the fence price. */
  condition: number
  acquiredTurn: number
}

/** §4 — an in-flight SegmentRun. The *config* lives in content; this is the state. */
export interface SegmentRunState {
  configId: string
  /** What the run is about — for the heist config, a VehicleInstance id. */
  contextId: string
  segmentIndex: number
  /** Persistent state vars: 动静 / 耗时 / 车况 … Config declares them. */
  vars: Record<string, number>
  history: SegmentChoice[]
  /** The `heist_start` event, so every consequence can chain back to it. */
  startedEventId: string
  finished: RunOutcome | null
}

export interface SegmentChoice {
  segmentId: string
  optionId: string
  success: boolean
  probability: number
}

export interface RunOutcome {
  result: 'success' | 'failure' | 'aborted'
  atSegmentIndex: number
}

export type FailureKind = 'bankrupt' | 'arrested' | 'alone' | 'liquidated'

/** §7 — three of the four are not game over; they route into a coda. */
export interface FailureState {
  kind: FailureKind
  turn: number
  /** Only 'liquidated' truly ends the game. */
  terminal: boolean
}

export interface GameState {
  turn: number
  ap: number
  maxAp: number
  difficulty: Difficulty
  cash: number
  /** 0-100. §5.4 */
  heat: number
  debt: DebtState
  marco: MarcoState
  informants: InformantState[]
  intel: IntelItem[]
  targets: VehicleInstance[]
  garage: GarageVehicle[]
  /** defId → 0..0.40 saturation penalty on the fence price. §5.5 */
  marketDecay: Record<string, number>
  /** Ids of unlocked systems. Anything not listed does not exist in the UI. §8.1 */
  unlocked: string[]
  /** Scalar story flags (counters and booleans-as-0/1). */
  flags: Record<string, number>
  activeRun: SegmentRunState | null
  failure: FailureState | null
  /** Turn number of the most recent unlock, enforcing the 3-turn spacing rule. */
  lastUnlockTurn: number
}

export interface NewGameOptions {
  difficulty?: Difficulty
}

export function createInitialState(options: NewGameOptions = {}): GameState {
  return {
    turn: 1,
    ap: 3,
    maxAp: 3,
    difficulty: options.difficulty ?? 'standard',
    cash: 340,
    heat: 0,
    debt: {
      principal: 12_000,
      minimumPayment: 1_500,
      nextDueTurn: 7,
      missed: 0,
      interestRate: 0.12,
      periodTurns: 7,
    },
    marco: {
      // §5.1 — mechanical 78 is his pride. electronic 5 is the whole tragedy.
      skills: { stealth: 55, mechanical: 78, electronic: 5, driving: 45, nerve: 60 },
      injuryTurns: 0,
    },
    informants: [],
    intel: [],
    targets: [],
    garage: [],
    marketDecay: {},
    unlocked: [],
    flags: {},
    activeRun: null,
    failure: null,
    lastUnlockTurn: -99,
  }
}

export const isUnlocked = (state: GameState, systemId: string): boolean =>
  state.unlocked.includes(systemId)

export const getInformant = (
  state: GameState,
  id: string,
): InformantState | undefined => state.informants.find((i) => i.id === id)

export const getTarget = (
  state: GameState,
  id: string,
): VehicleInstance | undefined => state.targets.find((t) => t.id === id)
