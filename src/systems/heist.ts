/**
 * The heist: SegmentRun wired to cars, heat, the garage and Marco's body.
 * DESIGN_v12.md §4, §5.
 *
 * `segment-run.ts` stays domain-free; everything car-shaped lives here.
 * A future chase or transport run gets its own thin module like this one and
 * reuses the same engine.
 */

import type { EventLog, GameEvent } from '../engine/events.js'
import type { GameState, IntelOutcome, SegmentRunState } from '../engine/state.js'
import { getTarget } from '../engine/state.js'
import type { Rng } from '../engine/rng.js'
import { clamp } from '../engine/types.js'
import type { SkillKey } from '../engine/types.js'
import type { DefenseKey } from '../content/types.js'
import { HEAT, RUN_PENALTY } from '../content/balance.js'
import { HEIST_CONFIG } from '../content/heist.js'
import { vehicleDef } from '../content/vehicles.js'
import { BETRAYAL, TUTORIAL_TARGET } from '../content/script.js'
import { probability, resolve } from './checks.js'
import { addHeat } from './heat.js'
import { intelEffect, resolveIntel } from './intel.js'
import { defenseFor } from './vehicles.js'
import type { RunContext, RunView, StepResult } from './segment-run.js'
import { abort, segmentAt, startRun, step, view } from './segment-run.js'

/** Danger contributed by a single piece of false intel. */
export const DANGER_PER_LIE = 40
/** At or above this, somebody is waiting at the exit. */
export const AMBUSH_THRESHOLD = 40
/** Added opposition on the escape segment when an ambush is live. */
export const AMBUSH_OPPOSITION = 25

/**
 * Solomon talks the player through the first job. It is a real, visible
 * modifier rather than a rigged outcome — the 0.05/0.95 band is a hard rule
 * and the tutorial does not get to break it. What this buys is that the
 * opening heist sits at the ceiling on every segment, so the loop almost
 * always closes before anything is allowed to go wrong.
 */
export const TUTORIAL_ASSIST = 0.2

export function buildContext(state: GameState, targetInstanceId: string): RunContext {
  const target = getTarget(state, targetInstanceId)
  if (!target) throw new Error(`没有这个目标：${targetInstanceId}`)
  return {
    defense: (key: DefenseKey) => defenseFor(target.defId, key),
    skill: (key: SkillKey) => state.marco.skills[key],
    intel: (segmentId: string) => intelEffect(state, targetInstanceId, segmentId),
    statePenalty: (vars) => {
      const noise = (vars['noise'] ?? 0) * RUN_PENALTY.noisePerPoint
      const overtime =
        Math.max(0, (vars['time'] ?? 0) - RUN_PENALTY.timeThreshold) *
        RUN_PENALTY.timePerPoint
      return noise + overtime
    },
    // The ambush is not a script. False intel raises `danger`, and danger
    // is what puts four extra people behind the building.
    extraDefense: (segmentId, vars) =>
      segmentId === 'escape' && (vars['danger'] ?? 0) >= AMBUSH_THRESHOLD
        ? AMBUSH_OPPOSITION
        : 0,
    heat: state.heat,
    injured: state.marco.injuryTurns > 0,
    difficulty: state.difficulty,
    nerve: state.marco.skills.nerve,
    ...(state.turn === 1 && targetInstanceId === `t-${TUTORIAL_TARGET}`
      ? { assist: { amount: TUTORIAL_ASSIST, note: '所罗门就站在你旁边，低声说着每一步。' } }
      : {}),
  }
}

export function beginHeist(
  state: GameState,
  log: EventLog,
  targetInstanceId: string,
): SegmentRunState {
  const target = getTarget(state, targetInstanceId)
  if (!target) throw new Error(`没有这个目标：${targetInstanceId}`)
  if (target.stolen) throw new Error('这辆车已经没了')
  const def = vehicleDef(target.defId)

  // Chain the run to the freshest tip about this target, so the dossier can
  // walk 情报 → 下手 → 后果 without anybody authoring that link by hand.
  const informing = [...state.intel]
    .reverse()
    .find((i) => i.targetInstanceId === targetInstanceId && !i.resolved)

  const run = startRun(
    state,
    log,
    HEIST_CONFIG,
    targetInstanceId,
    `开始对 ${def.name} 下手`,
    [target.defId, targetInstanceId],
    informing?.eventId,
  )

  // Seed `danger` from every lie the player is currently carrying about
  // this target. They cannot see this number, and that is the point.
  const lies = state.intel.filter(
    (i) => i.targetInstanceId === targetInstanceId && i.truth === 'false',
  )
  run.vars['danger'] = lies.length * DANGER_PER_LIE
  return run
}

