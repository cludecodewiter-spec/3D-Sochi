/**
 * 赃物袋。
 *
 * 一次作案的产出分成两半：散钱直接进现金，**东西**进这里。东西要另外
 * 出手，出手要打折，而打折的幅度取决于你走哪条路子——这跟车是一个道理，
 * 只是量级小得多，频率高得多。
 *
 * 唯一一件不进这套账的物品是那把左轮：它一旦落在你手上，改变的不是钱，
 * 是你在「被发现」那一层能选什么。
 */

import type { EventLog } from '../engine/events.js'
import type { GameState, SegmentRunState } from '../engine/state.js'
import { LOOT_TABLES, lootItem, lootValue } from '../content/items.js'

/** 销赃赃物的折价。比车宽松——这些东西没人查编号。 */
export const LOOT_FENCE_RATE = 0.65

/**
 * 把这一趟翻到的东西并进赃物袋。成功、失手都要走这一步：
 * 已经揣进兜里的东西是跟着你一起出来的。
 */
export function stashLoot(
  state: GameState,
  log: EventLog,
  run: SegmentRunState,
  causedBy?: string,
): string[] {
  if (run.loot.length === 0) return []

  const lines: string[] = []
  const armed: string[] = []
  for (const id of run.loot) {
    state.stash.push(id)
    const item = lootItem(id)
    if (item.armsYou && !state.marco.armed) armed.push(item.name)
  }

  const names = run.loot.map((id) => lootItem(id).name)
  lines.push(`你带出来的东西：${names.join('、')}。`)

  if (armed.length > 0) {
    state.marco.armed = true
    log.append({
      turn: state.turn,
      type: 'advisor',
      actors: ['marco'],
      summary: `Marco 身上有枪了（${armed[0]}）`,
      tone: 'bad',
      payload: { armed: true },
      ...(causedBy ? { causedBy } : {}),
    })
    lines.push('它比你记忆里沉。从今天起，有些事你多了一个选项——')
    lines.push('而那个选项一旦用过一次，就再也收不回去了。')
  }

  log.append({
    turn: state.turn,
    type: 'sale',
    actors: [run.contextId],
    summary: `带出 ${run.loot.length} 件东西（估价 $${lootValue(run.loot)}）`,
    tone: 'good',
    payload: { loot: [...run.loot] },
    ...(causedBy ? { causedBy } : {}),
  })

  run.loot = []
  return lines
}

export interface StashEntry {
  id: string
  name: string
  value: number
  /** 出手能拿到多少 */
  payout: number
  category: string
  note?: string
  armsYou: boolean
  /** 同一件东西有几个 */
  count: number
}

/** 按品类合并，UI 直接渲染。 */
export function stashView(state: GameState): StashEntry[] {
  const counts = new Map<string, number>()
  for (const id of state.stash) counts.set(id, (counts.get(id) ?? 0) + 1)
  return [...counts.entries()]
    .map(([id, count]) => {
      const item = lootItem(id)
      return {
        id,
        name: item.name,
        value: item.value,
        payout: payoutOf(id),
        category: item.category,
        ...(item.note ? { note: item.note } : {}),
        armsYou: item.armsYou === true,
        count,
      }
    })
    .sort((a, b) => b.value - a.value)
}

/** 现金按面值，其余打折。 */
export function payoutOf(id: string): number {
  const item = lootItem(id)
  return item.category === 'cash'
    ? item.value
    : Math.round(item.value * LOOT_FENCE_RATE)
}

/**
 * 「全部出手」能拿到多少。刻意跳过卖不掉的东西——枪和那叠证件——
 * 否则这个数字会承诺一笔你永远收不到的钱。
 */
export const sellable = (id: string): boolean => {
  const item = lootItem(id)
  return !item.armsYou && item.value > 0
}

export const stashWorth = (state: GameState): number =>
  state.stash.reduce((sum, id) => (sellable(id) ? sum + payoutOf(id) : sum), 0)

export class StashError extends Error {}

/**
 * 出手一件。枪不进这条路——你可以扔掉它，但那是另一个动作，
 * 而且扔掉它意味着你重新变回那个不会开枪的人。
 */
export function sellLoot(state: GameState, log: EventLog, id: string): number {
  const index = state.stash.indexOf(id)
  if (index < 0) throw new StashError('你手上没有这件东西。')
  const item = lootItem(id)
  if (item.armsYou) throw new StashError('这东西不能这么出手。')
  if (item.value === 0) throw new StashError(`${item.name}没人会买。`)

  state.stash.splice(index, 1)
  const payout = payoutOf(id)
  state.cash += payout
  log.append({
    turn: state.turn,
    type: 'sale',
    actors: [],
    summary: `出手了${item.name}，$${payout}`,
    tone: 'good',
    payload: { lootId: id, payout },
  })
  return payout
}

/** 一次清空。零价值的东西留在袋里——它们卖不掉，但也许有别的用处。 */
export function sellAllLoot(state: GameState, log: EventLog): number {
  let total = 0
  for (const id of [...new Set(state.stash)]) {
    if (!sellable(id)) continue
    while (state.stash.includes(id)) total += sellLoot(state, log, id)
  }
  return total
}

/** 丢掉一件。对那把枪来说，这是唯一的出路。 */
export function dropLoot(state: GameState, log: EventLog, id: string): void {
  const index = state.stash.indexOf(id)
  if (index < 0) throw new StashError('你手上没有这件东西。')
  state.stash.splice(index, 1)
  const item = lootItem(id)
  if (item.armsYou && !state.stash.some((s) => lootItem(s).armsYou)) {
    state.marco.armed = false
  }
  log.append({
    turn: state.turn,
    type: 'advisor',
    actors: ['marco'],
    summary: `扔掉了${item.name}`,
    tone: 'neutral',
    payload: { dropped: id },
  })
}

/** 内容完整性：每张表里的每个 id 都必须真的存在。 */
export function assertLootTablesResolve(): void {
  for (const [table, ids] of Object.entries(LOOT_TABLES)) {
    for (const id of ids) {
      try {
        lootItem(id)
      } catch {
        throw new Error(`赃物表 ${table} 里有未知条目：${id}`)
      }
    }
  }
}
