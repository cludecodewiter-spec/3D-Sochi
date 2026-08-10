/**
 * 物品级赃物 —— 一次作案的产出不再只是一个数字。
 *
 * 这一组守住的是：翻到的是**具体的东西**，东西要另外出手，
 * 而其中恰好有一件会改变你在别的地方能做什么。
 */

import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import type { Session } from '../src/engine/save.js'
import { settleIncidents } from './helpers.js'
import {
  chooseCrimeOption,
  chooseHeistOption,
  currentHeist,
  newGame,
  sellStash,
  sellStashItem,
  discardStashItem,
  stash as stashOf,
  stashValue,
  startCrime,
  startRifle,
} from '../src/systems/game.js'
import { assertLootTablesResolve, payoutOf, stashWorth } from '../src/systems/stash.js'
import { finishCrime } from '../src/systems/crime.js'
import { ARMED_TABLES, LOOT, LOOT_BY_ID, LOOT_TABLES, lootValue } from '../src/content/items.js'
import { RIFLE_CONFIG } from '../src/content/rifle.js'
import { CRIME_CONFIGS } from '../src/content/crimes.js'
import { VEHICLES } from '../src/content/vehicles.js'
import { AP_COSTS } from '../src/engine/time.js'

const ready = (seed: number): Session => {
  const session = newGame({ seed })
  session.state.unlocked.push('crimes', 'heist')
  session.state.turn = 20
  session.state.ap = 3
  session.state.targets = VEHICLES.map((v) => ({
    id: `t-${v.id}`,
    defId: v.id,
    scouted: [],
    stolen: false,
  }))
  return session
}

// ── 内容 ──────────────────────────────────────────────────────────────────

describe('the loot catalogue', () => {
  it('resolves every id every table names', () => {
    expect(() => assertLootTablesResolve()).not.toThrow()
  })

  it('has no duplicate ids and no negative prices', () => {
    expect(new Set(LOOT.map((i) => i.id)).size).toBe(LOOT.length)
    expect(LOOT.filter((i) => i.value < 0)).toEqual([])
  })

  it('keeps every gun behind a door you had to walk through', () => {
    // 这是整个「灭口 / 交火」分支的准入条件：街上和口袋里永远摸不到枪，
    // 想要那两个选项，你得先进别人家、赌厅后厅、或者帮派的账房。
    const guns = LOOT.filter((i) => i.armsYou).map((i) => i.id)
    expect(guns.length).toBeGreaterThan(0)
    for (const [table, ids] of Object.entries(LOOT_TABLES)) {
      const armed = ids.filter((id) => guns.includes(id))
      if (armed.length > 0) expect(ARMED_TABLES).toContain(table)
    }
    for (const open of ['vehicle', 'pocket', 'counter']) {
      expect(LOOT_TABLES[open]!.filter((id) => guns.includes(id))).toEqual([])
    }
  })

  it('puts one in the first place the player can reach', () => {
    // 住宅是最早解锁的「要走进去」的地方，那把左轮就在那儿。
    expect(LOOT_TABLES['house']).toContain('revolver')
  })

  it('is a catalogue, not a handful — 上百个物品', () => {
    expect(LOOT.length).toBeGreaterThanOrEqual(100)
    for (const [table, ids] of Object.entries(LOOT_TABLES)) {
      expect(ids.length, table).toBeGreaterThanOrEqual(10)
      // 每张表都要有几件卖不掉的东西——落空是这个玩法的一部分。
      expect(ids.some((id) => LOOT_BY_ID[id]!.value === 0), table).toBe(true)
    }
  })

  it('pays face value for cash and a haircut for everything else', () => {
    expect(payoutOf('wallet')).toBe(LOOT_BY_ID['wallet']!.value)
    expect(payoutOf('watch')).toBeLessThan(LOOT_BY_ID['watch']!.value)
  })

  it('draws only from tables that exist', () => {
    const configs = [RIFLE_CONFIG, ...Object.values(CRIME_CONFIGS)]
    const tables = new Set(Object.keys(LOOT_TABLES))
    for (const config of configs) {
      for (const segment of config.segments) {
        for (const option of segment.options) {
          if (option.draws) expect(tables.has(option.draws.table)).toBe(true)
        }
      }
    }
  })
})

// ── 翻车 ──────────────────────────────────────────────────────────────────

