import type { DailyCandleRecord } from './types'

interface BinanceKlineRaw {
  0: number // Open time ms
  1: string // Open
  2: string // High
  3: string // Low
  4: string // Close
  5: string // Volume base
  6: number // Close time ms
  7: string // Volume quote
}

/**
 * Fetch daily historical candles from Binance Vision with automatic failover to Bybit
 */
export async function fetchHistoricalDailyCandles(
  symbol: string,
  startTimeMs: number,
  endTimeMs: number
): Promise<DailyCandleRecord[]> {
  try {
    return await fetchFromBinanceVision(symbol, startTimeMs, endTimeMs)
  } catch (err) {
    console.warn(`[SyncFetcher] Binance Vision fetch failed for ${symbol}: ${err instanceof Error ? err.message : String(err)}. Trying Bybit...`)
    try {
      return await fetchFromBybit(symbol, startTimeMs, endTimeMs)
    } catch (bybitErr) {
      console.error(`[SyncFetcher] All historical providers failed for ${symbol}:`, bybitErr)
      return []
    }
  }
}

async function fetchFromBinanceVision(
  symbol: string,
  startTimeMs: number,
  endTimeMs: number
): Promise<DailyCandleRecord[]> {
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${startTimeMs}&endTime=${endTimeMs}&limit=1000`

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  })

  if (!res.ok) {
    throw new Error(`Binance Vision HTTP ${res.status}: ${res.statusText}`)
  }

  const raw = (await res.json()) as BinanceKlineRaw[]
  if (!Array.isArray(raw)) {
    throw new Error('Invalid response structure from Binance Vision')
  }

  return raw.map((k) => {
    const dateObj = new Date(Number(k[0]))
    const candleDate = dateObj.toISOString().split('T')[0] ?? ''

    return {
      symbol,
      candle_date: candleDate,
      open_price: parseFloat(k[1] ?? '0'),
      high_price: parseFloat(k[2] ?? '0'),
      low_price: parseFloat(k[3] ?? '0'),
      close_price: parseFloat(k[4] ?? '0'),
      volume_base: parseFloat(k[5] ?? '0'),
      volume_quote: parseFloat(k[7] ?? '0'),
      source: 'binance_vision'
    }
  }).filter(c => c.candle_date && !isNaN(c.close_price))
}

async function fetchFromBybit(
  symbol: string,
  startTimeMs: number,
  endTimeMs: number
): Promise<DailyCandleRecord[]> {
  const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=D&start=${startTimeMs}&end=${endTimeMs}&limit=1000`

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  })

  if (!res.ok) {
    throw new Error(`Bybit HTTP ${res.status}: ${res.statusText}`)
  }

  const data = await res.json() as {
    result?: {
      list?: Array<[string, string, string, string, string, string, string]>
    }
  }

  const list = data?.result?.list
  if (!Array.isArray(list) || list.length === 0) {
    return []
  }

  // Bybit returns newest first, so we reverse to chronological order
  const chronological = [...list].reverse()

  return chronological.map((item) => {
    const timestamp = Number(item[0])
    const candleDate = new Date(timestamp).toISOString().split('T')[0] ?? ''

    return {
      symbol,
      candle_date: candleDate,
      open_price: parseFloat(item[1] ?? '0'),
      high_price: parseFloat(item[2] ?? '0'),
      low_price: parseFloat(item[3] ?? '0'),
      close_price: parseFloat(item[4] ?? '0'),
      volume_base: parseFloat(item[5] ?? '0'),
      volume_quote: parseFloat(item[6] ?? '0'),
      source: 'bybit'
    }
  }).filter(c => c.candle_date && !isNaN(c.close_price))
}
