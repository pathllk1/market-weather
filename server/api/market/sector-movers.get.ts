import YahooFinance from 'yahoo-finance2'

export interface SectorStockItem {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
}

export interface SectorMoversItem {
  id: string
  name: string
  shortName: string
  indexSymbol: string
  indexName: string
  indexPrice: number
  indexChange: number
  indexChangePercent: number
  icon: string
  stocks: SectorStockItem[]
}

export interface MarketBreadthData {
  advances: number
  declines: number
  unchanged: number
  total: number
  advancePercent: number
  declinePercent: number
  ratio: number
  sentiment: 'bullish' | 'bearish' | 'neutral'
  sentimentLabel: string
}

export interface SectorMoversApiResponse {
  sectors: SectorMoversItem[]
  breadth: MarketBreadthData
  lastUpdated: number
}

const SECTOR_CONFIG = [
  {
    id: 'metal',
    name: 'NIFTY Metal',
    shortName: 'Metal',
    indexSymbol: '^CNXMETAL',
    icon: 'i-lucide-layers',
    stocks: [
      { symbol: 'TATASTEEL.NS', name: 'Tata Steel' },
      { symbol: 'JSWSTEEL.NS', name: 'JSW Steel' },
      { symbol: 'HINDALCO.NS', name: 'Hindalco' },
      { symbol: 'VEDL.NS', name: 'Vedanta' },
      { symbol: 'JINDALSTEL.NS', name: 'Jindal Steel' }
    ]
  },
  {
    id: 'power',
    name: 'NIFTY Energy',
    shortName: 'Power & Energy',
    indexSymbol: '^CNXENERGY',
    icon: 'i-lucide-zap',
    stocks: [
      { symbol: 'NTPC.NS', name: 'NTPC' },
      { symbol: 'POWERGRID.NS', name: 'Power Grid' },
      { symbol: 'TATAPOWER.NS', name: 'Tata Power' },
      { symbol: 'ADANIGREEN.NS', name: 'Adani Green' },
      { symbol: 'ONGC.NS', name: 'ONGC' }
    ]
  },
  {
    id: 'infra',
    name: 'NIFTY Infra',
    shortName: 'Infra',
    indexSymbol: '^CNXINFRA',
    icon: 'i-lucide-building-2',
    stocks: [
      { symbol: 'LT.NS', name: 'Larsen & Toubro' },
      { symbol: 'ULTRACEMCO.NS', name: 'UltraTech' },
      { symbol: 'GRASIM.NS', name: 'Grasim' },
      { symbol: 'ADANIPORTS.NS', name: 'Adani Ports' },
      { symbol: 'AMBUJACEM.NS', name: 'Ambuja Cements' }
    ]
  },
  {
    id: 'auto',
    name: 'NIFTY Auto',
    shortName: 'Auto',
    indexSymbol: '^CNXAUTO',
    icon: 'i-lucide-car',
    stocks: [
      { symbol: 'MARUTI.NS', name: 'Maruti Suzuki' },
      { symbol: 'M&M.NS', name: 'Mahindra & Mahindra' },
      { symbol: 'BAJAJ-AUTO.NS', name: 'Bajaj Auto' },
      { symbol: 'EICHERMOT.NS', name: 'Eicher Motors' },
      { symbol: 'HEROMOTOCO.NS', name: 'Hero MotoCorp' }
    ]
  },
  {
    id: 'pharma',
    name: 'NIFTY Pharma',
    shortName: 'Pharma',
    indexSymbol: '^CNXPHARMA',
    icon: 'i-lucide-pill',
    stocks: [
      { symbol: 'SUNPHARMA.NS', name: 'Sun Pharma' },
      { symbol: 'CIPLA.NS', name: 'Cipla' },
      { symbol: 'DRREDDY.NS', name: "Dr. Reddy's" },
      { symbol: 'DIVISLAB.NS', name: "Divi's Lab" },
      { symbol: 'LUPIN.NS', name: 'Lupin' }
    ]
  },
  {
    id: 'bank',
    name: 'NIFTY Bank',
    shortName: 'Banking',
    indexSymbol: '^NSEBANK',
    icon: 'i-lucide-landmark',
    stocks: [
      { symbol: 'HDFCBANK.NS', name: 'HDFC Bank' },
      { symbol: 'ICICIBANK.NS', name: 'ICICI Bank' },
      { symbol: 'SBIN.NS', name: 'State Bank of India' },
      { symbol: 'KOTAKBANK.NS', name: 'Kotak Bank' },
      { symbol: 'AXISBANK.NS', name: 'Axis Bank' }
    ]
  },
  {
    id: 'it',
    name: 'NIFTY IT',
    shortName: 'IT & Tech',
    indexSymbol: '^CNXIT',
    icon: 'i-lucide-laptop',
    stocks: [
      { symbol: 'TCS.NS', name: 'TCS' },
      { symbol: 'INFY.NS', name: 'Infosys' },
      { symbol: 'HCLTECH.NS', name: 'HCL Tech' },
      { symbol: 'WIPRO.NS', name: 'Wipro' },
      { symbol: 'TECHM.NS', name: 'Tech Mahindra' }
    ]
  },
  {
    id: 'fmcg',
    name: 'NIFTY FMCG',
    shortName: 'FMCG',
    indexSymbol: '^CNXFMCG',
    icon: 'i-lucide-shopping-cart',
    stocks: [
      { symbol: 'HINDUNILVR.NS', name: 'Hindustan Unilever' },
      { symbol: 'ITC.NS', name: 'ITC' },
      { symbol: 'NESTLEIND.NS', name: 'Nestle India' },
      { symbol: 'BRITANNIA.NS', name: 'Britannia' },
      { symbol: 'TATACONSUM.NS', name: 'Tata Consumer' }
    ]
  }
]

