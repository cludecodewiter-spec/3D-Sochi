/**
 * The game facade. Everything the UI is allowed to call lives here.
 *
 * The UI never mutates state directly and never reads a hidden field — in
 * particular it has no path to `IntelItem.truth` before an outcome resolves.
 * Keeping that boundary in one file is what makes the "you cannot know"
 * premise structurally true rather than a promise.
 */

import { EventLog } from '../engine/events.js'
import { Rng } from '../engine/rng.js'
import type { GameState, IntelItem, SegmentRunState } from '../engine/state.js'
import { createInitialState, getTarget } from '../engine/state.js'
import type { Session } from '../engine/save.js'
import { AP_COSTS, canAfford, spendAp } from '../engine/time.js'
import type { ActionKey } from '../engine/time.js'
import type { Difficulty } from '../engine/types.js'
import { VEHICLES } from '../content/vehicles.js'
import { LOCATIONS } from '../content/locations.js'
import type { CrimeKey } from '../content/crimes.js'
import { HEAT } from '../content/balance.js'
import { HEIST_CONFIG } from '../content/heist.js'
import { RIFLE_CONFIG } from '../content/rifle.js'
import { BETRAYAL, OPENING } from '../content/script.js'
import { informantDef } from '../content/informants.js'
import { sellVehicle } from './economy.js'
import { addHeat } from './heat.js'
import type { PriceBreakdown } from './economy.js'
import { beginHeist, beginRifle, finishHeist, heistAbort, heistStep, heistView } from './heist.js'
import { beginCrime, crimeAbort, crimeAp, crimeStep, crimeView, finishCrime } from './crime.js'
import type { CrimeStepResult } from './crime.js'
import type { HeistStepResult } from './heist.js'
import {
  arrest,
  clearIncident,
  incidentView,
  resolveIncident,
} from './incident.js'
import type { ArrestResult, IncidentOptionView } from './incident.js'
import { dropLoot, sellAllLoot, sellLoot, stashView, stashWorth } from './stash.js'
import type { StashEntry } from './stash.js'
import { offerIntel, verifyIntel } from './intel.js'
import type { VerifyResult } from './intel.js'
import { processUnlocks } from './unlocks.js'
import { endTurn as advanceTurn } from './turn.js'
import type { TurnReport } from './turn.js'
import type { RunView } from './segment-run.js'

export const VERIFY_FEE = 200

export interface NewGameOptions {
  seed?: number
  difficulty?: Difficulty
  playerName?: string
}

export function newGame(options: NewGameOptions = {}): Session {
  const seed = options.seed ?? Math.floor(Math.random() * 0x7fff_ffff)
  const session: Session = {
    state: createInitialState({
      ...(options.difficulty ? { difficulty: options.difficulty } : {}),
      ...(options.playerName ? { playerName: options.playerName } : {}),
    }),
    log: new EventLog(),
    rng: new Rng(seed),
  }

  session.state.places = LOCATIONS.map((l) => ({
    id: l.id,
    readyOnTurn: l.unlockTurn,
    timesHit: 0,
  }))
  session.state.targets = VEHICLES.map((v) => ({
    id: `t-${v.id}`,
    defId: v.id,
    scouted: [],
    stolen: false,
  }))

  session.log.append({
    turn: 1,
    type: 'turn_start',
    actors: [],
    summary: OPENING.subtitle,
    tone: 'neutral',
    payload: { seed },
  })
  processUnlocks(session.state, session.log)
  return session
}

// ── Guards ────────────────────────────────────────────────────────────────

export class ActionError extends Error {}

function requireAp(state: GameState, action: ActionKey): void {
  if (!canAfford(state, action)) {
    throw new ActionError(`行动点不够。这件事要 ${AP_COSTS[action]} 点，你还剩 ${state.ap} 点。`)
  }
}

function requireUnlocked(state: GameState, systemId: string): void {
  if (!state.unlocked.includes(systemId)) {
    throw new ActionError('这件事你现在还做不了。')
  }
}

/**
 * 人在里面的时候，外面的一切都不归你管。行动点归零已经拦住了大部分路，
 * 但那是巧合而不是规则——规则写在这里。
 */
function requireFreeMan(state: GameState): void {
  if (state.jailTurns > 0) {
    throw new ActionError(`你在里面。还剩 ${state.jailTurns} 天。`)
  }
  if (state.incident) {
    throw new ActionError('有人正站在那儿看着你。这件事得先解决。')
  }
}

/**
 * Nothing else may happen while a job is in progress. The UI hides these
 * buttons, but the guard belongs here — the facade is what makes the
 * invariant structural rather than a property of one screen's markup.
 */
