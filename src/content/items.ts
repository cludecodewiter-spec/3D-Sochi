/**
 * 赃物。
 *
 * 一次入室不该只产出一个数字——你翻到的是具体的东西，而具体的东西
 * 会改变你之后能做什么。那把左轮就是最好的例子：它不值几个钱，
 * 但从你把它揣进兜里那一刻起，「灭口」和「交火」才成为选项。
 */

export type LootCategory = 'cash' | 'valuables' | 'electronics' | 'weapon' | 'junk'

export interface LootItem {
  id: string
  name: string
  /** 销赃价。现金按面值。 */
  value: number
  category: LootCategory
  photo?: string
  /** 揣上它，你就有了开枪这个选项。 */
  armsYou?: boolean
  note?: string
}

export const LOOT: LootItem[] = [
  // ── 车里能摸到的 ──────────────────────────────────────────────────
  { id: 'radio', name: '车载收音机', value: 120, category: 'electronics', note: '拆下来要两分钟。' },
  { id: 'coins', name: '零钱盒里的硬币', value: 30, category: 'cash' },
  { id: 'sunglasses', name: '一副墨镜', value: 60, category: 'valuables' },
  { id: 'gps', name: '吸盘导航仪', value: 90, category: 'electronics' },
  { id: 'toolbag', name: '后备箱里的工具包', value: 140, category: 'junk' },
  { id: 'phone_old', name: '落在座位上的手机', value: 180, category: 'electronics', photo: 'items/phone' },
  { id: 'papers', name: '手套箱里的证件', value: 0, category: 'junk', note: '没人会买。但上面有名字和地址。' },

  // ── 屋里能翻到的 ──────────────────────────────────────────────────
  { id: 'wallet', name: '门口柜子上的钱包', value: 220, category: 'cash' },
  { id: 'handbag', name: '一只名牌包', value: 900, category: 'valuables' },
  { id: 'watch', name: '抽屉里的手表', value: 650, category: 'valuables' },
  { id: 'ring', name: '首饰盒', value: 1100, category: 'valuables' },
  { id: 'laptop', name: '书房的笔记本电脑', value: 700, category: 'electronics' },
  { id: 'envelope', name: '衣柜夹层里的信封', value: 1600, category: 'cash', note: '厚度让你愣了一下。' },
  { id: 'camera', name: '相机', value: 380, category: 'electronics' },
  { id: 'medkit', name: '药箱', value: 80, category: 'junk', photo: 'items/medkit' },
  {
    id: 'revolver',
    name: '床头柜里的左轮',
    value: 400,
    category: 'weapon',
    photo: 'items/revolver',
    armsYou: true,
    note: '有六发。你二十年没碰过这种东西。',
  },

  // ── 柜台后面 ──────────────────────────────────────────────────────
  { id: 'register', name: '收银机里的现钞', value: 480, category: 'cash' },
  { id: 'cartons', name: '几条烟', value: 260, category: 'junk' },
  { id: 'lotto', name: '一沓刮刮乐', value: 150, category: 'junk', note: '也许其中一张是中的。' },
]

export const LOOT_BY_ID: Record<string, LootItem> = Object.fromEntries(
  LOOT.map((i) => [i.id, i]),
)

export function lootItem(id: string): LootItem {
  const item = LOOT_BY_ID[id]
  if (!item) throw new Error(`未知赃物：${id}`)
  return item
}

/** 哪种场合能翻出哪些东西。抽取时按表随机。 */
export const LOOT_TABLES: Record<string, string[]> = {
  vehicle: ['radio', 'coins', 'sunglasses', 'gps', 'toolbag', 'phone_old', 'papers'],
  house: [
    'wallet', 'handbag', 'watch', 'ring', 'laptop', 'envelope',
    'camera', 'medkit', 'revolver',
  ],
  counter: ['register', 'cartons', 'lotto', 'phone_old'],
  pocket: ['wallet', 'coins', 'phone_old', 'sunglasses'],
}

export const lootValue = (ids: readonly string[]): number =>
  ids.reduce((sum, id) => sum + lootItem(id).value, 0)
