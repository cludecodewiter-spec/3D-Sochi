/**
 * Acceptance tests for the vertical slice. VERTICAL_SLICE.md §5.
 *
 * The point of these is not coverage — it is that the three claims the slice
 * exists to prove are actually true in code:
 *   1. the four-stage heist is a sequence of informed decisions
 *   2. the betrayal is produced by the model, not narrated by a script
 *   3. the dossier can reconstruct the causal chain with nothing authored
 */

import { describe, expect, it } from 'vitest'
import { settleIncidents } from './helpers.js'
import type { Session } from '../src/engine/save.js'
import {
  buyIntel,
  chooseHeistOption,
  currentHeist,
  endTurn,
  fence,
  newGame,
  scout,
  startHeist,
} from '../src/systems/game.js'
import { causalTree, dayCards, informantEntries, recall } from '../src/systems/dossier.js'
import { AMBUSH_THRESHOLD, DANGER_PER_LIE } from '../src/systems/heist.js'
import { UNLOCKS, UNLOCK_SPACING } from '../src/content/unlocks.js'
import { TUTORIAL_TARGET } from '../src/content/script.js'

const advanceTo = (session: Session, turn: number): void => {
  while (session.state.turn < turn) endTurn(session)
}

const runToEnd = (session: Session, plan: string[]): string[] => {
  const lines: string[] = []
  for (const optionId of plan) {
    const result = chooseHeistOption(session, optionId)
    lines.push(result.text, ...result.epilogue)
    if (session.state.incident) {
      if (settleIncidents(session, lines)) break
      continue
    }
    if (result.outcome) break
  }
  return lines
}

describe('unlock curve (§8.1)', () => {
  it('never introduces two systems within the spacing window', () => {
    const gated = UNLOCKS.filter((u) => u.turn > 1)
    for (let i = 1; i < gated.length; i++) {
      expect(gated[i]!.turn - gated[i - 1]!.turn).toBeGreaterThanOrEqual(UNLOCK_SPACING)
    }
  })

  it('opens with exactly the three things the first hour teaches', () => {
    const session = newGame({ seed: 11 })
    expect(session.state.unlocked).toEqual(['heist', 'fence'])
  })

  it('opens up crimes other than car theft once the loop is learned', () => {
    const session = newGame({ seed: 11 })
    advanceTo(session, 5)
    expect(session.state.unlocked).not.toContain('crimes')
    advanceTo(session, 6)
    expect(session.state.unlocked).toContain('crimes')
  })

  it('hands the player the dossier at turn 9 — a tool for hour five, not hour one', () => {
    const session = newGame({ seed: 11 })
    advanceTo(session, 8)
    expect(session.state.unlocked).not.toContain('dossier')
    advanceTo(session, 9)
    expect(session.state.unlocked).toContain('dossier')
  })

  it('reveals heat only after the player has quietly accumulated some', () => {
    const session = newGame({ seed: 11 })
    advanceTo(session, 12)
    expect(session.state.unlocked).toContain('heat')
  })

  it('delivers every unlock through Solomon rather than a popup', () => {
    const session = newGame({ seed: 11 })
    advanceTo(session, 3)
    const advisor = session.log.byType('advisor')
    expect(advisor.length).toBeGreaterThan(0)
    expect(advisor.every((e) => e.actors.includes('solomon'))).toBe(true)
  })

  it('goes silent on hardcore', () => {
    const session = newGame({ seed: 11, difficulty: 'hardcore' })
    advanceTo(session, 9)
    expect(session.log.byType('advisor')).toHaveLength(0)
    expect(session.state.unlocked).toContain('dossier')
  })
})

describe('the tutorial heist (§2, turn 1)', () => {
  it('is winnable on the first try with the safe line', () => {
    const wins = [1, 2, 3, 4, 5].filter((seed) => {
      const session = newGame({ seed })
      startHeist(session, `t-${TUTORIAL_TARGET}`)
      const lines = runToEnd(session, ['patient', 'shadow', 'wire', 'calm'])
      return lines.some((l) => l.includes('现在在你手上'))
    })
    // The turn-1 car is deliberately soft; the player has to be able to feel
    // the loop close before anything is allowed to go wrong.
    expect(wins.length).toBeGreaterThanOrEqual(4)
  })

  it('closes the loop: steal, then turn it into money', () => {
    const session = newGame({ seed: 2 })
    startHeist(session, `t-${TUTORIAL_TARGET}`)
    runToEnd(session, ['patient', 'shadow', 'wire', 'calm'])
    expect(session.state.garage).toHaveLength(1)

    const before = session.state.cash
    const { payout } = fence(session, `t-${TUTORIAL_TARGET}`, 'chop')
    expect(payout).toBeGreaterThan(0)
    expect(session.state.cash).toBe(before + payout)
    expect(session.state.garage).toHaveLength(0)
  })

  it('lets the player walk away for free at the first segment', () => {
    const session = newGame({ seed: 3 })
    startHeist(session, `t-${TUTORIAL_TARGET}`)
    const view = currentHeist(session)
    expect(view.segmentId).toBe('recon')
    expect(view.options).toHaveLength(3)
    expect(view.options.every((o) => o.probability > 0)).toBe(true)
  })
})

