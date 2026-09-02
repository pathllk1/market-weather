import { getTursoClient } from '../../../utils/turso'
import {
  aggregateHoldingsFromTrades,
  calculateTaxSummary,
  type RawTradeRow
} from '../../../utils/portfolio'
import { getLiveQuotes } from '../../../utils/yahoo'
import type { TaxSummary } from '~/types/portfolio'

export default defineEventHandler(async (event) => {
  const portfolioId = getRouterParam(event, 'id')
  if (!portfolioId) {
    throw createError({ statusCode: 400, statusMessage: 'Portfolio ID is required' })
  }

  const db = getTursoClient()

  // 1. Fetch portfolio metadata
  const pRes = await db.execute({
    sql: `SELECT id, cost_method FROM portfolios WHERE id = ?`,
    args: [portfolioId]
  })
  if (pRes.rows.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Portfolio not found' })
  }

  const costMethod = (pRes.rows[0]?.cost_method as any) || 'FIFO'

  // 2. Fetch all trades
  const tradesRes = await db.execute({
    sql: `SELECT id, portfolio_id, symbol, trade_type, trade_date, quantity, price_per_share, 
                 brokerage, stt, exchange_charges, gst, sebi_fee, total_cost, notes
          FROM portfolio_trades
          WHERE portfolio_id = ?
          ORDER BY trade_date ASC, created_at ASC`,
    args: [portfolioId]
  })

  const trades = tradesRes.rows as unknown as RawTradeRow[]
  const { holdingsMap, realizedLots } = aggregateHoldingsFromTrades(trades, costMethod)

  // 3. Compute baseline tax summary from realized lots
  const taxSummary = calculateTaxSummary(realizedLots, new Date().getFullYear())

  // 4. Scan open holdings for Tax-Loss Harvesting opportunities
  const symbols = Array.from(holdingsMap.keys())
  let liveQuoteMap: Record<string, any> = {}
  try {
    if (symbols.length > 0) {
      liveQuoteMap = await getLiveQuotes(symbols)
    }
  } catch (err) {
    console.warn('[Tax API] Live quote fetch error:', err)
  }

  const techRes = await db.execute({
    sql: `SELECT symbol, current_price FROM technical_analysis WHERE symbol IN (${symbols.map(() => '?').join(',') || "''"})`,
    args: symbols.length > 0 ? symbols : []
  })
  const techMap = new Map(techRes.rows.map(r => [String(r.symbol), Number(r.current_price)]))

  const lossHarvestOpportunities: TaxSummary['taxLossHarvestingOpportunities'] = []

  for (const [sym, h] of holdingsMap.entries()) {
    const currentPrice = liveQuoteMap[sym]?.price || techMap.get(sym) || h.avgCost
    const unrealizedDiff = (currentPrice - h.avgCost) * h.qty
    if (unrealizedDiff < -500) {
      // Opportunity to harvest tax loss to offset realized gains
      lossHarvestOpportunities.push({
        symbol: sym,
        unrealizedLoss: Number(Math.abs(unrealizedDiff).toFixed(2)),
        quantity: h.qty,
        currentPrice: Number(currentPrice.toFixed(2)),
        avgCost: h.avgCost,
        suggestion: `Book loss of ₹${Math.abs(unrealizedDiff).toFixed(2)} to offset realized STCG/LTCG tax liabilities.`
      })
    }
  }

  taxSummary.taxLossHarvestingOpportunities = lossHarvestOpportunities

  return taxSummary
})
