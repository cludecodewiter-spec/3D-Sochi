/**
 * The four informants. DESIGN_v12.md §6.1, VERTICAL_SLICE.md §3–4.
 *
 * `honesty` and `access` are never rendered anywhere, on any difficulty.
 * The player can only infer them from the shape of their mistakes:
 *
 *   低 access 的人错在方向上——他猜的。
 *   低 honesty 的人错在关键细节上——他知道，但他卖了你。
 *
 * Benny sits in the worst quadrant (honesty 45 / access 70): he knows, and he
 * still sells you the wrong number. He is also the first informant the player
 * ever meets, which is the whole point.
 */

import type { InformantDef } from './types.js'

export const INFORMANTS: InformantDef[] = [
  {
    id: 'benny',
    name: 'BENNY WALSH',
    role: '码头工人',
    honesty: 45,
    access: 70,
    price: 150,
    hangout: '港口区 · 那家没有招牌的酒吧',
    intro:
      '他在码头干了十四年，什么船进来、什么车出去，他都看得见。' +
      '他跟你说话的时候一直在看别的地方。',
  },
  {
    id: 'rosa',
    name: 'ROSA IBARRA',
    role: '夜班护士',
    honesty: 80,
    access: 30,
    price: 80,
    hangout: '中城 · 医院对面的二十四小时快餐店',
    intro:
      '她从不撒谎，一次也没有。问题是她知道的事情有限——' +
      '她告诉你的，大多是她听别人在急诊室里说的。',
  },
  {
    id: 'teo',
    name: 'TEO',
    role: '修车行学徒',
    honesty: 30,
    access: 40,
    price: 60,
    hangout: '工业路 · 他师傅的铺子后门',
    intro: '便宜。他会为了六十块钱编一整段话，而且编得挺像那么回事。',
  },
  {
    id: 'marcus',
    name: 'MARCUS FANE',
    role: '保险公司理赔员',
    honesty: 70,
    access: 75,
    price: 400,
    hangout: '中城 · 一家太贵的咖啡馆',
    intro:
      '他能看到全市每一份车险的资料。他要价四百，' +
      '而且他很清楚这四百块买的是什么。',
  },
]

export const INFORMANT_BY_ID: Record<string, InformantDef> = Object.fromEntries(
  INFORMANTS.map((i) => [i.id, i]),
)

export function informantDef(id: string): InformantDef {
  const def = INFORMANT_BY_ID[id]
  if (!def) throw new Error(`未知线人：${id}`)
  return def
}
