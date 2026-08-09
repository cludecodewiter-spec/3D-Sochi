import { describe, expect, it } from 'vitest'
import { Rng } from '../src/engine/rng.js'
import { probability } from '../src/systems/checks.js'
import { breachMechanicalOpposition } from '../src/systems/vehicles.js'
import { truthOdds, rollTruth } from '../src/systems/intel.js'
import { tierFor, showsCaseFile } from '../src/systems/heat.js'
import { fencePrice, settleDebt } from '../src/systems/economy.js'
import { P_CEILING, P_FLOOR } from '../src/content/balance.js'
import { vehicleDef } from '../src/content/vehicles.js'
import { INFORMANTS } from '../src/content/informants.js'
import { newGame } from '../src/systems/game.js'
import { EventLog } from '../src/engine/events.js'
import { createInitialState } from '../src/engine/state.js'

const base = {
  optionModifier: 0,
  intelModifier: 0,
  heat: 0,
  statePenalty: 0,
  injured: false,
  difficulty: 'standard' as const,
}

describe('check formula (§5.3)', () => {
  it('is 0.5 when skill equals defense', () => {
    expect(probability({ ...base, skill: 50, defense: 50 }).probability).toBeCloseTo(0.5)
  })

  it('moves 0.005 per point of skill gap', () => {
    expect(probability({ ...base, skill: 70, defense: 50 }).probability).toBeCloseTo(0.6)
    expect(probability({ ...base, skill: 30, defense: 50 }).probability).toBeCloseTo(0.4)
  })

  it('clamps to the 0.05 / 0.95 band — always a chance, always a hope', () => {
    expect(probability({ ...base, skill: 0, defense: 300 }).probability).toBe(P_FLOOR)
    expect(probability({ ...base, skill: 300, defense: 0 }).probability).toBe(P_CEILING)
  })

  it('applies the documented intel modifiers', () => {
    const at = (intelModifier: number) =>
      probability({ ...base, skill: 50, defense: 50, intelModifier }).probability
    expect(at(0.15)).toBeCloseTo(0.65)
    expect(at(-0.1)).toBeCloseTo(0.4)
  })

  it('caps the heat penalty at -0.20', () => {
    expect(probability({ ...base, skill: 50, defense: 50, heat: 100 }).probability)
      .toBeCloseTo(0.3)
  })

  it('story mode softens without ever removing the risk', () => {
    const p = probability({ ...base, skill: 50, defense: 50, difficulty: 'story' }).probability
    expect(p).toBeCloseTo(0.625)
    expect(p).toBeLessThan(P_CEILING)
  })

  it('hardcore shaves a flat 0.05', () => {
    expect(probability({ ...base, skill: 50, defense: 50, difficulty: 'hardcore' }).probability)
      .toBeCloseTo(0.45)
  })
})

describe('immobiliser model (§5.2) — the mechanism behind the third act', () => {
  const marcoMechanical = 78
  const chance = (defId: string) =>
    probability({
      ...base,
      skill: marcoMechanical,
      defense: breachMechanicalOpposition(vehicleDef(defId).defense),
    }).probability

  it('leaves classic cars wide open to a piece of wire', () => {
    expect(chance('delano_marlin_84')).toBeGreaterThan(0.7)
  })

  it('makes transition-era cars a real fight', () => {
    const p = chance('corso_gtx_07')
    expect(p).toBeGreaterThan(0.2)
    expect(p).toBeLessThan(0.5)
  })

  it('bottoms out on contemporary cars — this is the whole tragedy', () => {
    expect(chance('aureon_solace_14')).toBe(P_FLOOR)
  })

  it('bottoms out even with the most aggressive option modifier', () => {
    // Why factor 3 and not 2: +0.15 must not rescue a contemporary car.
    const p = probability({
      ...base,
      skill: marcoMechanical,
      defense: breachMechanicalOpposition(vehicleDef('aureon_solace_14').defense),
      optionModifier: 0.15,
    }).probability
    expect(p).toBe(P_FLOOR)
  })

  it('leaves the electronic path shut too, at skill 5', () => {
    const p = probability({
      ...base,
      skill: 5,
      defense: vehicleDef('aureon_solace_14').defense.ignition,
    }).probability
    expect(p).toBeLessThan(0.1)
  })

  it('opens the electronic path once Marco actually learns it', () => {
    const p = probability({
      ...base,
      skill: 60,
      defense: vehicleDef('aureon_solace_14').defense.ignition,
      intelModifier: 0.15,
    }).probability
    expect(p).toBeGreaterThan(0.3)
  })
})

