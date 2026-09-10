import { getTursoClient } from '../../utils/turso'
import { getLiveQuotes } from '../../utils/yahoo'
import { generateAITechnicalReview, type RawTechnicalInput } from '../../utils/groq'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const rawSymbol = typeof body?.symbol === 'string' ? body.symbol.trim().toUpperCase() : ''
  const forceRefresh = Boolean(body?.forceRefresh)

  if (!rawSymbol) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Stock symbol is required'
    })
  }

  const symbolWithNs = rawSymbol.endsWith('.NS') || rawSymbol.endsWith('.BO') ? rawSymbol : `${rawSymbol}.NS`
  const symbolWithoutNs = rawSymbol.replace(/\.(NS|BO)$/i, '')

  const db = getTursoClient()

  // 1. Fetch complete technical analysis row matching with or without .NS
  let tech: Record<string, unknown> | undefined

  try {
    const techRes = await db.execute({
      sql: 'SELECT * FROM technical_analysis WHERE symbol IN (?, ?) LIMIT 1',
      args: [symbolWithNs, symbolWithoutNs]
    })
    tech = techRes.rows[0] as Record<string, unknown> | undefined
  } catch (dbErr) {
    console.warn(`[AI Review API] DB query error for ${rawSymbol}:`, dbErr)
  }

  // 2. Fetch 52-week range from the last 252 sessions of historical_candles
  let high52w = 0
  let low52w = 0
  let avgVolume52w = 0

  try {
    const statsRes = await db.execute({
      sql: `
        SELECT 
          MAX(high) as high_52w,
          MIN(low) as low_52w,
          AVG(volume) as avg_volume_52w
        FROM (
          SELECT high, low, volume 
          FROM historical_candles 
          WHERE symbol IN (?, ?) 
          ORDER BY date DESC 
          LIMIT 252
        )
      `,
      args: [symbolWithNs, symbolWithoutNs]
    })
    const row = statsRes.rows[0] as Record<string, unknown> | undefined
    if (row) {
      high52w = Number(row.high_52w || 0)
      low52w = Number(row.low_52w || 0)
      avgVolume52w = Math.round(Number(row.avg_volume_52w || 0))
    }
  } catch (statsErr) {
    console.warn(`[AI Review API] 52W stats query error for ${rawSymbol}:`, statsErr)
  }

  let currentPrice = Number(tech?.current_price || 0)
  let priceChange = Number(tech?.price_change || 0)
  let percentageChange = Number(tech?.percentage_change || 0)

  // 3. Sync with real-time live quotes if available
  try {
    const liveQuotes = await getLiveQuotes([symbolWithNs])
    const liveQuote = liveQuotes[symbolWithNs] || liveQuotes[symbolWithoutNs]
    if (liveQuote && liveQuote.price > 0) {
      currentPrice = liveQuote.price
      priceChange = liveQuote.change
      percentageChange = liveQuote.changePercent
    }
  } catch {
    // Non-fatal, keep precomputed prices
  }

  // If stock is not in database, reject request (no fake or demo data)
  if (!tech) {
    throw createError({
      statusCode: 404,
      statusMessage: `Stock symbol '${rawSymbol}' does not have technical analysis data in the database.`
    })
  }

  const companyName = String(tech.company_name || symbolWithoutNs)
  const algorithmicScore = Number(tech.overall_score || 50)

  // 4. Construct sanitized technical input: EXCLUDE overall_score and overall_rating!
  const technicalInput: RawTechnicalInput = {
    symbol: symbolWithoutNs,
    companyName,
    currentPrice,
    priceChange,
    percentageChange,
    high52w: high52w || undefined,
    low52w: low52w || undefined,
    avgVolume52w: avgVolume52w || undefined,
    rsi14: tech?.rsi_14 !== undefined ? Number(tech.rsi_14) : undefined,
    macd: tech
      ? {
          line: Number(tech.macd_line || 0),
          signal: Number(tech.macd_signal || 0),
          hist: Number(tech.macd_hist || 0)
        }
      : undefined,
    supertrend: tech
      ? {
          trend: String(tech.supertrend_trend || ''),
          value: Number(tech.supertrend_value || 0)
        }
      : undefined,
    volatility: tech
      ? {
          bbUpper: Number(tech.bb_upper || 0),
          bbMiddle: Number(tech.bb_middle || 0),
          bbLower: Number(tech.bb_lower || 0),
          atr: Number(tech.atr_14 || 0)
        }
      : undefined,
    momentum: tech
      ? {
          adx: Number(tech.adx_14 || 0),
          plusDi: Number(tech.plus_di_14 || 0),
          minusDi: Number(tech.minus_di_14 || 0),
          stochK: Number(tech.stoch_k || 0),
          stochD: Number(tech.stoch_d || 0),
          mfi: Number(tech.mfi_14 || 0),
          williamsR: Number(tech.williams_r_14 || 0),
          cci: Number(tech.cci_20 || 0),
          roc: Number(tech.roc_12 || 0)
        }
      : undefined,
    volume: tech
      ? {
          obv: Number(tech.obv || 0),
          vwap: Number(tech.vwap || 0)
        }
      : undefined,
    movingAverages: tech
      ? {
          sma10: Number(tech.sma_10 || 0),
          sma20: Number(tech.sma_20 || 0),
          sma30: Number(tech.sma_30 || 0),
          sma50: Number(tech.sma_50 || 0),
          sma100: Number(tech.sma_100 || 0),
          sma200: Number(tech.sma_200 || 0),
          ema10: Number(tech.ema_10 || 0),
          ema20: Number(tech.ema_20 || 0),
          ema30: Number(tech.ema_30 || 0),
          ema50: Number(tech.ema_50 || 0),
          ema100: Number(tech.ema_100 || 0),
          ema200: Number(tech.ema_200 || 0)
        }
      : undefined
  }

  // 5. Generate independent AI Review (passes only raw indicator values, with algorithmicScore attached for UI comparison only)
  const result = await generateAITechnicalReview(technicalInput, algorithmicScore, forceRefresh)
  return result
})
