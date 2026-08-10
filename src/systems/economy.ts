/**
 * Money: fencing, market saturation, debt. DESIGN_v12.md §5.5, §5.6.
 */

import type { EventLog } from '../engine/events.js'
import type { GameState } from '../engine/state.js'
import { clamp, round2 } from '../engine/types.js'
import type { FenceChannel } from '../content/balance.js'
import { DEBT, DIFFICULTIES, FENCE_CHANNELS, MARKET } from '../content/balance.js'
import { vehicleDef } from '../content/vehicles.js'
import { debtCallFor } from '../content/script.js'
import { heatOf, tierFor } from './heat.js'

export const availableChannels = (state: GameState): FenceChannel[] =>
  FENCE_CHANNELS.filter((c) => state.turn >= c.unlockTurn)

export function channelById(id: string): FenceChannel {
  const channel = FENCE_CHANNELS.find((c) => c.id === id)
  if (!channel) throw new Error(`未知销赃渠道：${id}`)
  return channel
}

export interface PriceBreakdown {
  base: number
  channelRate: number
  conditionFactor: number
  heatFactor: number
  demandFactor: number
  final: number
}

/**
 * 销赃价 = basePrice × channelRate × (condition/100) × (1 - heat/250) × (1 - decay)
 */
export function fencePrice(
  state: GameState,
  defId: string,
  condition: number,
  channelId: string,
): PriceBreakdown {
  const def = vehicleDef(defId)
  const channel = channelById(channelId)
  const decay = state.marketDecay[defId] ?? 0
  const conditionFactor = clamp(condition, 0, 100) / 100
  const heatFactor = 1 - heatOf(state) / 250
  const demandFactor = 1 - decay

  return {
    base: def.basePrice,
    channelRate: channel.rate,
    conditionFactor: round2(conditionFactor),
    heatFactor: round2(heatFactor),
    demandFactor: round2(demandFactor),
    final: Math.round(
      def.basePrice * channel.rate * conditionFactor * heatFactor * demandFactor,
    ),
  }
}

/** Selling the same model again is worth less. Forces the player to rotate targets. */
export function recordSale(state: GameState, defId: string): void {
  const current = state.marketDecay[defId] ?? 0
  state.marketDecay[defId] = clamp(current + MARKET.decayPerSale, 0, MARKET.decayCap)
}

export function recoverMarket(state: GameState): void {
  for (const [defId, value] of Object.entries(state.marketDecay)) {
    const next = clamp(value - MARKET.recoveryPerTurn, 0, MARKET.decayCap)
    if (next <= 0) delete state.marketDecay[defId]
    else state.marketDecay[defId] = next
  }
}

export function sellVehicle(
  state: GameState,
  log: EventLog,
  instanceId: string,
  channelId: string,
): { payout: number; breakdown: PriceBreakdown } {
  const index = state.garage.findIndex((g) => g.instanceId === instanceId)
  if (index === -1) throw new Error(`车库里没有这辆车：${instanceId}`)
  const car = state.garage[index]!
  const breakdown = fencePrice(state, car.defId, car.condition, channelId)
  const channel = channelById(channelId)

  state.garage.splice(index, 1)
  state.cash += breakdown.final
  recordSale(state, car.defId)

  const def = vehicleDef(car.defId)
  const tier = tierFor(heatOf(state))
  log.append({
    turn: state.turn,
    type: 'sale',
    actors: [car.defId, `channel:${channelId}`],
    summary: `把 ${def.name} 卖给了${channel.label}，到手 $${breakdown.final}`,
    tone: 'good',
    payload: {
      defId: car.defId,
      channelId,
      payout: breakdown.final,
      breakdown,
      heatTier: tier.label,
    },
  })
  return { payout: breakdown.final, breakdown }
}

// ── Debt (§5.6) ────────────────────────────────────────────────────────────

export interface DebtSettlement {
  paid: number
  missed: boolean
  interestAdded: number
  callTitle: string
  callBody: string[]
  crewDisabledTurns: number
  liquidated: boolean
}

/**
 * Runs when `turn === debt.nextDueTurn`. Pays automatically if the player has
 * the cash — the interesting decision is what they spent it on beforehand,
 * not clicking a "pay" button.
 */
export function settleDebt(state: GameState, log: EventLog): DebtSettlement {
  const profile = DIFFICULTIES[state.difficulty]
  const due = Math.round(state.debt.minimumPayment * profile.debtMultiplier)
  const canPay = state.cash >= due

  let paid = 0
  let interestAdded = 0

  if (canPay) {
    state.cash -= due
    state.debt.principal = Math.max(0, state.debt.principal - due)
    paid = due
  } else {
    state.debt.missed += 1
    interestAdded = Math.round(state.debt.principal * state.debt.interestRate)
    state.debt.principal += interestAdded
  }

  const call = debtCallFor(canPay ? 0 : state.debt.missed)
  const liquidated =
    !canPay && state.debt.missed >= DEBT.defaultsUntilLiquidation

  state.debt.nextDueTurn = state.turn + state.debt.periodTurns

  log.append({
    turn: state.turn,
    type: canPay ? 'debt_payment' : 'debt_default',
    actors: ['creditor'],
    summary: canPay
      ? `还了 $${due}。剩余本金 $${state.debt.principal}`
      : `没能还上 $${due}。利息 +$${interestAdded}，这是第 ${state.debt.missed} 次`,
    tone: canPay ? 'good' : 'bad',
    payload: { due, paid, missed: !canPay, interestAdded, principal: state.debt.principal },
  })

  return {
    paid,
    missed: !canPay,
    interestAdded,
    callTitle: call.title,
    callBody: call.body,
    crewDisabledTurns: canPay ? 0 : (call.crewDisabledTurns ?? 0),
    liquidated,
  }
}
