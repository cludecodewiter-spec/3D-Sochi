/**
 * Shared test driving helpers.
 *
 * Since the incident layer landed, a run no longer ends the moment a roll
 * goes badly — somebody notices you, and the run stays open until that is
 * dealt with. Tests that just want to reach an outcome need a fixed policy
 * for that, so it lives here rather than being retyped per file.
 */

import type { Session } from '../src/engine/save.js'
import type { IncidentKind } from '../src/content/incidents.js'
import { currentIncident, handleIncident } from '../src/systems/game.js'

/**
 * The deterministic policy: never fight, never linger. Every branch here
 * either ends the run or leaves it untouched, so a test's outcome never
 * depends on how the incident roll went.
 */
export const INCIDENT_PLAN: Record<IncidentKind, string> = {
  witness: 'run',
  camera: 'ignore',
  police: 'surrender',
}

/** Clears any live incident. Returns true once the run is over. */
export function settleIncidents(session: Session, lines: string[] = []): boolean {
  while (session.state.incident) {
    const view = currentIncident(session)
    const conclusion = handleIncident(session, INCIDENT_PLAN[view.kind])
    lines.push(conclusion.text, ...conclusion.epilogue)
    if (conclusion.runOver) return true
  }
  return session.state.activeRun === null
}
