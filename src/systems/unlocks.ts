/**
 * Unlock gating. DESIGN_v12.md §8.1, surgery S2.
 *
 * The real fix for the onboarding score isn't a dossier — it's never showing
 * the player a system they have no reason to think about yet. Two rules do
 * all the work: unlocked systems only, and never two new ones at once.
 */

import type { EventLog } from '../engine/events.js'
import type { GameState } from '../engine/state.js'
import { isUnlocked } from '../engine/state.js'
import { DIFFICULTIES } from '../content/balance.js'
import type { AdvisorLine, UnlockDef } from '../content/types.js'
import { UNLOCKS, UNLOCK_SPACING, advisorLineFor } from '../content/unlocks.js'

export interface UnlockEvent {
  unlock: UnlockDef
  advisor: AdvisorLine | null
}

/**
 * Called at the start of each turn. Returns at most one unlock — the spacing
 * rule is enforced here rather than trusted to the content table, so adding
 * a new entry can never accidentally stack two tutorials on one turn.
 */
export function processUnlocks(state: GameState, log: EventLog): UnlockEvent[] {
  const fired: UnlockEvent[] = []
  const advisorMode = DIFFICULTIES[state.difficulty].advisorMode

  for (const unlock of UNLOCKS) {
    if (isUnlocked(state, unlock.id)) continue
    if (state.turn < unlock.turn) continue
    // Turn-1 unlocks arrive together as the opening kit; after that, spacing applies.
    if (unlock.turn > 1 && state.turn - state.lastUnlockTurn < UNLOCK_SPACING) break

    state.unlocked.push(unlock.id)
    if (unlock.turn > 1) state.lastUnlockTurn = state.turn

    log.append({
      turn: state.turn,
      type: 'unlock',
      actors: [],
      summary: `解锁：${unlock.label}`,
      tone: 'neutral',
      payload: { unlockId: unlock.id },
    })

    const line = advisorMode === 'off' ? null : (advisorLineFor(unlock.id) ?? null)
    if (line) {
      log.append({
        turn: state.turn,
        type: 'advisor',
        actors: ['solomon'],
        summary: `${line.speaker}：${line.text.split('\n')[0]}`,
        tone: 'neutral',
        payload: { trigger: unlock.id, text: line.text },
      })
    }
    fired.push({ unlock, advisor: line })

    // One new system at a time. Turn-1 unlocks are exempt.
    if (unlock.turn > 1) break
  }
  return fired
}
