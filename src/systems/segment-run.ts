/**
 * The unified SegmentRun engine. DESIGN_v12.md §4, surgery S1.
 *
 * v11 specced four separate systems — the four-stage heist, plus three new
 * ones for Diana (segmented races, transport event chains, three-layer
 * chases). They are structurally the same thing:
 *
 *   for each segment: show an incomplete tell → pick one of three options
 *                   → check → mutate persistent state vars
 *                   → those vars make later segments harder
 *
 * So there is one engine here and the rest is configuration. Beyond the
 * saved engineering, the player learns the grammar once and can then play
 * all four modes — which quietly removes a chunk of the onboarding problem
 * that v11 tried to solve with a dossier.
 *
 * This module knows nothing about cars, races or police. Everything
 * domain-specific arrives through `RunContext`.
 */

import type { EventLog } from '../engine/events.js'
import type { GameState, RunOutcome, SegmentRunState } from '../engine/state.js'
import type { Rng } from '../engine/rng.js'
import { clamp } from '../engine/types.js'
import type { Difficulty, SkillKey } from '../engine/types.js'
import { SKILL_LABELS } from '../engine/types.js'
import type {
  DefenseKey,
  OptionDef,
  SegmentDef,
  SegmentRunConfig,
  VarDelta,
} from '../content/types.js'
import type { IntelEffect } from './intel.js'
import type { probability as probabilityFn, resolve as resolveFn } from './checks.js'

/**
 * The check functions are injected rather than imported for use, so this
 * engine stays a pure state machine over its config — easy to drive from a
 * test with a stubbed roll, and free of any hidden dependency on balance.
 */
export type ProbabilityFn = typeof probabilityFn
export type ResolveFn = typeof resolveFn

export interface RunContext {
  defense: (key: DefenseKey) => number
  skill: (key: SkillKey) => number
  intel: (segmentId: string) => IntelEffect
  statePenalty: (vars: Record<string, number>) => number
  /** Extra opposition on a specific segment — e.g. an ambush waiting at the exit. */
  extraDefense?: (segmentId: string, vars: Record<string, number>) => number
  heat: number
  injured: boolean
  difficulty: Difficulty
  /** Nerve threshold above which the player sees the second-guess line. */
  nerve: number
  /**
   * A visible, explained bonus — someone standing next to you talking you
   * through it. Always surfaced in the view; never a hidden thumb on the scale.
   */
  assist?: { amount: number; note: string }
}

export interface OptionView {
  id: string
  label: string
  hint: string
  skillLabel: string
  skillValue: number
  opposition: number
  probability: number
  endsRunOnFailure: boolean
}

export interface RunView {
  configId: string
  segmentId: string
  segmentTitle: string
  segmentIndex: number
  segmentCount: number
  intro: string
  tell: string
  nerveHint: string | null
  vars: Record<string, number>
  varLabels: Record<string, string>
  options: OptionView[]
  abortText: string
  assistNote: string | null
}

export const NERVE_HINT_THRESHOLD = 55

export function startRun(
  state: GameState,
  log: EventLog,
  config: SegmentRunConfig,
  contextId: string,
  summary: string,
  actors: string[],
  causedBy?: string,
): SegmentRunState {
  if (state.activeRun && !state.activeRun.finished) {
    throw new Error('已经有一次进行中的行动')
  }
  const event = log.append({
    turn: state.turn,
    type: 'heist_start',
    actors,
    summary,
    tone: 'neutral',
    payload: { configId: config.id, contextId },
    ...(causedBy ? { causedBy } : {}),
  })

  const vars: Record<string, number> = {}
  for (const [key, def] of Object.entries(config.vars)) vars[key] = def.init

  const run: SegmentRunState = {
    configId: config.id,
    contextId,
    segmentIndex: 0,
    vars,
    history: [],
    startedEventId: event.id,
    finished: null,
  }
  state.activeRun = run
  return run
}

export function segmentAt(config: SegmentRunConfig, index: number): SegmentDef {
  const segment = config.segments[index]
  if (!segment) throw new Error(`${config.id} 没有第 ${index} 段`)
  return segment
}

function oppositionFor(
  option: OptionDef,
  segment: SegmentDef,
  run: SegmentRunState,
  ctx: RunContext,
): number {
  const extra = ctx.extraDefense?.(segment.id, run.vars) ?? 0
  return ctx.defense(option.defense) + extra
}

/** Probability shown on the button, identical to the one that will be rolled. */
export function optionProbability(
  option: OptionDef,
  segment: SegmentDef,
  run: SegmentRunState,
  ctx: RunContext,
  probabilityFn: ProbabilityFn,
): number {
  return probabilityFn({
    skill: ctx.skill(option.skill),
    defense: oppositionFor(option, segment, run, ctx),
    optionModifier: option.modifier + (ctx.assist?.amount ?? 0),
    intelModifier: ctx.intel(segment.id).modifier,
    heat: ctx.heat,
    statePenalty: ctx.statePenalty(run.vars),
    injured: ctx.injured,
    difficulty: ctx.difficulty,
  }).probability
}