describe('intel truth model (§6.1) — two different ways to be wrong', () => {
  it('a dishonest source skews toward outright lies', () => {
    const odds = truthOdds(45, 70) // Benny
    expect(odds.false).toBeGreaterThan(odds.partial)
  })

  it('an under-informed but honest source skews toward half-truths', () => {
    const odds = truthOdds(80, 30) // Rosa
    expect(odds.partial).toBeGreaterThan(odds.false)
  })

  it('the two failure modes are genuinely distinguishable', () => {
    const benny = truthOdds(45, 70)
    const rosa = truthOdds(80, 30)
    // Similar overall accuracy, opposite shapes — which is the design.
    expect(Math.abs(benny.true - rosa.true)).toBeLessThan(0.1)
    expect(benny.false).toBeGreaterThan(rosa.false * 2)
  })

  it('a good source is mostly right', () => {
    expect(truthOdds(70, 75).true).toBeGreaterThan(0.7)
  })

  it('odds always sum to 1', () => {
    for (const i of INFORMANTS) {
      const o = truthOdds(i.honesty, i.access)
      expect(o.true + o.partial + o.false).toBeCloseTo(1)
    }
  })

  it('rolls out to roughly the modelled distribution', () => {
    const rng = new Rng(2024)
    const counts = { true: 0, partial: 0, false: 0 }
    for (let i = 0; i < 4_000; i++) counts[rollTruth(45, 70, rng)] += 1
    const odds = truthOdds(45, 70)
    expect(counts.true / 4_000).toBeCloseTo(odds.true, 1)
    expect(counts.false).toBeGreaterThan(counts.partial)
  })
})

describe('heat (§5.4)', () => {
  it('names the documented tiers', () => {
    expect(tierFor(0).label).toBe('平静')
    expect(tierFor(25).label).toBe('留意')
    expect(tierFor(45).label).toBe('关注')
    expect(tierFor(65).label).toBe('专案')
    expect(tierFor(90).label).toBe('通缉')
  })

  it('reveals the player their own case file at 专案', () => {
    expect(showsCaseFile(59)).toBe(false)
    expect(showsCaseFile(60)).toBe(true)
  })
})

describe('economy (§5.5, §5.6)', () => {
  it('prices a clean car through the documented formula', () => {
    const session = newGame({ seed: 1 })
    const p = fencePrice(session.state, 'delano_marlin_84', 100, 'chop')
    expect(p.final).toBe(Math.round(2_200 * 0.35))
  })

  it('docks the price for damage, heat and market saturation', () => {
    const session = newGame({ seed: 1 })
    session.state.wanted.current = 50
    session.state.marketDecay['delano_marlin_84'] = 0.16
    const p = fencePrice(session.state, 'delano_marlin_84', 70, 'chop')
    expect(p.final).toBe(Math.round(2_200 * 0.35 * 0.7 * 0.8 * 0.84))
  })

  it('pays the debt when the money is there', () => {
    const state = createInitialState()
    const log = new EventLog()
    state.cash = 5_000
    state.turn = 7
    const result = settleDebt(state, log)
    expect(result.missed).toBe(false)
    expect(state.cash).toBe(3_500)
    expect(state.debt.principal).toBe(10_500)
    expect(state.debt.nextDueTurn).toBe(14)
  })

  it('compounds and escalates when it is not', () => {
    const state = createInitialState()
    const log = new EventLog()
    state.cash = 10
    state.turn = 7
    const result = settleDebt(state, log)
    expect(result.missed).toBe(true)
    expect(state.debt.missed).toBe(1)
    expect(state.debt.principal).toBe(12_000 + 1_440)
  })

  it('escalates one step per missed payment, per the §5.6 table', () => {
    const call = (alreadyMissed: number) => {
      const state = createInitialState()
      state.cash = 0
      state.debt.missed = alreadyMissed
      return settleDebt(state, new EventLog())
    }
    // 1st miss: a phone call. 2nd: they break Diana's hand. 3rd: one day left.
    expect(call(0).crewDisabledTurns).toBe(0)
    expect(call(1).crewDisabledTurns).toBe(5)
    expect(call(2).crewDisabledTurns).toBe(0)
    expect(call(2).callBody.join('')).toContain('明天')
  })

  it('liquidates on the fourth miss', () => {
    const state = createInitialState()
    state.cash = 0
    state.debt.missed = 3
    expect(settleDebt(state, new EventLog()).liquidated).toBe(true)
  })

  it('halves the pressure in story mode and raises it in hardcore', () => {
    const story = createInitialState({ difficulty: 'story' })
    story.cash = 800
    expect(settleDebt(story, new EventLog()).missed).toBe(false)

    const hardcore = createInitialState({ difficulty: 'hardcore' })
    hardcore.cash = 1_600
    expect(settleDebt(hardcore, new EventLog()).missed).toBe(true)
  })
})
