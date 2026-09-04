import YahooFinance from 'yahoo-finance2'
import { getTursoClient } from './turso'

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

// In-memory quote cache with 30-second TTL (half of client's 60s poll interval to prevent cache-collision)
const quoteCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 30_000

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

export interface DirectYahooQuote {
  symbol: string
  price: number
  change: number
  changePercent: number
  open: number
  dayHigh: number
  dayLow: number
  previousClose: number
  volume: number
  fiftyTwoWeekHigh: number
  fiftyTwoWeekLow: number
  shortName: string
  longName?: string
  marketState: string
}

/**
 * Direct crumb-free quote fetcher using Yahoo Finance v8 chart metadata.
 * Completely immune to Yahoo crumb rate limiting / 429 Too Many Requests in cloud environments (Render, AWS, etc.).
 */
export async function fetchDirectYahooQuote(symbol: string): Promise<DirectYahooQuote | null> {
  const hosts = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json'
  }

  for (const host of hosts) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 6000)

      const res = await fetch(url, { headers, signal: controller.signal })
      clearTimeout(timeoutId)

      if (!res.ok) continue

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any
      const meta = data?.chart?.result?.[0]?.meta
      if (!meta || meta.regularMarketPrice === undefined) continue

      const price = Number(meta.regularMarketPrice ?? 0)
      const previousClose = Number(meta.previousClose ?? meta.chartPreviousClose ?? price)
      const change = Number((price - previousClose).toFixed(2))
      const changePercent = Number((previousClose ? (change / previousClose) * 100 : 0).toFixed(2))

      return {
        symbol,
        price,
        change,
        changePercent,
        open: Number(meta.regularMarketOpen ?? meta.chartPreviousClose ?? price),
        dayHigh: Number(meta.regularMarketDayHigh ?? price),
        dayLow: Number(meta.regularMarketDayLow ?? price),
        previousClose,
        volume: Number(meta.regularMarketVolume ?? 0),
        fiftyTwoWeekHigh: Number(meta.fiftyTwoWeekHigh ?? price),
        fiftyTwoWeekLow: Number(meta.fiftyTwoWeekLow ?? price),
        shortName: String(meta.shortName || symbol),
        longName: meta.longName ? String(meta.longName) : undefined,
        marketState: String(meta.marketState || 'REGULAR')
      }
    } catch {
      // Continue to backup host
    }
  }

  return null
}

/**
 * Fetches real-time quotes for a list of NSE equity symbols.
 * Employs crumb-free Yahoo v8 metadata fetcher with 30s cache and automatic Turso DB fallback.
 */
export async function getLiveQuotes(symbols: string[], forceRefresh = false): Promise<Record<string, LiveQuote>> {
  const results: Record<string, LiveQuote> = {}
  const now = Date.now()
  const symbolsToFetch: string[] = []

  // 1. Check in-memory cache first
  for (const rawSymbol of symbols) {
    const symbol = rawSymbol.trim().toUpperCase()
    const cached = quoteCache.get(symbol)
    const effectiveTtl = forceRefresh ? 5_000 : CACHE_TTL_MS
    if (cached && now - cached.timestamp < effectiveTtl) {
      results[symbol] = cached.quote
    } else {
      symbolsToFetch.push(symbol)
    }
  }

  if (symbolsToFetch.length === 0) {
    return results
  }

  // 2. Fetch fresh quotes using crumb-free direct Yahoo endpoint
  const failedSymbols: string[] = []

  await Promise.all(
    symbolsToFetch.map(async (symbol) => {
      try {
        const ticker = toYahooTicker(symbol)
        const q = await fetchDirectYahooQuote(ticker)

        if (q && q.price > 0) {
          const liveQuote: LiveQuote = {
            symbol,
            price: q.price,
            change: q.change,
            changePercent: q.changePercent,
            open: q.open,
            dayHigh: q.dayHigh,
            dayLow: q.dayLow,
            previousClose: q.previousClose,
            volume: q.volume,
            lastUpdated: now
          }

          quoteCache.set(symbol, { quote: liveQuote, timestamp: now })
          if (ticker !== symbol) {
            quoteCache.set(ticker, { quote: liveQuote, timestamp: now })
          }
          results[symbol] = liveQuote
          if (ticker !== symbol) {
            results[ticker] = liveQuote
          }
        } else {
          // If network fetch fails, check previous cache or queue for DB fallback
          const fallback = quoteCache.get(symbol) || quoteCache.get(ticker)
          if (fallback?.quote) {
            results[symbol] = fallback.quote
          } else {
            failedSymbols.push(symbol)
          }
        }
      } catch (err) {
        failedSymbols.push(symbol)
        console.warn(`[getLiveQuotes] Failed for ${symbol}:`, (err as Error).message)
      }
    })
  )

  // 3. Fallback to Turso DB for any symbols that failed external fetch (100% resilient)
  if (failedSymbols.length > 0) {
    try {
      const { getTursoClient } = await import('./turso')
      const db = getTursoClient()
      const symbolsWithNs = failedSymbols.map(toYahooTicker)
      const allSearch = [...new Set([...failedSymbols, ...symbolsWithNs])]
      const placeholders = allSearch.map(() => '?').join(',')
      const dbRes = await db.execute({
        sql: `SELECT symbol, company_name, current_price, price_change, percentage_change FROM technical_analysis WHERE symbol IN (${placeholders})`,
        args: allSearch
      })

      for (const row of dbRes.rows) {
        const sym = String(row.symbol)
        const clean = sym.replace(/\.(NS|BO)$/i, '')
        const liveQuote: LiveQuote = {
          symbol: clean,
          price: Number(row.current_price || 0),
          change: Number(row.price_change || 0),
          changePercent: Number(row.percentage_change || 0),
          open: Number(row.current_price || 0),
          dayHigh: Number(row.current_price || 0),
          dayLow: Number(row.current_price || 0),
          previousClose: Number(row.current_price || 0),
          volume: 0,
          lastUpdated: now
        }
        results[clean] = liveQuote
        results[sym] = liveQuote
        quoteCache.set(clean, { quote: liveQuote, timestamp: now })
        quoteCache.set(sym, { quote: liveQuote, timestamp: now })
      }
    } catch (dbErr) {
      console.warn('[getLiveQuotes] Turso DB fallback error:', dbErr)
    }
  }

  return results
}

