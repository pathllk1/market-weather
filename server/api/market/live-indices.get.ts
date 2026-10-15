import { fetchDirectYahooQuote } from '../../utils/yahoo'
import { getTursoClient } from '../../utils/turso'

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
          const q = await fetchDirectYahooQuote(cfg.symbol)
          if (q && q.price > 0) {
            return {
              symbol: cfg.symbol,
              name: cfg.displayName,
              shortName: cfg.shortName,
              price: Number(q.price.toFixed(2)),
              change: Number(q.change.toFixed(2)),
              changePercent: Number(q.changePercent.toFixed(2)),
              dayHigh: Number(q.dayHigh.toFixed(2)),
              dayLow: Number(q.dayLow.toFixed(2)),
              open: Number(q.open.toFixed(2)),
              previousClose: Number(q.previousClose.toFixed(2)),
              fiftyTwoWeekHigh: Number(q.fiftyTwoWeekHigh.toFixed(2)),
              fiftyTwoWeekLow: Number(q.fiftyTwoWeekLow.toFixed(2)),
              marketState: q.marketState,
              lastUpdated: now
            } as LiveIndexData
          }
        } catch (err) {
          console.warn(`[live-indices] Direct fetch failed for ${cfg.symbol}:`, (err as Error).message)
        }

        // Return prior real cached index if available; never fabricate fake fallback numbers
        const cachedItem = cache?.data.indices.find(i => i.symbol === cfg.symbol)
        if (cachedItem) return cachedItem

        return null
      })
    )

    const validIndices = rawQuotes.filter((item): item is LiveIndexData => item !== null)

    // Fetch live movers purely dynamically from technical_analysis database
    let gainers: LiveMoverItem[] = []
    let losers: LiveMoverItem[] = []

    try {
      const db = getTursoClient()
      const [gainersRes, losersRes] = await Promise.all([
        db.execute(`
          SELECT symbol, company_name, current_price, price_change, percentage_change
          FROM technical_analysis
          WHERE percentage_change > 0
          ORDER BY percentage_change DESC
          LIMIT 5;
        `),
        db.execute(`
          SELECT symbol, company_name, current_price, price_change, percentage_change
          FROM technical_analysis
          WHERE percentage_change < 0
          ORDER BY percentage_change ASC
          LIMIT 5;
        `)
      ])

      gainers = gainersRes.rows.map(r => ({
        symbol: String(r.symbol).replace(/\.(NS|BO)$/i, ''),
        name: String(r.company_name || r.symbol).replace(/\.(NS|BO)$/i, ''),
        price: Number(Number(r.current_price || 0).toFixed(2)),
        change: Number(Number(r.price_change || 0).toFixed(2)),
        changePercent: Number(Number(r.percentage_change || 0).toFixed(2))
      }))

      losers = losersRes.rows.map(r => ({
        symbol: String(r.symbol).replace(/\.(NS|BO)$/i, ''),
        name: String(r.company_name || r.symbol).replace(/\.(NS|BO)$/i, ''),
        price: Number(Number(r.current_price || 0).toFixed(2)),
        change: Number(Number(r.price_change || 0).toFixed(2)),
        changePercent: Number(Number(r.percentage_change || 0).toFixed(2))
      }))
    } catch (mErr) {
      console.warn('[live-indices] Error fetching database movers:', mErr)
    }

    const payload = {
      indices: validIndices.length > 0 ? validIndices : (cache?.data.indices || []),
      movers: {
        gainers: gainers.length > 0 ? gainers : (cache?.data.movers.gainers || []),
        losers: losers.length > 0 ? losers : (cache?.data.movers.losers || [])
      }
    }

    cache = {
      data: payload,
      timestamp: now
    }

    return {
      indices: payload.indices,
      movers: payload.movers,
      lastUpdated: now
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
