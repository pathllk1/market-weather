import YahooFinance from 'yahoo-finance2'

export interface LiveIndexData {
  symbol: string
  name: string
  shortName: string
  price: number
  change: number
  changePercent: number
  dayHigh: number
  dayLow: number
  open: number
  previousClose: number
  fiftyTwoWeekHigh: number
  fiftyTwoWeekLow: number
  marketState: string
  lastUpdated: number
}

export interface LiveMoverItem {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
}

export interface LiveIndicesApiResponse {
  indices: LiveIndexData[]
  movers: {
    gainers: LiveMoverItem[]
    losers: LiveMoverItem[]
  }
  lastUpdated: number
}

const INDICES_CONFIG = [
  { symbol: '^NSEI', displayName: 'NIFTY 50', shortName: 'NIFTY' },
  { symbol: '^NSEBANK', displayName: 'BANK NIFTY', shortName: 'BANKNIFTY' },
  { symbol: '^CNXIT', displayName: 'NIFTY IT', shortName: 'NIFTY IT' },
  { symbol: '^INDIAVIX', displayName: 'INDIA VIX', shortName: 'VIX' },
  { symbol: '^BSESN', displayName: 'S&P BSE SENSEX', shortName: 'SENSEX' }
]

const NIFTY_MOVERS_UNIVERSE = [
  'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS',
  'BHARTIARTL.NS', 'SBIN.NS', 'ITC.NS', 'HINDUNILVR.NS', 'LT.NS',
  'BAJFINANCE.NS', 'KOTAKBANK.NS', 'AXISBANK.NS', 'MARUTI.NS', 'SUNPHARMA.NS',
  'TITAN.NS', 'ULTRACEMCO.NS', 'TATASTEEL.NS', 'NTPC.NS', 'POWERGRID.NS'
]

const yf = new YahooFinance({
  suppressNotices: ['yahooSurvey']
})

interface CacheEntry {
  data: {
    indices: LiveIndexData[]
    movers: {
      gainers: LiveMoverItem[]
      losers: LiveMoverItem[]
    }
  }
  timestamp: number
}

let cache: CacheEntry | null = null
const CACHE_TTL_MS = 15_000 // 15 seconds cache

export default defineEventHandler(async (): Promise<LiveIndicesApiResponse> => {
  const now = Date.now()
  if (cache && now - cache.timestamp < CACHE_TTL_MS) {
    return {
      indices: cache.data.indices,
      movers: cache.data.movers,
      lastUpdated: cache.timestamp
    }
  }

  try {
    const rawQuotes = await Promise.all(
      INDICES_CONFIG.map(async (cfg) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const q = (await yf.quote(cfg.symbol)) as Record<string, any>
          if (!q) return null

          const price = Number(q.regularMarketPrice ?? 0)
          const previousClose = Number(q.regularMarketPreviousClose ?? price)
          const change = Number(q.regularMarketChange ?? (price - previousClose))
          const changePercent = Number(
            q.regularMarketChangePercent ?? (previousClose ? (change / previousClose) * 100 : 0)
          )

          return {
            symbol: cfg.symbol,
            name: cfg.displayName,
            shortName: cfg.shortName,
            price: Number(price.toFixed(2)),
            change: Number(change.toFixed(2)),
            changePercent: Number(changePercent.toFixed(2)),
            dayHigh: Number((q.regularMarketDayHigh ?? price).toFixed(2)),
            dayLow: Number((q.regularMarketDayLow ?? price).toFixed(2)),
            open: Number((q.regularMarketOpen ?? price).toFixed(2)),
            previousClose: Number(previousClose.toFixed(2)),
            fiftyTwoWeekHigh: Number((q.fiftyTwoWeekHigh ?? price).toFixed(2)),
            fiftyTwoWeekLow: Number((q.fiftyTwoWeekLow ?? price).toFixed(2)),
            marketState: String(q.marketState || 'REGULAR'),
            lastUpdated: now
          } as LiveIndexData
        } catch (err) {
          console.warn(`[live-indices] Failed for ${cfg.symbol}:`, (err as Error).message)
          return null
        }
      })
    )

    const validIndices = rawQuotes.filter((item): item is LiveIndexData => item !== null)

    // Fetch live movers from Yahoo Finance (0 DB involvement)
    let gainers: LiveMoverItem[] = []
    let losers: LiveMoverItem[] = []

    try {
      const moverQuotes = await Promise.all(
        NIFTY_MOVERS_UNIVERSE.map(async (s) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const q = (await yf.quote(s)) as Record<string, any>
            if (!q || q.regularMarketPrice === undefined) return null
            const price = Number(q.regularMarketPrice ?? 0)
            const prev = Number(q.regularMarketPreviousClose ?? price)
            const change = Number(q.regularMarketChange ?? (price - prev))
            const changePercent = Number(
              q.regularMarketChangePercent ?? (prev ? (change / prev) * 100 : 0)
            )
            return {
              symbol: s.replace('.NS', ''),
              name: String(q.shortName || q.longName || s.replace('.NS', '')),
              price: Number(price.toFixed(2)),
              change: Number(change.toFixed(2)),
              changePercent: Number(changePercent.toFixed(2))
            } as LiveMoverItem
          } catch {
            return null
          }
        })
      )

      const validMovers = moverQuotes.filter((m): m is LiveMoverItem => m !== null)
      const sortedMovers = [...validMovers].sort((a, b) => b.changePercent - a.changePercent)
      gainers = sortedMovers.slice(0, 5)
      losers = sortedMovers.slice(-5).reverse()
    } catch (mErr) {
      console.warn('[live-indices] Error fetching movers:', mErr)
    }

    const payload = {
      indices: validIndices.length > 0 ? validIndices : (cache?.data.indices || []),
      movers: {
        gainers: gainers.length > 0 ? gainers : (cache?.data.movers.gainers || []),
        losers: losers.length > 0 ? losers : (cache?.data.movers.losers || [])
      }
    }

    if (validIndices.length > 0) {
      cache = {
        data: payload,
        timestamp: now
      }
    }

    return {
      indices: payload.indices,
      movers: payload.movers,
      lastUpdated: cache?.timestamp || now
    }
  } catch (err) {
    console.error('[live-indices] Error fetching indices:', err)
    if (cache?.data) {
      return {
        indices: cache.data.indices,
        movers: cache.data.movers,
        lastUpdated: cache.timestamp
      }
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch live NSE benchmark indices'
    })
  }
})
