/**
 * The target list. DESIGN_v12.md §5.2, VERTICAL_SLICE.md §4.
 *
 * 6 classic / 3 modern / 1 contemporary. The contemporary car is visible from
 * the first hour and cannot be taken — the player will try, and fail, and only
 * understand what that meant about fifteen hours later.
 */

import type { VehicleDef } from './types.js'

export const VEHICLES: VehicleDef[] = [
  {
    id: 'delano_wagon_79',
    name: '德拉诺 Wagon',
    year: 1979,
    era: 'classic',
    bodyType: 'wagon',
    basePrice: 1_800,
    defense: { exposure: 22, lock: 20, ignition: 10, pursuit: 18 },
    location: '东区 · 一条没有路灯的巷子',
    flavor: '后座堆着别人家的杂物。这车的主人已经很久没开它了。',
  },
  {
    id: 'delano_marlin_84',
    name: '德拉诺 Marlin',
    year: 1984,
    era: 'classic',
    bodyType: 'sedan',
    basePrice: 2_200,
    defense: { exposure: 18, lock: 22, ignition: 12, pursuit: 20 },
    location: '码头区 · 仓库后面',
    flavor: '锁芯松得像一颗要掉的牙。二十年前你就撬过一模一样的。',
  },
  {
    id: 'mercer_ranger_93',
    name: '默瑟 Ranger 皮卡',
    year: 1993,
    era: 'classic',
    bodyType: 'pickup',
    basePrice: 2_400,
    defense: { exposure: 28, lock: 26, ignition: 14, pursuit: 25 },
    location: '工业路 · 建材店门口',
    flavor: '车斗里有水泥灰。它每天都在这个位置，前后不超过两米。',
  },
  {
    id: 'vantry_coast_91',
    name: '万特里 Coast',
    year: 1991,
    era: 'classic',
    bodyType: 'sedan',
    basePrice: 2_800,
    defense: { exposure: 35, lock: 30, ignition: 15, pursuit: 32 },
    location: '南街 · 一家还没关门的洗衣房外',
    flavor: '洗衣房的灯亮到十一点。十一点之后这条街上什么都没有。',
  },
  {
    id: 'halloran_sedan_95',
    name: '哈洛伦 Sedan',
    year: 1995,
    era: 'classic',
    bodyType: 'sedan',
    basePrice: 3_400,
    defense: { exposure: 40, lock: 40, ignition: 25, pursuit: 38 },
    location: '中城 · 公寓楼下的固定车位',
    flavor: '九五年的车，已经开始有那种电子的味道了。但也只是味道。',
  },
  {
    id: 'corso_gt_88',
    name: '科尔索 GT',
    year: 1988,
    era: 'classic',
    bodyType: 'coupe',
    basePrice: 5_200,
    defense: { exposure: 45, lock: 38, ignition: 22, pursuit: 44 },
    location: '河滨路 · 一栋独栋的车道上',
    flavor: '这一款一共造了不到四千台。买家不会问它从哪来。',
    legendary: true,
  },
  {
    id: 'vantry_coast_ii_02',
    name: '万特里 Coast II',
    year: 2002,
    era: 'modern',
    bodyType: 'sedan',
    basePrice: 5_600,
    defense: { exposure: 42, lock: 45, ignition: 48, pursuit: 45 },
    location: '西区 · 超市停车场靠外的一排',
    flavor: '第一批装了防盗锁止的量产车。当年你觉得那只是个噱头。',
  },
  {
    id: 'mercer_ranger_lx_09',
    name: '默瑟 Ranger LX',
    year: 2009,
    era: 'modern',
    bodyType: 'pickup',
    basePrice: 6_900,
    defense: { exposure: 48, lock: 50, ignition: 55, pursuit: 52 },
    location: '北环 · 加油站边上',
    flavor: '同一个名字，同一个厂。里面已经完全是另一台机器了。',
  },
  {
    id: 'corso_gtx_07',
    name: '科尔索 GTX',
    year: 2007,
    era: 'modern',
    bodyType: 'coupe',
    basePrice: 8_400,
    defense: { exposure: 55, lock: 55, ignition: 58, pursuit: 62 },
    location: '河滨路 · 那栋独栋换的新车',
    flavor: '同一家人。同一个车道。十九年过去了。',
  },
  {
    id: 'aureon_solace_14',
    name: '奥瑞恩 Solace',
    year: 2014,
    era: 'contemporary',
    bodyType: 'sleek',
    basePrice: 19_500,
    defense: { exposure: 72, lock: 65, ignition: 92, pursuit: 84 },
    location: '中城 · 写字楼地下车库 B2',
    flavor:
      '你在名单上看了它很久。它值一万九，是这张表上其余所有车加起来的一半。' +
      '你也知道自己打不开它——但你还没有真正试过。',
    legendary: true,
  },
]

export const VEHICLE_BY_ID: Record<string, VehicleDef> = Object.fromEntries(
  VEHICLES.map((v) => [v.id, v]),
)

export function vehicleDef(id: string): VehicleDef {
  const def = VEHICLE_BY_ID[id]
  if (!def) throw new Error(`未知车辆：${id}`)
  return def
}
