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
 * Employs a 60-second cache (with 10-second minimum clamp on forced refresh) and handles per-symbol failures gracefully.
 */
export async function getLiveQuotes(symbols: string[], forceRefresh = false): Promise<Record<string, LiveQuote>> {
  const results: Record<string, LiveQuote> = {}
  const now = Date.now()
  const symbolsToFetch: string[] = []

  // 1. Check cache first (forced refresh requires at least 10s age)
  for (const rawSymbol of symbols) {
    const symbol = rawSymbol.trim().toUpperCase()
    const cached = quoteCache.get(symbol)
    const effectiveTtl = forceRefresh ? 10_000 : CACHE_TTL_MS
    if (cached && now - cached.timestamp < effectiveTtl) {
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

