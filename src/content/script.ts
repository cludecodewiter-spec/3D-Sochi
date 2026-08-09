/**
 * Scripted beats for the first hour. VERTICAL_SLICE.md §2–3.
 *
 * Everything here is a *hook* — the systems do the work, this only supplies
 * the words and the timing.
 */

/** §5.6 — the loan shark. Escalation is driven by missed payments, not turns. */
export interface DebtCall {
  missed: number
  title: string
  body: string[]
  /** Turns a crew member is put out of action, if any. */
  crewDisabledTurns?: number
}

export const DEBT_CALLS: DebtCall[] = [
  {
    missed: 0,
    title: '未接来电 · 3 通',
    body: [
      '"马可。是我。"',
      '"我知道你在听。我不催你，我只是提醒你一下日子——这个星期天。"',
      '"一千五。不多。你以前一个晚上就能挣出来。"',
      '"……我说的是以前。"',
    ],
  },
  {
    missed: 1,
    title: '来电 · 未接通',
    body: [
      '"星期天过去了。"',
      '"我不喜欢打第二次电话，马可。第二次电话说明第一次没用。"',
      '"下个星期天。一千五，还有这一周的利息。"',
    ],
  },
  {
    missed: 2,
    title: '来电 · 接通 · 00:41',
    body: [
      '"你去看看戴安娜。"',
      '"她没事，手上打了石膏而已。医生说六个星期。"',
      '"我本来是想打给你的，但你不接电话。"',
      '"下个星期天。"',
    ],
    crewDisabledTurns: 5,
  },
  {
    missed: 3,
    title: '来电 · 接通 · 00:09',
    body: ['"明天。"', '"就这样。"'],
  },
]

export const debtCallFor = (missed: number): DebtCall =>
  DEBT_CALLS[Math.min(missed, DEBT_CALLS.length - 1)] as DebtCall

/** Turn 1 tutorial target — low across the board, and Solomon is standing there. */
export const TUTORIAL_TARGET = 'delano_marlin_84'

/** VERTICAL_SLICE.md §3 — the betrayal. Benny's second tip is always false. */
export const BETRAYAL = {
  informantId: 'benny',
  /** His first tip is always true. Trust has to exist before it can be spent. */
  firstTipTurn: 3,
  firstTipTruth: 'true' as const,
  /** The second one is the one that gets Marco shot. */
  secondTipTurn: 8,
  secondTipTruth: 'false' as const,
  secondTipTemplate: 'approach_guards',
  injuryTurns: 4,
}

export const OPENING = {
  title: 'GRAND THEFT: TEXT',
  subtitle: '第一纪 · 手艺',
  body: [
    '你四十七岁。',
    '你这双手会做的事情只有一件，而这件事你做了二十年。',
    '',
    '你欠了一万二。',
    '欠的人不着急，因为他知道你跑不掉——',
    '像你这样的人，全城只有三个地方能去，他三个都认识。',
    '',
    '所罗门在车库里等你。他说他有个活儿。',
    '他说这话的时候，看你的眼神像在看一件要卖掉的东西。',
  ],
}

export const SLICE_END = {
  turn: 12,
  title: '第一纪 · 未完',
  body: [
    '这是垂直切片的终点。',
    '',
    '往后还有：戴安娜，凯，那辆你打不开的奥瑞恩，',
    '以及一个叫维达尔的人——他正在做你想做而没做成的事。',
    '',
    '但那些还没有做出来。',
  ],
}