// In-memory fundamentals cache with 5-minute TTL
interface FundamentalsCacheEntry {
  data: import('~/types/market').StockFundamentalDetails
  timestamp: number
}
const fundamentalsCache = new Map<string, FundamentalsCacheEntry>()
const FUNDAMENTALS_TTL_MS = 5 * 60 * 1000

function safeNum(val: unknown): number | undefined {
  if (val === null || val === undefined) return undefined
  const num = Number(val)
  return Number.isNaN(num) ? undefined : num
}

function safeStr(val: unknown): string | undefined {
  if (val === null || val === undefined || val === '') return undefined
  return String(val)
}

/**
 * Fetches comprehensive fundamental analysis data for a stock using Yahoo Finance quoteSummary.
 * Employs in-memory caching to minimize external API roundtrips.
 */
export async function getStockFundamentals(symbol: string): Promise<import('~/types/market').StockFundamentalDetails | null> {
  const cleanSymbol = symbol.trim().toUpperCase()
  const now = Date.now()

  // 1. Check cache first
  const cached = fundamentalsCache.get(cleanSymbol)
  if (cached && now - cached.timestamp < FUNDAMENTALS_TTL_MS) {
    return cached.data
  }

  const ticker = toYahooTicker(cleanSymbol)

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = (await yf.quoteSummary(ticker, {
      modules: [
        'quoteType',
        'price',
        'summaryProfile',
        'assetProfile',
        'financialData',
        'defaultKeyStatistics',
        'summaryDetail',
        'recommendationTrend',
        'earnings'
      ]
    })) as Record<string, any>

    if (!res) return null

    const quoteType = res.quoteType || {}
    const price = res.price || {}
    const profile = res.assetProfile || res.summaryProfile || {}
    const financial = res.financialData || {}
    const stats = res.defaultKeyStatistics || {}
    const summary = res.summaryDetail || {}
    const recTrend = res.recommendationTrend?.trend?.[0]
    const earnings = res.earnings?.financialsChart

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const companyOfficers = Array.isArray(profile.companyOfficers)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? profile.companyOfficers.slice(0, 10).map((o: any) => ({
          name: String(o.name || ''),
          title: String(o.title || ''),
          age: safeNum(o.age),
          totalPay: safeNum(o.totalPay)
        }))
      : []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const yearlyEarnings = Array.isArray(earnings?.yearly)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? earnings.yearly.map((y: any) => ({
          date: Number(y.date),
          revenue: Number(y.revenue || 0),
          earnings: Number(y.earnings || 0),
          profitMargin: safeNum(y.profitMargin)
        }))
      : []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quarterlyEarnings = Array.isArray(earnings?.quarterly)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? earnings.quarterly.map((q: any) => ({
          date: String(q.date || ''),
          revenue: Number(q.revenue || 0),
          earnings: Number(q.earnings || 0),
          profitMargin: safeNum(q.profitMargin)
        }))
      : []

    const details: import('~/types/market').StockFundamentalDetails = {
      symbol: cleanSymbol,
      companyName: safeStr(price.longName || price.shortName || quoteType.longName || quoteType.shortName || profile.longName),
      currency: safeStr(financial.financialCurrency || summary.currency || 'INR'),
      currentPrice: safeNum(financial.currentPrice || summary.regularMarketPrice || summary.currentPrice),
      profile: {
        sector: safeStr(profile.sector || profile.sectorDisp),
        industry: safeStr(profile.industry || profile.industryDisp),
        website: safeStr(profile.website),
        fullTimeEmployees: safeNum(profile.fullTimeEmployees),
        city: safeStr(profile.city),
        country: safeStr(profile.country),
        longBusinessSummary: safeStr(profile.longBusinessSummary),
        companyOfficers
      },
      valuation: {
        marketCap: safeNum(summary.marketCap || stats.marketCap),
        enterpriseValue: safeNum(stats.enterpriseValue),
        trailingPE: safeNum(summary.trailingPE || stats.trailingPE),
        forwardPE: safeNum(summary.forwardPE || stats.forwardPE),
        pegRatio: safeNum(stats.pegRatio),
        priceToBook: safeNum(stats.priceToBook),
        priceToSales: safeNum(summary.priceToSalesTrailing12Months),
        enterpriseToRevenue: safeNum(stats.enterpriseToRevenue),
        enterpriseToEbitda: safeNum(stats.enterpriseToEbitda),
        beta: safeNum(summary.beta || stats.beta),
        sharesOutstanding: safeNum(stats.sharesOutstanding),
        floatShares: safeNum(stats.floatShares),
        bookValue: safeNum(stats.bookValue),
        heldPercentInsiders: safeNum(stats.heldPercentInsiders),
        heldPercentInstitutions: safeNum(stats.heldPercentInstitutions)
      },
      financials: {
        totalRevenue: safeNum(financial.totalRevenue),
        revenueGrowth: safeNum(financial.revenueGrowth),
        revenuePerShare: safeNum(financial.revenuePerShare),
        grossProfits: safeNum(financial.grossProfits),
        grossMargins: safeNum(financial.grossMargins),
        ebitda: safeNum(financial.ebitda),
        ebitdaMargins: safeNum(financial.ebitdaMargins),
        operatingMargins: safeNum(financial.operatingMargins),
        profitMargins: safeNum(financial.profitMargins),
        netIncome: safeNum(stats.netIncomeToCommon),
        trailingEps: safeNum(stats.trailingEps),
        forwardEps: safeNum(stats.forwardEps),
        earningsGrowth: safeNum(financial.earningsGrowth),
        returnOnAssets: safeNum(financial.returnOnAssets),
        returnOnEquity: safeNum(financial.returnOnEquity)
      },
      balanceSheet: {
        totalCash: safeNum(financial.totalCash),
        totalCashPerShare: safeNum(financial.totalCashPerShare),
        totalDebt: safeNum(financial.totalDebt),
        debtToEquity: safeNum(financial.debtToEquity),
        currentRatio: safeNum(financial.currentRatio),
        quickRatio: safeNum(financial.quickRatio)
      },
      dividends: {
        dividendRate: safeNum(summary.dividendRate),
        dividendYield: safeNum(summary.dividendYield),
        payoutRatio: safeNum(summary.payoutRatio),
        fiveYearAvgDividendYield: safeNum(summary.fiveYearAvgDividendYield),
        exDividendDate: summary.exDividendDate ? new Date(summary.exDividendDate).toISOString().split('T')[0] : undefined
      },
      analystTargets: {
        targetMeanPrice: safeNum(financial.targetMeanPrice),
        targetHighPrice: safeNum(financial.targetHighPrice),
        targetLowPrice: safeNum(financial.targetLowPrice),
        targetMedianPrice: safeNum(financial.targetMedianPrice),
        recommendationKey: safeStr(financial.recommendationKey),
        recommendationMean: safeNum(financial.recommendationMean),
        numberOfAnalystOpinions: safeNum(financial.numberOfAnalystOpinions),
        recommendationTrend: recTrend ? {
          strongBuy: Number(recTrend.strongBuy || 0),
          buy: Number(recTrend.buy || 0),
          hold: Number(recTrend.hold || 0),
          sell: Number(recTrend.sell || 0),
          strongSell: Number(recTrend.strongSell || 0)
        } : undefined
      },
      earningsTrend: yearlyEarnings,
      quarterlyEarnings
    }

    fundamentalsCache.set(cleanSymbol, { data: details, timestamp: now })
    return details
  } catch (err) {
    console.error(`[YahooFinance] Failed to fetch fundamentals for ${cleanSymbol}:`, (err as Error).message)
    throw err
  }
}

