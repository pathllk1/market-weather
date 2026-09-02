import { getTursoClient } from '../../utils/turso'
import { aggregateHoldingsFromTrades, type RawTradeRow } from '../../utils/portfolio'
import { getLiveQuotes } from '../../utils/yahoo'
import type { Portfolio } from '~/types/portfolio'

export default defineEventHandler(async (event) => {
  const userId = event.context.user?.id || 'guest_default_user'
  const db = getTursoClient()

  // 1. Fetch user portfolios
  let pRes = await db.execute({
    sql: `SELECT id, user_id, name, description, benchmark_symbol, cost_method, currency, 
                 is_paper_trading, initial_capital, created_at, updated_at
          FROM portfolios 
          WHERE user_id = ? 
          ORDER BY updated_at DESC`,
    args: [userId]
  })

  // 2. If no portfolios exist for this user, return empty list
  if (pRes.rows.length === 0) {
    return { portfolios: [] }
  }

  // 3. Collect all portfolio IDs and fetch all trades to compute summary metrics
  const portfolioIds = pRes.rows.map(r => String(r.id))
  const tradesRes = await db.execute({
    sql: `SELECT id, portfolio_id, symbol, trade_type, trade_date, quantity, price_per_share, 
                 brokerage, stt, exchange_charges, gst, sebi_fee, total_cost, notes
          FROM portfolio_trades
          WHERE portfolio_id IN (${portfolioIds.map(() => '?').join(',')})`,
    args: portfolioIds
  })

  const trades = tradesRes.rows as unknown as RawTradeRow[]

  // Fetch unique symbols for live quotes
  const uniqueSymbols = Array.from(new Set(trades.map(t => t.symbol)))
  let liveQuoteMap: Record<string, any> = {}
  try {
    if (uniqueSymbols.length > 0) {
      liveQuoteMap = await getLiveQuotes(uniqueSymbols)
    }
  } catch (err) {
    console.warn('[Portfolios API] Live quote fetch fallback:', err)
  }

  // Fetch technical analysis prices as fallback
  const techRes = await db.execute({
    sql: `SELECT symbol, current_price, percentage_change, price_change FROM technical_analysis WHERE symbol IN (${uniqueSymbols.map(() => '?').join(',') || "''"})`,
    args: uniqueSymbols.length > 0 ? uniqueSymbols : []
  })
  const techMap = new Map(techRes.rows.map(r => [String(r.symbol), r]))

  // Assemble portfolio summaries
  const portfolios: Portfolio[] = []

  for (const row of pRes.rows) {
    const pId = String(row.id)
    const pTrades = trades.filter(t => t.portfolio_id === pId)
    const costMethod = (row.cost_method as any) || 'FIFO'
    const { holdingsMap, totalRealizedPnL } = aggregateHoldingsFromTrades(pTrades, costMethod)

    let totalInvested = 0
    let totalCurrentValue = 0
    let dayPnL = 0

    for (const [sym, h] of holdingsMap.entries()) {
      const quote = liveQuoteMap[sym]
      const tech = techMap.get(sym)

      const currentPrice = quote?.price || Number(tech?.current_price) || h.avgCost
      const priceChange = quote?.change || Number(tech?.price_change) || 0

      const value = h.qty * currentPrice
      totalInvested += h.invested
      totalCurrentValue += value
      dayPnL += h.qty * priceChange
    }

    const unrealizedPnL = totalCurrentValue - totalInvested
    const unrealizedPnLPct = totalInvested > 0 ? (unrealizedPnL / totalInvested) * 100 : 0
    const dayPnLPct = (totalCurrentValue - dayPnL) > 0 ? (dayPnL / (totalCurrentValue - dayPnL)) * 100 : 0

    portfolios.push({
      id: pId,
      userId: String(row.user_id),
      name: String(row.name),
      description: row.description ? String(row.description) : undefined,
      benchmarkSymbol: String(row.benchmark_symbol || '^NSEI'),
      costMethod,
      currency: String(row.currency || 'INR'),
      isPaperTrading: Number(row.is_paper_trading) === 1,
      initialCapital: Number(row.initial_capital || 1000000),
      cashBalance: Math.max(0, Number(row.initial_capital || 1000000) - totalInvested),
      totalValue: Number(totalCurrentValue.toFixed(2)),
      totalInvested: Number(totalInvested.toFixed(2)),
      unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
      unrealizedPnLPct: Number(unrealizedPnLPct.toFixed(2)),
      realizedPnL: Number(totalRealizedPnL.toFixed(2)),
      dayPnL: Number(dayPnL.toFixed(2)),
      dayPnLPct: Number(dayPnLPct.toFixed(2)),
      holdingsCount: holdingsMap.size,
      tradesCount: pTrades.length,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    })
  }

  return { portfolios }
})
