/**
 * 被发现之后。
 *
 * 此前的判定是「掷一次骰子 → 成或败 → 结束」。真正缺的一层是：
 * **失败不是终点，是进入下一个环节** —— 谁看见了你，以及你打算拿他怎么办。
 *
 * 三种发现者，处理方式完全不同：
 *   人      能被糊弄、能被收买、能被吓住，也能被灭口
 *   监控    不听你说话，也不收钱。只能砸掉、拔掉，或者留着
 *   警察    到这一步只剩三条路，其中两条通向牢房
 */

import type { SkillKey } from '../engine/types.js'

export type IncidentKind = 'witness' | 'camera' | 'police'

export interface IncidentEffect {
  text: string
  /** 累积通缉，会自然衰减 */
  wanted?: number
  /** 底案，永不衰减，贿赂消不掉 */
  wantedBase?: number
  health?: number
  /** 这一趟到此为止 */
  endsRun?: boolean
  /** 进局子 */
  arrest?: boolean
  /** 死了人 */
  killed?: boolean
}

export interface IncidentOption {
  id: string
  label: string
  hint: string
  /** 不填表示不需要判定，必定发生 */
  skill?: SkillKey
  difficulty?: number
  cashCost?: number
  /** 只有带着枪才出现 */
  needsWeapon?: boolean
  onSuccess: IncidentEffect
  onFailure?: IncidentEffect
}

export interface IncidentDef {
  kind: IncidentKind
  title: string
  /** `{who}` 会被替换成具体的发现者 */
  intro: string
  options: IncidentOption[]
}

/** 谁撞见了你。按场所抽。 */
export const WITNESSES: Record<string, string[]> = {
  street: ['一个遛狗的中年男人', '推着婴儿车的年轻女人', '刚下夜班的便利店店员'],
  house: ['楼上没睡的老太太', '回来拿东西的房主', '隔壁探头出来的邻居'],
  counter: ['柜台后面那个店员', '正在加油的司机'],
  lot: ['停车场的收费员', '一个等人的出租车司机'],
  casino: ['出纳台后面的女人', '走廊尽头那个保安', '一个不该在这层的荷官'],
  // 帮派据点撞见你的从来不是路人。这也是这一处最贵的原因。
  den: ['门口那两个人里的一个', '从七号房出来的那个矮个子', '停车场里刚下车的人'],
}

