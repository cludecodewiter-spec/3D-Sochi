/**
 * The heist SegmentRun config. DESIGN_v12.md §4.
 *
 * This is *data*. The engine that runs it (`systems/segment-run.ts`) knows
 * nothing about cars — feeding it a different config gives you the chase, the
 * transport run and the race without another line of engine code. That
 * consolidation is surgery S1 in REVIEW_v11.md.
 */

import type { SegmentRunConfig } from './types.js'

export const HEIST_VARS = {
  /** 动静。100 ⇒ 被发现，任务立刻失败。 */
  noise: { init: 0, min: 0, max: 100, label: '动静' },
  /** 耗时。超过阈值后每一点都在扣成功率。 */
  time: { init: 0, min: 0, max: 60, label: '耗时' },
  /** 车况。直接乘进销赃价。 */
  condition: { init: 100, min: 0, max: 100, label: '车况' },
  /** 危险。由错误情报推高；到脱离阶段决定是否有人在等你。 */
  danger: { init: 0, min: 0, max: 100, label: '危险' },
} as const

export const HEIST_CONFIG: SegmentRunConfig = {
  id: 'heist',
  title: '偷车',
  vars: HEIST_VARS,
  failWhen: [
    { var: 'noise', atLeast: 100, text: '有人喊了一声。整条街的灯都亮了。' },
  ],
  segments: [
    {
      id: 'recon',
      title: '踩点',
      intro: '你在半个街区外停下来。从这里能看见它，也能看见那些能看见它的人。',
      tell: {
        accurate: '巡逻车刚过去。按你知道的节奏，下一趟在四十分钟以后。',
        vague: '街上很安静。安静得让你不太确定这是好事还是坏事。',
        misleading: '这片确实没车经过。你等了十分钟，一辆都没有——正如你听说的那样。',
        nerveHint: '……不过一辆都没有，本身就有点太干净了。',
      },
      abortHeat: 0,
      abortText: '你把手插回口袋，往回走。什么都没发生过。',
      options: [
        {
          id: 'patient',
          label: '蹲下来，看一会儿',
          hint: '最稳，但要花掉时间',
          skill: 'stealth',
          defense: 'exposure',
          modifier: 0.1,
          onSuccess: [{ var: 'time', amount: 2 }],
          onFailure: [
            { var: 'time', amount: 2 },
            { var: 'noise', amount: 8 },
          ],
          successText: '四十分钟。你把这条街的呼吸摸清楚了。',
          failureText: '你蹲得太久，一个遛狗的人从你旁边过去，回头看了你两眼。',
        },
        {
          id: 'sweep',
          label: '走一圈就走',
          hint: '快，但你只会看到表面',
          skill: 'stealth',
          defense: 'exposure',
          modifier: 0,
          onSuccess: [{ var: 'time', amount: 1 }],
          onFailure: [{ var: 'noise', amount: 12 }],
          successText: '一圈下来，该看的都看了。',
          failureText: '你走得太直了。直得像个在找什么的人。',
        },
        {
          id: 'ask',
          label: '找旁边的人打听',
          hint: '能问出细节，但你的脸被记住了',
          skill: 'nerve',
          defense: 'exposure',
          modifier: 0.05,
          onSuccess: [
            { var: 'time', amount: 1 },
            { var: 'noise', amount: 4 },
          ],
          onFailure: [{ var: 'noise', amount: 14 }],
          successText: '"那车？停这儿好几个月了。" 他说得很随意。',
          failureText: '"你问这个干什么？" 他没再说下去，但他记住你了。',
        },
      ],
    },
    {
      id: 'approach',
      title: '接近',
      intro: '从人行道到那辆车，一共十九步。你数过。',
      tell: {
        accurate: '车主十一点回来。现在是九点四十。你有八十分钟。',
        vague: '楼上有几扇窗还亮着。你不知道那些窗后面的人在看哪里。',
        misleading: '车主这周不在。这车已经三天没动过——你确认过轮胎上的灰。',
        nerveHint: '……可轮胎上的灰是你自己想看到的东西。',
      },
      abortHeat: 5,
      abortText: '你已经走出去一半，然后转身回来。动静已经造出来了，只是还没人喊。',
      options: [
        {
          id: 'shadow',
          label: '贴着阴影过去',
          hint: '最不容易被看见',
          skill: 'stealth',
          defense: 'exposure',
          modifier: 0.1,
          onSuccess: [{ var: 'time', amount: 2 }],
          onFailure: [{ var: 'noise', amount: 15 }],
          successText: '你贴着墙走完了十九步。没有人抬头。',
          failureText: '声控灯亮了。你在光里站了半秒，那半秒有一年那么长。',
        },
        {
          id: 'casual',
          label: '大方走过去，像个车主',
          hint: '看的人不会起疑，但你没有退路',
          skill: 'nerve',
          defense: 'exposure',
          modifier: 0.05,
          onSuccess: [{ var: 'time', amount: 1 }],
          onFailure: [{ var: 'noise', amount: 18 }],
          successText: '你掏出根本不存在的钥匙，边走边低头找。没有人多看一眼。',
          failureText: '你走得太自然了，自然到自己都不信。有人停下来看你。',
        },
        {
          id: 'wait',
          label: '等一个空档',
          hint: '安全，但时间在走',
          skill: 'stealth',
          defense: 'exposure',
          modifier: 0,
          onSuccess: [{ var: 'time', amount: 3 }],
          onFailure: [
            { var: 'time', amount: 3 },
            { var: 'noise', amount: 10 },
          ],
          successText: '楼上最后一扇灯灭了。现在。',
          failureText: '你等到的不是空档，是另一个人下楼。',
        },
      ],
    },
    {
      id: 'breach',
      title: '破解',
      intro: '手贴上车门。到这一步，剩下的全是手上的事。',
      tell: {
        accurate: '原厂锁，没换过。锁芯里的弹子你闭着眼都排得出来。',
        vague: '锁看不出年代。得摸进去才知道。',
        misleading: '就是个老锁。你听说过这一款——铁丝进去一挑就开。',
        nerveHint: '……你自己其实没看清锁芯。',
      },
      abortHeat: 12,
      abortText: '你把铁丝收回口袋。车还锁着，但你还站在外面。',
      options: [
        {
          id: 'wire',
          label: '铁丝开门，热线点火',
          hint: '你干了二十年的方式。安静，但对新车无效',
          skill: 'mechanical',
          defense: 'breachMechanical',
          modifier: 0.05,
          onSuccess: [{ var: 'time', amount: 2 }],
          onFailure: [
            { var: 'noise', amount: 20 },
            { var: 'time', amount: 3 },
          ],
          successText: '咔。二十年了，这个声音一次都没变过。',
          failureText: '锁芯里什么都没有。你在跟一台电脑较劲，而它连理都不理你。',
          failureEndsRun: true,
        },
        {
          id: 'column',
          label: '撬开方向盘柱，硬来',
          hint: '快得多，但动静大、车会伤',
          skill: 'mechanical',
          defense: 'breachMechanical',
          modifier: 0.15,
          onSuccess: [
            { var: 'noise', amount: 12 },
            { var: 'condition', amount: -12 },
            { var: 'time', amount: 1 },
          ],
          onFailure: [
            { var: 'noise', amount: 28 },
            { var: 'condition', amount: -20 },
          ],
          successText: '塑料裂开的声音比你想的响。但线在手上了。',
          failureText: '塑料碎了一地，线露出来了——可它们不接到你想要的地方去。',
          failureEndsRun: true,
        },
        {
          id: 'chip',
          label: '用电子设备',
          hint: '对新车唯一的路。你几乎不会用',
          skill: 'electronic',
          defense: 'ignition',
          modifier: 0,
          onSuccess: [{ var: 'time', amount: 1 }],
          onFailure: [{ var: 'noise', amount: 15 }],
          successText: '屏幕上跳出一行你看不懂的字，然后车灯亮了。',
          failureText: '设备一直在转。你不知道它在等什么，也不知道该按哪里。',
          failureEndsRun: true,
        },
      ],
    },
    {
      id: 'escape',
      title: '脱离',
      intro: '发动机响了。从现在开始，每一秒都在计价。',
      tell: {
        accurate: '往北那条小路一路通到河边，中间没有路口。',
        vague: '两个方向都能走。你不知道哪边更糟。',
        misleading: '西头那条路刚修好，最顺。往那边走，两分钟出城。',
        nerveHint: '……"最顺"这个词，是别人替你选的。',
      },
      abortHeat: 20,
      abortText: '你熄了火，下车，走开。车丢了，人还在。',
      options: [
        {
          id: 'calm',
          label: '按限速开走',
          hint: '不引人注意，但慢',
          skill: 'nerve',
          defense: 'pursuit',
          modifier: 0.05,
          onSuccess: [{ var: 'time', amount: 2 }],
          onFailure: [{ var: 'noise', amount: 10 }],
          successText: '你在第二个路口等了整整一个红灯。没有人看你。',
          failureText: '你太守规矩了。守规矩到一辆巡逻车放慢了速度跟在后面。',
        },
        {
          id: 'floor',
          label: '踩下去',
          hint: '最快，也最响',
          skill: 'driving',
          defense: 'pursuit',
          modifier: 0,
          onSuccess: [{ var: 'noise', amount: 12 }],
          onFailure: [
            { var: 'noise', amount: 25 },
            { var: 'condition', amount: -20 },
          ],
          successText: '三个街区，一次都没减速。',
          failureText: '轮胎在路口打滑，你蹭上了一根柱子。有人在拍照。',
        },
        {
          id: 'backstreets',
          label: '钻小路',
          hint: '甩得掉，但车要磕',
          skill: 'driving',
          defense: 'pursuit',
          modifier: 0.1,
          onSuccess: [
            { var: 'time', amount: 3 },
            { var: 'condition', amount: -5 },
          ],
          onFailure: [
            { var: 'condition', amount: -25 },
            { var: 'noise', amount: 18 },
          ],
          successText: '第四个弯之后，后视镜里什么都没有了。',
          failureText: '这条巷子是死的。你倒出来的时候刮掉了半边后视镜。',
        },
      ],
    },
  ],
}
