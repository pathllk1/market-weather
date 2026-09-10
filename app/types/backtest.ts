export type TradeType = 'BUY' | 'SELL'

export interface BacktestTrade {
  id: string
  portfolioId: string
  symbol: string
  companyName: string
  tradeType: TradeType
  quantity: number
  price: number
  fees: number
  stopLoss?: number | null
  targetPrice?: number | null
  strategyTag?: string | null
  notes?: string | null
  executedAt: number
  createdAt: number
}

export interface BacktestPosition {
  symbol: string
  companyName: string
  quantity: number
  avgPrice: number
  totalInvested: number
  currentPrice: number
  dayChange: number
  dayChangePercent: number
  currentValue: number
  unrealizedPnL: number
  unrealizedPnLPercent: number
  portfolioWeightPercent: number
  stopLoss?: number | null
  targetPrice?: number | null
  status: 'PROFIT' | 'LOSS' | 'BREAKEVEN'
  lastUpdated: number
}

export interface ClosedTradeRecord {
  id: string
  symbol: string
  companyName: string
  quantity: number
  buyPrice: number
  sellPrice: number
  investedAmount: number
  exitValue: number
  netPnL: number
  netPnLPercent: number
  strategyTag?: string | null
  holdingDays: number
  executedAt: number
}

export interface BacktestMetrics {
  totalEquity: number
  cashBalance: number
  initialCapital: number
  totalInvested: number
  totalRealizedPnL: number
  totalUnrealizedPnL: number
  netPnL: number
  netReturnPercent: number
  totalTradesCount: number
  winningTradesCount: number
  losingTradesCount: number
  winRatePercent: number
  profitFactor: number
  avgWinAmount: number
  avgLossAmount: number
  largestWin: number
  largestLoss: number
  maxDrawdownPercent: number
}

export interface BacktestPortfolio {
  id: string
  userId: string
  name: string
  description?: string
  initialCapital: number
  cashBalance: number
  currency: string
  createdAt: number
  updatedAt: number
  metrics?: BacktestMetrics
  positionsCount?: number
  tradesCount?: number
}

export interface BacktestPortfolioDetailResponse {
  portfolio: BacktestPortfolio
  metrics: BacktestMetrics
  positions: BacktestPosition[]
  trades: BacktestTrade[]
  closedTrades: ClosedTradeRecord[]
  strategyBreakdown: {
    tag: string
    tradesCount: number
    winRatePercent: number
    netPnL: number
  }[]
}

export interface BacktestLiveQuoteResponse {
  symbol: string
  companyName: string
  price: number
  change: number
  changePercent: number
  dayHigh: number
  dayLow: number
  open: number
  previousClose: number
  volume: number
  rsi?: number
  macdHist?: number
  supertrendTrend?: string
  lastUpdated: number
}
