/**
 * The event log. DESIGN_v12.md §9.1 — this is the architectural pivot.
 *
 * One log feeds four consumers:
 *   save file      (log + rng seed rebuilds everything)
 *   dossier        (group by actor, walk `causedBy`)
 *   "上次怎么了" bar (most recent bad event for an actor)
 *   ending montage (high-impact events rendered as newspaper clippings)
 *
 * Because the dossier is *derived* rather than stored, "this tip led to
 * Marco getting shot" is a graph walk instead of a second data structure
 * somebody has to keep in sync.
 */

export type EventType =
  | 'turn_start'
  | 'turn_end'
  | 'heist_start'
  | 'heist_segment'
  | 'heist_result'
  | 'intel_received'
  | 'intel_verified'
  | 'intel_resolved'
  | 'sale'
  | 'debt_notice'
  | 'debt_payment'
  | 'debt_default'
  | 'injury'
  | 'heat_change'
  | 'unlock'
  | 'advisor'
  | 'difficulty_change'

export type Tone = 'neutral' | 'good' | 'bad'

export interface GameEvent {
  id: string
  turn: number
  type: EventType
  /** Entity ids this event touches: informants, crew, vehicles, locations. */
  actors: string[]
  /** One-line Chinese summary. The dossier and the recall bar render this directly. */
  summary: string
  tone: Tone
  payload: Record<string, unknown>
  /** Points at the event that caused this one. Builds the causal chain. */
  causedBy?: string
}

export type NewEvent = Omit<GameEvent, 'id'>

export class EventLog {
  #events: GameEvent[] = []
  #counter = 0

  static hydrate(events: readonly GameEvent[]): EventLog {
    const log = new EventLog()
    log.#events = events.map((e) => ({ ...e, actors: [...e.actors] }))
    log.#counter = events.length
    return log
  }

  /** Ids are sequential (`e0`, `e1`, …) so save round-trips are byte-stable. */
  append(event: NewEvent): GameEvent {
    const stored: GameEvent = { ...event, id: `e${this.#counter++}` }
    this.#events.push(stored)
    return stored
  }

  all(): readonly GameEvent[] {
    return this.#events
  }

  get size(): number {
    return this.#events.length
  }

  byId(id: string): GameEvent | undefined {
    return this.#events.find((e) => e.id === id)
  }

  byActor(actorId: string): GameEvent[] {
    return this.#events.filter((e) => e.actors.includes(actorId))
  }

  byType(...types: EventType[]): GameEvent[] {
    return this.#events.filter((e) => types.includes(e.type))
  }

  byTurn(turn: number): GameEvent[] {
    return this.#events.filter((e) => e.turn === turn)
  }

  /** Direct consequences of an event. */
  children(eventId: string): GameEvent[] {
    return this.#events.filter((e) => e.causedBy === eventId)
  }

  /**
   * Every downstream consequence, depth-first. This is what renders the
   * indented "你执行了偷车 └─ Marco 中枪" block in the dossier.
   */
  descendants(eventId: string): GameEvent[] {
    const out: GameEvent[] = []
    const visit = (id: string): void => {
      for (const child of this.children(id)) {
        out.push(child)
        visit(child.id)
      }
    }
    visit(eventId)
    return out
  }

  /** Walks up to the root cause. Answers "why did this happen to me?" */
  ancestry(eventId: string): GameEvent[] {
    const out: GameEvent[] = []
    let current = this.byId(eventId)
    while (current?.causedBy) {
      const parent = this.byId(current.causedBy)
      if (!parent) break
      out.push(parent)
      current = parent
    }
    return out
  }

  /**
   * Powers the recall bar: "你上次信 Benny 的话，Marco 中了一枪。"
   * Zero interaction cost, surfaced exactly when the player touches that actor.
   */
  lastBad(actorId: string): GameEvent | undefined {
    for (let i = this.#events.length - 1; i >= 0; i--) {
      const e = this.#events[i] as GameEvent
      if (e.tone === 'bad' && e.actors.includes(actorId)) return e
    }
    return undefined
  }

  toJSON(): GameEvent[] {
    return this.#events
  }
}
