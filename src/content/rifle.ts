/**
 * 翻车 —— 不开走它，只把里面的东西拿走。
 *
 * 这是《Car Thief》里最被低估的一件事：一辆装了防盗的 2016 年新车对你
 * 来说等于一堵墙，但它的车窗和 1987 年那辆没有区别。撬开、翻一遍、走人，
 * 你带走的是收音机、手套箱里的东西、和后座上那只包。
 *
 * 它跑在和偷车完全相同的引擎上，只是段更短、图更小、留下的痕迹也更浅。
 * 关键区别在结算：这一趟的产出不是一个数字，是**一堆具体的东西**。
 */

import type { SegmentRunConfig } from './types.js'

export const RIFLE_VARS = {
  noise: { init: 0, min: 0, max: 100, label: '动静' },
  time: { init: 0, min: 0, max: 60, label: '耗时' },
} as const

export const RIFLE_CONFIG: SegmentRunConfig = {
  id: 'rifle',
  title: '翻车',
  vars: RIFLE_VARS,
  failWhen: [{ var: 'noise', atLeast: 100, text: '警报叫了起来，整条街都听见了。' }],
  segments: [
    {
      id: 'pop',
      title: '开门',
      intro: '你不需要它跑起来。你只需要门开一条缝。',
      tell: {
        accurate: '副驾那侧的门锁是老式提杆，铁丝够得着。',
        vague: '你从外面看不出这车有没有装报警器。',
        misleading: '这个年份的车没有中控联动，撬哪边都一样。',
        nerveHint: '……你上次这么想的时候，喇叭响了四十秒。',
      },
      abortHeat: 2,
      abortText: '你把铁丝收回袖子里，继续往前走。',
      options: [
        {
          id: 'slim',
          label: '铁丝走车窗缝',
          hint: '最安静，但慢',
          skill: 'locksmithing',
          defense: 'lock',
          modifier: 0.1,
          onSuccess: [{ var: 'time', amount: 3 }],
          onFailure: [
            { var: 'time', amount: 3 },
            { var: 'noise', amount: 12 },
          ],
          successText: '提杆弹起来的时候几乎没有声音。',
          failureText: '铁丝在胶条里卡住了，你拽出来的时候整块玻璃都在响。',
        },
        {
          id: 'jam',
          label: '塞气囊撑门缝',
          hint: '快，但会留下痕迹',
          skill: 'locksmithing',
          defense: 'lock',
          modifier: 0.04,
          onSuccess: [
            { var: 'time', amount: 1 },
            { var: 'noise', amount: 6 },
          ],
          onFailure: [{ var: 'noise', amount: 20 }],
          successText: '门框被撑开两指宽。够了。',
          failureText: '撑得太开，密封条崩了一截，车子晃了一下。',
        },
        {
          id: 'glass',
          label: '砸后三角窗',
          hint: '一定成，但响',
          skill: 'locksmithing',
          defense: 'exposure',
          modifier: 0.2,
          onSuccess: [{ var: 'noise', amount: 26 }],
          onFailure: [{ var: 'noise', amount: 44 }],
          successText: '一下。玻璃碎在座椅上，声音比你想的闷。',
          failureText: '玻璃碎了，报警器也叫了。',
        },
      ],
    },
    {
      id: 'sweep',
      title: '翻找',
      intro: '车里有一股别人的味道。你有多少时间，取决于你敢待多久。',
      tell: {
        accurate: '后座上那只包没拉拉链。手套箱是开着的。',
        vague: '天太黑，你只能靠手摸。',
        misleading: '这种车中控台底下都有暗格，钱都放那儿。',
        nerveHint: '……你从来没在任何一辆车里找到过所谓的暗格。',
      },
      abortHeat: 6,
      abortText: '你把门带上，两手空空地走开了。',
      options: [
        {
          id: 'grab',
          label: '抓了就走',
          hint: '明面上的东西，十秒钟',
          skill: 'hiding',
          defense: 'exposure',
          modifier: 0.16,
          onSuccess: [{ var: 'time', amount: 1 }],
          onFailure: [{ var: 'noise', amount: 10 }],
          successText: '座椅上、杯架里、遮阳板夹层。十秒，关门。',
          failureText: '你伸手的时候压到了喇叭。',
          draws: { table: 'vehicle', count: 1 },
        },
        {
          id: 'toss',
          label: '前后翻一遍',
          hint: '东西多，但你要在车里待着',
          skill: 'hiding',
          defense: 'exposure',
          modifier: -0.04,
          onSuccess: [
            { var: 'time', amount: 4 },
            { var: 'noise', amount: 8 },
          ],
          onFailure: [
            { var: 'time', amount: 4 },
            { var: 'noise', amount: 24 },
          ],
          successText: '手套箱、中控台、后备箱。你花了四分钟，值。',
          failureText: '你在后备箱里翻的时候，有辆车打着灯拐了进来。',
          draws: { table: 'vehicle', count: 3 },
        },
        {
          id: 'stereo',
          label: '拆音响',
          hint: '值钱，但要动线',
          skill: 'electronics',
          defense: 'ignition',
          modifier: -0.02,
          onSuccess: [
            { var: 'time', amount: 5 },
            { var: 'noise', amount: 6 },
          ],
          onFailure: [
            { var: 'time', amount: 5 },
            { var: 'noise', amount: 30 },
          ],
          successText: '卡扣、两根线、一颗螺丝。整台机器落在你手里。',
          failureText: '你扯断了一根线，仪表盘全亮了，然后是喇叭。',
          draws: { table: 'vehicle', count: 2 },
        },
      ],
    },
  ],
}
