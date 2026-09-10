import { getTursoClient } from '../../utils/turso'
import { getLiveQuotes } from '../../utils/yahoo'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const rawSymbol = typeof query.symbol === 'string' ? query.symbol.trim().toUpperCase() : ''
  const symbolWithNs = rawSymbol.endsWith('.NS') || rawSymbol.endsWith('.BO') ? rawSymbol : `${rawSymbol}.NS`
  const symbolWithoutNs = rawSymbol.replace(/\.(NS|BO)$/i, '')

  if (!rawSymbol) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required query parameter: symbol'
    })
  }

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
    console.warn(`[Stock API] DB query error for ${rawSymbol}:`, dbErr)
  }

  // Reject if stock is not in database — no fake or synthetic indicator generation
  if (!tech) {
    throw createError({
      statusCode: 404,
      statusMessage: `Stock symbol '${rawSymbol}' does not have technical analysis data in database. Real dynamic data required.`
    })
  }

  // 2. Fetch 52-week range from the last 252 trading sessions of historical_candles
  let stats: Record<string, unknown> = {}
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
    stats = (statsRes.rows[0] || {}) as Record<string, unknown>
  } catch (statsErr) {
    console.warn(`[Stock API] Stats query error for ${rawSymbol}:`, statsErr)
  }

  // 3. Sync with real-time live quotes if available
  let currentPrice = Number(tech.current_price)
  let priceChange = Number(tech.price_change)
  let percentageChange = Number(tech.percentage_change)

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

  // 4. Helper to determine status for key indicators
  const rsi = Number(tech.rsi_14)
  const macdHist = Number(tech.macd_hist)
  const overallScore = Number(tech.overall_score)
  const supertrendTrend = String(tech.supertrend_trend)

  let rsiBias = 'Neutral'
  if (rsi >= 70) rsiBias = 'Overbought'
  else if (rsi <= 30) rsiBias = 'Oversold'

  const macdBias = macdHist > 0 ? 'Bullish' : 'Bearish'
  const supertrendBias = (supertrendTrend === '1' || supertrendTrend === '1.0' || supertrendTrend.toLowerCase() === 'bullish') ? 'Bullish' : 'Bearish'

  let overallRating = 'Neutral'
  if (overallScore >= 75) overallRating = 'Strong Buy'
  else if (overallScore >= 60) overallRating = 'Buy'
  else if (overallScore <= 35) overallRating = 'Sell'
  else if (overallScore <= 20) overallRating = 'Strong Sell'

  return {
    symbol: symbolWithoutNs,
    companyName: String(tech.company_name || symbolWithoutNs),
    currentPrice,
    priceChange,
    percentageChange,
    overallScore,
    overallRating,
    lastUpdated: String(tech.last_updated),
    ranges: {
      high52w: Number(stats.high_52w || 0),
      low52w: Number(stats.low_52w || 0),
      avgVolume52w: Math.round(Number(stats.avg_volume_52w || 0))
    },
    signals: {
      rsi: {
        value: rsi,
        bias: rsiBias
      },
      macd: {
        line: Number(tech.macd_line),
        signal: Number(tech.macd_signal),
        hist: macdHist,
        bias: macdBias
      },
      supertrend: {
        trend: supertrendBias,
        value: Number(tech.supertrend_value)
      },
      volatility: {
        bbUpper: Number(tech.bb_upper),
        bbMiddle: Number(tech.bb_middle),
        bbLower: Number(tech.bb_lower),
        atr: Number(tech.atr_14)
      },
      momentum: {
        adx: Number(tech.adx_14),
        plusDi: Number(tech.plus_di_14),
        minusDi: Number(tech.minus_di_14),
        stochK: Number(tech.stoch_k),
        stochD: Number(tech.stoch_d),
        mfi: Number(tech.mfi_14),
        williamsR: Number(tech.williams_r_14),
        cci: Number(tech.cci_20),
        roc: Number(tech.roc_12)
      },
      volume: {
        obv: Number(tech.obv),
        vwap: Number(tech.vwap)
      },
      movingAverages: {
        sma10: Number(tech.sma_10),
        sma20: Number(tech.sma_20),
        sma30: Number(tech.sma_30),
        sma50: Number(tech.sma_50),
        sma100: Number(tech.sma_100),
        sma200: Number(tech.sma_200),
        ema10: Number(tech.ema_10),
        ema20: Number(tech.ema_20),
        ema30: Number(tech.ema_30),
        ema50: Number(tech.ema_50),
        ema100: Number(tech.ema_100),
        ema200: Number(tech.ema_200)
      }
    }
  }
})
