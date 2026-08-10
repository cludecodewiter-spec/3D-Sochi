/**
 * Intel templates. DESIGN_v12.md §6.2.
 *
 * Each template ships three phrasings of the same claim. Which one the player
 * gets is decided by the informant's honesty/access roll — the text itself is
 * never hedged, so a false tip reads exactly as confident as a true one.
 *
 * `partial` is the most valuable of the three: right direction, wrong number.
 * It teaches the player to distrust precise figures, which is the lesson the
 * whole game is built on.
 */

import type { IntelTemplate } from './types.js'

export const INTEL_TEMPLATES: IntelTemplate[] = [
  {
    id: 'recon_patrol',
    segmentId: 'recon',
    trueText: '{target} 那条街上，巡逻车每四十分钟过一次。中间那段时间没人。',
    partialText: '{target} 那条街上巡逻车过得不勤，大概一小时一趟吧。',
    falseText: '{target} 那片区域最近撤了巡逻。整晚都不会有车过去。',
  },
  {
    id: 'recon_camera',
    segmentId: 'recon',
    trueText: '{target} 斜对面那个摄像头是坏的，坏了三个月了，没人报修。',
    partialText: '{target} 附近的摄像头有几个是坏的。具体哪个我说不好。',
    falseText: '{target} 那块地方一个摄像头都没有。我天天从那儿走。',
  },
  {
    id: 'approach_owner',
    segmentId: 'approach',
    trueText: '{target} 的车主每天十一点前后回来，一次都没变过。',
    partialText: '{target} 的车主晚上会回来，具体几点不一定。',
    falseText: '{target} 的车主这周出差了。那车停在那儿三天没动。',
  },
  {
    id: 'approach_watch',
    segmentId: 'approach',
    trueText: '{target} 旁边那栋楼里有个老头总在窗口坐着。绕开他那一侧。',
    partialText: '{target} 那边有人爱往窗外看，你自己注意点。',
    falseText: '{target} 周围没人住。那几栋楼一半是空的。',
  },
  {
    id: 'approach_guards',
    segmentId: 'approach',
    trueText: '{target} 停的地方有看守。我数过，六个人，两个在前面，四个在后面。',
    partialText: '{target} 那儿有几个看守。反正不止一个。',
    falseText: '{target} 那儿只有两个看守，都在前门。后面那道卷帘门锁着没人。',
  },
  {
    id: 'breach_lock',
    segmentId: 'breach',
    trueText: '{target} 的锁是原厂的，从没换过。老式的，你懂的。',
    partialText: '{target} 的锁看着挺旧，应该不难。',
    falseText: '{target} 的锁我见过，就是个老锁。铁丝进去一挑就开。',
  },
  {
    id: 'breach_alarm',
    segmentId: 'breach',
    trueText: '{target} 的警报器早就拆了。车主嫌它半夜乱叫。',
    partialText: '{target} 的警报器好像有点毛病，不太灵。',
    falseText: '{target} 根本没装警报。那年头的车都不装。',
  },
  {
    id: 'escape_route',
    segmentId: 'escape',
    trueText: '{target} 往北那条小路能一直通到河边，中间不过任何路口。',
    partialText: '{target} 北边有条小路，我记得能通出去。',
    falseText: '{target} 往北那条路直接上高架，两分钟就能出城。',
  },
  {
    id: 'escape_block',
    segmentId: 'escape',
    trueText: '{target} 那条街西头这周在施工，堵死的。别往那边走。',
    partialText: '{target} 附近好像有段路在修。',
    falseText: '{target} 西头那条路刚修好，最顺。往那边走。',
  },
  {
    id: 'escape_shift',
    segmentId: 'escape',
    trueText: '{target} 那片是二分局管，他们十点换班，那二十分钟人最少。',
    partialText: '{target} 那片的警察晚上换一次班，具体几点不清楚。',
    falseText: '{target} 那片今晚没人管。二分局全被抽去别的地方了。',
  },
]

export const INTEL_TEMPLATE_BY_ID: Record<string, IntelTemplate> = Object.fromEntries(
  INTEL_TEMPLATES.map((t) => [t.id, t]),
)

export const templatesForSegment = (segmentId: string): IntelTemplate[] =>
  INTEL_TEMPLATES.filter((t) => t.segmentId === segmentId)
