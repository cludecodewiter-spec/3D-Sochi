/**
 * 被发现之后 —— 判定链上此前缺的一整层。
 *
 * 这一组测试守住三条设计承诺：
 *   1. 失手不等于回家。处理掉撞见你的人，这一趟还能接着干
 *   2. 手上没枪，「灭口」和「开枪」不该出现在任何一个界面上
 *   3. 第三次进局子是无期，而且它是终局
 */

import { describe, expect, it } from 'vitest'
import type { Session } from '../src/engine/save.js'
import { Rng } from '../src/engine/rng.js'
import {
  currentIncident,
  endTurn,
  handleIncident,
  newGame,
  startCrime,
  chooseCrimeOption,
} from '../src/systems/game.js'
import {
  DISCOVERY,
  arrest,
  failureIncident,
  incidentView,
  raiseIncident,
  resolveIncident,
} from '../src/systems/incident.js'
import { INCIDENTS, SENTENCES, STRIKES_TO_LIFE } from '../src/content/incidents.js'
import { wantedTotal } from '../src/engine/state.js'
import type { SegmentRunState } from '../src/engine/state.js'
import type { StepResult } from '../src/systems/segment-run.js'

const ready = (seed: number): Session => {
  const session = newGame({ seed })
  session.state.unlocked.push('crimes')
  session.state.turn = 20
  session.state.ap = 3
  return session
}

const fakeRun = (noise: number): SegmentRunState => ({
  configId: 'burgle',
  contextId: 'houses_west',
  segmentIndex: 1,
  vars: { noise },
  history: [],
  loot: [],
  startedEventId: 'e1',
  finished: null,
})

const fakeStep = (over: Partial<StepResult>): StepResult =>
  ({
    option: { id: 'x' },
    success: false,
    probability: 0.5,
    roll: 0.9,
    text: '',
    brokeRule: null,
    outcome: null,
    vars: {},
    ...over,
  }) as StepResult

// ── 触发 ──────────────────────────────────────────────────────────────────

describe('what gets you noticed', () => {
  it('never fires on a clean step', () => {
    const rng = new Rng(1)
    for (let i = 0; i < 200; i++) {
      expect(failureIncident(fakeRun(50), fakeStep({ success: true }), rng)).toBeNull()
    }
  })

  it('sends the police, not a passer-by, when the noise blows the roof off', () => {
    const rng = new Rng(2)
    expect(failureIncident(fakeRun(95), fakeStep({}), rng)).toBe('police')
    expect(failureIncident(fakeRun(0), fakeStep({ brokeRule: '有人在喊。' }), rng)).toBe('police')
  })

  it('is likelier the louder you were', () => {
    const count = (noise: number): number => {
      const rng = new Rng(7)
      let seen = 0
      for (let i = 0; i < 400; i++) if (failureIncident(fakeRun(noise), fakeStep({}), rng)) seen++
      return seen
    }
    expect(count(80)).toBeGreaterThan(count(0))
    // 而且从来不是必然的——安静地搞砸一步，多数时候没人看见。
    expect(count(0)).toBeLessThan(400 * DISCOVERY.ceiling)
  })
})

// ── 没枪就没有那两条路 ────────────────────────────────────────────────────

describe('options you do not have', () => {
  it('hides every armed option while Marco is unarmed', () => {
    const session = ready(3)
    expect(session.state.marco.armed).toBe(false)

    for (const kind of ['witness', 'police'] as const) {
      raiseIncident(session.state, session.log, session.rng, kind)
      const shown = incidentView(session.state).options.map((o) => o.id)
      const armed = INCIDENTS[kind].options.filter((o) => o.needsWeapon).map((o) => o.id)
      expect(armed.length).toBeGreaterThan(0)
      for (const id of armed) expect(shown).not.toContain(id)
      session.state.incident = null
    }
  })

  it('refuses an armed option even if something asks for it by id', () => {
    const session = ready(3)
    raiseIncident(session.state, session.log, session.rng, 'witness')
    expect(() => resolveIncident(session.state, session.log, session.rng, 'silence')).toThrow()
  })

  it('offers them once a gun is in his pocket', () => {
    const session = ready(3)
    session.state.marco.armed = true
    raiseIncident(session.state, session.log, session.rng, 'police')
    expect(incidentView(session.state).options.map((o) => o.id)).toContain('fight')
  })

  it('greys out the bribe he cannot pay instead of hiding it', () => {
    const session = ready(3)
    session.state.cash = 10
    raiseIncident(session.state, session.log, session.rng, 'witness')
    const bribe = incidentView(session.state).options.find((o) => o.id === 'bribe')
    expect(bribe?.disabled).toBe(true)
    expect(bribe?.disabledWhy).toContain('400')
  })
})

// ── 一次失败不等于回去了 ──────────────────────────────────────────────────

