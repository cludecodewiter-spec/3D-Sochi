/**
 * Save serialisation and schema migration. DESIGN_v12.md §9.4.
 *
 * A 46-hour game means saves outlive several updates, so every schema bump
 * ships a migration. `load` walks the file up one version at a time.
 */

import type { GameEvent } from './events.js'
import { EventLog } from './events.js'
import type { RngState } from './rng.js'
import { Rng } from './rng.js'
import type { GameState } from './state.js'

export const SAVE_VERSION = 3

export interface SaveFile {
  version: number
  createdAt: string
  rng: RngState
  state: GameState
  log: GameEvent[]
}

export interface Session {
  state: GameState
  log: EventLog
  rng: Rng
}

/** version n → version n+1. Add an entry whenever SAVE_VERSION goes up. */
const migrations: Record<number, (save: SaveFile) => SaveFile> = {
  // v1 stored a single `heat` number. §3.3 splits it into base + current:
  // an old save has no way to know which half its heat belonged to, and the
  // honest answer is all of it is the decaying half — the player never
  // committed a crime the old model recorded as permanent.
  1: (save) => {
    const state = save.state as unknown as Record<string, unknown>
    const heat = typeof state['heat'] === 'number' ? (state['heat'] as number) : 0
    delete state['heat']
    state['wanted'] = { base: 0, current: heat, locked: false }
    state['playerName'] ??= 'MARCO'
    return { ...save, version: 2 }
  },

  // v2 有偷车和场所犯罪，但没有「被发现」这一层，也没有物品级赃物。
  // v3 补上：身上没枪、没有前科、不在里面、赃物袋是空的——
  // 对一个 v2 存档来说，这四条全都是事实。
  // 技能同时改名（§3.2 的八属性口径）：老名字按语义搬过去，不猜。
  2: (save) => {
    const state = save.state as unknown as Record<string, unknown>
    state['stash'] ??= []
    state['incident'] ??= null
    state['convictions'] ??= 0
    state['jailTurns'] ??= 0
    state['places'] ??= []

    const marco = state['marco'] as Record<string, unknown> | undefined
    if (marco) {
      marco['armed'] ??= false
      marco['health'] ??= 100
      const skills = marco['skills'] as Record<string, number> | undefined
      if (skills) marco['skills'] = renameSkills(skills)
    }

    const run = state['activeRun'] as Record<string, unknown> | null | undefined
    if (run) run['loot'] ??= []

    return { ...save, version: 3 }
  },
}

/**
 * 旧技能名 → CLAUDE.md §3.2 的口径。`shooting` 在 v2 里根本不存在，
 * 因为那时候还没有开枪这件事；老角色从 12 起步，和新开局一样。
 */
const SKILL_RENAMES: Record<string, string> = {
  stealth: 'hiding',
  mechanical: 'locksmithing',
  electronic: 'electronics',
  nerve: 'acting',
}

function renameSkills(skills: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(skills)) {
    out[SKILL_RENAMES[key] ?? key] = value
  }
  out['shooting'] ??= 12
  return out
}

export function serialize(session: Session, now = new Date()): SaveFile {
  return {
    version: SAVE_VERSION,
    createdAt: now.toISOString(),
    rng: session.rng.state,
    state: structuredClone(session.state),
    log: structuredClone(session.log.toJSON()),
  }
}

export function toJSON(session: Session, now = new Date()): string {
  return JSON.stringify(serialize(session, now))
}

export class SaveError extends Error {}

export function migrate(save: SaveFile): SaveFile {
  let current = save
  while (current.version < SAVE_VERSION) {
    const step = migrations[current.version]
    if (!step) {
      throw new SaveError(`没有从 v${current.version} 升级的迁移路径`)
    }
    current = step(current)
  }
  if (current.version > SAVE_VERSION) {
    throw new SaveError(`存档版本 v${current.version} 比当前游戏（v${SAVE_VERSION}）更新`)
  }
  return current
}

export function deserialize(save: SaveFile): Session {
  const migrated = migrate(save)
  return {
    state: structuredClone(migrated.state),
    log: EventLog.hydrate(migrated.log),
    rng: Rng.from(migrated.rng),
  }
}

export function fromJSON(json: string): Session {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new SaveError('存档不是合法的 JSON')
  }
  if (!isSaveFile(parsed)) throw new SaveError('存档结构不完整')
  return deserialize(parsed)
}

function isSaveFile(value: unknown): value is SaveFile {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<SaveFile>
  return (
    typeof v.version === 'number' &&
    typeof v.rng === 'object' &&
    v.rng !== null &&
    typeof v.state === 'object' &&
    v.state !== null &&
    Array.isArray(v.log)
  )
}
