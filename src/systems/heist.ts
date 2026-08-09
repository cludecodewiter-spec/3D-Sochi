/**
 * The heist: SegmentRun wired to cars, heat, the garage and Marco's body.
 * DESIGN_v12.md §4, §5.
 *
 * `segment-run.ts` stays domain-free; everything car-shaped lives here.
 * A future chase or transport run gets its own thin module like this one and
 * reuses the same engine.
 */

import type { EventLog, GameEvent } from '../engine/events.js'
import type { GameState, SegmentRunState } from '../engine/state.js'
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
  settleIntel(state, log, run, 'aborted')
  state.activeRun = null
  return lines
}

function finishHeist(
  state: GameState,
  log: EventLog,
  run: SegmentRunState,
  result: StepResult,
  ambushed: boolean,
): string[] {
  const target = getTarget(state, run.contextId)
  if (!target) throw new Error(`没有这个目标：${run.contextId}`)
  const def = vehicleDef(target.defId)
  const outcome = result.outcome!
  const lines: string[] = []

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
      payload: { result: 'failure', defId: target.defId, ambushed },
      causedBy: run.startedEventId,
    })
    addHeat(state, log, HEAT.perFailedEscape, '失手', {
      causedBy: resultEvent.id,
      actors: [run.contextId],
    })

    if (ambushed) {
      lines.push('仓库里有六个人。')
      lines.push('其中四个，本来就在等你。')
      injure(state, log, BETRAYAL.injuryTurns, resultEvent.id)
      lines.push(`你肩膀上挨了一枪。接下来 ${BETRAYAL.injuryTurns} 个回合，你干什么都比平时吃力。`)
    } else {
      lines.push('你走掉了。这次只是没拿到东西。')
    }
  }

  settleIntel(state, log, run, outcome.result, resultEvent.id)
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
 * dossier can render "你信了这条 → 你去偷了 → Marco 中枪" without anybody
 * authoring that chain by hand.
 */
function settleIntel(
  state: GameState,
  log: EventLog,
  run: SegmentRunState,
  result: 'success' | 'failure' | 'aborted',
  causedBy?: string,
): void {
  const used = state.intel.filter(
    (i) => i.targetInstanceId === run.contextId && !i.resolved,
  )
  for (const item of used) {
    if (result === 'aborted') continue
    const harmed = item.truth === 'false' && result === 'failure'
    const helped = item.truth === 'true' && result === 'success'
    resolveIntel(
      state,
      log,
      item.id,
      harmed ? 'harmed' : helped ? 'helped' : 'neutral',
      harmed
        ? '实际情况和他说的完全不一样。'
        : helped
          ? '和他说的一模一样。'
          : '结果说明不了什么。',
      causedBy,
    )
  }
}
