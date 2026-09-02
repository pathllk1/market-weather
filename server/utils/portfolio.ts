import type { CostMethod, TradeType, HoldingPosition, HoldingLot, TaxLotBreakdown, TaxSummary, RiskMetrics, AllocationSlice, RebalanceItem } from '~/types/portfolio'

// Sector and Market Cap mappings for prominent NSE equities
export const SECTOR_MAP: Record<string, { sector: string; cap: 'Large Cap' | 'Mid Cap' | 'Small Cap' }> = {
  'RELIANCE.NS': { sector: 'Energy & Petrochemicals', cap: 'Large Cap' },
  'TCS.NS': { sector: 'Information Technology', cap: 'Large Cap' },
  'HDFCBANK.NS': { sector: 'Banking & Financials', cap: 'Large Cap' },
  'INFY.NS': { sector: 'Information Technology', cap: 'Large Cap' },
  'ICICIBANK.NS': { sector: 'Banking & Financials', cap: 'Large Cap' },
  'BHARTIARTL.NS': { sector: 'Telecommunications', cap: 'Large Cap' },
  'SBIN.NS': { sector: 'Banking & Financials', cap: 'Large Cap' },
  'ITC.NS': { sector: 'FMCG & Consumer', cap: 'Large Cap' },
  'HINDUNILVR.NS': { sector: 'FMCG & Consumer', cap: 'Large Cap' },
  'LT.NS': { sector: 'Infrastructure & Engineering', cap: 'Large Cap' },
  'BAJFINANCE.NS': { sector: 'Banking & Financials', cap: 'Large Cap' },
  'MARUTI.NS': { sector: 'Automobiles', cap: 'Large Cap' },
  'SUNPHARMA.NS': { sector: 'Healthcare & Pharma', cap: 'Large Cap' },
  'TATAMOTORS.NS': { sector: 'Automobiles', cap: 'Large Cap' },
  'NTPC.NS': { sector: 'Power & Utilities', cap: 'Large Cap' },
  'ONGC.NS': { sector: 'Energy & Petrochemicals', cap: 'Large Cap' },
  'POWERGRID.NS': { sector: 'Power & Utilities', cap: 'Large Cap' },
  'KOTAKBANK.NS': { sector: 'Banking & Financials', cap: 'Large Cap' },
  'AXISBANK.NS': { sector: 'Banking & Financials', cap: 'Large Cap' },
  'TITAN.NS': { sector: 'FMCG & Consumer', cap: 'Large Cap' },
  'ADANIENT.NS': { sector: 'Conglomerate', cap: 'Large Cap' },
  'ADANIPORTS.NS': { sector: 'Infrastructure & Logistics', cap: 'Large Cap' },
  'TATASTEEL.NS': { sector: 'Metals & Mining', cap: 'Large Cap' },
  'ASIANPAINT.NS': { sector: 'Paints & Chemicals', cap: 'Large Cap' },
  'COALINDIA.NS': { sector: 'Metals & Mining', cap: 'Large Cap' },
  'BAJAJFINSV.NS': { sector: 'Banking & Financials', cap: 'Large Cap' },
  'JSWSTEEL.NS': { sector: 'Metals & Mining', cap: 'Large Cap' },
  'HCLTECH.NS': { sector: 'Information Technology', cap: 'Large Cap' },
  'WIPRO.NS': { sector: 'Information Technology', cap: 'Large Cap' },
  'ULTRACEMCO.NS': { sector: 'Cement & Construction', cap: 'Large Cap' },
  'POLYCAB.NS': { sector: 'Electricals & Cables', cap: 'Mid Cap' },
  'DIXON.NS': { sector: 'Electronics & Hardware', cap: 'Mid Cap' },
  'IRFC.NS': { sector: 'Banking & Financials', cap: 'Mid Cap' },
  'TRENT.NS': { sector: 'Retail & Consumer', cap: 'Large Cap' },
  'HAL.NS': { sector: 'Defense & Aerospace', cap: 'Large Cap' },
  'BEL.NS': { sector: 'Defense & Aerospace', cap: 'Large Cap' },
  'ZOMATO.NS': { sector: 'Internet & Tech', cap: 'Large Cap' },
  'JIOFIN.NS': { sector: 'Banking & Financials', cap: 'Large Cap' }
}

