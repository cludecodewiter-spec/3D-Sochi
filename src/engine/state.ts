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
  /** 兜里有没有那把枪。没有的话，「灭口」和「开枪」根本不会出现。 */
  armed: boolean
  /** 0-100。挨枪子会掉，掉到 0 就结束了。 */
  health: number
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

/**
 * What the player actually saw come of a tip. Derived from the run they used
 * it on — never from `truth`. The dossier and the reliability numbers read
 * this and nothing else, which is what keeps §6 honest: the player can only
 * judge a source by outcomes they witnessed.
 */
export type IntelOutcome = 'helped' | 'harmed' | 'inconclusive'

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
  /** Set once the intel has been acted on. */
  resolved: boolean
  /** Only what the player could observe. Absent until resolved. */
  outcome?: IntelOutcome
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

/** A crime spot's per-run state. The definition lives in content. */
export interface LocationInstance {
  id: string
  /** Turn it can be hit again — a place that was just robbed is watched. */
  readyOnTurn: number
  timesHit: number
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
  /** 这一趟翻到的东西（赃物 id）。行动结束时并入 stash。 */
  loot: string[]
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

/**
 * 正在发生的「被发现」环节。它挡在 run 的下一段前面。
 *
 * 关键在于它**可以发生在半途**：搞砸一步不等于收工回家，而是有人朝
 * 这边看了一眼。把这一眼处理掉，你还能接着干下去。
 */
export interface IncidentState {
  kind: 'witness' | 'camera' | 'police'
  /** 具体是谁/什么发现了你 */
  who: string
  /** 撞见你的时候，这一趟是不是已经黄了 */
  runEnded: boolean
  /** 出口是不是已经有人在等——延到收场时才兑现 */
  atRisk: boolean
  /** 触发的硬失败规则文案，同样延到收场时才说出口 */
  brokeRule: string | null
  /** 已经处理完，等玩家点「继续」 */
  resolvedText: string | null
}

export type FailureKind = 'bankrupt' | 'arrested' | 'alone' | 'liquidated' | 'life'

/** §7 — three of the four are not game over; they route into a coda. */
export interface FailureState {
  kind: FailureKind
  turn: number
  /** Only 'liquidated' truly ends the game. */
  terminal: boolean
}

/**
 * CLAUDE.md §3.3 — 通缉度是双段的，不要写成单值。
 *
 *   base    重案永久抬升，贿赂消不掉
 *   current 每回合自然衰减，贿赂主要减这一段
 *
 * 显示为 "10+15"。base > 0 意味着这座城市已经记住你了，
 * 而不只是这周比较热闹。
 */
export interface WantedState {
  base: number
  current: number
  /** §2.1 总值过高 → 区域封锁，必须离城才能继续作业。 */
  locked: boolean
}

export const wantedTotal = (w: WantedState): number => w.base + w.current

export interface GameState {
  /** Chosen at setup. Lives in state so it survives a save. */
  playerName: string
  turn: number
  ap: number
  maxAp: number
  difficulty: Difficulty
  cash: number
  /** §3.3 双段通缉度。 */
  wanted: WantedState
  debt: DebtState
  marco: MarcoState
  informants: InformantState[]
  intel: IntelItem[]
  targets: VehicleInstance[]
  /** Non-vehicle crime spots. */
  places: LocationInstance[]
  garage: GarageVehicle[]
  /** 手上的赃物，等着出手。 */
  stash: string[]
  /** defId → 0..0.40 saturation penalty on the fence price. §5.5 */
  marketDecay: Record<string, number>
  /** Ids of unlocked systems. Anything not listed does not exist in the UI. §8.1 */
  unlocked: string[]
  /** Scalar story flags (counters and booleans-as-0/1). */
  flags: Record<string, number>
  activeRun: SegmentRunState | null
  incident: IncidentState | null
  /** §7 — 进过几次局子。第三次是无期。 */
  convictions: number
  /** > 0 表示人在里面，每回合递减。 */
  jailTurns: number
  failure: FailureState | null
  /** Turn number of the most recent unlock, enforcing the 3-turn spacing rule. */
  lastUnlockTurn: number
}

export interface NewGameOptions {
  difficulty?: Difficulty
  playerName?: string
}

export function createInitialState(options: NewGameOptions = {}): GameState {
  return {
    playerName: options.playerName ?? 'MARCO',
    turn: 1,
    ap: 3,
    maxAp: 3,
    difficulty: options.difficulty ?? 'standard',
    cash: 340,
    wanted: { base: 0, current: 0, locked: false },
    debt: {
      principal: 12_000,
      minimumPayment: 1_500,
      nextDueTurn: 7,
      missed: 0,
      interestRate: 0.12,
      periodTurns: 7,
    },
    marco: {
      // §5.1 — 开锁 78 是他的骄傲，电气 5 是整场悲剧。
      // 射击 12：他干了二十年，从来不带枪，也没必要。
      skills: {
        hiding: 55,
        acting: 60,
        shooting: 12,
        driving: 45,
        locksmithing: 78,
        electronics: 5,
      },
      health: 100,
      armed: false,
      injuryTurns: 0,
    },
    informants: [],
    intel: [],
    targets: [],
    places: [],
    garage: [],
    stash: [],
    marketDecay: {},
    unlocked: [],
    flags: {},
    activeRun: null,
    incident: null,
    convictions: 0,
    jailTurns: 0,
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
