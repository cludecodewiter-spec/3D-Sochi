/**
 * The unlock curve. DESIGN_v12.md §8.1.
 *
 * Three hard constraints, enforced in `systems/unlocks.ts`:
 *   1. An unlocked-out system does not exist in the UI — not greyed out.
 *      A greyed-out button is still cognitive load.
 *   2. At least 3 turns between any two unlocks.
 *   3. Every unlock is delivered by Solomon, in character.
 *
 * This is the actual fix for the 6.5 onboarding score. The dossier (turn 6)
 * is a tool for hour five, not hour one — v11 misfiled it as a newbie aid.
 */

import type { AdvisorLine, UnlockDef } from './types.js'

export const UNLOCKS: UnlockDef[] = [
  {
    id: 'heist',
    label: '偷车',
    turn: 1,
    description: '看一辆车的四个数值，然后用四个阶段把它开走。',
  },
  {
    id: 'fence',
    label: '销赃',
    turn: 1,
    description: '车放在手上不值钱。把它变成钱。',
  },
  {
    id: 'informants',
    label: '线人与情报',
    turn: 3,
    description: '有人愿意卖消息给你。消息可能是假的。',
  },
  {
    id: 'dossier',
    label: '档案库',
    turn: 6,
    description: '你记不住的，它替你记着——包括谁害过你。',
  },
  {
    id: 'heat',
    label: '警方热度',
    turn: 9,
    description: '你做的每一件事都在别人的本子上记着。',
  },
  {
    id: 'verify',
    label: '情报验证',
    turn: 12,
    description: '找第二个人对一遍。它不会告诉你真相，只给你第二个数据点。',
  },
]

export const UNLOCK_BY_ID: Record<string, UnlockDef> = Object.fromEntries(
  UNLOCKS.map((u) => [u.id, u]),
)

/** Minimum turns between two unlocks. Constraint 2 above. */
export const UNLOCK_SPACING = 3

/**
 * Teaching is never a popup. It is an old man telling you how it works,
 * which doubles as characterisation — Solomon is genuinely looking for
 * a successor, and this is what that looks like.
 */
export const ADVISOR_LINES: AdvisorLine[] = [
  {
    trigger: 'heist',
    speaker: 'SOLOMON',
    text:
      '先看三样东西：它停在哪、锁是什么年代的、跑起来有多显眼。\n' +
      '其他的都是废话。',
  },
  {
    trigger: 'fence',
    speaker: 'SOLOMON',
    text:
      '车在你手上一分钱不值，还烫手。\n' +
      '拆车场给得少，但当场结清，而且他们不认识你。刚开始就这样吧。',
  },
  {
    trigger: 'informants',
    speaker: 'SOLOMON',
    text:
      '没人会白给你消息。\n' +
      '在你信他之前，先问自己——他为什么要告诉我？',
  },
  {
    trigger: 'heat',
    speaker: 'SOLOMON',
    text:
      '条子不是突然出现的。\n' +
      '他们是慢慢攒够了理由。你每干一票，就往那个本子上添一行。',
  },
  {
    trigger: 'dossier',
    speaker: 'SOLOMON',
    text:
      '我这辈子记不住的事，都写下来了。\n' +
      '你也该有个本子。人会忘，本子不会——尤其是关于谁坑过你这种事。',
  },
  {
    trigger: 'verify',
    speaker: 'SOLOMON',
    text:
      '一个人说的话是话。\n' +
      '两个人说的一样，那才叫消息。\n' +
      '但你要记住：第二个人也可能是错的。这行没有确定的事。',
  },
]

export const advisorLineFor = (trigger: string): AdvisorLine | undefined =>
  ADVISOR_LINES.find((l) => l.trigger === trigger)