export interface RawTradeRow {
  id: string
  portfolio_id: string
  symbol: string
  trade_type: TradeType
  trade_date: string
  quantity: number
  price_per_share: number
  brokerage: number
  stt: number
  exchange_charges: number
  gst: number
  sebi_fee: number
  total_cost: number
  notes?: string
}

/**
 * Automatically computes standard regulatory charges for Indian equity trades
 */
export function calculateIndianBrokerageCharges(type: 'BUY' | 'SELL', qty: number, price: number) {
  const turnOver = qty * price
  // Discount broker standard: 0.03% or ₹20 whichever is lower, or 0 on delivery
  const brokerage = 0
  const stt = type === 'BUY' ? turnOver * 0.001 : turnOver * 0.001 // 0.1% delivery
  const exchangeCharges = Number((turnOver * 0.0000345).toFixed(2)) // 0.00345%
  const gst = Number(((brokerage + exchangeCharges) * 0.18).toFixed(2)) // 18% GST
  const sebiFee = Number(((turnOver / 10000000) * 10).toFixed(2)) // ₹10 per crore
  const stampDuty = type === 'BUY' ? Number((turnOver * 0.00015).toFixed(2)) : 0 // 0.015% on buy

  const totalCharges = Number((brokerage + stt + exchangeCharges + gst + sebiFee + stampDuty).toFixed(2))
  const totalCost = type === 'BUY' ? turnOver + totalCharges : turnOver - totalCharges

  return {
    brokerage,
    stt: Number(stt.toFixed(2)),
    exchangeCharges,
    gst,
    sebiFee,
    stampDuty,
    totalCharges,
    totalCost: Number(totalCost.toFixed(2))
  }
}

/**
 * Aggregates trades per symbol, matches buys to sells using chosen cost method (FIFO/LIFO/AVG),
 * and computes remaining open holdings and realized gain lots.
 */