describe('rifling a car instead of taking it', () => {
  it('costs less than driving it away', () => {
    expect(AP_COSTS.rifle).toBeLessThan(AP_COSTS.runHeist)
  })

  it('leaves the car where it stands', () => {
    const session = ready(4)
    const id = `t-${VEHICLES[0]!.id}`
    startRifle(session, id)
    for (const plan of ['slim', 'toss']) {
      if (!session.state.activeRun || session.state.incident) break
      chooseHeistOption(session, plan)
    }
    settleIncidents(session)
    expect(session.state.garage).toHaveLength(0)
    expect(session.state.targets.find((t) => t.id === id)?.stolen).toBe(false)
  })

  it('is the one job an immobiliser cannot stop', () => {
    // 2014 年的车能把偷车这条路彻底堵死，但堵不住它的车窗。
    const hopeless = VEHICLES.reduce((worst, v) =>
      v.defense.ignition > worst.defense.ignition ? v : worst,
    )
    const session = ready(6)
    startRifle(session, `t-${hopeless.id}`)
    const view = currentHeist(session)
    expect(view.options.some((o) => o.probability > 0.5)).toBe(true)
  })

  it('hands back things, not a number', () => {
    let found: string[] = []
    for (let seed = 1; seed <= 25 && found.length === 0; seed++) {
      const session = ready(seed)
      startRifle(session, `t-${VEHICLES[0]!.id}`)
      for (const plan of ['slim', 'toss']) {
        if (!session.state.activeRun || session.state.incident) break
        chooseHeistOption(session, plan)
      }
      settleIncidents(session)
      found = [...session.state.stash]
    }
    expect(found.length).toBeGreaterThan(0)
    for (const id of found) expect(LOOT_TABLES['vehicle']).toContain(id)
  })
})

// ── 入室 ──────────────────────────────────────────────────────────────────

describe('a house gives up objects', () => {
  it('fills the bag from the house table', () => {
    let bag: string[] = []
    for (let seed = 1; seed <= 25 && bag.length === 0; seed++) {
      const session = ready(seed)
      startCrime(session, 'houses_west', 'burgle')
      for (const plan of ['mail', 'lock', 'thorough']) {
        if (!session.state.activeRun || session.state.incident) break
        chooseCrimeOption(session, plan)
      }
      settleIncidents(session)
      bag = [...session.state.stash]
    }
    expect(bag.length).toBeGreaterThan(0)
    for (const id of bag) expect(LOOT_TABLES['house']).toContain(id)
  })

  it('arms him the moment the revolver turns up, and only then', () => {
    const session = ready(3)
    expect(session.state.marco.armed).toBe(false)
    session.state.stash = []
    startCrime(session, 'houses_west', 'burgle')
    const run = session.state.activeRun!
    run.loot = ['revolver']
    run.finished = { result: 'success', atSegmentIndex: 2 }
    // 直接走收场那条路，绕开骰子。
    finishCrime(session.state, session.log, run)
    expect(session.state.marco.armed).toBe(true)
    expect(session.state.stash).toContain('revolver')
  })
})

// ── 出手 ──────────────────────────────────────────────────────────────────

describe('turning things back into money', () => {
  it('sells one item at its own price', () => {
    const session = ready(3)
    session.state.stash = ['watch', 'wallet']
    const before = session.state.cash
    const paid = sellStashItem(session, 'watch')
    expect(paid).toBe(payoutOf('watch'))
    expect(session.state.cash).toBe(before + paid)
    expect(session.state.stash).toEqual(['wallet'])
  })

  it('empties the bag in one go and matches the quoted total', () => {
    const session = ready(3)
    session.state.stash = ['watch', 'wallet', 'ring', 'papers']
    const quoted = stashValue(session)
    expect(quoted).toBe(stashWorth(session.state))
    const before = session.state.cash
    expect(sellStash(session)).toBe(quoted)
    expect(session.state.cash).toBe(before + quoted)
    // 没人买的东西留在袋里，而不是凭空消失。
    expect(session.state.stash).toEqual(['papers'])
  })

  it('refuses to fence the gun, and disarms him only when it is gone', () => {
    const session = ready(3)
    session.state.stash = ['revolver']
    session.state.marco.armed = true
    expect(() => sellStashItem(session, 'revolver')).toThrow()
    expect(stashValue(session)).toBe(0)

    discardStashItem(session, 'revolver')
    expect(session.state.marco.armed).toBe(false)
    expect(session.state.stash).toEqual([])
  })

  it('groups duplicates for the rack instead of listing them twice', () => {
    const session = ready(3)
    session.state.stash = ['coins', 'coins', 'watch']
    const view = stashOf(session)
    expect(view).toHaveLength(2)
    expect(view.find((e) => e.id === 'coins')?.count).toBe(2)
    // 最值钱的排在最前面。
    expect(view[0]?.id).toBe('watch')
  })

  it('quotes a bag total that matches the sum of its parts', () => {
    const ids = ['watch', 'ring', 'coins']
    expect(lootValue(ids)).toBe(ids.reduce((s, i) => s + LOOT_BY_ID[i]!.value, 0))
  })
})

describe('loot art', () => {
  it('only points at photos that are actually on disk', async () => {
    for (const item of LOOT) {
      if (!item.photo) continue
      expect(existsSync(`public/assets/${item.photo}.jpg`)).toBe(true)
    }
  })
})