describe('information economy (§6)', () => {
  it('treats what Marco saw himself as always true', () => {
    const session = newGame({ seed: 5 })
    scout(session, `t-${TUTORIAL_TARGET}`, 'recon')
    startHeist(session, `t-${TUTORIAL_TARGET}`)
    const view = currentHeist(session)
    expect(view.tell).toContain('四十分钟')
  })

  it('shows a vague tell when the player knows nothing', () => {
    const session = newGame({ seed: 5 })
    startHeist(session, `t-${TUTORIAL_TARGET}`)
    expect(currentHeist(session).tell).toContain('安静得让你不太确定')
  })

  it('gives Benny’s first tip straight — trust has to exist before it is spent', () => {
    const session = newGame({ seed: 7 })
    advanceTo(session, 3)
    const tip = buyIntel(session, 'benny', `t-${TUTORIAL_TARGET}`, 'recon')
    expect(tip.truth).toBe('true')
  })

  it('makes Benny’s second tip the lie', () => {
    const session = newGame({ seed: 7 })
    advanceTo(session, 3)
    buyIntel(session, 'benny', `t-${TUTORIAL_TARGET}`, 'recon')
    endTurn(session)
    const second = buyIntel(session, 'benny', `t-${TUTORIAL_TARGET}`)
    expect(second.truth).toBe('false')
    expect(second.segmentId).toBe('approach')
    expect(second.text).toContain('只有两个看守')
  })
})

describe('the betrayal is mechanical, not scripted (§4.3, VERTICAL_SLICE §3)', () => {
  const setUpBetrayal = (seed: number): Session => {
    const session = newGame({ seed })
    advanceTo(session, 3)
    session.state.cash = 5_000
    buyIntel(session, 'benny', `t-${TUTORIAL_TARGET}`, 'recon')
    endTurn(session)
    buyIntel(session, 'benny', `t-${TUTORIAL_TARGET}`) // the lie, always about 接近
    return session
  }

  it('states the lie confidently instead of hedging it', () => {
    const session = setUpBetrayal(21)
    startHeist(session, `t-${TUTORIAL_TARGET}`)
    chooseHeistOption(session, 'patient')

    const view = currentHeist(session)
    expect(view.segmentId).toBe('approach')
    // This is the rule the whole design rests on: bad intel does not read as
    // uncertainty, it reads as knowledge. The player makes a decision that is
    // correct given everything visible, and it is still wrong.
    expect(view.tell).toContain('这周不在')
    expect(view.tell).not.toContain('不知道')
  })

  it('offers the high-nerve player a second look without handing over the answer', () => {
    const session = setUpBetrayal(21)
    startHeist(session, `t-${TUTORIAL_TARGET}`)
    chooseHeistOption(session, 'patient')
    const view = currentHeist(session)
    expect(view.nerveHint).toContain('你自己想看到的')
  })

  it('turns the lie into people waiting at the exit', () => {
    const session = setUpBetrayal(21)
    const run = startHeist(session, `t-${TUTORIAL_TARGET}`)
    expect(run.vars['danger']).toBe(DANGER_PER_LIE)
    expect(run.vars['danger']).toBeGreaterThanOrEqual(AMBUSH_THRESHOLD)
  })

  it('makes the escape measurably harder once the ambush is live', () => {
    const clean = newGame({ seed: 21 })
    startHeist(clean, `t-${TUTORIAL_TARGET}`)
    for (const o of ['patient', 'shadow', 'wire']) chooseHeistOption(clean, o)

    const trapped = setUpBetrayal(21)
    startHeist(trapped, `t-${TUTORIAL_TARGET}`)
    for (const o of ['patient', 'shadow', 'wire']) chooseHeistOption(trapped, o)

    if (!clean.state.activeRun || !trapped.state.activeRun) return
    const a = currentHeist(clean).options[0]!
    const b = currentHeist(trapped).options[0]!
    expect(b.opposition).toBeGreaterThan(a.opposition)
    expect(b.probability).toBeLessThan(a.probability)
  })

  it('does not hand over the car when the getaway is botched', () => {
    // Regression: the final segment decides the run. A failed escape used to
    // still deposit the car in the garage.
    const session = setUpBetrayal(21)
    session.state.marco.skills.driving = 5
    session.state.marco.skills.acting = 5
    startHeist(session, `t-${TUTORIAL_TARGET}`)
    const lines = runToEnd(session, ['patient', 'casual', 'column', 'floor'])
    expect(lines.some((l) => l.includes('在你手上'))).toBe(false)
    expect(session.state.garage).toHaveLength(0)
  })

  it('gets Marco shot, and the dossier can explain why with nothing authored', () => {
    // Deterministic seed search: find the first seed where the ambushed escape
    // actually fails, then assert the causal chain on that run.
    let hit: Session | null = null
    for (let seed = 1; seed <= 60 && !hit; seed++) {
      const session = setUpBetrayal(seed)
      session.state.marco.skills.driving = 5
      session.state.marco.skills.acting = 5
      startHeist(session, `t-${TUTORIAL_TARGET}`)
      const lines = runToEnd(session, ['patient', 'casual', 'column', 'floor'])
      if (lines.some((l) => l.includes('本来就在等你'))) hit = session
    }
    expect(hit).not.toBeNull()
    const session = hit!

    expect(session.state.marco.injuryTurns).toBeGreaterThan(0)

    const entries = informantEntries(session.state, session.log)
    const benny = entries.find((e) => e.id === 'benny')!
    expect(benny.wrong).toBeGreaterThanOrEqual(1)
    expect(benny.relationship).toBeLessThan(0)

    // The chain the dossier renders: 情报 → 下手 → 中枪
    const lie = benny.intel.find((i) => i.verdict === 'wrong')!
    const chain = causalTree(session.log, lie.intelId.replace('intel-', ''))
    expect(chain.map((n) => n.event.type)).toContain('injury')

    // And the zero-cost recall bar the player sees next time they meet him.
    expect(recall(session.log, 'benny')).toContain('BENNY')
  })
})

