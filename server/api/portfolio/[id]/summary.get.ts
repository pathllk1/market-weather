import { getTursoClient } from '../../../utils/turso'
import {
  aggregateHoldingsFromTrades,
  calculatePortfolioRisk,
  computeAllocations,
  type RawTradeRow,
  SECTOR_MAP
} from '../../../utils/portfolio'
import { getLiveQuotes } from '../../../utils/yahoo'
import type { DematAccount, HoldingPosition, Portfolio, PortfolioSummaryResponse } from '~/types/portfolio'

export default defineEventHandler(async (event) => {
  const portfolioId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const selectedDematId = typeof query.dematId === 'string' ? query.dematId.trim() : ''

  if (!portfolioId) {
    throw createError({ statusCode: 400, statusMessage: 'Portfolio ID is required' })
  }

  const db = getTursoClient()

  // 1. Fetch portfolio metadata
  const pRes = await db.execute({
    sql: `SELECT id, user_id, name, description, benchmark_symbol, cost_method, currency, 
                 is_paper_trading, initial_capital, created_at, updated_at
          FROM portfolios 
          WHERE id = ?`,
    args: [portfolioId]
  })

  const pRow = pRes.rows[0]
  if (!pRow) {
    throw createError({ statusCode: 404, statusMessage: 'Portfolio not found' })
  }

  const userId = String(pRow.user_id)

  // 2. Fetch user's Demat accounts
  const dematRes = await db.execute({
    sql: `SELECT id, user_id, broker_name, account_name, client_id, depository, is_default, created_at, updated_at
          FROM demat_accounts
          WHERE user_id = ?
          ORDER BY is_default DESC, created_at ASC`,
    args: [userId]
  })

  const dematAccounts: DematAccount[] = dematRes.rows.map(r => ({
    id: String(r.id),
    userId: String(r.user_id),
    brokerName: String(r.broker_name),
    accountName: String(r.account_name),
    clientId: r.client_id ? String(r.client_id) : undefined,
    depository: (r.depository as any) || 'CDSL',
    isDefault: Number(r.is_default) === 1,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at)
  }))
  const dematMap = new Map(dematAccounts.map(d => [d.id, d]))

  // 3. Fetch trades (with optional Demat account filter)
  let sql = `SELECT id, portfolio_id, demat_account_id, symbol, trade_type, trade_date, quantity, price_per_share, 
                    brokerage, stt, exchange_charges, gst, sebi_fee, total_cost, notes
             FROM portfolio_trades
             WHERE portfolio_id = ?`
  const args: any[] = [portfolioId]

  if (selectedDematId) {
    sql += ` AND demat_account_id = ?`
    args.push(selectedDematId)
  }

  sql += ` ORDER BY trade_date ASC, created_at ASC`

  const tradesRes = await db.execute({ sql, args })
  const trades = tradesRes.rows as unknown as (RawTradeRow & { demat_account_id?: string })[]
  const costMethod = (pRow.cost_method as any) || 'FIFO'
  const { holdingsMap, totalRealizedPnL } = aggregateHoldingsFromTrades(trades, costMethod)

  // 4. Fetch targets and stop losses
  const targetsRes = await db.execute({
    sql: `SELECT symbol, target_price, stop_loss, target_notes FROM portfolio_targets WHERE portfolio_id = ?`,
    args: [portfolioId]
  })
  const targetsMap = new Map(targetsRes.rows.map(r => [String(r.symbol), r]))

  // 5. Fetch live quotes & technical data for holdings
  const activeSymbols = Array.from(holdingsMap.keys())
  let liveQuoteMap: Record<string, any> = {}
  try {
    if (activeSymbols.length > 0) {
      liveQuoteMap = await getLiveQuotes(activeSymbols)
    }
  } catch (err) {
    console.warn('[Portfolio Summary API] Live quote fetch fallback:', err)
  }

  const techRes = await db.execute({
    sql: `SELECT symbol, company_name, current_price, percentage_change, price_change, overall_score 
          FROM technical_analysis 
          WHERE symbol IN (${activeSymbols.map(() => '?').join(',') || "''"})`,
    args: activeSymbols.length > 0 ? activeSymbols : []
  })
  const techMap = new Map(techRes.rows.map(r => [String(r.symbol), r]))

  // 6. Construct live holding positions with Demat breakdown
  let totalInvested = 0
  let totalCurrentValue = 0
  let totalDayPnL = 0
  const rawPositions: Omit<HoldingPosition, 'portfolioWeightPct'>[] = []

  for (const [sym, h] of holdingsMap.entries()) {
    const quote = liveQuoteMap[sym]
    const tech = techMap.get(sym)
    const targetRow = targetsMap.get(sym)
    const meta = SECTOR_MAP[sym]

    const currentPrice = quote?.price || Number(tech?.current_price) || h.avgCost
    const priceChange = quote?.change || Number(tech?.price_change) || 0
    const pctChange = quote?.changePercent || Number(tech?.percentage_change) || 0
    const companyName = String(tech?.company_name || sym.replace(/\.NS$/, ''))

    const currentValue = h.qty * currentPrice
    const investedAmount = h.invested
    const unrealizedPnL = currentValue - investedAmount
    const unrealizedPnLPct = investedAmount > 0 ? (unrealizedPnL / investedAmount) * 100 : 0
    const dayChangeAmount = h.qty * priceChange

    totalInvested += investedAmount
    totalCurrentValue += currentValue
    totalDayPnL += dayChangeAmount

    // Earliest buy lot for holding period days
    const oldestLot = h.lots[0]
    const holdingDays = oldestLot
      ? Math.max(0, Math.floor((Date.now() - new Date(oldestLot.date).getTime()) / (1000 * 60 * 60 * 24)))
      : 0

    // Compute breakdown across Demat accounts for this symbol
    const dematQtyMap = new Map<string, { qty: number; cost: number }>()
    for (const t of trades.filter(tr => tr.symbol === sym)) {
      const dId = t.demat_account_id || 'unassigned'
      const curr = dematQtyMap.get(dId) || { qty: 0, cost: 0 }
      if (t.trade_type === 'BUY' || t.trade_type === 'BONUS') {
        curr.qty += t.quantity
        curr.cost += t.total_cost
      } else if (t.trade_type === 'SELL') {
        curr.qty = Math.max(0, curr.qty - t.quantity)
      }
      dematQtyMap.set(dId, curr)
    }

    const dematBreakdown = Array.from(dematQtyMap.entries())
      .filter(([_, data]) => data.qty > 0.001)
      .map(([dId, data]) => {
        const dAcc = dematMap.get(dId)
        return {
          dematId: dId,
          accountName: dAcc ? dAcc.accountName : (dematAccounts[0]?.accountName || 'Primary Demat'),
          brokerName: dAcc ? dAcc.brokerName : (dematAccounts[0]?.brokerName || 'Zerodha'),
          quantity: data.qty,
          avgCost: data.qty > 0 ? Number((data.cost / data.qty).toFixed(2)) : currentPrice,
          currentValue: Number((data.qty * currentPrice).toFixed(2))
        }
      })

    rawPositions.push({
      symbol: sym,
      companyName,
      quantity: h.qty,
      averageCost: h.avgCost,
      investedAmount: Number(investedAmount.toFixed(2)),
      currentPrice: Number(currentPrice.toFixed(2)),
      currentValue: Number(currentValue.toFixed(2)),
      priceChange: Number(priceChange.toFixed(2)),
      percentageChange: Number(pctChange.toFixed(2)),
      unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
      unrealizedPnLPct: Number(unrealizedPnLPct.toFixed(2)),
      realizedPnL: 0,
      dayChangeAmount: Number(dayChangeAmount.toFixed(2)),
      holdingPeriodDays: holdingDays,
      isLtcgEligible: holdingDays >= 365,
      lots: h.lots,
      sector: meta?.sector || 'Diversified',
      marketCapCategory: meta?.cap || 'Mid Cap',
      targetPrice: targetRow?.target_price ? Number(targetRow.target_price) : null,
      stopLoss: targetRow?.stop_loss ? Number(targetRow.stop_loss) : null,
      overallScore: tech?.overall_score ? Number(tech.overall_score) : 50,
      dematBreakdown
    })
  }

  // Calculate portfolio weights
  const holdings: HoldingPosition[] = rawPositions.map(p => ({
    ...p,
    portfolioWeightPct: totalCurrentValue > 0 ? Number(((p.currentValue / totalCurrentValue) * 100).toFixed(1)) : 0
  })).sort((a, b) => b.currentValue - a.currentValue)

  // 7. Compute Risk Metrics
  const riskMetrics = calculatePortfolioRisk(holdings, totalCurrentValue, new Map())

  // 8. Compute Sector & Market Cap allocations
  const { sectors: sectorAllocation, marketCaps: marketCapAllocation } = computeAllocations(holdings, totalCurrentValue)

  // 9. Top Gainers & Losers
  const topGainers = [...holdings].sort((a, b) => b.unrealizedPnLPct - a.unrealizedPnLPct).slice(0, 3)
  const topLosers = [...holdings].sort((a, b) => a.unrealizedPnLPct - b.unrealizedPnLPct).slice(0, 3)

  // 10. Historical Portfolio Value Simulation Curve (Last 30 Days)
  const historicalValueCurve: Array<{ date: string; portfolioValue: number; benchmarkValue: number }> = []
  const today = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    if (d.getDay() === 0 || d.getDay() === 6) continue
    const dateStr = d.toISOString().split('T')[0]!
    
    const driftFactor = 1 - ((i * 0.0015) + (Math.sin(i / 2) * 0.008))
    const pVal = Number((totalCurrentValue * driftFactor).toFixed(2))
    const bVal = Number((24500 * driftFactor * 1.01).toFixed(2))

    historicalValueCurve.push({
      date: dateStr,
      portfolioValue: pVal,
      benchmarkValue: bVal
    })
  }

  const unrealizedPnL = totalCurrentValue - totalInvested
  const unrealizedPnLPct = totalInvested > 0 ? (unrealizedPnL / totalInvested) * 100 : 0
  const dayPnLPct = (totalCurrentValue - totalDayPnL) > 0 ? (totalDayPnL / (totalCurrentValue - totalDayPnL)) * 100 : 0

  const portfolio: Portfolio = {
    id: String(pRow.id),
    userId: String(pRow.user_id),
    name: String(pRow.name),
    description: pRow.description ? String(pRow.description) : undefined,
    benchmarkSymbol: String(pRow.benchmark_symbol || '^NSEI'),
    costMethod,
    currency: String(pRow.currency || 'INR'),
    isPaperTrading: Number(pRow.is_paper_trading) === 1,
    initialCapital: Number(pRow.initial_capital || 1000000),
    cashBalance: Math.max(0, Number(pRow.initial_capital || 1000000) - totalInvested),
    totalValue: Number(totalCurrentValue.toFixed(2)),
    totalInvested: Number(totalInvested.toFixed(2)),
    unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
    unrealizedPnLPct: Number(unrealizedPnLPct.toFixed(2)),
    realizedPnL: Number(totalRealizedPnL.toFixed(2)),
    dayPnL: Number(totalDayPnL.toFixed(2)),
    dayPnLPct: Number(dayPnLPct.toFixed(2)),
    holdingsCount: holdings.length,
    tradesCount: trades.length,
    createdAt: Number(pRow.created_at),
    updatedAt: Number(pRow.updated_at)
  }

  const response: PortfolioSummaryResponse = {
    portfolio,
    holdings,
    dematAccounts,
    riskMetrics,
    sectorAllocation,
    marketCapAllocation,
    topGainers,
    topLosers,
    historicalValueCurve
  }

  return response
})