export function view(
  run: SegmentRunState,
  config: SegmentRunConfig,
  ctx: RunContext,
  probabilityFn: ProbabilityFn,
): RunView {
  const segment = segmentAt(config, run.segmentIndex)
  const effect = ctx.intel(segment.id)
  const tell = segment.tell[effect.variant]

  const varLabels: Record<string, string> = {}
  for (const [key, def] of Object.entries(config.vars)) varLabels[key] = def.label

  return {
    configId: config.id,
    segmentId: segment.id,
    segmentTitle: segment.title,
    segmentIndex: run.segmentIndex,
    segmentCount: config.segments.length,
    intro: segment.intro,
    tell,
    // The extra line only exists when there is something to doubt, so a
    // high-nerve player is being told "look again", not being handed the answer.
    nerveHint:
      ctx.nerve >= NERVE_HINT_THRESHOLD && effect.variant === 'misleading'
        ? (segment.tell.nerveHint ?? null)
        : null,
    vars: { ...run.vars },
    varLabels,
    options: segment.options.map((option) => ({
      id: option.id,
      label: option.label,
      hint: option.hint,
      skillLabel: SKILL_LABELS[option.skill],
      skillValue: ctx.skill(option.skill),
      opposition: Math.round(oppositionFor(option, segment, run, ctx)),
      probability: optionProbability(option, segment, run, ctx, probabilityFn),
      endsRunOnFailure: option.failureEndsRun === true,
    })),
    abortText: segment.abortText,
    assistNote: ctx.assist?.note ?? null,
  }
}

function applyDeltas(
  run: SegmentRunState,
  config: SegmentRunConfig,
  deltas: VarDelta[],
): void {
  for (const delta of deltas) {
    const def = config.vars[delta.var]
    if (!def) throw new Error(`${config.id} 没有状态量 ${delta.var}`)
    run.vars[delta.var] = clamp((run.vars[delta.var] ?? def.init) + delta.amount, def.min, def.max)
  }
}

export interface StepResult {
  option: OptionDef
  success: boolean
  probability: number
  roll: number
  text: string
  /** Set when a `failWhen` rule tripped. */
  brokeRule: string | null
  outcome: RunOutcome | null
  vars: Record<string, number>
}

export function step(
  run: SegmentRunState,
  config: SegmentRunConfig,
  ctx: RunContext,
  optionId: string,
  rng: Rng,
  resolveFn: ResolveFn,
): StepResult {
  if (run.finished) throw new Error('这次行动已经结束了')
  const segment = segmentAt(config, run.segmentIndex)
  const option = segment.options.find((o) => o.id === optionId)
  if (!option) throw new Error(`第 ${segment.id} 段没有选项 ${optionId}`)

  const check = resolveFn(
    {
      skill: ctx.skill(option.skill),
      defense: oppositionFor(option, segment, run, ctx),
      optionModifier: option.modifier + (ctx.assist?.amount ?? 0),
      intelModifier: ctx.intel(segment.id).modifier,
      heat: ctx.heat,
      statePenalty: ctx.statePenalty(run.vars),
      injured: ctx.injured,
      difficulty: ctx.difficulty,
    },
    rng,
  )

  applyDeltas(run, config, check.success ? option.onSuccess : option.onFailure)
  run.history.push({
    segmentId: segment.id,
    optionId: option.id,
    success: check.success,
    probability: check.probability,
  })

  let brokeRule: string | null = null
  for (const rule of config.failWhen) {
    if ((run.vars[rule.var] ?? 0) >= rule.atLeast) {
      brokeRule = rule.text
      break
    }
  }

  let outcome: RunOutcome | null = null
  if (brokeRule) {
    outcome = { result: 'failure', atSegmentIndex: run.segmentIndex }
  } else if (!check.success && option.failureEndsRun) {
    outcome = { result: 'failure', atSegmentIndex: run.segmentIndex }
  } else if (run.segmentIndex === config.segments.length - 1) {
    // The final segment *is* the outcome. Botching the getaway does not hand
    // you the car with a scratch on it — it is how the run is lost. Earlier
    // segments only ever make later ones harder.
    outcome = {
      result: check.success ? 'success' : 'failure',
      atSegmentIndex: run.segmentIndex,
    }
  } else {
    run.segmentIndex += 1
  }

  run.finished = outcome

  return {
    option,
    success: check.success,
    probability: check.probability,
    roll: check.roll,
    text: check.success ? option.successText : option.failureText,
    brokeRule,
    outcome,
    vars: { ...run.vars },
  }
}

/** §4.4 — walking away must always stay a correct move. */
export function abort(run: SegmentRunState, config: SegmentRunConfig): {
  outcome: RunOutcome
  segment: SegmentDef
} {
  if (run.finished) throw new Error('这次行动已经结束了')
  const segment = segmentAt(config, run.segmentIndex)
  const outcome: RunOutcome = { result: 'aborted', atSegmentIndex: run.segmentIndex }
  run.finished = outcome
  return { outcome, segment }
}