describe('a botched step is not the end of the job', () => {
  it('leaves the run open when the incident is dealt with mid-job', () => {
    // 撞见你的时候这一趟还没结束：处理掉，接着干。
    const session = ready(11)
    startCrime(session, 'houses_west', 'burgle')
    chooseCrimeOption(session, 'mail')
    session.state.activeRun!.finished = null
    session.state.activeRun!.segmentIndex = 1
    raiseIncident(session.state, session.log, session.rng, 'camera')

    expect(currentIncident(session).runEnded).toBe(false)
    const done = handleIncident(session, 'ignore')
    expect(done.runOver).toBe(false)
    expect(session.state.incident).toBeNull()
    expect(session.state.activeRun).not.toBeNull()
  })

  it('closes the job when the incident lands after it already fell apart', () => {
    const session = ready(11)
    startCrime(session, 'houses_west', 'burgle')
    const run = session.state.activeRun!
    run.finished = { result: 'failure', atSegmentIndex: 2 }
    raiseIncident(session.state, session.log, session.rng, 'witness')

    expect(currentIncident(session).runEnded).toBe(true)
    const done = handleIncident(session, 'run')
    expect(done.runOver).toBe(true)
    expect(session.state.activeRun).toBeNull()
  })

  it('turns walking away into a real cost, not a free exit', () => {
    const session = ready(11)
    startCrime(session, 'houses_west', 'burgle')
    session.state.activeRun!.segmentIndex = 1
    raiseIncident(session.state, session.log, session.rng, 'witness')
    const before = wantedTotal(session.state.wanted)
    const done = handleIncident(session, 'run')
    expect(done.runOver).toBe(true)
    expect(wantedTotal(session.state.wanted)).toBeGreaterThan(before)
  })
})

// ── 底案 ──────────────────────────────────────────────────────────────────

describe('some things go on the permanent record', () => {
  it('puts killing a witness into the base tier, where money cannot reach it', () => {
    const session = ready(5)
    session.state.marco.armed = true
    session.state.marco.skills.shooting = 95
    session.state.wanted = { base: 0, current: 0, locked: false }
    raiseIncident(session.state, session.log, session.rng, 'witness')
    handleIncident(session, 'silence')
    expect(session.state.wanted.base).toBeGreaterThan(0)
  })

  it('while talking your way out leaves nothing behind at all', () => {
    // 0.95 是硬上限，所以走种子而不是赌一次骰子。
    let talked = false
    for (let seed = 1; seed <= 20 && !talked; seed++) {
      const session = ready(seed)
      session.state.marco.skills.acting = 95
      session.state.wanted = { base: 0, current: 0, locked: false }
      raiseIncident(session.state, session.log, session.rng, 'witness')
      if (!handleIncident(session, 'talk').success) continue
      talked = true
      expect(session.state.wanted.base).toBe(0)
      expect(session.state.wanted.current).toBe(0)
    }
    expect(talked).toBe(true)
  })

  it('archives the footage you chose to ignore', () => {
    const session = ready(5)
    session.state.wanted = { base: 0, current: 0, locked: false }
    raiseIncident(session.state, session.log, session.rng, 'camera')
    handleIncident(session, 'ignore')
    expect(session.state.wanted.base).toBeGreaterThan(0)
  })
})

// ── 进局子 ────────────────────────────────────────────────────────────────

describe('three strikes', () => {
  it('takes the goods, the job and the day', () => {
    const session = ready(9)
    session.state.stash = ['watch', 'ring']
    startCrime(session, 'houses_west', 'burgle')

    const result = arrest(session.state, session.log)
    expect(result.conviction).toBe(1)
    expect(result.days).toBe(SENTENCES[0])
    expect(result.lostLoot).toBe(2)
    expect(session.state.stash).toEqual([])
    expect(session.state.activeRun).toBeNull()
    expect(session.state.ap).toBe(0)
  })

  it('runs the clock down without giving back any action points', () => {
    const session = ready(9)
    arrest(session.state, session.log)
    const days = SENTENCES[0]!

    for (let i = 0; i < days - 1; i++) {
      const report = endTurn(session)
      expect(report.jail?.released).toBe(false)
      expect(session.state.ap).toBe(0)
    }
    const out = endTurn(session)
    expect(out.jail?.released).toBe(true)
    expect(session.state.jailTurns).toBe(0)
    expect(session.state.ap).toBe(session.state.maxAp)
  })

  it('keeps the debt running while you are inside', () => {
    const session = ready(9)
    session.state.turn = 1
    session.state.debt.nextDueTurn = 3
    const owed = session.state.debt.principal
    arrest(session.state, session.log)
    for (let i = 0; i < 4; i++) endTurn(session)
    // 没人替你还，利息照滚。
    expect(session.state.debt.principal).toBeGreaterThan(owed)
  })

  it('has no third sentence', () => {
    const session = ready(9)
    for (let i = 0; i < STRIKES_TO_LIFE - 1; i++) {
      arrest(session.state, session.log)
      session.state.jailTurns = 0
    }
    const last = arrest(session.state, session.log)
    expect(last.life).toBe(true)
    expect(last.days).toBe(0)
    expect(session.state.failure).toEqual({
      kind: 'life',
      turn: session.state.turn,
      terminal: true,
    })
  })
})
