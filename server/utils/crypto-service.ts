/**
 * Enterprise Crypto Service for Live Binance & INR Rates
 * Zero-Database, Keyless, In-Memory Cached Architecture
 */

export interface RawBinanceTicker {
  symbol: string
  priceChange: string
  priceChangePercent: string
  weightedAvgPrice: string
  prevClosePrice: string
  lastPrice: string
  lastQty: string
  bidPrice: string
  bidQty: string
  askPrice: string
  askQty: string
  openPrice: string
  highPrice: string
  lowPrice: string
  volume: string
  quoteVolume: string
  openTime: number
  closeTime: number
  firstId: number
  lastId: number
  count: number
}

export interface CryptoAsset {
  symbol: string
  baseAsset: string
  quoteAsset: string
  name: string
  priceUsdt: number
  priceInr: number
  change24h: number
  priceChangeUsdt: number
  priceChangeInr: number
  high24hUsdt: number
  high24hInr: number
  low24hUsdt: number
  low24hInr: number
  volume24h: number
  quoteVolumeUsdt: number
  quoteVolumeInr: number
  category: 'l1-l2' | 'defi' | 'ai-data' | 'meme' | 'infrastructure' | 'other'
}

export interface InrRateData {
  domesticRate: number
  forexRate: number
  activeRate: number
  spreadPercent: number
  lastUpdated: number
  source: string
}

// In-memory cache structures
interface CacheEntry<T> {
  data: T
  timestamp: number
}

let tickersCache: CacheEntry<CryptoAsset[]> | null = null
let inrRateCache: CacheEntry<InrRateData> | null = null
const TICKERS_CACHE_TTL_MS = 3000 // 3 seconds cache
const INR_RATE_CACHE_TTL_MS = 60000 // 60 seconds cache

// Popular coin categories mapping
const CATEGORY_MAP: Record<string, CryptoAsset['category']> = {
  BTC: 'l1-l2',
  ETH: 'l1-l2',
  SOL: 'l1-l2',
  BNB: 'l1-l2',
  XRP: 'l1-l2',
  ADA: 'l1-l2',
  AVAX: 'l1-l2',
  SUI: 'l1-l2',
  NEAR: 'l1-l2',
  APT: 'l1-l2',
  DOT: 'l1-l2',
  POL: 'l1-l2',
  MATIC: 'l1-l2',
  TRX: 'l1-l2',
  FTM: 'l1-l2',
  ATOM: 'l1-l2',
  SEI: 'l1-l2',
  KAS: 'l1-l2',
  TIA: 'l1-l2',
  ARB: 'l1-l2',
  OP: 'l1-l2',

  UNI: 'defi',
  AAVE: 'defi',
  MKR: 'defi',
  CRV: 'defi',
  PENDLE: 'defi',
  LDO: 'defi',
  INJ: 'defi',
  RUNE: 'defi',
  DYDX: 'defi',
  SNX: 'defi',
  CAKE: 'defi',
  ENA: 'defi',
  JUP: 'defi',

  FET: 'ai-data',
  RENDER: 'ai-data',
  TAO: 'ai-data',
  GRT: 'ai-data',
  WLD: 'ai-data',
  ARKM: 'ai-data',
  THETA: 'ai-data',
  OCEAN: 'ai-data',
  AGIX: 'ai-data',
  IO: 'ai-data',

  DOGE: 'meme',
  SHIB: 'meme',
  PEPE: 'meme',
  WIF: 'meme',
  BONK: 'meme',
  FLOKI: 'meme',
  BOME: 'meme',
  POPCAT: 'meme',
  MEME: 'meme',

  LINK: 'infrastructure',
  FIL: 'infrastructure',
  PYTH: 'infrastructure',
  AR: 'infrastructure',
  HNT: 'infrastructure',
  ICP: 'infrastructure'
}

