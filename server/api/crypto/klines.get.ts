import { defineEventHandler, getQuery, createError } from 'h3'
import { getCryptoKlines, getLiveInrRates } from '../../utils/crypto-service'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const symbol = (query.symbol as string) || 'BTCUSDT'
    const interval = (query.interval as string) || '1h'
    const limit = query.limit ? parseInt(String(query.limit), 10) : 50

    const [candles, rates] = await Promise.all([
      getCryptoKlines(symbol, interval, limit),
      getLiveInrRates()
    ])

    const rate = rates.domesticRate

    // Return both USDT values and converted INR values
    const inrCandles = candles.map(([time, open, high, low, close, volume]) => ({
      time: Math.floor(time / 1000), // seconds timestamp for lightweight-charts
      openUsdt: open,
      highUsdt: high,
      lowUsdt: low,
      closeUsdt: close,
      openInr: Number((open * rate).toFixed(2)),
      highInr: Number((high * rate).toFixed(2)),
      lowInr: Number((low * rate).toFixed(2)),
      closeInr: Number((close * rate).toFixed(2)),
      volume
    }))

    return {
      success: true,
      symbol,
      interval,
      rate,
      data: inrCandles
    }
  } catch (err: unknown) {
    const error = err as Error
    throw createError({
      statusCode: 400,
      statusMessage: error.message || 'Failed to fetch candlestick chart data'
    })
  }
})
