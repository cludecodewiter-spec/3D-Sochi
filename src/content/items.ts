/**
 * 赃物目录。
 *
 * 一次入室不该只产出一个数字——你翻到的是具体的东西，而具体的东西
 * 会改变你之后能做什么。那把左轮就是最好的例子：它不值几个钱，
 * 但从你把它揣进兜里那一刻起，「灭口」和「交火」才成为选项。
 *
 * 编排原则：
 *   · 值钱的东西藏得深，浅处只有零钱和别人的杂物
 *   · 每张表都要有几件 value 0 的东西——落空是这个玩法的一部分
 *   · 武器只出现在你必须走进去的地方（住宅 / 赌场后厅 / 帮派账房），
 *     街上和口袋里永远摸不到枪
 */

export type LootCategory = 'cash' | 'valuables' | 'electronics' | 'weapon' | 'junk'

export interface LootItem {
  id: string
  name: string
  /** 销赃价。现金按面值。0 表示没人会买。 */
  value: number
  category: LootCategory
  photo?: string
  /** 揣上它，你就有了开枪这个选项。 */
  armsYou?: boolean
  note?: string
}

export const LOOT: LootItem[] = [
  // ── 车里能摸到的 ──────────────────────────────────────────────────
  { id: 'radio', name: '车载收音机', value: 120, category: 'electronics', photo: 'items/scanner', note: '拆下来要两分钟。' },
  { id: 'coins', name: '零钱盒里的硬币', value: 30, category: 'cash' },
  { id: 'sunglasses', name: '一副墨镜', value: 60, category: 'valuables' },
  { id: 'gps', name: '吸盘导航仪', value: 90, category: 'electronics', photo: 'items/scanner' },
  { id: 'toolbag', name: '后备箱里的工具包', value: 140, category: 'junk', photo: 'items/gloves' },
  { id: 'phone_old', name: '落在座位上的手机', value: 180, category: 'electronics', photo: 'items/phone' },
  { id: 'papers', name: '手套箱里的证件', value: 0, category: 'junk', note: '没人会买。但上面有名字和地址。' },
  { id: 'dashcam', name: '行车记录仪', value: 210, category: 'electronics', note: '里面有这两周的每一趟。' },
  { id: 'cd_case', name: '一盒 CD', value: 40, category: 'junk' },
  { id: 'child_seat', name: '儿童安全座椅', value: 80, category: 'junk', note: '你把它放回去了。' },
  { id: 'golf_clubs', name: '后备箱里的高尔夫球杆', value: 520, category: 'valuables' },
  { id: 'case_front', name: '副驾上的公文包', value: 430, category: 'valuables' },
  { id: 'parking_card', name: '月租车位卡', value: 0, category: 'junk', note: '能进那个车库。也许比钱有用。' },
  { id: 'spare_wheel', name: '备胎', value: 160, category: 'junk' },
  { id: 'jumper', name: '搭电线', value: 45, category: 'junk' },
  { id: 'cigarettes', name: '中控台上的半包烟', value: 15, category: 'junk' },
  { id: 'perfume', name: '挂在后视镜上的香水', value: 55, category: 'valuables' },
  { id: 'toll_change', name: '收费站零钱袋', value: 70, category: 'cash' },
  { id: 'camera_bag', name: '后座的相机包', value: 340, category: 'electronics' },
  { id: 'uniform', name: '后备箱里的工作服', value: 25, category: 'junk', note: '穿上它，很多地方没人会拦你。' },
  { id: 'impact_wrench', name: '电动扳手', value: 260, category: 'junk' },
  { id: 'badge_holder', name: '门禁卡套', value: 0, category: 'junk' },
  { id: 'sat_radio', name: '卫星电台主机', value: 190, category: 'electronics' },
  { id: 'suitcase', name: '一只登机箱', value: 120, category: 'junk' },
  { id: 'gym_bag', name: '健身包', value: 60, category: 'junk' },
  { id: 'kid_tablet', name: '座椅背后的平板', value: 230, category: 'electronics' },

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
  { id: 'silverware', name: '一套银餐具', value: 540, category: 'valuables' },
  { id: 'tv_small', name: '卧室的小电视', value: 320, category: 'electronics' },
  { id: 'coin_album', name: '集币册', value: 780, category: 'valuables' },
  { id: 'necklace', name: '项链', value: 860, category: 'valuables' },
  { id: 'cufflinks', name: '一对袖扣', value: 240, category: 'valuables' },
  { id: 'console', name: '游戏主机', value: 380, category: 'electronics' },
  { id: 'speaker', name: '客厅的音响', value: 260, category: 'electronics' },
  { id: 'pills', name: '处方药', value: 130, category: 'junk' },
  { id: 'passport', name: '一本护照', value: 0, category: 'junk', note: '照片上的人和你一点都不像。' },
  { id: 'deed', name: '房产证', value: 0, category: 'junk' },
  { id: 'liquor', name: '一瓶陈年威士忌', value: 420, category: 'valuables' },
  { id: 'painting', name: '走廊上的小幅油画', value: 1200, category: 'valuables', note: '不好出手，但真值这个价。' },
  { id: 'stamps', name: '邮票册', value: 640, category: 'valuables' },
  { id: 'bills', name: '抽屉里的现钞', value: 750, category: 'cash' },
  { id: 'piggy', name: '存钱罐', value: 90, category: 'cash', note: '你在楼梯上把它打开了。' },
  { id: 'gold_chain', name: '金链子', value: 980, category: 'valuables' },
  { id: 'tablet', name: '茶几上的平板', value: 410, category: 'electronics' },
  { id: 'drone', name: '柜顶上的无人机', value: 560, category: 'electronics' },
  { id: 'power_tools', name: '车库里的电动工具', value: 300, category: 'junk' },
  { id: 'fur', name: '衣柜里的皮草', value: 1400, category: 'valuables' },
  { id: 'watch_box', name: '表盒里的另外两块', value: 1600, category: 'valuables' },
  { id: 'road_bike', name: '车库里的公路车', value: 900, category: 'valuables' },
  { id: 'safe_cash', name: '保险箱里的现钞', value: 2200, category: 'cash' },

  // ── 柜台后面 ──────────────────────────────────────────────────────
  { id: 'register', name: '收银机里的现钞', value: 480, category: 'cash' },
  { id: 'cartons', name: '几条烟', value: 260, category: 'junk' },
  { id: 'lotto', name: '一沓刮刮乐', value: 150, category: 'junk', note: '也许其中一张是中的。' },
  { id: 'till_float', name: '备用金袋', value: 320, category: 'cash' },
  { id: 'scratch_roll', name: '整卷刮刮乐', value: 380, category: 'junk' },
  { id: 'phone_cards', name: '一叠电话卡', value: 140, category: 'junk' },
  { id: 'liquor_shelf', name: '货架上的洋酒', value: 290, category: 'valuables' },
  { id: 'smokes_carton', name: '整条外烟', value: 340, category: 'junk' },
  { id: 'second_drawer', name: '第二个抽屉', value: 260, category: 'cash' },
  { id: 'deposit_bag', name: '待存银行的钱袋', value: 900, category: 'cash', note: '今晚本来要送走的。' },
  { id: 'pos', name: '收银终端', value: 180, category: 'electronics' },
  { id: 'security_tape', name: '监控录像带', value: 0, category: 'junk', note: '带走它，今晚就没人认得出你。' },
  { id: 'staff_phone', name: '店员的手机', value: 200, category: 'electronics', photo: 'items/phone' },
  { id: 'batteries', name: '一箱电池', value: 70, category: 'junk' },
  { id: 'watch_display', name: '柜台里的手表', value: 480, category: 'valuables' },
  { id: 'zippo', name: '打火机', value: 60, category: 'junk' },
  { id: 'coffee_tin', name: '咖啡罐里的零钱', value: 110, category: 'cash' },
  { id: 'map_book', name: '一本旧地图册', value: 0, category: 'junk' },

  // ── 身上摸到的 ────────────────────────────────────────────────────
  { id: 'money_clip', name: '钱夹', value: 380, category: 'cash' },
  { id: 'watch_worn', name: '手腕上的表', value: 700, category: 'valuables', note: '他一路都没有低头看过时间。' },
  { id: 'keys', name: '一串钥匙', value: 0, category: 'junk' },
  { id: 'gold_lighter', name: '镀金打火机', value: 130, category: 'valuables' },
  { id: 'pen', name: '一支好笔', value: 160, category: 'valuables' },
  { id: 'earbuds', name: '无线耳机', value: 190, category: 'electronics' },
  { id: 'card_case', name: '名片夹', value: 0, category: 'junk', note: '一沓陌生人的名字。' },
  { id: 'pill_box', name: '药盒', value: 40, category: 'junk' },
  { id: 'race_ticket', name: '一张赛马票', value: 0, category: 'junk', note: '第三场，八号。已经开过了。' },
  { id: 'bracelet', name: '手链', value: 320, category: 'valuables' },

  // ── 赌场后厅 ──────────────────────────────────────────────────────
  { id: 'chips_rack', name: '一盘筹码', value: 1500, category: 'cash', note: '要拿去换才是钱。' },
  { id: 'chips_high', name: '高额筹码', value: 3400, category: 'cash', note: '这种面额，全城只有两个地方敢换。' },
  { id: 'cage_cash', name: '出纳台的现钞', value: 2600, category: 'cash' },
  { id: 'counting_bag', name: '点钞袋', value: 1900, category: 'cash' },
  { id: 'markers', name: '借据本', value: 0, category: 'junk', note: '欠这家钱的人，名字都在这儿。' },
  { id: 'dealer_watch', name: '荷官的表', value: 420, category: 'valuables' },
  { id: 'dvr', name: '赌厅监控主机', value: 0, category: 'junk', note: '带走它，今晚没有任何画面存在过。' },
  { id: 'vip_ledger', name: 'VIP 账本', value: 0, category: 'junk' },
  { id: 'cigar_box', name: '雪茄盒', value: 260, category: 'valuables' },
  { id: 'gold_bar', name: '抽屉里的小金条', value: 3200, category: 'valuables' },
  { id: 'card_shoe', name: '牌靴', value: 90, category: 'junk' },
  { id: 'tip_box', name: '小费箱', value: 340, category: 'cash' },
  { id: 'staff_locker', name: '员工柜里的现金', value: 480, category: 'cash' },
  {
    id: 'desk_pistol',
    name: '抽屉里的手枪',
    value: 500,
    category: 'weapon',
    photo: 'items/beretta',
    armsYou: true,
    note: '上了膛。放在这儿的人显然想过会有今天。',
  },

  // ── 帮派账房 ──────────────────────────────────────────────────────
  { id: 'gang_ledger', name: '收数本', value: 0, category: 'junk', note: '上面有名字。这东西比钱危险得多。' },
  { id: 'duffel', name: '帆布袋里的现钞', value: 4200, category: 'cash' },
  { id: 'brick', name: '一块砖', value: 1800, category: 'junk', note: '你没打开它。你不想知道。' },
  { id: 'scale', name: '电子秤', value: 120, category: 'junk' },
  { id: 'burners', name: '一把一次性手机', value: 260, category: 'electronics', photo: 'items/phone' },
  {
    id: 'shotgun',
    name: '靠墙的霰弹枪',
    value: 700,
    category: 'weapon',
    armsYou: true,
    note: '锯短过。拿着它，你就再也不是那个只带铁丝的人了。',
  },
  { id: 'gold_rings', name: '一把戒指', value: 900, category: 'valuables' },
  { id: 'gang_watch', name: '抽屉里的表', value: 1100, category: 'valuables' },
  { id: 'gang_safe', name: '保险柜里的现钞', value: 3600, category: 'cash' },
  { id: 'car_keys', name: '一串车钥匙', value: 0, category: 'junk', note: '楼下停着的都是他们的。' },
  { id: 'cash_belt', name: '腰包里的钱', value: 780, category: 'cash' },
  { id: 'liquor_case', name: '一箱酒', value: 380, category: 'junk' },
  { id: 'kevlar', name: '防弹背心', value: 450, category: 'junk', photo: 'items/vest', note: '有人在这儿等着挨枪子。' },
]