const KNOWN_NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  BNB: 'BNB Chain',
  XRP: 'XRP Ledger',
  DOGE: 'Dogecoin',
  ADA: 'Cardano',
  AVAX: 'Avalanche',
  SUI: 'Sui Network',
  SHIB: 'Shiba Inu',
  PEPE: 'Pepe',
  NEAR: 'NEAR Protocol',
  LINK: 'Chainlink',
  DOT: 'Polkadot',
  POL: 'Polygon (POL)',
  MATIC: 'Polygon (MATIC)',
  TRX: 'TRON',
  LTC: 'Litecoin',
  BCH: 'Bitcoin Cash',
  UNI: 'Uniswap',
  AAVE: 'Aave',
  FET: 'Artificial Superintelligence',
  RENDER: 'Render Network',
  TAO: 'Bittensor',
  WIF: 'dogwifhat',
  BONK: 'Bonk',
  APT: 'Aptos',
  ARB: 'Arbitrum',
  OP: 'Optimism',
  TIA: 'Celestia',
  INJ: 'Injective',
  KAS: 'Kaspa',
  PENDLE: 'Pendle',
  FLOKI: 'Floki',
  POPCAT: 'Popcat',
  ICP: 'Internet Computer',
  FIL: 'Filecoin',
  ATOM: 'Cosmos',
  SEI: 'Sei',
  ENA: 'Ethena',
  JUP: 'Jupiter',
  MKR: 'Maker',
  CRV: 'Curve DAO',
  LDO: 'Lido DAO',
  USDC: 'USD Coin'
}

/**
 * Fetch live USDT to INR exchange rates (Keyless)
 * Uses CoinDCX public ticker for domestic crypto rate and Open Exchange Rates for forex USD rate
 */
export async function getLiveInrRates(): Promise<InrRateData> {
  const now = Date.now()
  if (inrRateCache && now - inrRateCache.timestamp < INR_RATE_CACHE_TTL_MS) {
    return inrRateCache.data
  }

  let domesticRate = 101.25 // Default realistic fallback
  let forexRate = 95.00

  // 1. Fetch Domestic Crypto USDT/INR rate from CoinDCX public ticker
  try {
    const res = await fetch('https://api.coindcx.com/exchange/ticker', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(4000)
    })
    if (res.ok) {
      const markets: Array<{ market: string, last_price: string }> = await res.json()
      const usdtInr = markets.find(m => m.market === 'USDTINR')
      if (usdtInr && parseFloat(usdtInr.last_price) > 0) {
        domesticRate = parseFloat(usdtInr.last_price)
      }
    }
  } catch (err) {
    console.warn('CoinDCX ticker fetch warning, using secondary rate:', (err as Error).message)
  }

  // 2. Fetch Forex USD to INR rate from Open Exchange Rates (Keyless)
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(4000)
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.rates?.INR && typeof data.rates.INR === 'number') {
        forexRate = data.rates.INR
      }
    }
  } catch (err) {
    console.warn('Forex USD/INR fetch warning:', (err as Error).message)
  }

  // Calculate spread between domestic crypto and formal forex rate
  const spreadPercent = forexRate > 0 ? ((domesticRate - forexRate) / forexRate) * 100 : 0

  const rateData: InrRateData = {
    domesticRate: Number(domesticRate.toFixed(2)),
    forexRate: Number(forexRate.toFixed(2)),
    activeRate: Number(domesticRate.toFixed(2)),
    spreadPercent: Number(spreadPercent.toFixed(2)),
    lastUpdated: now,
    source: 'CoinDCX Domestic Market + Open ER Forex'
  }

  inrRateCache = {
    data: rateData,
    timestamp: now
  }

  return rateData
}

/**
 * Fetch all Binance 24h tickers, filter USDT pairs, and convert to INR
 */
