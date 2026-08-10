/**
 * Intel: the soul of the game. DESIGN_v12.md §6.
 *
 * v11 had a single "reliability" axis. v12 splits it into two hidden ones,
 * because there are two different ways a tip goes wrong and they demand
 * opposite responses:
 *
 *   低 access  → 他猜的。错在方向上。别为他的情报付钱。
 *   低 honesty → 他知道，但他卖了你。错在关键数字上。离他远点。
 *
 * Neither number is ever rendered, on any difficulty. What the player can see
 * is history — which is exactly what the dossier is for.
 */

import type { EventLog, GameEvent } from '../engine/events.js'
import type { GameState, IntelItem, IntelOutcome } from '../engine/state.js'
import type { Rng } from '../engine/rng.js'
import { clamp } from '../engine/types.js'
import type { Truth } from '../engine/types.js'
import { INTEL_MODIFIER } from '../content/balance.js'
import { informantDef } from '../content/informants.js'
import { INTEL_TEMPLATE_BY_ID, templatesForSegment } from '../content/intel.js'
import { vehicleDef } from '../content/vehicles.js'
import { getInformant, getTarget } from '../engine/state.js'

export interface TruthOdds {
  true: number
  partial: number
  false: number
}

/**
 * p(true) is the average of honesty and access — you need both to be told
 * something correct. How the *remainder* splits is where the design lives:
 * a dishonest source's errors skew to outright lies, an under-informed
 * source's errors skew to half-truths.
 */
export function truthOdds(honesty: number, access: number): TruthOdds {
  const h = clamp(honesty, 0, 100) / 100
  const a = clamp(access, 0, 100) / 100
  const pTrue = h * 0.5 + a * 0.5
  const remainder = 1 - pTrue

  const malice = 1 - h
  const ignorance = 1 - a
  const total = malice + ignorance
  const falseShare = total === 0 ? 0 : malice / total

  return {
    true: pTrue,
    false: remainder * falseShare,
    partial: remainder * (1 - falseShare),
  }
}

export function rollTruth(honesty: number, access: number, rng: Rng): Truth {
  const noise = (rng.next() - 0.5) * 0.2
  const odds = truthOdds(clamp(honesty + noise * 100, 0, 100), access)
  const roll = rng.next()
  if (roll < odds.true) return 'true'
  if (roll < odds.true + odds.partial) return 'partial'
  return 'false'
}

export interface OfferOptions {
  segmentId?: string
  templateId?: string
  /** The slice script pins Benny's two tips. Otherwise leave unset. */
  forcedTruth?: Truth
  free?: boolean
}

export function offerIntel(
  state: GameState,
  log: EventLog,
  rng: Rng,
  informantId: string,
  targetInstanceId: string,
  options: OfferOptions = {},
): IntelItem {
  const source = informantDef(informantId)
  const target = getTarget(state, targetInstanceId)
  if (!target) throw new Error(`没有这个目标：${targetInstanceId}`)
  const def = vehicleDef(target.defId)

  const template = options.templateId
    ? INTEL_TEMPLATE_BY_ID[options.templateId]
    : rng.pick(
        options.segmentId
          ? templatesForSegment(options.segmentId)
          : templatesForSegment(rng.pick(['recon', 'approach', 'breach', 'escape'])),
      )
  if (!template) throw new Error(`未知情报模板：${options.templateId}`)

  const truth = options.forcedTruth ?? rollTruth(source.honesty, source.access, rng)
  const raw =
    truth === 'true'
      ? template.trueText
      : truth === 'partial'
        ? template.partialText
        : template.falseText
  const text = raw.replaceAll('{target}', def.name)

  const cost = options.free ? 0 : source.price
  state.cash -= cost

  let record = getInformant(state, informantId)
  if (!record) {
    record = {
      id: informantId,
      met: true,
      firstContactTurn: state.turn,
      relationship: 0,
      totalSpent: 0,
    }
    state.informants.push(record)
  }
  record.met = true
  record.firstContactTurn ??= state.turn
  record.totalSpent += cost

  const event = log.append({
    turn: state.turn,
    type: 'intel_received',
    actors: [informantId, target.defId, targetInstanceId],
    summary: `${source.name} 说：「${text}」`,
    tone: 'neutral',
    payload: {
      informantId,
      targetInstanceId,
      segmentId: template.segmentId,
      templateId: template.id,
      text,
      cost,
      // `truth` is in the payload for the ending montage and for tests.
      // No UI path is allowed to read it before the intel resolves.
      truth,
    },
  })

  const item: IntelItem = {
    id: `intel-${event.id}`,
    sourceId: informantId,
    receivedTurn: state.turn,
    targetInstanceId,
    segmentId: template.segmentId,
    text,
    truth,
    costPaid: cost,
    resolved: false,
    eventId: event.id,
  }
  state.intel.push(item)
  return item
}

