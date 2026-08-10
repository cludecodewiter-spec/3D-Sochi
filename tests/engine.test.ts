import { describe, expect, it } from 'vitest'
import { Rng } from '../src/engine/rng.js'
import { EventLog } from '../src/engine/events.js'
import { deserialize, fromJSON, serialize, toJSON } from '../src/engine/save.js'
import { newGame } from '../src/systems/game.js'

describe('Rng', () => {
  it('is fully reproducible from a seed', () => {
    const a = new Rng(1234)
    const b = new Rng(1234)
    const left = Array.from({ length: 50 }, () => a.next())
    const right = Array.from({ length: 50 }, () => b.next())
    expect(left).toEqual(right)
  })

  it('restores from { seed, step } in O(1) without replaying', () => {
    const original = new Rng(99)
    for (let i = 0; i < 40; i++) original.next()
    const restored = Rng.from(original.state)
    expect(restored.next()).toBe(new Rng(99, 40).next())
  })

  it('produces different streams for different seeds', () => {
    const a = Array.from({ length: 20 }, (_, i) => new Rng(i).next())
    expect(new Set(a).size).toBe(a.length)
  })

  it('stays inside [0, 1)', () => {
    const rng = new Rng(7)
    for (let i = 0; i < 5_000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('int() covers the full inclusive range', () => {
    const rng = new Rng(3)
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) seen.add(rng.int(1, 6))
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('named forks are stable and independent', () => {
    const parent = new Rng(5)
    expect(parent.fork('intel').next()).toBe(new Rng(5).fork('intel').next())
    expect(parent.fork('intel').next()).not.toBe(parent.fork('heat').next())
  })
})

describe('EventLog', () => {
  it('walks the causal chain downward', () => {
    const log = new EventLog()
    const root = log.append({
      turn: 1, type: 'intel_received', actors: ['benny'],
      summary: '情报', tone: 'neutral', payload: {},
    })
    const child = log.append({
      turn: 1, type: 'heist_start', actors: [],
      summary: '下手', tone: 'neutral', payload: {}, causedBy: root.id,
    })
    log.append({
      turn: 1, type: 'injury', actors: ['marco'],
      summary: '中枪', tone: 'bad', payload: {}, causedBy: child.id,
    })

    expect(log.children(root.id)).toHaveLength(1)
    expect(log.descendants(root.id).map((e) => e.type)).toEqual(['heist_start', 'injury'])
  })

  it('walks the causal chain upward', () => {
    const log = new EventLog()
    const a = log.append({ turn: 1, type: 'intel_received', actors: [], summary: 'a', tone: 'neutral', payload: {} })
    const b = log.append({ turn: 1, type: 'heist_start', actors: [], summary: 'b', tone: 'neutral', payload: {}, causedBy: a.id })
    const c = log.append({ turn: 1, type: 'injury', actors: [], summary: 'c', tone: 'bad', payload: {}, causedBy: b.id })
    expect(log.ancestry(c.id).map((e) => e.summary)).toEqual(['b', 'a'])
  })

  it('finds the most recent bad event for an actor (the recall bar)', () => {
    const log = new EventLog()
    log.append({ turn: 1, type: 'intel_resolved', actors: ['benny'], summary: '第一次就坑了你', tone: 'bad', payload: {} })
    log.append({ turn: 5, type: 'intel_resolved', actors: ['rosa'], summary: '罗莎的事', tone: 'bad', payload: {} })
    log.append({ turn: 9, type: 'intel_resolved', actors: ['benny'], summary: 'Marco 中了一枪', tone: 'bad', payload: {} })
    expect(log.lastBad('benny')?.summary).toBe('Marco 中了一枪')
    expect(log.lastBad('teo')).toBeUndefined()
  })

  it('assigns sequential ids so saves are byte-stable', () => {
    const log = new EventLog()
    const ids = [0, 1, 2].map(() =>
      log.append({ turn: 1, type: 'turn_start', actors: [], summary: '', tone: 'neutral', payload: {} }).id,
    )
    expect(ids).toEqual(['e0', 'e1', 'e2'])
  })
})

describe('save round-trip', () => {
  it('restores state and log identically', () => {
    const session = newGame({ seed: 4242 })
    session.state.cash = 777
    session.state.wanted = { base: 4, current: 27, locked: false }
    const restored = deserialize(serialize(session))

    expect(restored.state).toEqual(session.state)
    expect(restored.log.toJSON()).toEqual(session.log.toJSON())
    expect(restored.rng.state).toEqual(session.rng.state)
  })

  it('survives a JSON round-trip and keeps the RNG on the same step', () => {
    const session = newGame({ seed: 8 })
    for (let i = 0; i < 12; i++) session.rng.next()
    const restored = fromJSON(toJSON(session))
    expect(restored.rng.next()).toBe(session.rng.next())
  })

  it('rejects malformed saves instead of silently starting over', () => {
    expect(() => fromJSON('not json')).toThrow(/JSON/)
    expect(() => fromJSON('{"version":1}')).toThrow(/结构/)
  })
})
