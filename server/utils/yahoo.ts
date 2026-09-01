import YahooFinance from 'yahoo-finance2'

export interface LiveQuote {
  symbol: string
  price: number
  change: number
  changePercent: number
  open: number
  dayHigh: number
  dayLow: number
  previousClose: number
  volume: number
  lastUpdated: number
}

interface CacheEntry {
  quote: LiveQuote
  timestamp: number
}

// In-memory quote cache with 60-second TTL
const quoteCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60_000

// Initialize YahooFinance client with notice suppression
const yf = new YahooFinance({
  suppressNotices: ['yahooSurvey']
})

/**
 * Normalizes an NSE symbol to Yahoo Finance ticker (.NS suffix)
 */
export function toYahooTicker(symbol: string): string {
  const clean = symbol.trim().toUpperCase()
  if (clean.endsWith('.NS') || clean.endsWith('.BO')) return clean
  return `${clean}.NS`
}

/**
 * Fetches real-time / delayed quotes for a list of NSE equity symbols.
 * Employs a 60-second cache and handles per-symbol failures gracefully.
 */
export async function getLiveQuotes(symbols: string[]): Promise<Record<string, LiveQuote>> {
  const results: Record<string, LiveQuote> = {}
  const now = Date.now()
  const symbolsToFetch: string[] = []

  // 1. Check cache first
  for (const rawSymbol of symbols) {
    const symbol = rawSymbol.trim().toUpperCase()
    const cached = quoteCache.get(symbol)
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      results[symbol] = cached.quote
    } else {
      symbolsToFetch.push(symbol)
    }
  }

  if (symbolsToFetch.length === 0) {
    return results
  }

  // 2. Fetch fresh quotes in parallel with error isolation per symbol
  await Promise.all(
    symbolsToFetch.map(async (symbol) => {
      try {
        const ticker = toYahooTicker(symbol)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q = (await yf.quote(ticker)) as Record<string, any>

        if (q && (q.regularMarketPrice !== undefined || q.currentPrice !== undefined)) {
          const price = Number(q.regularMarketPrice ?? q.currentPrice ?? 0)
          const previousClose = Number(q.regularMarketPreviousClose ?? price)
          const change = Number(q.regularMarketChange ?? (price - previousClose))
          const changePercent = Number(q.regularMarketChangePercent ?? (previousClose ? (change / previousClose) * 100 : 0))
          const open = Number(q.regularMarketOpen ?? price)
          const dayHigh = Number(q.regularMarketDayHigh ?? price)
          const dayLow = Number(q.regularMarketDayLow ?? price)
          const volume = Number(q.regularMarketVolume ?? 0)

          const liveQuote: LiveQuote = {
            symbol,
            price,
            change,
            changePercent,
            open,
            dayHigh,
            dayLow,
            previousClose,
            volume,
            lastUpdated: now
          }

          quoteCache.set(symbol, { quote: liveQuote, timestamp: now })
          results[symbol] = liveQuote
        }
      } catch (err) {
        // Silently tolerate individual quote fetch failures (e.g. rate limit, offline)
        // Calling layer falls back to local SQLite technical_analysis values
        console.warn(`[YahooFinance] Failed to fetch quote for ${symbol}:`, (err as Error).message)
      }
    })
  )

  return results
}