export const INCIDENTS: Record<IncidentKind, IncidentDef> = {
  witness: {
    kind: 'witness',
    title: '有人看见了',
    intro: '{who}正看着你。他还没喊，但他已经看清了你的脸。',
    options: [
      {
        id: 'talk',
        label: '把话圆过去',
        hint: '演技。成了就当什么都没发生',
        skill: 'acting',
        difficulty: 42,
        onSuccess: {
          text: '"我车钥匙锁里面了。" 你说得比自己想的还自然。他笑了笑，走了。',
        },
        onFailure: {
          text: '他没接你的话，只是往后退了两步，然后掏出手机。',
          wanted: 10,
        },
      },
      {
        id: 'bribe',
        label: '塞钱',
        hint: '$400。有人收了钱就是收了',
        skill: 'acting',
        difficulty: 30,
        cashCost: 400,
        onSuccess: {
          text: '他看了看钱，看了看你，然后什么都没说地走开了。',
        },
        onFailure: {
          text: '他收下了钱。然后在你走出二十米之后，还是打了那个电话。',
          wanted: 12,
        },
      },
      {
        id: 'scare',
        label: '吓住他',
        hint: '不用动手，但他会记得这张脸',
        skill: 'acting',
        difficulty: 50,
        onSuccess: {
          text: '你朝他走了两步，什么也没说。他先移开了视线。',
          wanted: 5,
        },
        onFailure: {
          text: '他比你想的硬。他一边后退一边开始喊。',
          wanted: 18,
        },
      },
      {
        id: 'silence',
        label: '灭口',
        hint: '再也不会有人从他嘴里听到这件事',
        skill: 'shooting',
        difficulty: 45,
        needsWeapon: true,
        onSuccess: {
          text: '很快。快到你还没想清楚自己在做什么。\n街上重新安静下来，只是这条街从此不一样了。',
          // 杀人是永久的。这一段进底案，任何钱都买不回来。
          wantedBase: 22,
        },
        onFailure: {
          text: '你的手在抖，子弹打在墙上。他跑掉了——带着你的样子跑掉了。',
          wantedBase: 14,
          wanted: 22,
        },
      },
      {
        id: 'run',
        label: '转身就跑',
        hint: '最省事，但他会去报警',
        skill: 'hiding',
        difficulty: 36,
        onSuccess: {
          text: '你跑进了两条街外的巷子。他大概只看清了一个背影。',
          wanted: 8,
          endsRun: true,
        },
        onFailure: {
          text: '你跑了，但他看清了方向，也看清了你上的那辆车。',
          wanted: 20,
          endsRun: true,
        },
      },
    ],
  },

  camera: {
    kind: 'camera',
    title: '摄像头',
    intro:
      '墙角那个黑色半球转了过来。{who}\n' +
      '它不听你解释，也不收你的钱——录像这会儿已经在别的地方了。',
    options: [
      {
        id: 'smash',
        label: '砸掉它',
        hint: '最快，但动静不小',
        skill: 'locksmithing',
        difficulty: 30,
        onSuccess: {
          text: '一下就够了。玻璃碎在地上，红灯灭了。',
          wanted: 6,
        },
        onFailure: {
          text: '你够不着。跳起来那两下反倒让警报响了。',
          wanted: 16,
        },
      },
      {
        id: 'pull',
        label: '找到主机，拔硬盘',
        hint: '干净利落，但你不擅长这个',
        skill: 'electronics',
        difficulty: 55,
        onSuccess: {
          text: '柜子里那台机器嗡嗡响着。你把硬盘抽出来揣进兜里。什么都没留下。',
        },
        onFailure: {
          text: '线太多了。你在柜子前面站了三分钟，一根都没敢拔。',
          wanted: 10,
        },
      },
      {
        id: 'ignore',
        label: '不管它，接着干',
        hint: '省时间。代价是那段录像会一直在',
        onSuccess: {
          text: '你侧过脸，继续手上的事。红灯一直亮着。',
          // 保安公司的录像会归档，警察迟早会调。这一段消不掉。
          wantedBase: 8,
        },
      },
    ],
  },

  police: {
    kind: 'police',
    title: '警察到了',
    intro: '{who}\n手电筒的光扫过来，停在你身上。',
    options: [
      {
        id: 'fight',
        label: '开枪',
        hint: '打倒他们也许能走。但这条线过去就回不来了',
        skill: 'shooting',
        difficulty: 62,
        needsWeapon: true,
        onSuccess: {
          text: '两声。然后是很长的安静。\n你上了车，手一直没停下来抖。',
          // 打警察是这个游戏里最贵的一件事。
          wantedBase: 32,
          killed: true,
          endsRun: true,
        },
        onFailure: {
          text: '你先开的枪，但没打中。他们没有不中。',
          health: -45,
          arrest: true,
          endsRun: true,
        },
      },
      {
        id: 'flee',
        label: '跑',
        hint: '看你的车和你的运气',
        skill: 'driving',
        difficulty: 56,
        onSuccess: {
          text: '你在第三个路口甩掉了他们。后视镜里只剩下光。',
          wanted: 22,
          endsRun: true,
        },
        onFailure: {
          text: '两个街区。你连巷子口都没拐进去。',
          arrest: true,
          endsRun: true,
        },
      },
      {
        id: 'surrender',
        label: '把手举起来',
        hint: '不会挨枪子。但你要进去待一阵',
        onSuccess: {
          text: '你把手放到能看见的地方，跪下来。\n他们没有为难你——这种事他们一晚上要做好几回。',
          arrest: true,
          endsRun: true,
        },
      },
    ],
  },
}

/** 前科与刑期。第三次是无期。 */
export const SENTENCES = [8, 18]
export const STRIKES_TO_LIFE = 3
