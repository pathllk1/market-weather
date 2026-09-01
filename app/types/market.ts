export interface MarketStockSummary {
  symbol: string
  company_name: string
  current_price: number
  price_change: number
  percentage_change: number
  overall_score: number
  rsi_14?: number
  macd_line?: number
  macd_signal?: number
  macd_hist?: number
  supertrend_trend?: string
  supertrend_value?: number
  bb_upper?: number
  bb_lower?: number
  adx_14?: number
  mfi_14?: number
  stoch_k?: number
  stoch_d?: number
  last_updated?: string
}

export interface MarketSummaryBreadth {
  totalStocks: number
  bullishCount: number
  bearishCount: number
  neutralCount: number
  advancingCount: number
  decliningCount: number
  avgScore: number
}

export interface ScreenerResponse {
  stocks: MarketStockSummary[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
  summary: MarketSummaryBreadth
}

export interface StockDetailResponse {
  symbol: string
  companyName: string
  currentPrice: number
  priceChange: number
  percentageChange: number
  overallScore: number
  overallRating: string
  lastUpdated: string
  ranges: {
    high52w: number
    low52w: number
    avgVolume52w: number
  }
  signals: {
    rsi: { value: number, bias: string }
    macd: { line: number, signal: number, hist: number, bias: string }
    supertrend: { trend: string, value: number }
    volatility: { bbUpper: number, bbMiddle: number, bbLower: number, atr: number }
    momentum: {
      adx: number
      plusDi: number
      minusDi: number
      stochK: number
      stochD: number
      mfi: number
      williamsR: number
      cci: number
      roc: number
    }
    volume: { obv: number, vwap: number }
    movingAverages: {
      sma10: number
      sma20: number
      sma30: number
      sma50: number
      sma100: number
      sma200: number
      ema10: number
      ema20: number
      ema30: number
      ema50: number
      ema100: number
      ema200: number
    }
  }
}

export interface UserMarketView {
  id: string
  name: string
  description?: string
  symbols: string[]
  layout: 'ohlcv' | 'table' | 'cards'
  isDefault: boolean
  stockCount: number
  createdAt: number
  updatedAt: number
}

export interface ViewEquityOhlcv {
  symbol: string
  companyName: string
  price: number
  change: number
  changePercent: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  overallScore: number
  rsi?: number
  macdHist?: number
  supertrendTrend?: string
  lastUpdated: string | number
  isLive: boolean
}

export interface MarketViewDetailResponse {
  view: UserMarketView
  equities: ViewEquityOhlcv[]
}