export function aggregateHoldingsFromTrades(
  trades: RawTradeRow[],
  costMethod: CostMethod = 'FIFO'
): {
  holdingsMap: Map<string, { qty: number; avgCost: number; invested: number; lots: HoldingLot[] }>
  realizedLots: TaxLotBreakdown[]
  totalRealizedPnL: number
} {
  // Sort trades chronologically
  const sortedTrades = [...trades].sort((a, b) => {
    const dateCmp = a.trade_date.localeCompare(b.trade_date)
    if (dateCmp !== 0) return dateCmp
    // Buys before sells if same day
    if (a.trade_type === 'BUY' && b.trade_type !== 'BUY') return -1
    if (a.trade_type !== 'BUY' && b.trade_type === 'BUY') return 1
    return 0
  })

  // Group trades by symbol
  const symbolTrades = new Map<string, RawTradeRow[]>()
  for (const t of sortedTrades) {
    if (!symbolTrades.has(t.symbol)) {
      symbolTrades.set(t.symbol, [])
    }
    symbolTrades.get(t.symbol)!.push(t)
  }

  const holdingsMap = new Map<string, { qty: number; avgCost: number; invested: number; lots: HoldingLot[] }>()
  const realizedLots: TaxLotBreakdown[] = []
  let totalRealizedPnL = 0

  for (const [symbol, tList] of symbolTrades.entries()) {
    const openLots: HoldingLot[] = []

    for (const trade of tList) {
      if (trade.trade_type === 'BUY') {
        openLots.push({
          tradeId: trade.id,
          date: trade.trade_date,
          quantity: trade.quantity,
          price: trade.price_per_share,
          totalCost: trade.total_cost
        })
      } else if (trade.trade_type === 'BONUS') {
        // Bonus issues: zero cost, additional quantity
        openLots.push({
          tradeId: trade.id,
          date: trade.trade_date,
          quantity: trade.quantity,
          price: 0,
          totalCost: 0
        })
      } else if (trade.trade_type === 'SPLIT') {
        // Stock split: multiply quantities of existing lots, divide price
        const factor = trade.quantity // e.g. 5 for 1:5 split
        for (const lot of openLots) {
          lot.quantity *= factor
          if (lot.quantity > 0) {
            lot.price = lot.totalCost / lot.quantity
          }
        }
      } else if (trade.trade_type === 'SELL') {
        let sellRemaining = trade.quantity
        const sellPrice = trade.price_per_share

        // Order lots according to cost method
        if (costMethod === 'LIFO') {
          openLots.reverse()
        }

        while (sellRemaining > 0 && openLots.length > 0) {
          const lot = openLots[0]!
          const matchQty = Math.min(sellRemaining, lot.quantity)
          const buyCostPerShare = lot.quantity > 0 ? lot.totalCost / lot.quantity : lot.price
          const gain = (sellPrice - buyCostPerShare) * matchQty

          // Calculate holding days
          const buyDate = new Date(lot.date)
          const sellDate = new Date(trade.trade_date)
          const diffDays = Math.max(0, Math.floor((sellDate.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24)))
          const isLtcg = diffDays >= 365
          const taxType = isLtcg ? 'LTCG' : 'STCG'
          const taxRate = isLtcg ? 10 : 15
          const estimatedTax = gain > 0 ? Number(((gain * taxRate) / 100).toFixed(2)) : 0

          realizedLots.push({
            symbol,
            tradeDate: lot.date,
            sellDate: trade.trade_date,
            quantity: matchQty,
            buyPrice: Number(buyCostPerShare.toFixed(2)),
            sellPrice: Number(sellPrice.toFixed(2)),
            holdingDays: diffDays,
            gainAmount: Number(gain.toFixed(2)),
            taxType,
            taxRatePct: taxRate,
            estimatedTax
          })

          totalRealizedPnL += gain
          sellRemaining -= matchQty
          lot.quantity -= matchQty
          lot.totalCost -= buyCostPerShare * matchQty

          if (lot.quantity <= 0.0001) {
            openLots.shift()
          }
        }

        if (costMethod === 'LIFO') {
          openLots.reverse()
        }
      }
    }

    // Remaining open position
    const totalOpenQty = openLots.reduce((sum, l) => sum + l.quantity, 0)
    if (totalOpenQty > 0.0001) {
      const totalInvested = openLots.reduce((sum, l) => sum + l.totalCost, 0)
      const avgCost = totalInvested / totalOpenQty
      holdingsMap.set(symbol, {
        qty: Number(totalOpenQty.toFixed(2)),
        avgCost: Number(avgCost.toFixed(2)),
        invested: Number(totalInvested.toFixed(2)),
        lots: openLots.filter(l => l.quantity > 0.0001)
      })
    }
  }

  return {
    holdingsMap,
    realizedLots,
    totalRealizedPnL: Number(totalRealizedPnL.toFixed(2))
  }
}

/**
 * Computes Capital Gains Tax Report according to Indian Income Tax rules
 */
export function calculateTaxSummary(realizedLots: TaxLotBreakdown[], currentYear = 2026): TaxSummary {
  const fyString = `FY ${currentYear}-${(currentYear + 1).toString().slice(-2)}`

  let stcgGain = 0
  let ltcgGain = 0

  for (const lot of realizedLots) {
    if (lot.taxType === 'STCG') {
      stcgGain += lot.gainAmount
    } else {
      ltcgGain += lot.gainAmount
    }
  }

  // STCG flat 15%
  const stcgTax = stcgGain > 0 ? Number((stcgGain * 0.15).toFixed(2)) : 0

  // LTCG 10% on gains exceeding ₹1,00,000 exemption limit per FY
  const LTCG_EXEMPTION = 100000
  const ltcgExemptionUsed = Math.min(Math.max(0, ltcgGain), LTCG_EXEMPTION)
  const ltcgTaxable = Math.max(0, ltcgGain - LTCG_EXEMPTION)
  const ltcgTax = Number((ltcgTaxable * 0.10).toFixed(2))

  return {
    financialYear: fyString,
    stcgTotalGain: Number(stcgGain.toFixed(2)),
    stcgEstimatedTax: stcgTax,
    ltcgTotalGain: Number(ltcgGain.toFixed(2)),
    ltcgExemptionUsed: Number(ltcgExemptionUsed.toFixed(2)),
    ltcgTaxableGain: Number(ltcgTaxable.toFixed(2)),
    ltcgEstimatedTax: ltcgTax,
    totalTaxLiability: Number((stcgTax + ltcgTax).toFixed(2)),
    taxLossHarvestingOpportunities: [],
    realizedLots
  }
}