function requireNoActiveRun(state: GameState): void {
  requireFreeMan(state)
  if (state.activeRun && !state.activeRun.finished) {
    throw new ActionError('你正在动手，现在没工夫做别的。')
  }
}

// ── Actions ───────────────────────────────────────────────────────────────

/** Your own eyes. Costs an action point, and what you see is always true. */
export function scout(
  session: Session,
  targetInstanceId: string,
  segmentId: string,
): void {
  const { state, log } = session
  requireNoActiveRun(state)
  requireAp(state, 'scout')
  const target = getTarget(state, targetInstanceId)
  if (!target) throw new ActionError('没有这个目标。')
  if (target.stolen) throw new ActionError('那辆车已经不在了。')
  if (!HEIST_CONFIG.segments.some((s) => s.id === segmentId)) {
    throw new ActionError('没有这个阶段。')
  }
  if (target.scouted.includes(segmentId)) throw new ActionError('这一段你已经看过了。')

  spendAp(state, 'scout')
  target.scouted.push(segmentId)
  const segment = HEIST_CONFIG.segments.find((s) => s.id === segmentId)!
  log.append({
    turn: state.turn,
    type: 'intel_received',
    actors: [targetInstanceId, target.defId],
    summary: `你自己去看了一趟「${segment.title}」。`,
    tone: 'neutral',
    payload: { targetInstanceId, segmentId, selfScouted: true },
  })
}

/**
 * Buying a tip. Benny's first two are pinned by the script — trust has to
 * exist before it can be spent (VERTICAL_SLICE.md §3).
 */
export function buyIntel(
  session: Session,
  informantId: string,
  targetInstanceId: string,
  segmentId?: string,
): IntelItem {
  const { state, log, rng } = session
  requireNoActiveRun(state)
  requireUnlocked(state, 'informants')
  requireAp(state, 'meetInformant')
  const source = informantDef(informantId)
  if (state.cash < source.price) {
    throw new ActionError(`${source.name} 要 $${source.price}。你没有。`)
  }

  spendAp(state, 'meetInformant')

  const previous = state.intel.filter((i) => i.sourceId === informantId).length
  const scripted =
    informantId === BETRAYAL.informantId && previous < 2
      ? previous === 0
        ? { forcedTruth: BETRAYAL.firstTipTruth }
        : { forcedTruth: BETRAYAL.secondTipTruth, templateId: BETRAYAL.secondTipTemplate }
      : {}

  return offerIntel(state, log, rng, informantId, targetInstanceId, {
    ...(segmentId ? { segmentId } : {}),
    ...scripted,
  })
}

export function verify(
  session: Session,
  intelId: string,
  verifierId: string,
): VerifyResult {
  const { state, log, rng } = session
  requireNoActiveRun(state)
  requireUnlocked(state, 'verify')
  requireAp(state, 'verifyIntel')
  if (state.cash < VERIFY_FEE) throw new ActionError(`验证要 $${VERIFY_FEE}。你没有。`)
  spendAp(state, 'verifyIntel')
  return verifyIntel(state, log, rng, intelId, verifierId, VERIFY_FEE)
}

export function startHeist(session: Session, targetInstanceId: string): SegmentRunState {
  const { state, log } = session
  requireNoActiveRun(state)
  requireUnlocked(state, 'heist')
  requireAp(state, 'runHeist')
  spendAp(state, 'runHeist')
  return beginHeist(state, log, targetInstanceId)
}

export const currentHeist = (session: Session): RunView => heistView(session.state)

export function chooseHeistOption(session: Session, optionId: string): HeistStepResult {
  return heistStep(session.state, session.log, session.rng, optionId)
}

export function giveUpHeist(session: Session): string[] {
  return heistAbort(session.state, session.log)
}

/**
 * 只翻车，不开走。花的行动点比偷车少一点，但它是电子防盗时代唯一
 * 还稳定挣钱的手艺——你拿不走车，可以拿走车里的一切。
 */
export function startRifle(session: Session, targetInstanceId: string): SegmentRunState {
  const { state, log } = session
  requireNoActiveRun(state)
  requireUnlocked(state, 'heist')
  requireAp(state, 'rifle')
  spendAp(state, 'rifle')
  return beginRifle(state, log, targetInstanceId)
}

// ── 被发现之后 ────────────────────────────────────────────────────────────

export interface IncidentScreen {
  kind: 'witness' | 'camera' | 'police'
  title: string
  intro: string
  options: IncidentOptionView[]
  /** 这一趟已经黄了，处理完就直接收场 */
  runEnded: boolean
}

export const currentIncident = (session: Session): IncidentScreen => ({
  ...incidentView(session.state),
  runEnded: session.state.incident?.runEnded ?? true,
})

