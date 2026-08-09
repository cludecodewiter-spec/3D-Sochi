/**
 * Regression tests for the bug-hunt pass.
 *
 * Each block names the defect it pins down. The existing suites all followed
 * the happy path; these deliberately walk the edges and the failure paths,
 * because that is where every one of these bugs was hiding.
 */

import { describe, expect, it } from 'vitest'
import { EventLog } from '../src/engine/events.js'
import { Rng } from '../src/engine/rng.js'
import { createInitialState } from '../src/engine/state.js'
import type { GameState } from '../src/engine/state.js'
import type { Session } from '../src/engine/save.js'
import { deserialize, serialize } from '../src/engine/save.js'
import {
  ActionError,
  buyIntel,
  chooseHeistOption,
  endTurn,
  fence,
  newGame,
  rest,
  scout,
  startHeist,
} from '../src/systems/game.js'
import { offerIntel, observedReliability, reputationTone } from '../src/systems/intel.js'
import { informantEntries, vehicleEntries } from '../src/systems/dossier.js'
import { addHeat, bribe } from '../src/systems/heat.js'
import { endTurn as advanceTurn } from '../src/systems/turn.js'
import { injure } from '../src/systems/heist.js'
import { FormRotation } from '../src/ui/docs/index.js'
import { TUTORIAL_TARGET } from '../src/content/script.js'

const TUTORIAL = `t-${TUTORIAL_TARGET}`
const HOPELESS = 't-aureon_solace_14'

function ready(seed: number): Session {
  const session = newGame({ seed })
  session.state.unlocked.push('informants', 'verify')
  session.state.cash = 20_000
  session.state.turn = 4 // past the tutorial, so no Solomon assist skews checks
  session.state.ap = 3
  return session
}

const verdictOf = (session: Session, intelId: string): string | undefined =>
  informantEntries(session.state, session.log)
    .flatMap((p) => p.intel)
    .find((i) => i.intelId === intelId)?.verdict

/**
 * Runs the hopeless car until the wire fails at the breach — the one stage a
 * 2014 immobiliser guarantees. It is 95% per attempt, so we walk seeds rather
 * than trust a single one; the search is fixed, so the test stays deterministic.
 */
function stoppedAtBreach(prepare: (session: Session) => void): Session {
  for (let seed = 1; seed <= 60; seed++) {
    const session = ready(seed)
    prepare(session)
    startHeist(session, HOPELESS)
    const lines = play(session, ['patient', 'shadow', 'wire'])
    if (lines.some((l) => l.includes('电脑'))) return session
  }
  throw new Error('没有找到在破解阶段收场的种子')
}

function play(session: Session, plan: string[]): string[] {
  const lines: string[] = []
  for (const optionId of plan) {
    const result = chooseHeistOption(session, optionId)
    lines.push(result.text, ...result.epilogue)
    if (result.outcome) break
  }
  return lines
}

// ── B1 ────────────────────────────────────────────────────────────────────

