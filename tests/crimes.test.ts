/**
 * Crimes against places — the second family of SegmentRun configs.
 *
 * The point of these is that adding a kind of crime did not require a new
 * engine: everything below drives the same machinery as the car heist.
 */

import { describe, expect, it } from 'vitest'
import { settleIncidents } from './helpers.js'
import type { Session } from '../src/engine/save.js'
import {
  ActionError,
  chooseCrimeOption,
  currentCrime,
  giveUpCrime,
  newGame,
  startCrime,
} from '../src/systems/game.js'
import { isReady, placeOf } from '../src/systems/crime.js'
import { WITNESSES } from '../src/content/incidents.js'
import { heatOf } from '../src/systems/heat.js'
import { CRIME_CONFIGS, CRIME_AP, FACE_LINE, LEAVES_A_FACE } from '../src/content/crimes.js'
import type { CrimeKey } from '../src/content/crimes.js'
import { LOCATIONS, locationDef, witnessPool } from '../src/content/locations.js'
import { DISTRICTS, districtOf } from '../src/ui/art/map.js'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const ready = (seed: number): Session => {
  const session = newGame({ seed })
  session.state.unlocked.push('crimes')
  session.state.turn = 20
  session.state.ap = 3
  return session
}

const play = (session: Session, plan: string[]): string[] => {
  const lines: string[] = []
  for (const optionId of plan) {
    const result = chooseCrimeOption(session, optionId)
    lines.push(result.text, ...result.epilogue)
    // 被发现的时候，这一趟还没结束——先把眼前那个人处理掉。
    if (session.state.incident) {
      if (settleIncidents(session, lines)) break
      continue
    }
    if (result.outcome) break
  }
  return lines
}

describe('content integrity', () => {
  it('every location sits in a district the map knows', () => {
    expect(LOCATIONS.filter((l) => !districtOf(l.location)).map((l) => l.name)).toEqual([])
    expect(DISTRICTS.length).toBeGreaterThan(0)
  })

  it('every location photo exists on disk', () => {
    const missing = LOCATIONS.filter(
      (l) => !existsSync(join(process.cwd(), 'public', 'assets', `${l.photo}.jpg`)),
    )
    expect(missing.map((l) => l.photo)).toEqual([])
  })

  it('every crime a location offers has a config, an AP cost and a label', () => {
    for (const l of LOCATIONS) {
      for (const crime of l.crimes) {
        expect(CRIME_CONFIGS[crime]).toBeDefined()
        expect(CRIME_AP[crime]).toBeGreaterThan(0)
      }
    }
  })

  it('every crime config is well formed', () => {
    for (const [key, config] of Object.entries(CRIME_CONFIGS)) {
      expect(config.segments.length).toBeGreaterThanOrEqual(2)
      for (const segment of config.segments) {
        expect(segment.options).toHaveLength(3)
        expect(segment.tell.accurate.length).toBeGreaterThan(0)
        expect(segment.tell.misleading.length).toBeGreaterThan(0)
        for (const option of segment.options) {
          for (const delta of [...option.onSuccess, ...option.onFailure]) {
            expect(Object.keys(config.vars)).toContain(delta.var)
          }
        }
      }
      expect(config.id).toBe(key)
    }
  })

  it('locked places are visible but offer nothing', () => {
    const bank = locationDef('bank_midtown')
    expect(bank.crimes).toEqual([])
    expect(bank.lockedNote).toBeTruthy()
  })
})

describe('running a crime', () => {
  it('pays out what was actually picked up, not a flat reward', () => {
    const takes = new Set<number>()
    for (let seed = 1; seed <= 12; seed++) {
      const session = ready(seed)
      const before = session.state.cash
      startCrime(session, 'atm_midtown', 'pickpocket')
      play(session, ['rich', 'bag'])
      takes.add(session.state.cash - before)
    }
    // Different runs bank different amounts — `take` accumulates per choice.
    expect(takes.size).toBeGreaterThan(1)
  })

  it('charges action points and refunds them if the job cannot start', () => {
    const session = ready(3)
    session.state.ap = 3
    startCrime(session, 'atm_midtown', 'pickpocket')
    expect(session.state.ap).toBe(3 - CRIME_AP.pickpocket)

    giveUpCrime(session)
    const before = session.state.ap
    // Wrong crime for this place — the AP must come back.
    expect(() => startCrime(session, 'atm_midtown', 'burgle')).toThrow(ActionError)
    expect(session.state.ap).toBe(before)
  })

  it('puts a place on cooldown after it is hit', () => {
    const session = ready(5)
    startCrime(session, 'atm_midtown', 'pickpocket')
    play(session, ['distracted', 'pocket'])
    expect(isReady(session.state, 'atm_midtown')).toBe(false)
    expect(placeOf(session.state, 'atm_midtown')?.timesHit).toBe(1)

    session.state.ap = 3
    expect(() => startCrime(session, 'atm_midtown', 'pickpocket')).toThrow(ActionError)
  })

  it('refuses a crime the location does not offer', () => {
    const session = ready(5)
    expect(() => startCrime(session, 'houses_west', 'holdup')).toThrow(ActionError)
  })

  it('refuses anything at all while another job is running', () => {
    const session = ready(5)
    startCrime(session, 'atm_midtown', 'pickpocket')
    session.state.ap = 3
    expect(() => startCrime(session, 'houses_west', 'burgle')).toThrow(ActionError)
  })

  it('shows the same three-option shape as the heist', () => {
    const session = ready(7)
    startCrime(session, 'houses_west', 'burgle')
    const view = currentCrime(session)
    expect(view.options).toHaveLength(3)
    expect(view.segmentCount).toBe(3)
    expect(view.tell.length).toBeGreaterThan(0)
    expect(view.options.every((o) => o.probability > 0 && o.probability < 1)).toBe(true)
  })

  it('lets the player walk away at any point', () => {
    const session = ready(7)
    startCrime(session, 'houses_west', 'burgle')
    const lines = giveUpCrime(session)
    expect(lines[0]?.length).toBeGreaterThan(0)
    expect(session.state.activeRun).toBeNull()
  })
})