export const LOOT_BY_ID: Record<string, LootItem> = Object.fromEntries(
  LOOT.map((i) => [i.id, i]),
)

export function lootItem(id: string): LootItem {
  const item = LOOT_BY_ID[id]
  if (!item) throw new Error(`未知赃物：${id}`)
  return item
}

/**
 * 哪种场合能翻出哪些东西。抽取时按表随机。
 *
 * 表与表之间刻意有重叠（手机哪儿都有），但**枪只在三张表里**：
 * house / casino / den。这三处的共同点是你必须走进去。
 */
export const LOOT_TABLES: Record<string, string[]> = {
  vehicle: [
    'radio', 'coins', 'sunglasses', 'gps', 'toolbag', 'phone_old', 'papers',
    'dashcam', 'cd_case', 'child_seat', 'golf_clubs', 'case_front', 'parking_card',
    'spare_wheel', 'jumper', 'cigarettes', 'perfume', 'toll_change', 'camera_bag',
    'uniform', 'impact_wrench', 'badge_holder', 'sat_radio', 'suitcase', 'gym_bag',
    'kid_tablet',
  ],
  house: [
    'wallet', 'handbag', 'watch', 'ring', 'laptop', 'envelope', 'camera', 'medkit',
    'revolver', 'silverware', 'tv_small', 'coin_album', 'necklace', 'cufflinks',
    'console', 'speaker', 'pills', 'passport', 'deed', 'liquor', 'painting',
    'stamps', 'bills', 'piggy', 'gold_chain', 'tablet', 'drone', 'power_tools',
    'fur', 'watch_box', 'road_bike', 'safe_cash',
  ],
  counter: [
    'register', 'cartons', 'lotto', 'phone_old', 'till_float', 'scratch_roll',
    'phone_cards', 'liquor_shelf', 'smokes_carton', 'second_drawer', 'deposit_bag',
    'pos', 'security_tape', 'staff_phone', 'batteries', 'watch_display', 'zippo',
    'coffee_tin', 'map_book',
  ],
  pocket: [
    'wallet', 'coins', 'phone_old', 'sunglasses', 'money_clip', 'watch_worn',
    'keys', 'gold_lighter', 'pen', 'earbuds', 'card_case', 'pill_box',
    'race_ticket', 'bracelet',
  ],
  casino: [
    'chips_rack', 'chips_high', 'cage_cash', 'counting_bag', 'markers',
    'dealer_watch', 'dvr', 'vip_ledger', 'cigar_box', 'gold_bar', 'card_shoe',
    'tip_box', 'staff_locker', 'desk_pistol',
  ],
  den: [
    'gang_ledger', 'duffel', 'brick', 'scale', 'burners', 'shotgun', 'gold_rings',
    'gang_watch', 'gang_safe', 'car_keys', 'cash_belt', 'liquor_case', 'kevlar',
  ],
}

/** 只有走进去的地方才可能摸到枪。街上和口袋里永远没有。 */
export const ARMED_TABLES = ['house', 'casino', 'den']

export const lootValue = (ids: readonly string[]): number =>
  ids.reduce((sum, id) => sum + lootItem(id).value, 0)
