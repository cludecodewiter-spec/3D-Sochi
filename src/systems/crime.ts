/**
 * Crimes against places. The sibling of `heist.ts`.
 *
 * Both modules are thin: they build a `RunContext` and apply consequences.
 * The engine underneath is the same `SegmentRun` that drives car theft, which
 * is why a new kind of crime costs a content file and about eighty lines here
 * rather than a new system.
 */

import type { EventLog, GameEvent } from '../engine/events.js'
import type { GameState, SegmentRunState } from '../engine/state.js'
import type { Rng } from '../engine/rng.js'
import type { SkillKey } from '../engine/types.js'
import type { DefenseKey } from '../content/types.js'
import type { CrimeKey } from '../content/crimes.js'
import { CRIME_AP, CRIME_LABELS, FACE_LINE, LEAVES_A_FACE, crimeConfig } from '../content/crimes.js'
import { locationDef, witnessPool } from '../content/locations.js'
import { HEAT, RUN_PENALTY } from '../content/balance.js'
import { probability, resolve } from './checks.js'
import { addHeat, heatOf } from './heat.js'
import { failureIncident, raiseIncident } from './incident.js'
import { stashLoot } from './stash.js'
import type { RunContext, RunView, StepResult } from './segment-run.js'
import { abort, segmentAt, startRun, step, view } from './segment-run.js'

export const placeOf = (state: GameState, id: string): GameState['places'][number] | undefined =>
  state.places.find((p) => p.id === id)

export const isReady = (state: GameState, id: string): boolean =>
  state.turn >= (placeOf(state, id)?.readyOnTurn ?? 0)

export function buildContext(state: GameState, locationId: string): RunContext {
  const def = locationDef(locationId)
  return {
    defense: (key: DefenseKey) =>
      key === 'exposure' || key === 'security' || key === 'response'
        ? def.defense[key]
        : def.defense.security,
    skill: (key: SkillKey) => state.marco.skills[key],
    // Places have no informants wired to them yet — what you know about a
    // place is what the tell says, and the tell is vague until it isn't.
    intel: () => ({ modifier: 0, variant: 'vague' as const, item: undefined }),
    statePenalty: (vars) => {
      const noise = (vars['noise'] ?? 0) * RUN_PENALTY.noisePerPoint
      const overtime =
        Math.max(0, (vars['time'] ?? 0) - RUN_PENALTY.timeThreshold) * RUN_PENALTY.timePerPoint
      return noise + overtime
    },
    heat: heatOf(state),
    injured: state.marco.injuryTurns > 0,
    difficulty: state.difficulty,
    nerve: state.marco.skills.acting,
  }
}

export const crimeAp = (crime: CrimeKey): number => CRIME_AP[crime]

export function beginCrime(
  state: GameState,
  log: EventLog,
  locationId: string,
  crime: CrimeKey,
): SegmentRunState {
  const def = locationDef(locationId)
  if (!def.crimes.includes(crime)) throw new Error(`${def.name} 不能做这件事`)
  if (!isReady(state, locationId)) throw new Error('这地方刚出过事，现在有人盯着。')

  return startRun(
    state,
    log,
    crimeConfig(crime),
    locationId,
    `在${def.name}动手：${CRIME_LABELS[crime]}`,
    [locationId],
  )
}

function requireRun(state: GameState): SegmentRunState {
  const run = state.activeRun
  if (!run || run.finished) throw new Error('现在没有进行中的行动')
  return run
}

export function crimeView(state: GameState): RunView {
  const run = requireRun(state)
  return view(run, crimeConfig(run.configId as CrimeKey), buildContext(state, run.contextId), probability)
}

export interface CrimeStepResult extends StepResult {
  epilogue: string[]
}

