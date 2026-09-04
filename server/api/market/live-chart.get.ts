import YahooFinance from 'yahoo-finance2'
import { toYahooTicker, fetchDirectYahooQuote } from '../../utils/yahoo'

export interface LiveChartCandle {
  time: number // UNIX epoch seconds
  open: number
  high: number
  low: number
  close: number
  volume: number
  sma20?: number | null
  sma50?: number | null
  ema9?: number | null
}

export interface LiveChartResponse {
  symbol: string
  name: string
  currency: string
  range: string
  interval: string
  candles: LiveChartCandle[]
  meta: {
    currentPrice: number
    previousClose: number
    change: number
    changePercent: number
    periodHigh: number
    periodLow: number
    periodVolume: number
    marketState: string
    lastUpdated: number
  }
}

const yf = new YahooFinance({
  suppressNotices: ['yahooSurvey']
})

interface CacheItem {
  data: LiveChartResponse
  timestamp: number
}

const chartCache = new Map<string, CacheItem>()

export default defineEventHandler(async (event): Promise<LiveChartResponse> => {
  const query = getQuery(event)
  const rawSymbol = typeof query.symbol === 'string' ? query.symbol.trim().toUpperCase() : '^NSEI'
  const range = typeof query.range === 'string' && ['1d', '5d', '1mo', '6mo', '1y'].includes(query.range)
    ? query.range
    : '1d'

  // Default interval based on range if not explicitly provided
  let interval = typeof query.interval === 'string' && ['1m', '5m', '15m', '30m', '1h', '1d'].includes(query.interval)
    ? query.interval
    : ''

  if (!interval) {
    if (range === '1d') interval = '5m'
    else if (range === '5d') interval = '15m'
    else if (range === '1mo') interval = '1h'
    else if (range === '6mo') interval = '1d'
    else interval = '1d'
  }

  // If index symbol starting with ^, use directly. Otherwise append .NS if needed
  const ticker = rawSymbol.startsWith('^') ? rawSymbol : toYahooTicker(rawSymbol)
  const cacheKey = `${ticker}_${range}_${interval}`
  const now = Date.now()

  // Dynamic TTL: 15s for intraday, 60s for historical
  const cacheTtl = interval === '1d' ? 60_000 : 15_000
  const cached = chartCache.get(cacheKey)
  if (cached && now - cached.timestamp < cacheTtl) {
    return cached.data
  }

  // Professional charting standard: fetch a pre-roll "warm-up" period before the visible range
  // so that SMA20, SMA50, and EMA9 are fully calculated from the very first visible candle!
  let period1: Date
  let visibleStartMs: number

  if (range === '1d') {
    // Look back 4 days to get ~150-200 warmup candles so SMA 50 has full history at 9:15 AM
    period1 = new Date(now - 4 * 24 * 60 * 60 * 1000)
    visibleStartMs = now - 24 * 60 * 60 * 1000
  } else if (range === '5d') {
    visibleStartMs = now - 7 * 24 * 60 * 60 * 1000
    period1 = new Date(now - 18 * 24 * 60 * 60 * 1000)
  } else if (range === '1mo') {
    visibleStartMs = now - 35 * 24 * 60 * 60 * 1000
    period1 = new Date(now - 70 * 24 * 60 * 60 * 1000)
  } else if (range === '6mo') {
    visibleStartMs = now - 185 * 24 * 60 * 60 * 1000
    period1 = new Date(now - 265 * 24 * 60 * 60 * 1000)
  } else {
    // 1y
    visibleStartMs = now - 370 * 24 * 60 * 60 * 1000
    period1 = new Date(now - 455 * 24 * 60 * 60 * 1000)
  }

  try {
    // Query chart and real-time quote in parallel (both fast, 0 DB involvement)
    const [chartRes, quoteRes] = await Promise.all([
      yf.chart(ticker, {
        interval: interval as any,
        period1
      }) as Promise<Record<string, any>>,
      fetchDirectYahooQuote(ticker).catch(() => null)
    ])

    if (!chartRes || !Array.isArray(chartRes.quotes)) {
      throw new Error(`No chart data returned for ${ticker}`)
    }

    const metaObj = chartRes.meta || {}
    // Filter valid quotes with open and close
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validQuotes: any[] = chartRes.quotes.filter(
      (q: any) => q && q.open !== null && q.close !== null && q.high !== null && q.low !== null
    )

    if (validQuotes.length === 0) {
      throw new Error(`No valid quote bars for ${ticker}`)
    }

    // 1. Calculate technical indicators across the ENTIRE quote array (including warm-up)
    const allSma20: (number | null)[] = validQuotes.map((q, i) => {
      if (i < 19) return null
      let sum = 0
      for (let j = 0; j < 20; j++) sum += Number(validQuotes[i - j].close)
      return Number((sum / 20).toFixed(2))
    })

    const allSma50: (number | null)[] = validQuotes.map((q, i) => {
      if (i < 49) return null
      let sum = 0
      for (let j = 0; j < 50; j++) sum += Number(validQuotes[i - j].close)
      return Number((sum / 50).toFixed(2))
    })

    const k9 = 2 / (9 + 1)
    let prevEma9: number | null = null
    const allEma9: (number | null)[] = validQuotes.map((q, i) => {
      if (i < 8) return null
      const close = Number(q.close)
      if (prevEma9 === null) {
        let sum = 0
        for (let j = 0; j < 9; j++) sum += Number(validQuotes[i - j].close)
        prevEma9 = sum / 9
        return Number(prevEma9.toFixed(2))
      }
      prevEma9 = (close - prevEma9) * k9 + prevEma9
      return Number(prevEma9.toFixed(2))
    })

    // 2. Identify visible candle indices
    let visibleIndices: number[] = []
    if (range === '1d') {
      // Visible = all candles belonging to the latest trading date
      const lastDate = new Date(validQuotes[validQuotes.length - 1].date).toDateString()
      validQuotes.forEach((q, idx) => {
        if (new Date(q.date).toDateString() === lastDate) {
          visibleIndices.push(idx)
        }
      })
    } else {
      validQuotes.forEach((q, idx) => {
        if (new Date(q.date).getTime() >= visibleStartMs) {
          visibleIndices.push(idx)
        }
      })
    }

    if (visibleIndices.length === 0) {
      // Fallback: take the last 50 quotes if filtering was too strict
      visibleIndices = validQuotes.map((_, i) => i).slice(-50)
    }

    // 3. Assemble visible candles with warm-up populated indicators
    const IST_OFFSET_SEC = 19_800
    const candles: LiveChartCandle[] = []
    let periodHigh = -Infinity
    let periodLow = Infinity
    let totalVol = 0

    for (const idx of visibleIndices) {
      const q = validQuotes[idx]
      const timeSec = Math.floor(new Date(q.date).getTime() / 1000) + IST_OFFSET_SEC
      const open = Number(Number(q.open).toFixed(2))
      const high = Number(Number(q.high).toFixed(2))
      const low = Number(Number(q.low).toFixed(2))
      const close = Number(Number(q.close).toFixed(2))
      const volume = Number(q.volume || 0)

      if (high > periodHigh) periodHigh = high
      if (low < periodLow) periodLow = low
      totalVol += volume

      candles.push({
        time: timeSec,
        open,
        high,
        low,
        close,
        volume,
        sma20: allSma20[idx],
        sma50: allSma50[idx],
        ema9: allEma9[idx]
      })
    }

    const lastCandle = candles[candles.length - 1]

    // Crucial: Use live quote stats for day change so it's NEVER corrupted by historical range
    const currentPrice = quoteRes?.price !== undefined
      ? Number(Number(quoteRes.price).toFixed(2))
      : (lastCandle ? lastCandle.close : Number(metaObj.regularMarketPrice ?? 0))

    const prevClose = quoteRes?.previousClose !== undefined
      ? Number(Number(quoteRes.previousClose).toFixed(2))
      : Number(metaObj.regularMarketPreviousClose ?? (candles[0]?.open || currentPrice))

    const change = quoteRes?.change !== undefined
      ? Number(Number(quoteRes.change).toFixed(2))
      : Number((currentPrice - prevClose).toFixed(2))

    const changePercent = quoteRes?.changePercent !== undefined
      ? Number(Number(quoteRes.changePercent).toFixed(2))
      : Number((prevClose ? (change / prevClose) * 100 : 0).toFixed(2))

    const response: LiveChartResponse = {
      symbol: rawSymbol,
      name: String(quoteRes?.shortName || quoteRes?.longName || metaObj.shortName || metaObj.longName || rawSymbol),
      currency: String(metaObj.currency || 'INR'),
      range,
      interval,
      candles,
      meta: {
        currentPrice,
        previousClose: prevClose,
        change,
        changePercent,
        periodHigh: periodHigh === -Infinity ? currentPrice : Number(periodHigh.toFixed(2)),
        periodLow: periodLow === Infinity ? currentPrice : Number(periodLow.toFixed(2)),
        periodVolume: totalVol,
        marketState: String(quoteRes?.marketState || metaObj.marketState || 'REGULAR'),
        lastUpdated: now
      }
    }

    chartCache.set(cacheKey, {
      data: response,
      timestamp: now
    })

    return response
  } catch (err) {
    console.error(`[live-chart] Failed to load chart for ${ticker}:`, err)
    if (cached?.data) {
      return cached.data
    }
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch live chart data for ${rawSymbol}`
    })
  }
})