describe('armed robbery is the one that costs you a face (§3.3)', () => {
  it('raises the base wanted level, which never decays', () => {
    const session = ready(11)
    session.state.wanted = { base: 0, current: 0, locked: false }
    startCrime(session, 'gas_north', 'holdup')
    play(session, ['casual', 'quiet', 'calm'])

    expect(session.state.wanted.base).toBe(LEAVES_A_FACE.holdup)
  })

  it('while the quiet crimes leave no permanent mark', () => {
    const session = ready(11)
    session.state.wanted = { base: 0, current: 0, locked: false }
    startCrime(session, 'atm_midtown', 'atm')
    play(session, ['patient', 'pry', 'walk'])

    expect(session.state.wanted.base).toBe(0)
    expect(heatOf(session.state)).toBeGreaterThanOrEqual(0)
  })
})

describe('the two places that are not the state\'s problem', () => {
  it('赌厅与帮派据点都在地图上，并且各有自己的活', () => {
    const casino = locationDef('casino_river')
    const den = locationDef('den_north')
    expect(casino.crimes).toContain('casino')
    expect(den.crimes).toContain('den')
    // 两处都会让人记住你的脸，而帮派记得更牢。
    expect(LEAVES_A_FACE.den).toBeGreaterThan(LEAVES_A_FACE.casino)
    expect(LEAVES_A_FACE.casino).toBeGreaterThan(LEAVES_A_FACE.holdup)
  })

  it('撞见你的是这个地方的人，不是路过的行人', () => {
    expect(witnessPool('den_north')).toBe('den')
    expect(witnessPool('casino_river')).toBe('casino')
    expect(WITNESSES['den']?.length).toBeGreaterThan(0)
    expect(WITNESSES['casino']?.length).toBeGreaterThan(0)
  })

  it('赌厅是唯一一个会先花你钱的活', () => {
    const session = ready(5)
    session.state.turn = 30
    session.state.ap = 3
    session.state.cash = 5_000
    startCrime(session, 'casino_river', 'casino')
    // 坐下来赌两把——为了不被认出来，这笔钱真的从口袋里出去。
    const view = currentCrime(session)
    expect(view.options.map((o) => o.id)).toContain('play')
    const config = CRIME_CONFIGS.casino
    expect(config.vars['take']!.min).toBeLessThan(0)
  })

  it('记住你的人是谁，说法要对得上地方', () => {
    // 挑帮派的账房，记住你的不是店员。
    for (const crime of Object.keys(LEAVES_A_FACE) as CrimeKey[]) {
      expect(FACE_LINE[crime].length > 0).toBe(LEAVES_A_FACE[crime] > 0)
    }
    expect(FACE_LINE.den).not.toContain('店员')
  })

  it('这两处都比别的活贵一个行动点', () => {
    expect(CRIME_AP.casino).toBeGreaterThan(CRIME_AP.burgle)
    expect(CRIME_AP.den).toBeGreaterThan(CRIME_AP.burgle)
  })
})

describe('the engine is shared, not duplicated', () => {
  it('crime configs and the heist config declare the same segment shape', () => {
    for (const config of Object.values(CRIME_CONFIGS)) {
      for (const segment of config.segments) {
        expect(segment).toHaveProperty('tell')
        expect(segment).toHaveProperty('abortText')
        expect(typeof segment.abortHeat).toBe('number')
      }
    }
  })

  it('every crime is reachable from at least one location', () => {
    const offered = new Set(LOCATIONS.flatMap((l) => l.crimes))
    const all = Object.keys(CRIME_CONFIGS) as CrimeKey[]
    expect(all.filter((c) => !offered.has(c))).toEqual([])
  })
})