export function crimeStep(
  state: GameState,
  log: EventLog,
  rng: Rng,
  optionId: string,
): CrimeStepResult {
  const run = requireRun(state)
  const crime = run.configId as CrimeKey
  const config = crimeConfig(crime)
  const segment = segmentAt(config, run.segmentIndex)

  const result = step(run, config, buildContext(state, run.contextId), optionId, rng, resolve)

  log.append({
    turn: state.turn,
    type: 'heist_segment',
    actors: [run.contextId],
    summary: `${segment.title}：${result.option.label} — ${result.success ? '成功' : '失败'}`,
    tone: result.success ? 'neutral' : 'bad',
    payload: { crime, segmentId: segment.id, optionId, success: result.success },
    causedBy: run.startedEventId,
  })

  // 失手不再等于「你走掉了」。有人看见了你，或者警察已经堵在门口——
  // 接下来怎么办，是 `incident.ts` 那一层要问的问题。
  const trigger = failureIncident(run, result, rng)
  if (trigger) {
    raiseIncident(state, log, rng, trigger, witnessPool(run.contextId), {
      brokeRule: result.brokeRule,
    })
    return { ...result, epilogue: [] }
  }

  const epilogue = result.outcome ? finishCrime(state, log, run, result.brokeRule) : []
  return { ...result, epilogue }
}

export function crimeAbort(state: GameState, log: EventLog): string[] {
  const run = requireRun(state)
  const crime = run.configId as CrimeKey
  const { outcome, segment } = abort(run, crimeConfig(crime))
  const heat = HEAT.abortAtSegment[outcome.atSegmentIndex] ?? 0

  if (heat > 0) {
    addHeat(state, log, heat, '中途收手', { causedBy: run.startedEventId, actors: [run.contextId] })
  }
  log.append({
    turn: state.turn,
    type: 'heist_result',
    actors: [run.contextId],
    summary: `在「${segment.title}」收手了`,
    tone: 'neutral',
    payload: { crime, result: 'aborted' },
    causedBy: run.startedEventId,
  })
  state.activeRun = null
  return [segment.abortText]
}

/**
 * 收场。刻意读 `run.finished` 而不是某次 step 的返回值——因为这一步
 * 现在可能被「被发现」环节推迟到几次交互之后才执行。
 */
export function finishCrime(
  state: GameState,
  log: EventLog,
  run: SegmentRunState,
  brokeRule: string | null = null,
): string[] {
  const crime = run.configId as CrimeKey
  const def = locationDef(run.contextId)
  const outcome = run.finished!
  const lines: string[] = []
  if (brokeRule) lines.push(brokeRule)

  const place = placeOf(state, run.contextId)
  if (place) {
    place.timesHit += 1
    place.readyOnTurn = state.turn + def.cooldown
  }

  let event: GameEvent
  if (outcome.result === 'success') {
    // What the job was worth is what you actually managed to pick up.
    const take = Math.round(run.vars['take'] ?? 0)
    state.cash += take
    event = log.append({
      turn: state.turn,
      type: 'sale',
      actors: [run.contextId],
      summary: `${CRIME_LABELS[crime]}得手，到手 $${take}`,
      tone: 'good',
      payload: { crime, take, locationId: run.contextId },
      causedBy: run.startedEventId,
    })
    lines.push(
      take > 0
        ? `到手 $${take}。`
        : take < 0
          ? `你在桌上留下了 $${-take}。那是入场费。`
          : '现钞一分都没有。',
    )
    lines.push(...stashLoot(state, log, run, event.id))
  } else {
    event = log.append({
      turn: state.turn,
      type: 'heist_result',
      actors: [run.contextId],
      summary: `${CRIME_LABELS[crime]}没做成`,
      tone: 'bad',
      payload: { crime, result: 'failure', locationId: run.contextId },
      causedBy: run.startedEventId,
    })
    addHeat(state, log, HEAT.perFailedEscape, '失手', {
      causedBy: event.id,
      actors: [run.contextId],
    })
    lines.push('你走掉了。')
    // 失手不代表两手空空——已经揣进兜里的东西，是跟着你出来的。
    lines.push(...stashLoot(state, log, run, event.id))
  }

  // §3.3 — 有人看清了你的脸，那一段进底案，贿赂消不掉。
  const face = LEAVES_A_FACE[crime]
  if (face > 0) {
    addHeat(state, log, face, `${CRIME_LABELS[crime]}——有人记住了你`, {
      causedBy: event.id,
      actors: [run.contextId],
      permanent: true,
    })
    const said = FACE_LINE[crime]
    if (said) lines.push(said)
  }

  const noise = run.vars['noise'] ?? 0
  if (noise > 40) {
    addHeat(state, log, Math.round(noise / 6), '动静太大', {
      causedBy: event.id,
      actors: [run.contextId],
    })
  }

  state.activeRun = null
  return lines
}
