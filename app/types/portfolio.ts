export type CostMethod = 'FIFO' | 'LIFO' | 'AVG'
export type TradeType = 'BUY' | 'SELL' | 'DIVIDEND' | 'BONUS' | 'SPLIT' | 'RIGHTS'

export interface Portfolio {
  id: string
  userId: string
  name: string
  description?: string
  benchmarkSymbol: string
  costMethod: CostMethod
  currency: string
  isPaperTrading: boolean
  initialCapital: number
  cashBalance: number
  totalValue: number
  totalInvested: number
  unrealizedPnL: number
  unrealizedPnLPct: number
  realizedPnL: number
  dayPnL: number
  dayPnLPct: number
  holdingsCount: number
  tradesCount: number
  createdAt: number
  updatedAt: number
}

export interface DematAccount {
  id: string
  userId: string
  brokerName: string // 'Zerodha' | 'Groww' | 'Upstox' | 'Angel One' | 'ICICI Direct' | 'HDFC Sky' | 'Dhan' | 'Kotak Neo' | string
  accountName: string
  clientId?: string
  depository: 'CDSL' | 'NSDL'
  isDefault: boolean
  holdingsCount?: number
  totalValue?: number
  createdAt: number
  updatedAt: number
}

export interface PortfolioTrade {
  id: string
  portfolioId: string
  dematAccountId?: string | null
  dematAccountName?: string
  brokerName?: string
  symbol: string
  tradeType: TradeType
  tradeDate: string // YYYY-MM-DD
  quantity: number
  pricePerShare: number
  brokerage: number
  stt: number
  exchangeCharges: number
  gst: number
  sebiFee: number
  totalCost: number
  notes?: string
  createdAt: number
  updatedAt: number
}

export interface HoldingLot {
  tradeId: string
  date: string
  quantity: number
  price: number
  totalCost: number
}

export interface HoldingPosition {
  symbol: string
  companyName: string
  quantity: number
  averageCost: number
  investedAmount: number
  currentPrice: number
  currentValue: number
  priceChange: number
  percentageChange: number
  unrealizedPnL: number
  unrealizedPnLPct: number
  realizedPnL: number
  portfolioWeightPct: number
  dayChangeAmount: number
  holdingPeriodDays: number
  isLtcgEligible: boolean // >= 365 days
  lots: HoldingLot[]
  sector?: string
  marketCapCategory?: 'Large Cap' | 'Mid Cap' | 'Small Cap'
  targetPrice?: number | null
  stopLoss?: number | null
  overallScore?: number
  dematBreakdown?: Array<{
    dematId: string
    accountName: string
    brokerName: string
    quantity: number
    avgCost: number
    currentValue: number
  }>
}

export interface RiskMetrics {
  beta: number
  sharpeRatio: number
  maxDrawdownPct: number
  annualizedVolatilityPct: number
  var95Pct: number // Value at Risk 95% 1-day
  benchmarkReturnPct: number
  correlationToBenchmark: number
  concentrationTop3Pct: number
}

export interface AllocationSlice {
  name: string
  value: number
  percentage: number
  count: number
  color: string
}

export interface TaxLotBreakdown {
  symbol: string
  tradeDate: string
  sellDate: string
  quantity: number
  buyPrice: number
  sellPrice: number
  holdingDays: number
  gainAmount: number
  taxType: 'STCG' | 'LTCG'
  taxRatePct: number
  estimatedTax: number
}

export interface TaxSummary {
  financialYear: string
  stcgTotalGain: number
  stcgEstimatedTax: number // 15% flat
  ltcgTotalGain: number
  ltcgExemptionUsed: number // up to 1,00,000 per FY
  ltcgTaxableGain: number
  ltcgEstimatedTax: number // 10%
  totalTaxLiability: number
  taxLossHarvestingOpportunities: Array<{
    symbol: string
    unrealizedLoss: number
    quantity: number
    currentPrice: number
    avgCost: number
    suggestion: string
  }>
  realizedLots: TaxLotBreakdown[]
}

export interface RebalanceItem {
  symbol: string
  companyName: string
  currentWeightPct: number
  targetWeightPct: number
  deviationPct: number
  action: 'BUY' | 'SELL' | 'HOLD'
  sharesToTrade: number
  estimatedValue: number
  rationale: string
}

export interface PortfolioTarget {
  id: string
  portfolioId: string
  symbol: string
  targetPrice?: number | null
  stopLoss?: number | null
  targetNotes?: string
  createdAt: number
  updatedAt: number
}

export interface PortfolioAlert {
  id: string
  portfolioId: string
  userId: string
  alertType: 'price' | 'technical' | 'portfolio'
  symbol: string
  conditionType: 'price_above' | 'price_below' | 'rsi_above' | 'rsi_below' | 'macd_cross' | 'drawdown'
  thresholdValue: number
  isActive: boolean
  lastTriggeredAt?: number | null
  createdAt: number
}

export interface PortfolioDividend {
  id: string
  portfolioId: string
  symbol: string
  dividendDate: string
  dividendPerShare: number
  totalCredit: number
  notes?: string
  createdAt: number
}

export interface PortfolioSummaryResponse {
  portfolio: Portfolio
  holdings: HoldingPosition[]
  dematAccounts: DematAccount[]
  riskMetrics: RiskMetrics
  sectorAllocation: AllocationSlice[]
  marketCapAllocation: AllocationSlice[]
  topGainers: HoldingPosition[]
  topLosers: HoldingPosition[]
  historicalValueCurve: Array<{ date: string; portfolioValue: number; benchmarkValue: number }>
}