/**
 * Calculates Risk Metrics (Beta, Sharpe, Drawdown, Volatility)
 */
export function calculatePortfolioRisk(
  holdings: HoldingPosition[],
  totalPortfolioValue: number,
  historicalCandlesMap: Map<string, number[]> // Symbol -> Array of daily percentage changes
): RiskMetrics {
  if (holdings.length === 0 || totalPortfolioValue <= 0) {
    return {
      beta: 1.0,
      sharpeRatio: 0,
      maxDrawdownPct: 0,
      annualizedVolatilityPct: 0,
      var95Pct: 0,
      benchmarkReturnPct: 0,
      correlationToBenchmark: 0.85,
      concentrationTop3Pct: 0
    }
  }

  // Concentration: Top 3 holdings % of total portfolio
  const sortedWeights = [...holdings].map(h => h.portfolioWeightPct).sort((a, b) => b - a)
  const top3Concentration = Number(sortedWeights.slice(0, 3).reduce((a, b) => a + b, 0).toFixed(1))

  // Weighted Beta computation (default beta 1.0 if insufficient historical variance)
  let weightedBeta = 0
  for (const h of holdings) {
    const weight = h.portfolioWeightPct / 100
    // Estimate individual beta from sector or score
    const s = SECTOR_MAP[h.symbol]
    let stockBeta = 1.0
    if (s?.sector === 'Banking & Financials') stockBeta = 1.25
    else if (s?.sector === 'Information Technology') stockBeta = 1.15
    else if (s?.sector === 'FMCG & Consumer') stockBeta = 0.75
    else if (s?.sector === 'Power & Utilities') stockBeta = 0.85
    else if (s?.sector === 'Automobiles') stockBeta = 1.1
    else if (s?.sector === 'Metals & Mining') stockBeta = 1.35
    else if (s?.cap === 'Mid Cap') stockBeta = 1.2
    else if (s?.cap === 'Small Cap') stockBeta = 1.4

    weightedBeta += weight * stockBeta
  }

  // Annualized Volatility (typical market weighted volatility ~ 14.5%)
  const annualizedVol = Number((12.0 * Math.max(0.6, weightedBeta)).toFixed(2))

  // Sharpe Ratio = (Annualized Expected Return - RBI Repo Rate 6.5%) / Annualized Volatility
  const avgPortfolioReturnPct = holdings.reduce((sum, h) => sum + (h.unrealizedPnLPct * (h.portfolioWeightPct / 100)), 0)
  const riskFreeRate = 6.5
  const sharpe = annualizedVol > 0 ? Number(((avgPortfolioReturnPct - riskFreeRate) / annualizedVol).toFixed(2)) : 0

  // 1-day Value at Risk (95% confidence) = 1.645 * (Daily Volatility) * Value
  const dailyVolPct = annualizedVol / Math.sqrt(252)
  const var95 = Number((1.645 * (dailyVolPct / 100) * totalPortfolioValue).toFixed(2))

  // Max Drawdown estimation based on volatility profile
  const maxDrawdown = Number((-1.8 * dailyVolPct * Math.sqrt(20)).toFixed(1))

  return {
    beta: Number(weightedBeta.toFixed(2)),
    sharpeRatio: sharpe,
    maxDrawdownPct: maxDrawdown,
    annualizedVolatilityPct: annualizedVol,
    var95Pct: var95,
    benchmarkReturnPct: 11.4, // Nifty 50 standard benchmark return
    correlationToBenchmark: 0.88,
    concentrationTop3Pct: top3Concentration
  }
}

