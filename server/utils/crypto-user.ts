import type { H3Event } from 'h3'
import { createError } from 'h3'

export interface PaperTradeRecord {
  id: string
  user_id: string
  symbol: string
  base_asset: string
  side: 'BUY' | 'SELL'
  qty: number
  price_inr: number
  gross_inr: number
  tds_inr: number
  net_inr: number
  executed_at: string
}

export interface PaperPosition {
  symbol: string
  baseAsset: string
  qty: number
  avgPriceInr: number
  totalCostInr: number
}

export interface PaperWalletState {
  cashInr: number
  positions: Record<string, PaperPosition>
  history: Array<{
    id: string
    timestamp: number
    symbol: string
    side: 'BUY' | 'SELL'
    priceInr: number
    qty: number
    grossTotalInr: number
    tdsInr: number
    netTotalInr: number
  }>
}

export interface PriceAlertRecord {
  id: string
  symbol: string
  targetPriceInr: number
  direction: 'above' | 'below'
  createdAt: number
  triggered: boolean
}

/**
 * Resolves user ID strictly from authenticated enterprise context
 */
export function resolveCryptoUserId(event: H3Event): string {
  if (event.context.user?.id) {
    return event.context.user.id
  }

  throw createError({
    statusCode: 401,
    statusMessage: 'Unauthorized: Enterprise identity clearance required'
  })
}

/**
 * Compute active holding positions and average cost basis from chronological trade logs
 */
export function computePaperPositions(trades: PaperTradeRecord[]): Record<string, PaperPosition> {
  const positions: Record<string, PaperPosition> = {}

  // Sort trades oldest first to recompute position balance chronologically
  const sorted = [...trades].sort((a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime())

  for (const t of sorted) {
    const symbol = t.symbol
    const side = t.side
    const qty = Number(t.qty)
    const price = Number(t.price_inr)
    const baseAsset = t.base_asset || symbol.replace(/USDT$/, '')

    if (side === 'BUY') {
      const existing = positions[symbol] || {
        symbol,
        baseAsset,
        qty: 0,
        avgPriceInr: 0,
        totalCostInr: 0
      }

      const newQty = existing.qty + qty
      const addedCost = qty * price
      const newTotalCost = existing.totalCostInr + addedCost
      const newAvgPrice = newQty > 0 ? newTotalCost / newQty : price

      positions[symbol] = {
        symbol,
        baseAsset,
        qty: Number(newQty.toFixed(8)),
        avgPriceInr: Number(newAvgPrice.toFixed(2)),
        totalCostInr: Number(newTotalCost.toFixed(2))
      }
    } else if (side === 'SELL') {
      const existing = positions[symbol]
      if (existing) {
        const remainingQty = existing.qty - qty
        if (remainingQty <= 0.00000001) {
          delete positions[symbol]
        } else {
          const remainingCost = remainingQty * existing.avgPriceInr
          positions[symbol] = {
            ...existing,
            qty: Number(remainingQty.toFixed(8)),
            totalCostInr: Number(remainingCost.toFixed(2))
          }
        }
      }
    }
  }

  return positions
}