export async function getLiveCryptoTickers(forceRefresh = false): Promise<{
  tickers: CryptoAsset[]
  inrRates: InrRateData
  totalCount: number
}> {
  const now = Date.now()
  const inrRates = await getLiveInrRates()

  if (!forceRefresh && tickersCache && now - tickersCache.timestamp < TICKERS_CACHE_TTL_MS) {
    return {
      tickers: tickersCache.data,
      inrRates,
      totalCount: tickersCache.data.length
    }
  }

  const baseUrls = [
    'https://data-api.binance.vision/api/v3/ticker/24hr',
    'https://api1.binance.com/api/v3/ticker/24hr',
    'https://api.binance.com/api/v3/ticker/24hr'
  ]

  let rawTickers: RawBinanceTicker[] = []
  let fetchError: Error | null = null

  for (const url of baseUrls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000)
      })
      if (res.ok) {
        rawTickers = await res.json()
        break
      }
    } catch (err) {
      fetchError = err as Error
    }
  }

  if (!rawTickers.length) {
    if (tickersCache) {
      return {
        tickers: tickersCache.data,
        inrRates,
        totalCount: tickersCache.data.length
      }
    }
    throw new Error(fetchError?.message || 'Failed to connect to Binance market data cluster')
  }

  const activeRate = inrRates.domesticRate

  // Process all USDT pairs, excluding leveraged tokens (UP/DOWN/BEAR/BULL)
  const processed: CryptoAsset[] = []

  for (const t of rawTickers) {
    if (
      t.symbol.endsWith('USDT')
      && !t.symbol.includes('UPUSDT')
      && !t.symbol.includes('DOWNUSDT')
      && !t.symbol.includes('BEARUSDT')
      && !t.symbol.includes('BULLUSDT')
    ) {
      const baseAsset = t.symbol.replace(/USDT$/, '')
      const priceUsdt = parseFloat(t.lastPrice)
      if (isNaN(priceUsdt) || priceUsdt <= 0) continue

      const change24h = parseFloat(t.priceChangePercent) || 0
      const priceChangeUsdt = parseFloat(t.priceChange) || 0
      const high24hUsdt = parseFloat(t.highPrice) || priceUsdt
      const low24hUsdt = parseFloat(t.lowPrice) || priceUsdt
      const volume24h = parseFloat(t.volume) || 0
      const quoteVolumeUsdt = parseFloat(t.quoteVolume) || 0

      // Only include coins with active 24h trading volume (> $1,000)
      if (quoteVolumeUsdt < 1000) continue

      const priceInr = priceUsdt * activeRate
      const priceChangeInr = priceChangeUsdt * activeRate
      const high24hInr = high24hUsdt * activeRate
      const low24hInr = low24hUsdt * activeRate
      const quoteVolumeInr = quoteVolumeUsdt * activeRate

      processed.push({
        symbol: t.symbol,
        baseAsset,
        quoteAsset: 'USDT',
        name: KNOWN_NAMES[baseAsset] || baseAsset,
        priceUsdt,
        priceInr,
        change24h: Number(change24h.toFixed(2)),
        priceChangeUsdt,
        priceChangeInr,
        high24hUsdt,
        high24hInr,
        low24hUsdt,
        low24hInr,
        volume24h,
        quoteVolumeUsdt,
        quoteVolumeInr,
        category: CATEGORY_MAP[baseAsset] || 'other'
      })
    }
  }

  // Sort descending by 24h trading turnover volume
  processed.sort((a, b) => b.quoteVolumeUsdt - a.quoteVolumeUsdt)

  tickersCache = {
    data: processed,
    timestamp: now
  }

  return {
    tickers: processed,
    inrRates,
    totalCount: processed.length
  }
}

/**
 * Fetch historical klines/candlesticks from Binance Vision
 * Strict allow-list validation on symbol and interval
 */
export async function getCryptoKlines(
  symbol: string,
  interval = '1h',
  limit = 50
): Promise<Array<[number, number, number, number, number, number]>> {
  // Validate symbol: 3 to 15 alphanumeric characters ending in USDT
  const cleanSymbol = symbol.toUpperCase().trim()
  if (!/^[A-Z0-9]{3,15}USDT$/.test(cleanSymbol)) {
    throw new Error('Invalid crypto trading pair symbol')
  }

  // Allowed intervals allow-list
  const allowedIntervals = ['15m', '1h', '4h', '1d', '1w']
  const normalized = (interval || '').toLowerCase().trim()
  const cleanInterval = allowedIntervals.includes(normalized) ? normalized : '1h'

  const cleanLimit = Math.min(Math.max(parseInt(String(limit), 10) || 50, 10), 500)

  const url = `https://data-api.binance.vision/api/v3/klines?symbol=${cleanSymbol}&interval=${cleanInterval}&limit=${cleanLimit}`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(5000)
  })

  if (!res.ok) {
    throw new Error(`Binance klines returned status ${res.status}`)
  }

  const raw = await res.json()
  // Format: [timestamp, open, high, low, close, volume]
  return raw.map((k: Array<string | number>) => [
    Number(k[0]), // open time
    parseFloat(String(k[1])), // open
    parseFloat(String(k[2])), // high
    parseFloat(String(k[3])), // low
    parseFloat(String(k[4])), // close
    parseFloat(String(k[5])) // volume
  ])
}

/**
 * Fetch top order book depth (bids & asks)
 */
export async function getCryptoDepth(symbol: string, limit = 10) {
  const cleanSymbol = symbol.toUpperCase().trim()
  if (!/^[A-Z0-9]{3,15}USDT$/.test(cleanSymbol)) {
    throw new Error('Invalid crypto trading pair symbol')
  }

  const cleanLimit = Math.min(Math.max(parseInt(String(limit), 10) || 10, 5), 20)
  const url = `https://data-api.binance.vision/api/v3/depth?symbol=${cleanSymbol}&limit=${cleanLimit}`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(4000)
  })

  if (!res.ok) {
    throw new Error(`Binance depth returned status ${res.status}`)
  }

  return await res.json()
}
