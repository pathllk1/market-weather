import { getTursoClient } from '../../../utils/turso'
import {
  aggregateHoldingsFromTrades,
  generateRebalancingPlan,
  type RawTradeRow
} from '../../../utils/portfolio'
import { getLiveQuotes } from '../../../utils/yahoo'
import type { HoldingPosition } from '~/types/portfolio'

export default defineEventHandler(async (event) => {
  const portfolioId = getRouterParam(event, 'id')
  if (!portfolioId) {
    throw createError({ statusCode: 400, statusMessage: 'Portfolio ID is required' })
  }

  const db = getTursoClient()

  // 1. Fetch trades
  const tradesRes = await db.execute({
    sql: `SELECT id, portfolio_id, symbol, trade_type, trade_date, quantity, price_per_share, 
                 brokerage, stt, exchange_charges, gst, sebi_fee, total_cost, notes
          FROM portfolio_trades
          WHERE portfolio_id = ?`,
    args: [portfolioId]
  })

  const trades = tradesRes.rows as unknown as RawTradeRow[]
  const { holdingsMap } = aggregateHoldingsFromTrades(trades, 'FIFO')

  // 2. Fetch live quotes & technical data
  const symbols = Array.from(holdingsMap.keys())
  let liveQuoteMap: Record<string, any> = {}
  try {
    if (symbols.length > 0) {
      liveQuoteMap = await getLiveQuotes(symbols)
    }
  } catch (err) {
    console.warn('[Rebalance API] Live quote fetch error:', err)
  }

  const techRes = await db.execute({
    sql: `SELECT symbol, company_name, current_price FROM technical_analysis WHERE symbol IN (${symbols.map(() => '?').join(',') || "''"})`,
    args: symbols.length > 0 ? symbols : []
  })
  const techMap = new Map(techRes.rows.map(r => [String(r.symbol), r]))

  let totalValue = 0
  const holdings: HoldingPosition[] = []

  for (const [sym, h] of holdingsMap.entries()) {
    const quote = liveQuoteMap[sym]
    const tech = techMap.get(sym)
    const currentPrice = quote?.price || Number(tech?.current_price) || h.avgCost
    const val = h.qty * currentPrice
    totalValue += val

    holdings.push({
      symbol: sym,
      companyName: String(tech?.company_name || sym.replace(/\.NS$/, '')),
      quantity: h.qty,
      averageCost: h.avgCost,
      investedAmount: h.invested,
      currentPrice,
      currentValue: val,
      priceChange: quote?.change || 0,
      percentageChange: quote?.changePercent || 0,
      unrealizedPnL: val - h.invested,
      unrealizedPnLPct: h.invested > 0 ? ((val - h.invested) / h.invested) * 100 : 0,
      realizedPnL: 0,
      portfolioWeightPct: 0, // will compute below
      dayChangeAmount: 0,
      holdingPeriodDays: 0,
      isLtcgEligible: false,
      lots: h.lots
    })
  }

  // Set weights
  for (const h of holdings) {
    h.portfolioWeightPct = totalValue > 0 ? Number(((h.currentValue / totalValue) * 100).toFixed(1)) : 0
  }

  const plan = generateRebalancingPlan(holdings, totalValue)

  return {
    totalValue: Number(totalValue.toFixed(2)),
    holdingsCount: holdings.length,
    plan
  }
})
