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

export const SAVE_VERSION = 2

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