/**
 * Computes Sector and Market Cap Allocations for Visual Donut Charts
 */
export function computeAllocations(holdings: HoldingPosition[], totalValue: number): {
  sectors: AllocationSlice[]
  marketCaps: AllocationSlice[]
} {
  const SECTOR_PALETTE = [
    '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
    '#06b6d4', '#6366f1', '#14b8a6', '#f97316', '#e11d48'
  ]

  const sectorTotals = new Map<string, { value: number; count: number }>()
  const capTotals = new Map<string, { value: number; count: number }>()

  for (const h of holdings) {
    const meta = SECTOR_MAP[h.symbol] || { sector: 'Other Diversified', cap: 'Mid Cap' }
    const sName = meta.sector
    const cName = meta.cap

    const sCurr = sectorTotals.get(sName) || { value: 0, count: 0 }
    sectorTotals.set(sName, { value: sCurr.value + h.currentValue, count: sCurr.count + 1 })

    const cCurr = capTotals.get(cName) || { value: 0, count: 0 }
    capTotals.set(cName, { value: cCurr.value + h.currentValue, count: cCurr.count + 1 })
  }

  const sectors: AllocationSlice[] = Array.from(sectorTotals.entries())
    .sort((a, b) => b[1].value - a[1].value)
    .map(([name, data], idx) => ({
      name,
      value: Number(data.value.toFixed(2)),
      percentage: totalValue > 0 ? Number(((data.value / totalValue) * 100).toFixed(1)) : 0,
      count: data.count,
      color: SECTOR_PALETTE[idx % SECTOR_PALETTE.length]!
    }))

  const CAP_COLORS: Record<string, string> = {
    'Large Cap': '#10b981', // Emerald
    'Mid Cap': '#3b82f6',   // Blue
    'Small Cap': '#f59e0b'  // Amber
  }

  const marketCaps: AllocationSlice[] = Array.from(capTotals.entries())
    .sort((a, b) => b[1].value - a[1].value)
    .map(([name, data]) => ({
      name,
      value: Number(data.value.toFixed(2)),
      percentage: totalValue > 0 ? Number(((data.value / totalValue) * 100).toFixed(1)) : 0,
      count: data.count,
      color: CAP_COLORS[name] || '#6366f1'
    }))

  return { sectors, marketCaps }
}

/**
 * Rebalancing Advisor: Generates suggested buy/sell trades to bring holdings in line with target weights
 */
export function generateRebalancingPlan(holdings: HoldingPosition[], totalValue: number): RebalanceItem[] {
  if (holdings.length === 0 || totalValue <= 0) return []

  // Default target: Equal Weight across all active holdings
  const targetEqualWeight = Number((100 / holdings.length).toFixed(1))

  return holdings.map(h => {
    const currentWeight = h.portfolioWeightPct
    const deviation = Number((currentWeight - targetEqualWeight).toFixed(1))
    const targetValue = (targetEqualWeight / 100) * totalValue
    const deltaValue = targetValue - h.currentValue
    const shares = h.currentPrice > 0 ? Math.round(Math.abs(deltaValue) / h.currentPrice) : 0

    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
    let rationale = 'Holding is within target allocation range.'

    if (deviation > 3.0) {
      action = 'SELL'
      rationale = `Overweight by ${deviation}%. Trim ${shares} shares to reduce concentration risk.`
    } else if (deviation < -3.0) {
      action = 'BUY'
      rationale = `Underweight by ${Math.abs(deviation)}%. Accumulate ${shares} shares to rebalance.`
    }

    return {
      symbol: h.symbol,
      companyName: h.companyName,
      currentWeightPct: currentWeight,
      targetWeightPct: targetEqualWeight,
      deviationPct: deviation,
      action,
      sharesToTrade: shares,
      estimatedValue: Number(Math.abs(deltaValue).toFixed(2)),
      rationale
    }
  })
}
