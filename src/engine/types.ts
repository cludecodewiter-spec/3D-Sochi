/**
 * Cross-cutting primitive types. See DESIGN_v12.md §5.1, §6.2, §8.2.
 * This module must stay dependency-free — everything else may import it.
 */

/**
 * CLAUDE.md §3.2 的属性表。
 *
 * `acting` 与 `shooting` 不是装饰——被人撞见之后，你能不能把话圆过去、
 * 要不要开枪，全靠这两项。没有它们，「失败」就只能是「你走掉了」。
 */
export type SkillKey =
  | 'hiding'
  | 'acting'
  | 'shooting'
  | 'driving'
  | 'locksmithing'
  | 'electronics'

export type Skills = Record<SkillKey, number>

export const SKILL_LABELS: Record<SkillKey, string> = {
  hiding: '隐匿',
  acting: '演技',
  shooting: '射击',
  driving: '驾驶',
  locksmithing: '开锁',
  electronics: '电气',
}

/** 面板顺序：先是让你不被发现的，再是被发现之后要用的。 */
export const SKILL_ORDER: SkillKey[] = [
  'hiding',
  'locksmithing',
  'electronics',
  'driving',
  'acting',
  'shooting',
]

/** 车辆年代。决定 lock/ignition 的形态，是「过时」主题的数值载体。§5.2 */
export type Era = 'classic' | 'modern' | 'contemporary'

export const ERA_LABELS: Record<Era, string> = {
  classic: '老车（1995 年前）',
  modern: '过渡期（1996–2010）',
  contemporary: '现代（2011 年后）',
}

/** 情报真值。partial = 方向对、关键数字错。§6.2 */
export type Truth = 'true' | 'partial' | 'false'

export type Difficulty = 'story' | 'standard' | 'hardcore'

/** 四段偷车对应的四个防御维度。§5.2 */
export interface VehicleDefense {
  exposure: number
  lock: number
  ignition: number
  pursuit: number
}

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

export const round2 = (v: number): number => Math.round(v * 100) / 100