export function heistView(state: GameState): RunView {
  const run = requireRun(state)
  return view(run, HEIST_CONFIG, buildContext(state, run.contextId), probability)
}

function requireRun(state: GameState): SegmentRunState {
  const run = state.activeRun
  if (!run || run.finished) throw new Error('现在没有进行中的行动')
  return run
}

export interface HeistStepResult extends StepResult {
  /** Set once the run ends, describing what it cost or earned. */
  epilogue: string[]
}

export function heistStep(
  state: GameState,
  log: EventLog,
  rng: Rng,
  optionId: string,
): HeistStepResult {
  const run = requireRun(state)
  const ctx = buildContext(state, run.contextId)
  const segment = segmentAt(HEIST_CONFIG, run.segmentIndex)
  const ambushed =
    segment.id === 'escape' && (run.vars['danger'] ?? 0) >= AMBUSH_THRESHOLD

  const result = step(run, HEIST_CONFIG, ctx, optionId, rng, resolve)

  log.append({
    turn: state.turn,
    type: 'heist_segment',
    actors: [run.contextId],
    summary: `${segment.title}：${result.option.label} — ${result.success ? '成功' : '失败'}`,
    tone: result.success ? 'neutral' : 'bad',
    payload: {
      segmentId: segment.id,
      optionId,
      success: result.success,
      probability: result.probability,
    },
    causedBy: run.startedEventId,
  })

  const epilogue: string[] = []
  if (result.outcome) {
    epilogue.push(...finishHeist(state, log, run, result, ambushed))
  }
  return { ...result, epilogue }
}

export function heistAbort(state: GameState, log: EventLog): string[] {
  const run = requireRun(state)
  const { outcome, segment } = abort(run, HEIST_CONFIG)
  const heat = HEAT.abortAtSegment[outcome.atSegmentIndex] ?? 0

  const lines = [segment.abortText]
  if (heat > 0) {
    addHeat(state, log, heat, '中途放弃', {
      causedBy: run.startedEventId,
      actors: [run.contextId],
    })
  }
  log.append({
    turn: state.turn,
    type: 'heist_result',
    actors: [run.contextId],
    summary: `在「${segment.title}」放弃了`,
    tone: 'neutral',
    payload: { result: 'aborted', segmentId: segment.id },
    causedBy: run.startedEventId,
  })
  settleIntel(state, log, run, 'aborted', false)
  state.activeRun = null
  return lines
}

