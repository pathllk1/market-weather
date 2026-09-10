import { getTursoClient } from '../../utils/turso'
import { getLiveQuotes, toYahooTicker } from '../../utils/yahoo'
import type { BacktestLiveQuoteResponse } from '~/types/backtest'

export default defineEventHandler(async (event): Promise<BacktestLiveQuoteResponse> => {
  const query = getQuery(event)
  const rawSymbol = typeof query.symbol === 'string' ? query.symbol.trim().toUpperCase() : ''

  if (!rawSymbol) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Symbol query parameter is required'
    })
  }

  const cleanSymbol = rawSymbol.replace(/\.(NS|BO)$/i, '')
  const symbolWithNs = toYahooTicker(rawSymbol)

  // 1. Fetch live quote from crumb-free Yahoo feed
  const liveQuotes = await getLiveQuotes([symbolWithNs])
  const quote = liveQuotes[symbolWithNs] || liveQuotes[cleanSymbol]

  if (!quote || quote.price <= 0) {
    throw createError({
      statusCode: 404,
      statusMessage: `Real-time quote not available for '${cleanSymbol}'. Please ensure the ticker is valid.`
    })
  }

  // 2. Fetch technical indicators if present in database
  const db = getTursoClient()
  let techRow: Record<string, unknown> | undefined
  try {
    const techRes = await db.execute({
      sql: 'SELECT company_name, rsi_14, macd_hist, supertrend_trend FROM technical_analysis WHERE symbol IN (?, ?) LIMIT 1',
      args: [cleanSymbol, symbolWithNs]
    })
    techRow = techRes.rows[0] as Record<string, unknown> | undefined
  } catch {
    // Non-fatal
  }

  return {
    symbol: cleanSymbol,
    companyName: String(techRow?.company_name || cleanSymbol),
    price: quote.price,
    change: quote.change,
    changePercent: quote.changePercent,
    dayHigh: quote.dayHigh,
    dayLow: quote.dayLow,
    open: quote.open,
    previousClose: quote.previousClose,
    volume: quote.volume,
    rsi: techRow?.rsi_14 !== undefined && techRow?.rsi_14 !== null ? Number(techRow.rsi_14) : undefined,
    macdHist: techRow?.macd_hist !== undefined && techRow?.macd_hist !== null ? Number(techRow.macd_hist) : undefined,
    supertrendTrend: techRow?.supertrend_trend ? String(techRow.supertrend_trend) : undefined,
    lastUpdated: quote.lastUpdated || Date.now()
  }
})