export interface IncidentConclusion {
  /** 处理这一步本身的结果文本 */
  text: string
  success: boolean
  /** 这一趟到此为止 */
  runOver: boolean
  /** 收场时才说出口的话（销赃、伤势、赃物…） */
  epilogue: string[]
  arrest: ArrestResult | null
}

/**
 * 处理掉眼前这个人／这个探头／这两个警察，然后决定这一趟还继不继续。
 *
 * 三条出路，顺序固定：
 *   进局子   → 一切归零，前科 +1，第三次是无期
 *   这趟黄了 → 走正常收场（赃物照样跟着你出来）
 *   都没有   → 清掉局面，回到刚才那一段接着干
 */
export function handleIncident(session: Session, optionId: string): IncidentConclusion {
  const { state, log, rng } = session
  const incident = state.incident
  const result = resolveIncident(session.state, log, rng, optionId)
  const run = state.activeRun

  // 被抓也要先收场：情报该记的账要记，赃物要先落到你身上——
  // 然后才被登记收走。「人赃并获」在这套账里就是这个顺序。
  const over = result.arrested || result.endsRun || run?.finished != null
  const epilogue: string[] = []

  if (run && over) {
    run.finished ??= { result: 'failure', atSegmentIndex: run.segmentIndex }
    const brokeRule = incident?.brokeRule ?? null
    epilogue.push(
      ...(run.configId === HEIST_CONFIG.id || run.configId === RIFLE_CONFIG.id
        ? finishHeist(state, log, run, incident?.atRisk === true, brokeRule)
        : finishCrime(state, log, run, brokeRule)),
    )
  }

  if (result.arrested) {
    const jail = arrest(state, log)
    epilogue.push(...jail.text)
    return { text: result.text, success: result.success, runOver: true, epilogue, arrest: jail }
  }

  clearIncident(state)
  // 没被抓、也没被赶出来，那就接着干——这一条就是「不是一次失败就回去了」。
  return { text: result.text, success: result.success, runOver: over, epilogue, arrest: null }
}

// ── 赃物 ──────────────────────────────────────────────────────────────────

export const stash = (session: Session): StashEntry[] => stashView(session.state)
export const stashValue = (session: Session): number => stashWorth(session.state)

export function sellStashItem(session: Session, id: string): number {
  requireNoActiveRun(session.state)
  return sellLoot(session.state, session.log, id)
}

export function sellStash(session: Session): number {
  requireNoActiveRun(session.state)
  return sellAllLoot(session.state, session.log)
}

export function discardStashItem(session: Session, id: string): void {
  requireNoActiveRun(session.state)
  dropLoot(session.state, session.log, id)
}

// ── crimes against places ─────────────────────────────────────────────────

export function startCrime(
  session: Session,
  locationId: string,
  crime: CrimeKey,
): SegmentRunState {
  const { state, log } = session
  requireNoActiveRun(state)
  requireUnlocked(state, 'crimes')
  const cost = crimeAp(crime)
  if (state.ap < cost) {
    throw new ActionError(`行动点不够。这件事要 ${cost} 点，你还剩 ${state.ap} 点。`)
  }
  state.ap -= cost
  try {
    return beginCrime(state, log, locationId, crime)
  } catch (error) {
    state.ap += cost // 没开成就把行动点退回去
    throw new ActionError(error instanceof Error ? error.message : String(error))
  }
}

export const currentCrime = (session: Session): RunView => crimeView(session.state)

export function chooseCrimeOption(session: Session, optionId: string): CrimeStepResult {
  return crimeStep(session.state, session.log, session.rng, optionId)
}

export function giveUpCrime(session: Session): string[] {
  return crimeAbort(session.state, session.log)
}

export function fence(
  session: Session,
  instanceId: string,
  channelId: string,
): { payout: number; breakdown: PriceBreakdown } {
  const { state, log } = session
  requireNoActiveRun(state)
  requireUnlocked(state, 'fence')
  requireAp(state, 'fence')
  spendAp(state, 'fence')
  return sellVehicle(state, log, instanceId, channelId)
}

/**
 * Burns the rest of the day. Note it does *not* tick the injury clock —
 * recovery happens in exactly one place (`systems/turn.ts`), or resting would
 * heal two turns per day and swallow the recovery notice on the last tick.
 * What resting actually buys is extra cooling.
 */
export function rest(session: Session): void {
  const { state, log } = session
  requireNoActiveRun(state)
  state.ap = 0
  addHeat(state, log, -HEAT.restBonus, '在家待了一天')
  log.append({
    turn: state.turn,
    type: 'advisor',
    actors: ['marco'],
    summary: '你今天什么都没做。',
    tone: 'neutral',
    payload: { rested: true },
  })
}

export function endTurn(session: Session): TurnReport {
  return advanceTurn(session.state, session.log)
}
