import { getTursoClient } from '../../../utils/turso'
import { getLiveQuotes } from '../../../utils/yahoo'
import type { UserMarketView, ViewEquityOhlcv, MarketViewDetailResponse } from '~/types/market'

export default defineEventHandler(async (event): Promise<MarketViewDetailResponse> => {
  const userId = event.context.user?.id || 'guest_default_user'
  const viewId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const forceRefresh = query.refresh === 'true' || query.refresh === '1'

  // Never cache live view OHLCV quotes in browser or proxy
  setHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  setHeader(event, 'Pragma', 'no-cache')
  setHeader(event, 'Expires', '0')

  if (!viewId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'View ID is required.'
    })
  }

  const db = getTursoClient()

  // 1. Fetch user view
  const res = await db.execute({
    sql: `SELECT id, user_id, name, description, symbols, layout, is_default, created_at, updated_at 
          FROM user_market_views 
          WHERE id = ? AND user_id = ?`,
    args: [viewId, userId]
  })

  const row = res.rows[0]
  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Market view not found.'
    })
  }

  let symbols: string[]
  try {
    symbols = JSON.parse(String(row.symbols || '[]'))
  } catch {
    symbols = []
  }

  const view: UserMarketView = {
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    symbols,
    layout: (String(row.layout) as 'ohlcv' | 'table' | 'cards') || 'ohlcv',
    isDefault: Boolean(row.is_default),
    stockCount: symbols.length,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  }

  if (symbols.length === 0) {
    return { view, equities: [] }
  }

  // 2. Query technical analysis from DB for all symbols in this view
  const placeholders = symbols.map(() => '?').join(',')
  const dbTechnicals = await db.execute({
    sql: `SELECT symbol, company_name, current_price, price_change, percentage_change, 
                 overall_score, rsi_14, macd_hist, supertrend_trend, last_updated
          FROM technical_analysis
          WHERE symbol IN (${placeholders})`,
    args: symbols
  })

  // Index DB records by symbol
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbMap = new Map<string, Record<string, any>>()
  for (const r of dbTechnicals.rows) {
    dbMap.set(String(r.symbol).toUpperCase(), r)
  }

  // 3. Fetch live quote data from Yahoo Finance (cached 60s, bypassed on forceRefresh)
  const liveQuotes = await getLiveQuotes(symbols, forceRefresh)

  // 4. Merge DB technical indicators with Yahoo real-time OHLCV
  const equities: ViewEquityOhlcv[] = symbols.map((symbol) => {
    const sym = symbol.toUpperCase()
    const dbData = dbMap.get(sym)
    const quote = liveQuotes[sym]

    const companyName = dbData?.company_name ? String(dbData.company_name) : sym
    const overallScore = dbData?.overall_score ? Number(dbData.overall_score) : 50
    const rsi = dbData?.rsi_14 !== undefined && dbData?.rsi_14 !== null ? Number(dbData.rsi_14) : undefined
    const macdHist = dbData?.macd_hist !== undefined && dbData?.macd_hist !== null ? Number(dbData.macd_hist) : undefined
    const supertrendTrend = dbData?.supertrend_trend ? String(dbData.supertrend_trend) : undefined

    if (quote) {
      // Use real-time Yahoo Finance quote data
      return {
        symbol: sym,
        companyName,
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
        open: quote.open,
        high: quote.dayHigh,
        low: quote.dayLow,
        close: quote.previousClose,
        volume: quote.volume,
        overallScore,
        rsi,
        macdHist,
        supertrendTrend,
        lastUpdated: quote.lastUpdated,
        isLive: true
      }
    }

    // Graceful fallback to existing Turso DB historical data
    const dbPrice = dbData?.current_price ? Number(dbData.current_price) : 0
    const dbChange = dbData?.price_change ? Number(dbData.price_change) : 0
    const dbPercent = dbData?.percentage_change ? Number(dbData.percentage_change) : 0

    return {
      symbol: sym,
      companyName,
      price: dbPrice,
      change: dbChange,
      changePercent: dbPercent,
      open: dbPrice - dbChange,
      high: dbPrice,
      low: dbPrice - dbChange,
      close: dbPrice - dbChange,
      volume: 0,
      overallScore,
      rsi,
      macdHist,
      supertrendTrend,
      lastUpdated: dbData?.last_updated ? String(dbData.last_updated) : Date.now(),
      isLive: false
    }
  })

  return { view, equities }
})