function finishHeist(
  state: GameState,
  log: EventLog,
  run: SegmentRunState,
  result: StepResult,
  atRisk: boolean,
): string[] {
  const target = getTarget(state, run.contextId)
  if (!target) throw new Error(`没有这个目标：${run.contextId}`)
  const def = vehicleDef(target.defId)
  const outcome = result.outcome!
  const lines: string[] = []
  // `atRisk` only says people *were* waiting. It becomes an ambush the player
  // can see — and evidence against whoever set them up — only if the getaway
  // actually fell apart. Drive out clean and nobody ever learns a thing.
  const ambushFired = atRisk && outcome.result !== 'success'

  if (result.brokeRule) lines.push(result.brokeRule)

  let resultEvent: GameEvent

  if (outcome.result === 'success') {
    const condition = Math.round(clamp(run.vars['condition'] ?? 100, 0, 100))
    target.stolen = true
    state.garage.push({
      instanceId: target.id,
      defId: target.defId,
      condition,
      acquiredTurn: state.turn,
    })
    resultEvent = log.append({
      turn: state.turn,
      type: 'heist_result',
      actors: [run.contextId, target.defId],
      summary: `把 ${def.name} 开走了（车况 ${condition}）`,
      tone: 'good',
      payload: { result: 'success', defId: target.defId, condition },
      causedBy: run.startedEventId,
    })
    addHeat(state, log, Math.round(def.defense.pursuit / 10), '偷了一辆车', {
      causedBy: resultEvent.id,
      actors: [run.contextId],
    })
    lines.push(`${def.name} 现在在你手上。车况 ${condition}。`)
  } else {
    resultEvent = log.append({
      turn: state.turn,
      type: 'heist_result',
      actors: [run.contextId, target.defId],
      summary: `${def.name} 没能得手`,
      tone: 'bad',
      payload: { result: 'failure', defId: target.defId, ambushed: ambushFired },
      causedBy: run.startedEventId,
    })
    addHeat(state, log, HEAT.perFailedEscape, '失手', {
      causedBy: resultEvent.id,
      actors: [run.contextId],
    })

    if (ambushFired) {
      lines.push('仓库里有六个人。')
      lines.push('其中四个，本来就在等你。')
      injure(state, log, BETRAYAL.injuryTurns, resultEvent.id)
      lines.push(`你肩膀上挨了一枪。接下来 ${BETRAYAL.injuryTurns} 个回合，你干什么都比平时吃力。`)
    } else {
      lines.push('你走掉了。这次只是没拿到东西。')
    }
  }

  settleIntel(state, log, run, outcome.result, ambushFired, resultEvent.id)
  state.activeRun = null
  return lines
}

export function injure(
  state: GameState,
  log: EventLog,
  turns: number,
  causedBy?: string,
): GameEvent {
  state.marco.injuryTurns = Math.max(state.marco.injuryTurns, turns)
  return log.append({
    turn: state.turn,
    type: 'injury',
    actors: ['marco'],
    summary: `Marco 受伤，需要休养 ${turns} 个回合`,
    tone: 'bad',
    payload: { turns },
    ...(causedBy ? { causedBy } : {}),
  })
}

/**
 * §6.5 — write every outcome back onto the tip that informed it, so the
 * dossier can render 情报 → 下手 → 后果 without anybody authoring that chain.
 *
 * The verdict is written from what the player could *see*, never from the
 * hidden `truth`:
 *
 *   埋伏兑现            → 错。六个人在等你，这无可辩驳
 *   行动栽在这一步上，
 *     且现实确实与它相悖 → 错
 *     但它其实是真的     → 说不好。运气差不该算在线人头上
 *   走到了，行动成功      → 准
 *   根本没走到那一步      → 说不好
 *
 * The consequence is deliberate: a lie the player got away with earns the
 * liar credit, and Benny's record stays clean right up until it isn't.
 */
function settleIntel(
  state: GameState,
  log: EventLog,
  run: SegmentRunState,
  result: 'success' | 'failure' | 'aborted',
  ambushed: boolean,
  causedBy?: string,
): void {
  // Walking away tests nothing. The tips stay on hand, still unresolved.
  if (result === 'aborted') return

  const used = state.intel.filter(
    (i) => i.targetInstanceId === run.contextId && !i.resolved,
  )
  const endedAt = run.history[run.history.length - 1]?.segmentId

  for (const item of used) {
    const reached = run.history.some((h) => h.segmentId === item.segmentId)
    const contradicted = item.truth !== 'true'

    let outcome: IntelOutcome
    let detail: string

    if (ambushed && item.truth === 'false') {
      outcome = 'harmed'
      detail = '有人在那儿等着你。他知道，而且他没说。'
    } else if (!reached) {
      outcome = 'inconclusive'
      detail = '你没走到能验证这句话的那一步。'
    } else if (result === 'success') {
      outcome = 'helped'
      detail = '和他说的对得上。'
    } else if (endedAt === item.segmentId && contradicted) {
      outcome = 'harmed'
      detail = '就是在这一步上出的岔子。'
    } else {
      outcome = 'inconclusive'
      detail = '这次说明不了什么。'
    }

    resolveIntel(state, log, item.id, outcome, detail, causedBy)
  }
}
