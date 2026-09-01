import { getTursoClient } from '../../utils/turso'

const RANGE_CANDLE_LIMITS: Record<string, number> = {
  '1M': 30,
  '3M': 75,
  '6M': 150,
  '1Y': 260,
  'ALL': 1000
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const symbol = typeof query.symbol === 'string' ? query.symbol.trim().toUpperCase() : ''
  const range = typeof query.range === 'string' ? query.range.toUpperCase() : '6M'

  if (!symbol) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required query parameter: symbol'
    })
  }

  const limit = RANGE_CANDLE_LIMITS[range] || 150
  const db = getTursoClient()

  // Retrieve the latest N candles for the symbol ordered by date DESC, then reverse to chronological order
  const res = await db.execute({
    sql: `
      SELECT date, open, high, low, close, volume
      FROM historical_candles
      WHERE symbol = ?
      ORDER BY date DESC
      LIMIT ?
    `,
    args: [symbol, limit]
  })

  // Format candles and reverse to chronological order (oldest to newest)
  const candles = res.rows
    .map(row => ({
      date: String(row.date),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume)
    }))
    .reverse()

  // Calculate high, low, volume stats for the selected period
  let periodHigh = -Infinity
  let periodLow = Infinity
  let totalVolume = 0

  for (const c of candles) {
    if (c.high > periodHigh) periodHigh = c.high
    if (c.low < periodLow) periodLow = c.low
    totalVolume += c.volume
  }

  const firstClose = candles.length > 0 ? candles[0]?.close ?? 0 : 0
  const lastClose = candles.length > 0 ? candles[candles.length - 1]?.close ?? 0 : 0
  const periodReturn = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0

  return {
    symbol,
    range,
    count: candles.length,
    stats: {
      periodHigh: periodHigh !== -Infinity ? periodHigh : 0,
      periodLow: periodLow !== Infinity ? periodLow : 0,
      avgVolume: candles.length > 0 ? Math.round(totalVolume / candles.length) : 0,
      periodReturn: Number(periodReturn.toFixed(2))
    },
    candles
  }
})
