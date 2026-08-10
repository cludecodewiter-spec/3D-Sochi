/**
 * Crime locations — everything on the map that is not a car.
 *
 * CLAUDE.md §1 keeps these as data so a new place is a content change. Each
 * one lists the crimes it supports; the crime configs live in `crimes.ts` and
 * run on the same SegmentRun engine as the heist.
 */

import type { CrimeKey } from './crimes.js'
import type { LocationDefense, VenueKey } from './types.js'

export interface LocationDef {
  id: string
  name: string
  /** Map placement — must start with a district id, same rule as vehicles. */
  location: string
  venue: VenueKey
  photo: string
  flavor: string
  defense: LocationDefense
  crimes: CrimeKey[]
  /** Turn this becomes available. Locked places still show on the map. */
  unlockTurn: number
  /**
   * Shown instead of the action buttons while locked. A place you can see but
   * cannot touch is a better hook than a place that is not there.
   */
  lockedNote?: string
  /** Turns before it is worth hitting again. */
  cooldown: number
}

export const LOCATIONS: LocationDef[] = [
  {
    id: 'atm_midtown',
    name: '街角取款机',
    location: '中城 · 银行外墙上的那台',
    venue: 'atm',
    photo: 'places/atm',
    flavor:
      '嵌在墙里，正对着街。白天前面永远排着队，凌晨三点整条街只有它是亮的。',
    defense: { exposure: 40, security: 45, response: 50 },
    crimes: ['pickpocket', 'atm'],
    unlockTurn: 4,
    cooldown: 5,
  },
  {
    id: 'houses_west',
    name: '西区联排住宅',
    location: '西区 · 一整排一模一样的房子',
    venue: 'house',
    photo: 'places/residential',
    flavor:
      '每一栋都长得一样，连信箱的位置都一样。所以谁家没人，一眼就看得出来。',
    defense: { exposure: 32, security: 38, response: 42 },
    crimes: ['burgle'],
    unlockTurn: 6,
    cooldown: 6,
  },
  {
    id: 'gas_north',
    name: '北环加油站',
    location: '北环 · 通宵营业的那家',
    venue: 'gas',
    photo: 'places/gasstation',
    flavor:
      '开到天亮，永远只排一个班。柜台后面那个人整晚都在看柜台下面的电视。',
    defense: { exposure: 48, security: 40, response: 58 },
    crimes: ['holdup'],
    unlockTurn: 9,
    cooldown: 8,
  },
  {
    id: 'nightclub_south',
    name: '南街夜店',
    location: '南街 · 招牌只剩半边亮着',
    venue: 'bar',
    photo: 'places/nightclub',
    flavor:
      '这座城市的正经生意在白天谈，剩下的在这里谈。门口那两个人认得所有该认得的脸。',
    defense: { exposure: 55, security: 60, response: 45 },
    crimes: ['pickpocket'],
    unlockTurn: 12,
    cooldown: 4,
  },
  {
    id: 'casino_river',
    name: '河滨赛马场 · 后厅',
    location: '河滨路 · 看台底下那扇没有招牌的门',
    venue: 'casino',
    photo: 'places/racetrack',
    flavor:
      '白天卖马票，晚上后厅开桌。这里的钱不进银行——每天凌晨有人开车拉走。',
    defense: { exposure: 62, security: 70, response: 66 },
    crimes: ['casino', 'pickpocket'],
    unlockTurn: 12,
    cooldown: 12,
  },
  {
    id: 'den_north',
    name: '北环汽车旅馆 · 七号房',
    location: '北环 · 停车场只停三辆车的那家',
    venue: 'den',
    photo: 'places/motel',
    flavor:
      '科尔曼家收数的地方。门口永远坐着两个人，他们不看电视，也不说话。',
    defense: { exposure: 58, security: 52, response: 80 },
    crimes: ['den'],
    unlockTurn: 14,
    cooldown: 15,
  },
  {
    id: 'bank_midtown',
    name: '中城银行',
    location: '中城 · 十字路口那栋石头房子',
    venue: 'store',
    photo: 'places/bank',
    flavor:
      '三道门，两个持枪的，一个延时保险库。你每次路过都会算一遍，每次都算不过来。',
    defense: { exposure: 78, security: 92, response: 88 },
    crimes: [],
    unlockTurn: 999,
    lockedNote: '这不是一个人的活。你需要一支队伍——而你现在连一个人都雇不起。',
    cooldown: 30,
  },
]

export const LOCATION_BY_ID: Record<string, LocationDef> = Object.fromEntries(
  LOCATIONS.map((l) => [l.id, l]),
)

export function locationDef(id: string): LocationDef {
  const def = LOCATION_BY_ID[id]
  if (!def) throw new Error(`未知地点：${id}`)
  return def
}

/**
 * 在什么地方动手，就会被什么人撞见。加油站是柜台后面那个店员，
 * 住宅区是楼上没睡的老太太——这层对应关系写在这里，不写死在判定里。
 */
const POOL_BY_VENUE: Partial<Record<VenueKey, string>> = {
  house: 'house',
  apartment: 'house',
  store: 'counter',
  gas: 'counter',
  lot: 'lot',
  deck: 'lot',
  casino: 'casino',
  den: 'den',
}

export const witnessPool = (id: string): string =>
  POOL_BY_VENUE[locationDef(id).venue] ?? 'street'
