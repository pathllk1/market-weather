import { defineEventHandler, getQuery } from 'h3'
import { getHistoricalCandlesFromSupabase } from '../../../utils/crypto-sync/sync-orchestrator'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const symbol = typeof query.symbol === 'string' && query.symbol.trim() ? query.symbol.trim().toUpperCase() : 'BTCUSDT'
  const days = Math.min(365, Math.max(1, Number(query.days) || 30))

  try {
    const candles = await getHistoricalCandlesFromSupabase(symbol, days)
    return {
      success: true,
      symbol,
      days,
      count: candles.length,
      candles,
      timestamp: Date.now()
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      symbol,
      days,
      count: 0,
      candles: [],
      error: message,
      timestamp: Date.now()
    }
  }
})