const yf = new YahooFinance({
  suppressNotices: ['yahooSurvey']
})

interface CacheEntry {
  data: {
    sectors: SectorMoversItem[]
    breadth: MarketBreadthData
  }
  timestamp: number
}

let cache: CacheEntry | null = null
const CACHE_TTL_MS = 25_000 // 25 seconds in-memory cache

export default defineEventHandler(async (): Promise<SectorMoversApiResponse> => {
  const now = Date.now()
  if (cache && now - cache.timestamp < CACHE_TTL_MS) {
    return {
      sectors: cache.data.sectors,
      breadth: cache.data.breadth,
      lastUpdated: cache.timestamp
    }
  }

  try {
    const allSymbols = SECTOR_CONFIG.flatMap((s) => [s.indexSymbol, ...s.stocks.map((stk) => stk.symbol)])
    // Fetch all quotes in a single batch call from Yahoo Finance (0 DB involvement)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes = (await yf.quote(allSymbols)) as Record<string, any>[]
    const quoteMap = new Map(quotes.map((q) => [q.symbol, q]))

    const sectors: SectorMoversItem[] = SECTOR_CONFIG.map((cfg) => {
      const idxQuote = quoteMap.get(cfg.indexSymbol)
      const idxPrice = Number(Number(idxQuote?.regularMarketPrice ?? 0).toFixed(2))
      const idxPrev = Number(Number(idxQuote?.regularMarketPreviousClose ?? idxPrice).toFixed(2))
      const idxChg = Number(Number(idxQuote?.regularMarketChange ?? (idxPrice - idxPrev)).toFixed(2))
      const idxPct = Number(
        Number(
          idxQuote?.regularMarketChangePercent ?? (idxPrev ? (idxChg / idxPrev) * 100 : 0)
        ).toFixed(2)
      )

      const stockItems: SectorStockItem[] = cfg.stocks.map((stk) => {
        const q = quoteMap.get(stk.symbol)
        const price = Number(Number(q?.regularMarketPrice ?? 0).toFixed(2))
        const prev = Number(Number(q?.regularMarketPreviousClose ?? price).toFixed(2))
        const change = Number(Number(q?.regularMarketChange ?? (price - prev)).toFixed(2))
        const changePercent = Number(
          Number(q?.regularMarketChangePercent ?? (prev ? (change / prev) * 100 : 0)).toFixed(2)
        )

        return {
          symbol: stk.symbol.replace('.NS', ''),
          name: stk.name,
          price,
          change,
          changePercent
        }
      })

      // Sort top 5 stocks by performance
      stockItems.sort((a, b) => b.changePercent - a.changePercent)

      return {
        id: cfg.id,
        name: cfg.name,
        shortName: cfg.shortName,
        indexSymbol: cfg.indexSymbol,
        indexName: String(idxQuote?.shortName || cfg.name),
        indexPrice: idxPrice,
        indexChange: idxChg,
        indexChangePercent: idxPct,
        icon: cfg.icon,
        stocks: stockItems
      }
    })

    // Calculate market breadth across all constituent heavyweights
    const allStocks = sectors.flatMap((s) => s.stocks)
    const advances = allStocks.filter((s) => s.changePercent > 0).length
    const declines = allStocks.filter((s) => s.changePercent < 0).length
    const unchanged = allStocks.filter((s) => s.changePercent === 0).length
    const total = allStocks.length
    const advancePercent = total ? Number(((advances / total) * 100).toFixed(1)) : 0
    const declinePercent = total ? Number(((declines / total) * 100).toFixed(1)) : 0
    const ratio = declines > 0 ? Number((advances / declines).toFixed(2)) : advances

    let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral'
    let sentimentLabel = 'Balanced / Mixed Market Breadth'
    if (advances >= declines * 1.35) {
      sentiment = 'bullish'
      sentimentLabel = 'Broad-Based Bullish Breadth'
    } else if (declines >= advances * 1.35) {
      sentiment = 'bearish'
      sentimentLabel = 'Broad-Based Selling Pressure'
    }

    const breadth: MarketBreadthData = {
      advances,
      declines,
      unchanged,
      total,
      advancePercent,
      declinePercent,
      ratio,
      sentiment,
      sentimentLabel
    }

    cache = {
      data: { sectors, breadth },
      timestamp: now
    }

    return {
      sectors,
      breadth,
      lastUpdated: now
    }
  } catch (err) {
    console.error('[sector-movers] Failed to fetch sector quotes:', err)
    if (cache?.data) {
      return {
        sectors: cache.data.sectors,
        breadth: cache.data.breadth,
        lastUpdated: cache.timestamp
      }
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch live sector movers'
    })
  }
})
