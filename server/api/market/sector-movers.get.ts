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

import { fetchDirectYahooQuote, getLiveQuotes } from '../../utils/yahoo'

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
    const stockSymbols = SECTOR_CONFIG.flatMap((s) => s.stocks.map((stk) => stk.symbol))
    const indexSymbols = SECTOR_CONFIG.map((s) => s.indexSymbol)

    // 1. Fetch live constituent quotes (crumb-free direct v8 with Turso DB fallback)
    // 2. Fetch sector index quotes in parallel
    const [liveQuotes, indexQuotesList] = await Promise.all([
      getLiveQuotes(stockSymbols),
      Promise.all(indexSymbols.map((sym) => fetchDirectYahooQuote(sym)))
    ])

    const indexMap = new Map(
      indexQuotesList.filter((q): q is NonNullable<typeof q> => q !== null).map((q) => [q.symbol, q])
    )

    const sectors: SectorMoversItem[] = SECTOR_CONFIG.map((cfg) => {
      const idxQuote = indexMap.get(cfg.indexSymbol)

      const stockItems: SectorStockItem[] = cfg.stocks.map((stk) => {
        const cleanSym = stk.symbol.replace(/\.(NS|BO)$/i, '')
        const q = liveQuotes[stk.symbol] || liveQuotes[cleanSym]
        const price = Number(Number(q?.price ?? 0).toFixed(2))
        const change = Number(Number(q?.change ?? 0).toFixed(2))
        const changePercent = Number(Number(q?.changePercent ?? 0).toFixed(2))

        return {
          symbol: cleanSym,
          name: stk.name,
          price,
          change,
          changePercent
        }
      })

      // Sort top 5 stocks by performance
      stockItems.sort((a, b) => b.changePercent - a.changePercent)

      // If index quote is available use it, otherwise synthesize from average stock movement
      const avgStockPct = stockItems.length > 0
        ? Number((stockItems.reduce((acc, s) => acc + s.changePercent, 0) / stockItems.length).toFixed(2))
        : 0

      const idxPrice = Number(Number(idxQuote?.price ?? 0).toFixed(2))
      const idxChg = Number(Number(idxQuote?.change ?? 0).toFixed(2))
      const idxPct = Number(Number(idxQuote?.changePercent ?? avgStockPct).toFixed(2))

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
      statusMessage: `Failed to fetch live sector movers: ${(err as Error).message}`
    })
  }
})