/** The intel currently covering a given segment of a given target. */
export function intelFor(
  state: GameState,
  targetInstanceId: string,
  segmentId: string,
): IntelItem | undefined {
  // The freshest word wins. If two sources contradict each other about the
  // same segment, the player is acting on the last thing they were told —
  // which is exactly how a lie told after the truth does its damage.
  for (let i = state.intel.length - 1; i >= 0; i--) {
    const item = state.intel[i]!
    if (item.targetInstanceId === targetInstanceId && item.segmentId === segmentId) {
      return item
    }
  }
  return undefined
}

export type TellVariant = 'accurate' | 'vague' | 'misleading'

export interface IntelEffect {
  modifier: number
  variant: TellVariant
  item: IntelItem | undefined
}

/**
 * §4.3 rule 3 — the single most important rule in the design.
 *
 * False intel does not merely subtract from a probability. It swaps the tell
 * for one that states the lie *confidently*, so the player makes a decision
 * that is correct given everything they can see, and it is still the wrong
 * decision. That is what makes the betrayal land as betrayal rather than as
 * a bad roll.
 */
export function intelEffect(
  state: GameState,
  targetInstanceId: string,
  segmentId: string,
): IntelEffect {
  // What Marco saw with his own eyes is always true. Scouting costs an action
  // point; an informant costs money and might be lying. That trade — time
  // versus trust — is the shape of the whole information economy.
  const target = getTarget(state, targetInstanceId)
  if (target?.scouted.includes(segmentId)) {
    return { modifier: INTEL_MODIFIER.true, variant: 'accurate', item: undefined }
  }

  const item = intelFor(state, targetInstanceId, segmentId)
  if (!item) return { modifier: INTEL_MODIFIER.none, variant: 'vague', item: undefined }
  switch (item.truth) {
    case 'true':
      return { modifier: INTEL_MODIFIER.true, variant: 'accurate', item }
    case 'partial':
      return { modifier: INTEL_MODIFIER.partial, variant: 'vague', item }
    case 'false':
      return { modifier: INTEL_MODIFIER.false, variant: 'misleading', item }
  }
}

// ── Verification (§6.4) ────────────────────────────────────────────────────

export interface VerifyResult {
  signal: 'confirms' | 'contradicts'
  /** The verifier can be wrong too. Nothing in this game gives certainty. */
  verifierWasRight: boolean
}

export function verifyIntel(
  state: GameState,
  log: EventLog,
  rng: Rng,
  intelId: string,
  verifierId: string,
  fee = 200,
): VerifyResult {
  const item = state.intel.find((i) => i.id === intelId)
  if (!item) throw new Error(`没有这条情报：${intelId}`)
  if (verifierId === item.sourceId) throw new Error('不能让同一个人验证他自己的话')

  const verifier = informantDef(verifierId)
  state.cash -= fee

  const accuracy = (verifier.honesty + verifier.access) / 200
  const verifierWasRight = rng.chance(accuracy)
  const originalIsSound = item.truth !== 'false'
  const reportsSound = verifierWasRight ? originalIsSound : !originalIsSound
  const signal: VerifyResult['signal'] = reportsSound ? 'confirms' : 'contradicts'

  item.verifiedBy = verifierId
  item.verifiedSignal = signal

  log.append({
    turn: state.turn,
    type: 'intel_verified',
    actors: [verifierId, item.sourceId, item.targetInstanceId],
    summary:
      signal === 'confirms'
        ? `${verifier.name} 说这话听着没问题`
        : `${verifier.name} 说这话不对`,
    tone: 'neutral',
    payload: { intelId, verifierId, signal, fee },
    causedBy: item.eventId,
  })

  return { signal, verifierWasRight }
}

