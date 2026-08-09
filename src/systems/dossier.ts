/**
 * The dossier — a *derived index*, never a second store. DESIGN_v12.md §9.2.
 *
 * This is the architectural pivot of the whole project. Because entries are
 * computed from the event log on demand, "每一条记录都自动关联到它导致的后果"
 * is a graph walk over `causedBy` rather than a parallel data structure
 * somebody has to remember to update. There is no way for the dossier to
 * disagree with what actually happened — they are the same data.
 */

import type { EventLog, GameEvent } from '../engine/events.js'
import type { GameState } from '../engine/state.js'
import { getInformant } from '../engine/state.js'
import { CASEFILE_THRESHOLD } from '../content/balance.js'
import { DIFFICULTIES } from '../content/balance.js'
import { INFORMANTS, informantDef } from '../content/informants.js'
import { vehicleDef } from '../content/vehicles.js'
import { observedReliability } from './intel.js'
import { heatOf, tierFor } from './heat.js'

export interface CausalNode {
  event: GameEvent
  depth: number
}

/** Flattened `causedBy` tree, ready to render with indentation. */
export function causalTree(log: EventLog, rootId: string, maxDepth = 4): CausalNode[] {
  const out: CausalNode[] = []
  const walk = (id: string, depth: number): void => {
    if (depth > maxDepth) return
    for (const child of log.children(id)) {
      out.push({ event: child, depth })
      walk(child.id, depth + 1)
    }
  }
  walk(rootId, 1)
  return out
}

export interface IntelEntry {
  intelId: string
  turn: number
  text: string
  /**
   * Mirrors `IntelItem.outcome` — what the player saw, never the hidden truth.
   * `inconclusive` is a real and common verdict: acted on, and still unproven.
   */
  verdict: 'accurate' | 'wrong' | 'inconclusive' | 'pending'
  consequences: CausalNode[]
}

export interface InformantEntry {
  id: string
  name: string
  role: string
  met: boolean
  firstContactTurn: number | null
  relationship: number
  totalSpent: number
  offered: number
  accurate: number
  wrong: number
  inconclusive: number
  pending: number
  /** Hidden on hardcore. §8.2 — this is a *disclosure* setting, not a triage aid. */
  accuracy: number | null
  intel: IntelEntry[]
  /** The most recent thing that went wrong because of them. */
  lastBad: GameEvent | undefined
}

export function informantEntries(state: GameState, log: EventLog): InformantEntry[] {
  const showScore = DIFFICULTIES[state.difficulty].showReliabilityScore
  return INFORMANTS.filter((def) => getInformant(state, def.id)?.met).map((def) => {
    const record = getInformant(state, def.id)
    const observed = observedReliability(state, def.id)
    const intel: IntelEntry[] = state.intel
      .filter((i) => i.sourceId === def.id)
      .map((i) => ({
        intelId: i.id,
        turn: i.receivedTurn,
        text: i.text,
        verdict: !i.resolved
          ? 'pending'
          : i.outcome === 'helped'
            ? 'accurate'
            : i.outcome === 'harmed'
              ? 'wrong'
              : 'inconclusive',
        consequences: causalTree(log, i.eventId),
      }))

    return {
      id: def.id,
      name: def.name,
      role: def.role,
      met: true,
      firstContactTurn: record?.firstContactTurn ?? null,
      relationship: record?.relationship ?? 0,
      totalSpent: observed.spent,
      offered: observed.offered,
      accurate: observed.accurate,
      wrong: observed.wrong,
      inconclusive: observed.inconclusive,
      pending: observed.pending,
      accuracy: showScore ? observed.accuracy : null,
      intel,
      lastBad: log.lastBad(def.id),
    }
  })
}

export interface VehicleEntry {
  defId: string
  name: string
  year: number
  era: string
  outcome: 'stolen' | 'failed' | 'sold' | 'untouched'
  events: GameEvent[]
}

export function vehicleEntries(log: EventLog): VehicleEntry[] {
  const seen = new Map<string, GameEvent[]>()
  for (const event of log.all()) {
    for (const actor of event.actors) {
      try {
        vehicleDef(actor)
      } catch {
        continue
      }
      const list = seen.get(actor) ?? []
      list.push(event)
      seen.set(actor, list)
    }
  }
  return [...seen.entries()].map(([defId, events]) => {
    const def = vehicleDef(defId)
    const sold = events.some((e) => e.type === 'sale')
    const stolen = events.some(
      (e) => e.type === 'heist_result' && e.payload['result'] === 'success',
    )
    // Buying a tip about a car is not the same as having gone after it.
    const attempted = events.some((e) => e.type === 'heist_result')
    return {
      defId,
      name: def.name,
      year: def.year,
      era: def.era,
      outcome: sold ? 'sold' : stolen ? 'stolen' : attempted ? 'failed' : 'untouched',
      events,
    }
  })
}

/**
 * §5.4 — at 专案 the player starts reading their own police file, filling in
 * line by line as heat climbs. Pressure as a document, not a progress bar.
 */
export interface CaseFile {
  visible: boolean
  tier: string
  heat: number
  entries: string[]
}

export function caseFile(state: GameState, log: EventLog): CaseFile {
  const visible = heatOf(state) >= CASEFILE_THRESHOLD
  if (!visible) {
    return { visible, tier: tierFor(heatOf(state)).label, heat: heatOf(state), entries: [] }
  }
  const entries = log
    .byType('heist_result', 'sale', 'heat_change')
    .filter((e) => e.tone === 'bad' || e.type === 'sale')
    .slice(-12)
    .map((e) => `第 ${e.turn} 天 —— ${e.summary}`)
  return { visible, tier: tierFor(heatOf(state)).label, heat: heatOf(state), entries }
}

/**
 * The recall bar: "你上次信 Benny 的话，Marco 中了一枪。"
 * Zero interaction cost, surfaced exactly when the player touches that actor.
 */
export function recall(log: EventLog, actorId: string): string | null {
  const event = log.lastBad(actorId)
  if (!event) return null
  try {
    return `你上次跟 ${informantDef(actorId).name} 打交道：${event.summary}`
  } catch {
    return `上次：${event.summary}`
  }
}

/** One card per turn, kept forever. Also the raw material for the ending montage. */
export interface DayCard {
  turn: number
  events: GameEvent[]
  cashDelta: number
  headline: string
}

export function dayCards(log: EventLog): DayCard[] {
  const byTurn = new Map<number, GameEvent[]>()
  for (const event of log.all()) {
    const list = byTurn.get(event.turn) ?? []
    list.push(event)
    byTurn.set(event.turn, list)
  }
  return [...byTurn.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([turn, events]) => {
      const cashDelta = events.reduce((sum, e) => {
        const payout = e.type === 'sale' ? Number(e.payload['payout'] ?? 0) : 0
        const paid = e.type === 'debt_payment' ? -Number(e.payload['paid'] ?? 0) : 0
        const cost = e.type === 'intel_received' ? -Number(e.payload['cost'] ?? 0) : 0
        const fee = e.type === 'intel_verified' ? -Number(e.payload['fee'] ?? 0) : 0
        return sum + payout + paid + cost + fee
      }, 0)
      const notable =
        events.find((e) => e.tone === 'bad') ??
        events.find((e) => e.tone === 'good') ??
        events[0]
      return {
        turn,
        events,
        cashDelta,
        headline: notable?.summary ?? '什么都没发生。',
      }
    })
}
