/**
 * Vehicle defense lookup. DESIGN_v12.md §5.2.
 *
 * The one non-obvious piece is `breachMechanical`: an immobiliser is not a
 * harder lock, it makes hotwiring fail in principle. Popping the door is only
 * step one — the engine still will not turn over. Modelling that as a large
 * additive term is what produces, with no scripting at all, the scene where
 * Marco sits in a garage for forty minutes with a piece of wire.
 */

import type { VehicleDefense } from '../engine/types.js'
import type { DefenseKey } from '../content/types.js'
import { IMMOBILISER } from '../content/balance.js'
import { vehicleDef } from '../content/vehicles.js'

export function breachMechanicalOpposition(defense: VehicleDefense): number {
  return (
    defense.lock +
    Math.max(0, defense.ignition - IMMOBILISER.threshold) * IMMOBILISER.factor
  )
}

export function defenseValue(defense: VehicleDefense, key: DefenseKey): number {
  return key === 'breachMechanical'
    ? breachMechanicalOpposition(defense)
    : defense[key]
}

export function defenseFor(defId: string, key: DefenseKey): number {
  return defenseValue(vehicleDef(defId).defense, key)
}