// ── Consequence write-back (§6.5) ──────────────────────────────────────────

/**
 * Ties the outcome of an action back to the tip that informed it. The dossier
 * renders this chain; nobody writes it by hand.
 */
export function resolveIntel(
  state: GameState,
  log: EventLog,
  intelId: string,
  outcome: IntelOutcome,
  detail: string,
  causedBy?: string,
): GameEvent {
  const item = state.intel.find((i) => i.id === intelId)
  if (!item) throw new Error(`没有这条情报：${intelId}`)
  item.resolved = true
  item.outcome = outcome

  const record = getInformant(state, item.sourceId)
  if (record) {
    const delta = outcome === 'helped' ? 8 : outcome === 'harmed' ? -15 : 0
    record.relationship = clamp(record.relationship + delta, -100, 100)
  }

  const source = informantDef(item.sourceId)
  return log.append({
    turn: state.turn,
    type: 'intel_resolved',
    actors: [item.sourceId, item.targetInstanceId],
    summary:
      outcome === 'harmed'
        ? `${source.name} 那条情报是错的。${detail}`
        : outcome === 'helped'
          ? `${source.name} 那条情报是对的。${detail}`
          : detail,
    tone: outcome === 'harmed' ? 'bad' : outcome === 'helped' ? 'good' : 'neutral',
    payload: { intelId, outcome, truth: item.truth },
    causedBy: causedBy ?? item.eventId,
  })
}

// ── Observed reliability (§8.2) ────────────────────────────────────────────

export interface ObservedRecord {
  offered: number
  accurate: number
  wrong: number
  /** Acted on, but nothing about it was ever demonstrated either way. */
  inconclusive: number
  pending: number
  spent: number
  /** null until at least one tip has actually proved itself. */
  accuracy: number | null
}

/**
 * Derived purely from what the player has *witnessed* — it reads `outcome`
 * and never `truth`. This distinction is the whole point of §6: a lie that
 * happened to work out is not something the player saw, so it must not show
 * up here as a mark against the source. An untested informant reads as
 * unknown, which is correct and is the tension of the early game.
 */
/**
 * How the player should feel about a source, from witnessed outcomes only.
 * Deliberately conservative: one hit and one miss is *not* a good record, and
 * an untested source reads as unknown rather than safe.
 */
export function reputationTone(
  record: Pick<ObservedRecord, 'accurate' | 'wrong' | 'accuracy'>,
): 'good' | 'bad' | 'neutral' {
  if (record.accuracy === null) return 'neutral'
  const proved = record.accurate + record.wrong
  if (proved >= 2 && record.accuracy >= 0.75) return 'good'
  if (record.accuracy <= 0.5 && record.wrong > 0) return 'bad'
  return 'neutral'
}

export function observedReliability(
  state: GameState,
  informantId: string,
): ObservedRecord {
  const items = state.intel.filter((i) => i.sourceId === informantId)
  const accurate = items.filter((i) => i.outcome === 'helped').length
  const wrong = items.filter((i) => i.outcome === 'harmed').length
  const inconclusive = items.filter((i) => i.outcome === 'inconclusive').length
  const proved = accurate + wrong
  const record = getInformant(state, informantId)
  return {
    offered: items.length,
    accurate,
    wrong,
    inconclusive,
    pending: items.filter((i) => !i.resolved).length,
    spent: record?.totalSpent ?? 0,
    accuracy: proved === 0 ? null : accurate / proved,
  }
}