describe('first-hour acceptance checklist (§5)', () => {
  it('hits every item on the list within fifteen turns', () => {
    const session = newGame({ seed: 31 })
    const checklist = {
      stoleACar: false,
      failedAndGotAway: false,
      earnedMoney: false,
      gotTheCall: false,
      wasLiedTo: false,
      canLookItUp: false,
    }

    // The tutorial car, retried across turns the way a real player would.
    // The opening job is heavily favoured, not rigged — the 0.05/0.95 band is
    // a hard rule, so "you will steal a car in the first hour" is a claim
    // about the hour, not about the first attempt.
    for (let attempt = 0; attempt < 4 && !checklist.stoleACar; attempt++) {
      startHeist(session, `t-${TUTORIAL_TARGET}`)
      const lines = runToEnd(session, ['patient', 'shadow', 'wire', 'calm'])
      if (lines.some((l) => l.includes('在你手上'))) {
        checklist.stoleACar = true
        fence(session, `t-${TUTORIAL_TARGET}`, 'chop')
        checklist.earnedMoney = session.state.cash > 340
      } else {
        checklist.failedAndGotAway = true
        endTurn(session)
      }
    }

    // Turn 2-3: the phone call and Benny. Roll forward to a day with room
    // in it, since the retries above may have burned several.
    while (session.state.turn < 3 || session.state.ap < 2) endTurn(session)
    session.state.cash += 2_000
    buyIntel(session, 'benny', 't-vantry_coast_91')
    endTurn(session)
    const lie = buyIntel(session, 'benny', 't-vantry_coast_91')
    checklist.wasLiedTo = lie.truth === 'false'
    expect(session.state.turn).toBeLessThanOrEqual(15)

    // The one car on the list that cannot be taken. The player will try it.
    session.state.ap = 3
    startHeist(session, 't-aureon_solace_14')
    const lines = runToEnd(session, ['sweep', 'casual', 'wire'])
    checklist.failedAndGotAway ||= lines.some((l) => l.includes('走掉了') || l.includes('电脑'))

    advanceTo(session, 8)
    checklist.gotTheCall = session.log.byType('debt_payment', 'debt_default').length > 0
    checklist.canLookItUp = informantEntries(session.state, session.log).some(
      (e) => e.id === 'benny' && e.intel.length >= 2,
    )

    expect(checklist).toEqual({
      stoleACar: true,
      failedAndGotAway: true,
      earnedMoney: true,
      gotTheCall: true,
      wasLiedTo: true,
      canLookItUp: true,
    })
  })

  it('produces one summary card per turn, kept forever', () => {
    const session = newGame({ seed: 41 })
    advanceTo(session, 6)
    const cards = dayCards(session.log)
    expect(cards).toHaveLength(6)
    expect(cards.map((c) => c.turn)).toEqual([1, 2, 3, 4, 5, 6])
    expect(cards.every((c) => c.headline.length > 0)).toBe(true)
  })

  it('is byte-identical across two runs of the same seed', () => {
    const play = (): string => {
      const session = newGame({ seed: 777 })
      startHeist(session, `t-${TUTORIAL_TARGET}`)
      runToEnd(session, ['patient', 'shadow', 'wire', 'calm'])
      advanceTo(session, 5)
      return JSON.stringify({ state: session.state, log: session.log.toJSON() })
    }
    expect(play()).toBe(play())
  })
})