describe('B1 · the dossier reports what was seen, never the hidden truth', () => {
  it('does not mark a lie the player got away with', () => {
    // A false tip, a clean getaway. Nothing contradicted him, so nothing may
    // appear against him — this is the case the old code leaked outright.
    let checked = 0
    for (let seed = 1; seed <= 40 && checked < 3; seed++) {
      const session = ready(seed)
      const lie = offerIntel(session.state, session.log, session.rng, 'benny', TUTORIAL, {
        segmentId: 'recon',
        forcedTruth: 'false',
      })
      session.state.marco.skills = {
        stealth: 100, mechanical: 100, electronic: 100, driving: 100, nerve: 100,
      }
      startHeist(session, TUTORIAL)
      const lines = play(session, ['patient', 'shadow', 'wire', 'calm'])
      if (!lines.some((l) => l.includes('在你手上'))) continue

      checked++
      expect(verdictOf(session, lie.id)).toBe('accurate')
      const observed = observedReliability(session.state, 'benny')
      expect(observed.wrong).toBe(0)
      expect(observed.accurate).toBe(1)
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('marks it the moment the ambush actually fires', () => {
    let found = false
    for (let seed = 1; seed <= 60 && !found; seed++) {
      const session = ready(seed)
      const lie = offerIntel(session.state, session.log, session.rng, 'benny', TUTORIAL, {
        segmentId: 'approach',
        forcedTruth: 'false',
      })
      session.state.marco.skills.driving = 5
      session.state.marco.skills.nerve = 5
      startHeist(session, TUTORIAL)
      const lines = play(session, ['patient', 'casual', 'column', 'floor'])
      if (!lines.some((l) => l.includes('本来就在等你'))) continue

      found = true
      expect(verdictOf(session, lie.id)).toBe('wrong')
      expect(observedReliability(session.state, 'benny').wrong).toBe(1)
    }
    expect(found).toBe(true)
  })

  it('says 说不好 for a tip whose stage the run never reached', () => {
    // Intel about the getaway from a car that cannot be opened at all.
    let tipId = ''
    const session = stoppedAtBreach((s) => {
      tipId = offerIntel(s.state, s.log, s.rng, 'rosa', HOPELESS, {
        segmentId: 'escape',
        forcedTruth: 'true',
      }).id
    })
    const tip = { id: tipId }

    expect(session.state.activeRun).toBeNull()
    expect(verdictOf(session, tip.id)).toBe('inconclusive')
    const observed = observedReliability(session.state, 'rosa')
    expect(observed.accurate).toBe(0)
    expect(observed.wrong).toBe(0)
    expect(observed.inconclusive).toBe(1)
  })

  it('does not blame an honest source for a bad roll', () => {
    // True intel covering the very stage the job died on. Reality never
    // contradicted him — he just could not save the player from the dice.
    let tipId = ''
    const session = stoppedAtBreach((s) => {
      tipId = offerIntel(s.state, s.log, s.rng, 'rosa', HOPELESS, {
        segmentId: 'breach',
        forcedTruth: 'true',
      }).id
    })
    expect(verdictOf(session, tipId)).toBe('inconclusive')
    expect(observedReliability(session.state, 'rosa').wrong).toBe(0)
  })

  it('leaves tips unresolved when the player walks away', () => {
    const session = ready(5)
    const tip = offerIntel(session.state, session.log, session.rng, 'teo', TUTORIAL, {
      segmentId: 'recon',
    })
    startHeist(session, TUTORIAL)
    chooseHeistOption(session, 'patient')
    expect(verdictOf(session, tip.id)).toBe('pending')
    expect(observedReliability(session.state, 'teo').pending).toBe(1)
  })

  it('keeps an untested source unknown rather than safe', () => {
    const session = ready(5)
    offerIntel(session.state, session.log, session.rng, 'marcus', TUTORIAL, {
      segmentId: 'recon',
    })
    const observed = observedReliability(session.state, 'marcus')
    expect(observed.accuracy).toBeNull()
    expect(reputationTone(observed)).toBe('neutral')
  })

  it('needs two proven tips before calling anyone reliable', () => {
    expect(reputationTone({ accurate: 1, wrong: 0, accuracy: 1 })).toBe('neutral')
    expect(reputationTone({ accurate: 2, wrong: 0, accuracy: 1 })).toBe('good')
    expect(reputationTone({ accurate: 1, wrong: 1, accuracy: 0.5 })).toBe('bad')
  })
})

// ── B3 ────────────────────────────────────────────────────────────────────

describe('B3 · injuries tick exactly once a day', () => {
  const injured = (): GameState => {
    const state = createInitialState()
    state.marco.injuryTurns = 2
    return state
  }

  it('resting does not heal twice', () => {
    const session = newGame({ seed: 2 })
    injure(session.state, session.log, 2)
    rest(session)
    endTurn(session)
    expect(session.state.marco.injuryTurns).toBe(1)
  })

  it('still reports the recovery on the turn it lands', () => {
    const state = injured()
    state.marco.injuryTurns = 1
    const log = new EventLog()
    expect(advanceTurn(state, log).recovered).toBe(true)
  })

  it('and resting on that same day does not swallow the notice', () => {
    const session = newGame({ seed: 2 })
    injure(session.state, session.log, 1)
    rest(session)
    expect(endTurn(session).recovered).toBe(true)
  })

  it('buys extra cooling instead', () => {
    const session = newGame({ seed: 2 })
    session.state.wanted.current = 40
    rest(session)
    expect(session.state.wanted.current).toBeLessThan(40)
  })
})

// ── B4 ────────────────────────────────────────────────────────────────────

describe('B4 · nothing else happens while a job is running', () => {
  const midHeist = (): Session => {
    const session = ready(3)
    session.state.garage.push({
      instanceId: 'g1', defId: 'delano_wagon_79', condition: 90, acquiredTurn: 1,
    })
    session.state.unlocked.push('fence')
    startHeist(session, TUTORIAL)
    session.state.ap = 3
    return session
  }

  it('refuses scouting', () => {
    expect(() => scout(midHeist(), TUTORIAL, 'breach')).toThrow(ActionError)
  })

  it('refuses buying intel', () => {
    expect(() => buyIntel(midHeist(), 'benny', TUTORIAL)).toThrow(ActionError)
  })

  it('refuses fencing', () => {
    expect(() => fence(midHeist(), 'g1', 'chop')).toThrow(ActionError)
  })

  it('refuses resting', () => {
    expect(() => rest(midHeist())).toThrow(ActionError)
  })
})

// ── B6 ────────────────────────────────────────────────────────────────────

describe('B6 · a save carries everything the screen shows', () => {
  it('keeps the chosen name', () => {
    const session = newGame({ seed: 4, playerName: 'SALVATORE' })
    expect(deserialize(serialize(session)).state.playerName).toBe('SALVATORE')
  })

  it('keeps what each tip proved', () => {
    let tipId = ''
    const session = stoppedAtBreach((s) => {
      tipId = offerIntel(s.state, s.log, s.rng, 'rosa', HOPELESS, {
        segmentId: 'escape',
        forcedTruth: 'true',
      }).id
    })
    const restored = deserialize(serialize(session))
    expect(restored.state.intel.find((i) => i.id === tipId)?.outcome).toBe('inconclusive')
    expect(verdictOf(restored, tipId)).toBe('inconclusive')
  })
})

// ── 双段通缉度（CLAUDE.md §3.3）────────────────────────────────────────────

describe('通缉度是双段的，不是一个数', () => {
  it('普通热度只进累积段，会自然衰减', () => {
    const state = createInitialState()
    const log = new EventLog()
    addHeat(state, log, 20, '偷了一辆车')
    expect(state.wanted).toMatchObject({ base: 0, current: 20 })
    advanceTurn(state, log)
    expect(state.wanted.current).toBeLessThan(20)
    expect(state.wanted.base).toBe(0)
  })

  it('重案进底案，衰减不掉它', () => {
    const state = createInitialState()
    const log = new EventLog()
    addHeat(state, log, 12, '有人看清了你', { permanent: true })
    expect(state.wanted).toMatchObject({ base: 12, current: 0 })
    for (let i = 0; i < 10; i++) advanceTurn(state, log)
    expect(state.wanted.base).toBe(12)
  })

  it('贿赂只砍累积段，底案分毫不动', () => {
    const state = createInitialState()
    const log = new EventLog()
    state.cash = 20_000
    state.wanted = { base: 15, current: 40, locked: false }
    expect(bribe(state, log, 10_000, 0)).toBe(true) // roll 0 ⇒ 必成
    expect(state.wanted.base).toBe(15)
    expect(state.wanted.current).toBe(20)
  })

  it('贿赂失败也要把钱扣掉', () => {
    const state = createInitialState()
    const log = new EventLog()
    state.cash = 20_000
    state.wanted = { base: 0, current: 40, locked: false }
    expect(bribe(state, log, 1_000, 0.99)).toBe(false)
    expect(state.cash).toBe(19_000)
    expect(state.wanted.current).toBe(40)
  })

  it('拒收负数金额——原型那版能靠这个白拿钱', () => {
    const state = createInitialState()
    const log = new EventLog()
    state.cash = 1_000
    expect(() => bribe(state, log, -5_000, 0)).toThrow()
    expect(state.cash).toBe(1_000)
  })

  it('付不起就不许付', () => {
    const state = createInitialState()
    state.cash = 100
    expect(() => bribe(state, new EventLog(), 5_000, 0)).toThrow()
    expect(state.cash).toBe(100)
  })

  it('总值过 90 触发区域封锁，降下来自动解除', () => {
    const state = createInitialState()
    const log = new EventLog()
    addHeat(state, log, 95, '一连串的事')
    expect(state.wanted.locked).toBe(true)
    addHeat(state, log, -40, '风头过去了')
    expect(state.wanted.locked).toBe(false)
  })

  it('v1 存档能迁移过来：旧的 heat 全部算作累积段', () => {
    const legacy = {
      version: 1,
      createdAt: new Date().toISOString(),
      rng: { seed: 1, step: 0 },
      state: { ...createInitialState(), heat: 33, wanted: undefined },
      log: [],
    }
    delete (legacy.state as Record<string, unknown>)['wanted']
    const restored = deserialize(legacy as never)
    expect(restored.state.wanted).toEqual({ base: 0, current: 33, locked: false })
    expect(restored.state.playerName).toBe('MARCO')
  })
})

// ── B11 ───────────────────────────────────────────────────────────────────

describe('B11 · the dossier tells apart "never touched" from "failed"', () => {
  it('does not call a car a failure just because you asked about it', () => {
    const session = ready(8)
    offerIntel(session.state, session.log, session.rng, 'rosa', TUTORIAL, {
      segmentId: 'recon',
    })
    const entry = vehicleEntries(session.log).find((v) => v.defId === TUTORIAL_TARGET)
    expect(entry?.outcome).toBe('untouched')
  })

  it('calls it a failure once the job actually went wrong', () => {
    const session = stoppedAtBreach(() => {})
    const entry = vehicleEntries(session.log).find((v) => v.defId === 'aureon_solace_14')
    expect(entry?.outcome).toBe('failed')
  })
})

// ── B10 ───────────────────────────────────────────────────────────────────

describe('B10 · the §10 variety rule is actually checked', () => {
  it('flags a run of identical document forms', () => {
    const rotation = new FormRotation()
    for (const turn of [1, 2, 3]) rotation.record(turn, 'ledger')
    expect(rotation.varietyIn(3)).toBe(1)
  })

  it('passes once two forms appear inside the window', () => {
    const rotation = new FormRotation()
    rotation.record(1, 'ledger')
    rotation.record(2, 'calllog')
    rotation.record(3, 'ledger')
    expect(rotation.varietyIn(3)).toBeGreaterThanOrEqual(2)
  })

  it('only looks at the trailing window', () => {
    const rotation = new FormRotation()
    rotation.record(1, 'note')
    rotation.record(8, 'ledger')
    rotation.record(9, 'ledger')
    expect(rotation.varietyIn(9)).toBe(1)
  })
})

// ── determinism, re-checked with the new fields in place ──────────────────

describe('the same seed still produces the same game', () => {
  it('byte for byte, including intel outcomes', () => {
    const run = (): string => {
      const session = ready(1234)
      offerIntel(session.state, session.log, new Rng(7), 'benny', TUTORIAL, {
        segmentId: 'recon',
      })
      startHeist(session, TUTORIAL)
      play(session, ['patient', 'shadow', 'wire', 'calm'])
      advanceTurn(session.state, session.log)
      return JSON.stringify({ state: session.state, log: session.log.toJSON() })
    }
    expect(run()).toBe(run())
  })
})
