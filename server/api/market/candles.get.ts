import { getTursoClient } from '../../utils/turso'
import { getLiveQuotes } from '../../utils/yahoo'

const RANGE_CANDLE_LIMITS: Record<string, number> = {
  '1D': 1,
  '5D': 5,
  '1M': 30,
  '3M': 75,
  '6M': 150,
  '1Y': 260,
  '5Y': 1250,
  'ALL': 2500
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const rawSymbol = typeof query.symbol === 'string' ? query.symbol.trim().toUpperCase() : ''
  const symbolWithNs = rawSymbol.endsWith('.NS') ? rawSymbol : `${rawSymbol}.NS`
  const symbolWithoutNs = rawSymbol.replace(/\.NS$/i, '')
  const range = typeof query.range === 'string' ? query.range.toUpperCase() : '6M'

  if (!rawSymbol) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required query parameter: symbol'
    })
  }

  const limit = RANGE_CANDLE_LIMITS[range] || 150
  // Historical warmup buffer (200 sessions) so SMA20, SMA50, SMA200 start on candle 0 of the visible range
  const WARMUP_BUFFER = 200
  const fetchLimit = limit + WARMUP_BUFFER
  const db = getTursoClient()

  // Retrieve historical candles with lookback warmup buffer
  const res = await db.execute({
    sql: `
      SELECT date, open, high, low, close, volume
      FROM historical_candles
      WHERE symbol IN (?, ?)
      ORDER BY date DESC
      LIMIT ?
    `,
    args: [symbolWithNs, symbolWithoutNs, fetchLimit]
  })

  // Format all candles and reverse to chronological order (oldest to newest)
  const allCandles = res.rows
    .map(row => ({
      date: String(row.date),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume)
    }))
    .reverse()

  // Synchronize latest trading session from live Yahoo Finance quote
  try {
    const liveQuotes = await getLiveQuotes([symbolWithNs])
    const liveQuote = liveQuotes[symbolWithNs]
    if (liveQuote && liveQuote.price > 0) {
      // Determine local date string in YYYY-MM-DD
      const dateObj = new Date(liveQuote.lastUpdated || Date.now())
      const year = dateObj.getFullYear()
      const month = String(dateObj.getMonth() + 1).padStart(2, '0')
      const day = String(dateObj.getDate()).padStart(2, '0')
      const todayStr = `${year}-${month}-${day}`

      const lastCandle = allCandles.length > 0 ? allCandles[allCandles.length - 1] : null

      if (lastCandle && lastCandle.date === todayStr) {
        lastCandle.close = liveQuote.price
        lastCandle.high = Math.max(lastCandle.high, liveQuote.dayHigh || liveQuote.price)
        lastCandle.low = Math.min(lastCandle.low, liveQuote.dayLow || liveQuote.price)
        lastCandle.volume = liveQuote.volume || lastCandle.volume
      } else if (lastCandle && todayStr > lastCandle.date) {
        allCandles.push({
          date: todayStr,
          open: liveQuote.open || liveQuote.price,
          high: liveQuote.dayHigh || liveQuote.price,
          low: liveQuote.dayLow || liveQuote.price,
          close: liveQuote.price,
          volume: liveQuote.volume || 0
        })
      }
    }
  } catch (liveErr) {
    console.warn(`[Candles API] Live quote sync failed for ${symbolWithNs}:`, liveErr)
  }

  // Slice display candles to the requested timeframe limit
  const displayCandles = allCandles.slice(-limit)

  // Calculate high, low, volume stats for the display period
  let periodHigh = -Infinity
  let periodLow = Infinity
  let totalVolume = 0

  for (const c of displayCandles) {
    if (c.high > periodHigh) periodHigh = c.high
    if (c.low < periodLow) periodLow = c.low
    totalVolume += c.volume
  }

  const firstClose = displayCandles.length > 0 ? displayCandles[0]?.close ?? 0 : 0
  const lastClose = displayCandles.length > 0 ? displayCandles[displayCandles.length - 1]?.close ?? 0 : 0
  const periodReturn = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0

  return {
    symbol: rawSymbol,
    range,
    count: displayCandles.length,
    stats: {
      periodHigh: periodHigh !== -Infinity ? periodHigh : 0,
      periodLow: periodLow !== Infinity ? periodLow : 0,
      avgVolume: displayCandles.length > 0 ? Math.round(totalVolume / displayCandles.length) : 0,
      periodReturn: Number(periodReturn.toFixed(2))
    },
    candles: displayCandles,
    lookbackCandles: allCandles
  }
})
