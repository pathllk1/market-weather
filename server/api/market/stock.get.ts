import { getTursoClient } from '../../utils/turso'
import { getLiveQuotes, toYahooTicker, fetchDirectYahooQuote } from '../../utils/yahoo'
import YahooFinance from 'yahoo-finance2'

const yf = new YahooFinance({
  suppressNotices: ['yahooSurvey']
})

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

  // If found in local database:
  if (tech) {
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
  }

  // Fallback: If not in local Turso database, synthesize from Yahoo Finance
  try {
    const ticker = toYahooTicker(rawSymbol)
    const yfQuote = await fetchDirectYahooQuote(ticker)
    if (!yfQuote) {
      throw new Error(`Symbol '${ticker}' not found on Yahoo Finance`)
    }

    const price = Number(yfQuote.price ?? 0)
    const prevClose = Number(yfQuote.previousClose ?? price)
    const pChange = Number(yfQuote.change ?? (price - prevClose))
    const pctChange = Number(yfQuote.changePercent ?? (prevClose ? (pChange / prevClose) * 100 : 0))
    const high52 = Number(yfQuote.fiftyTwoWeekHigh ?? price)
    const low52 = Number(yfQuote.fiftyTwoWeekLow ?? price)
    const avgVol = Number(yfQuote.volume ?? 0)
    const compName = String(yfQuote.longName || yfQuote.shortName || symbolWithoutNs)

    // Attempt to compute simple indicators from 60 days of historical data
    let rsi = 50
    let sma20 = price
    let sma50 = price
    const ema50 = price

    try {
      const chartRes = await yf.chart(ticker, {
        period1: new Date(Date.now() - 90 * 86400000),
        interval: '1d'
      })
      const closes = (chartRes.quotes || []).map(q => q.close).filter((c): c is number => typeof c === 'number')
      if (closes.length >= 15) {
        let gains = 0
        let losses = 0
        for (let i = closes.length - 14; i < closes.length; i++) {
          const diff = closes[i]! - closes[i - 1]!
          if (diff > 0) gains += diff
          else losses -= diff
        }
        const rs = losses === 0 ? 100 : gains / losses
        rsi = Math.round(100 - (100 / (1 + rs)))
      }
      if (closes.length >= 20) {
        const slice20 = closes.slice(-20)
        sma20 = Number((slice20.reduce((a, b) => a + b, 0) / 20).toFixed(2))
      }
      if (closes.length >= 50) {
        const slice50 = closes.slice(-50)
        sma50 = Number((slice50.reduce((a, b) => a + b, 0) / 50).toFixed(2))
      }
    } catch {
      // Historical candles calculation fallback
    }

    let rsiBias = 'Neutral'
    if (rsi >= 70) rsiBias = 'Overbought'
    else if (rsi <= 30) rsiBias = 'Oversold'

    const overallScore = Math.min(95, Math.max(10, Math.round(rsi * 0.5 + (price > sma20 ? 25 : 10) + (price > sma50 ? 25 : 10))))
    let overallRating = 'Neutral'
    if (overallScore >= 75) overallRating = 'Strong Buy'
    else if (overallScore >= 60) overallRating = 'Buy'
    else if (overallScore <= 35) overallRating = 'Sell'
    else if (overallScore <= 20) overallRating = 'Strong Sell'

    return {
      symbol: symbolWithoutNs,
      companyName: compName,
      currentPrice: price,
      priceChange: Number(pChange.toFixed(2)),
      percentageChange: Number(pctChange.toFixed(2)),
      overallScore,
      overallRating,
      lastUpdated: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      ranges: {
        high52w: high52,
        low52w: low52,
        avgVolume52w: Math.round(avgVol)
      },
      signals: {
        rsi: { value: rsi, bias: rsiBias },
        macd: { line: 0, signal: 0, hist: 0, bias: 'Neutral' },
        supertrend: { trend: price >= sma20 ? 'Bullish' : 'Bearish', value: Number((price * 0.97).toFixed(2)) },
        volatility: {
          bbUpper: Number((sma20 * 1.05).toFixed(2)),
          bbMiddle: sma20,
          bbLower: Number((sma20 * 0.95).toFixed(2)),
          atr: Number((price * 0.02).toFixed(2))
        },
        momentum: {
          adx: 25,
          plusDi: 22,
          minusDi: 18,
          stochK: rsi,
          stochD: rsi,
          mfi: rsi,
          williamsR: -(100 - rsi),
          cci: 0,
          roc: pctChange
        },
        volume: { obv: 0, vwap: price },
        movingAverages: {
          sma10: price,
          sma20,
          sma30: price,
          sma50,
          sma100: sma50,
          sma200: sma50,
          ema10: price,
          ema20: sma20,
          ema30: price,
          ema50,
          ema100: sma50,
          ema200: sma50
        }
      }
    }
  } catch {
    throw createError({
      statusCode: 404,
      statusMessage: `Stock symbol '${rawSymbol}' not found in database or market feed.`
    })
  }
})
