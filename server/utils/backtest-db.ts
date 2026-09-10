import { getTursoClient } from './turso'
import { getLiveQuotes, type LiveQuote } from './yahoo'
import type {
  BacktestTrade,
  BacktestPosition,
  ClosedTradeRecord,
  BacktestMetrics,
  BacktestPortfolio,
  BacktestPortfolioDetailResponse
} from '~/types/backtest'

let tablesInitialized = false

/**
 * Ensures the backtest database tables are created in Turso
 */
export async function initBacktestTables(): Promise<void> {
  if (tablesInitialized) return

  const db = getTursoClient()
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS backtest_portfolios (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      initial_capital REAL NOT NULL DEFAULT 1000000.0,
      cash_balance REAL NOT NULL DEFAULT 1000000.0,
      currency TEXT NOT NULL DEFAULT 'INR',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backtest_trades (
      id TEXT PRIMARY KEY,
      portfolio_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      company_name TEXT NOT NULL,
      trade_type TEXT NOT NULL CHECK(trade_type IN ('BUY', 'SELL')),
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      fees REAL NOT NULL DEFAULT 0.0,
      stop_loss REAL,
      target_price REAL,
      strategy_tag TEXT,
      notes TEXT,
      executed_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (portfolio_id) REFERENCES backtest_portfolios(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_backtest_trades_portfolio ON backtest_trades(portfolio_id);
    CREATE INDEX IF NOT EXISTS idx_backtest_portfolios_user ON backtest_portfolios(user_id);
  `)

  tablesInitialized = true
}

interface BuyLot {
  id: string
  qty: number
  price: number
  fees: number
  executedAt: number
  strategyTag?: string | null
}

/**
 * Computes exact positions, closed trades, metrics, and strategy breakdown using strict FIFO accounting
 */
export async function computePortfolioDetails(
  portfolioRow: Record<string, unknown>,
  tradesRows: Record<string, unknown>[]
): Promise<BacktestPortfolioDetailResponse> {
  const portfolioId = String(portfolioRow.id)
  const initialCapital = Number(portfolioRow.initial_capital || 1000000)
  const cashBalance = Number(portfolioRow.cash_balance ?? initialCapital)

  // Map raw database trades to typed models (sorted chronologically)
  const allTrades: BacktestTrade[] = tradesRows
    .map(r => ({
      id: String(r.id),
      portfolioId: String(r.portfolio_id),
      symbol: String(r.symbol).toUpperCase(),
      companyName: String(r.company_name || r.symbol),
      tradeType: String(r.trade_type).toUpperCase() as 'BUY' | 'SELL',
      quantity: Number(r.quantity),
      price: Number(r.price),
      fees: Number(r.fees || 0),
      stopLoss: r.stop_loss !== null && r.stop_loss !== undefined ? Number(r.stop_loss) : null,
      targetPrice: r.target_price !== null && r.target_price !== undefined ? Number(r.target_price) : null,
      strategyTag: r.strategy_tag ? String(r.strategy_tag) : null,
      notes: r.notes ? String(r.notes) : null,
      executedAt: Number(r.executed_at),
      createdAt: Number(r.created_at)
    }))
    .sort((a, b) => a.executedAt - b.executedAt)

  // 1. Process FIFO buy queues per symbol
  const buyLotsBySymbol = new Map<string, BuyLot[]>()
  const companyNamesBySymbol = new Map<string, string>()
  const closedTrades: ClosedTradeRecord[] = []
  const strategyStats = new Map<string, { tradesCount: number, wins: number, netPnL: number }>()

  for (const trade of allTrades) {
    companyNamesBySymbol.set(trade.symbol, trade.companyName)

    if (trade.tradeType === 'BUY') {
      const lots = buyLotsBySymbol.get(trade.symbol) || []
      lots.push({
        id: trade.id,
        qty: trade.quantity,
        price: trade.price,
        fees: trade.fees,
        executedAt: trade.executedAt,
        strategyTag: trade.strategyTag
      })
      buyLotsBySymbol.set(trade.symbol, lots)
    } else if (trade.tradeType === 'SELL') {
      let sellQtyRemaining = trade.quantity
      const lots = buyLotsBySymbol.get(trade.symbol) || []

      while (sellQtyRemaining > 0 && lots.length > 0) {
        const lot = lots[0]!
        const matchedQty = Math.min(sellQtyRemaining, lot.qty)
        const buyCost = matchedQty * lot.price
        const sellProceeds = matchedQty * trade.price
        const netPnL = Number((sellProceeds - buyCost - trade.fees).toFixed(2))
        const netPnLPercent = buyCost > 0 ? Number(((netPnL / buyCost) * 100).toFixed(2)) : 0
        const holdingDays = Math.max(0, Math.round((trade.executedAt - lot.executedAt) / (1000 * 60 * 60 * 24)))

        const tag = trade.strategyTag || lot.strategyTag || 'Discretionary'

        closedTrades.push({
          id: `${trade.id}-${lot.id}`,
          symbol: trade.symbol,
          companyName: trade.companyName,
          quantity: matchedQty,
          buyPrice: lot.price,
          sellPrice: trade.price,
          investedAmount: Number(buyCost.toFixed(2)),
          exitValue: Number(sellProceeds.toFixed(2)),
          netPnL,
          netPnLPercent,
          strategyTag: tag,
          holdingDays,
          executedAt: trade.executedAt
        })

        // Accumulate strategy metrics
        const sStat = strategyStats.get(tag) || { tradesCount: 0, wins: 0, netPnL: 0 }
        sStat.tradesCount += 1
        if (netPnL > 0) sStat.wins += 1
        sStat.netPnL = Number((sStat.netPnL + netPnL).toFixed(2))
        strategyStats.set(tag, sStat)

        lot.qty -= matchedQty
        sellQtyRemaining -= matchedQty

        if (lot.qty <= 0.0001) {
          lots.shift()
        }
      }

      buyLotsBySymbol.set(trade.symbol, lots)
    }
  }

  // 2. Determine open symbols and fetch live quotes
  const openSymbols: string[] = []
  for (const [sym, lots] of buyLotsBySymbol.entries()) {
    const totalQty = lots.reduce((acc, l) => acc + l.qty, 0)
    if (totalQty > 0.0001) {
      openSymbols.push(sym)
    }
  }

  let liveQuoteMap: Record<string, LiveQuote> = {}
  if (openSymbols.length > 0) {
    try {
      liveQuoteMap = await getLiveQuotes(openSymbols)
    } catch (err) {
      console.warn('[backtest-db] Error fetching live quotes:', err)
    }
  }

  // 3. Assemble open positions
  const positions: BacktestPosition[] = []
  let totalCurrentValue = 0
  let totalInvested = 0

  for (const sym of openSymbols) {
    const lots = buyLotsBySymbol.get(sym) || []
    const totalQty = lots.reduce((acc, l) => acc + l.qty, 0)
    const costBasis = lots.reduce((acc, l) => acc + (l.qty * l.price) + l.fees, 0)
    const avgPrice = totalQty > 0 ? Number((costBasis / totalQty).toFixed(2)) : 0

    const quote = liveQuoteMap[sym] || liveQuoteMap[sym.replace(/\.(NS|BO)$/i, '')]
    const curPrice = Number(quote?.price || avgPrice)
    const dayChange = Number(quote?.change || 0)
    const dayChangePercent = Number(quote?.changePercent || 0)

    const currentValue = Number((totalQty * curPrice).toFixed(2))
    const investedAmount = Number(costBasis.toFixed(2))
    const unrealizedPnL = Number((currentValue - investedAmount).toFixed(2))
    const unrealizedPnLPercent = investedAmount > 0 ? Number(((unrealizedPnL / investedAmount) * 100).toFixed(2)) : 0

    // Check last trade for active stop loss / target price
    const lastTrade = [...allTrades].reverse().find(t => t.symbol === sym && t.tradeType === 'BUY')

    totalCurrentValue += currentValue
    totalInvested += investedAmount

    let status: BacktestPosition['status'] = 'BREAKEVEN'
    if (unrealizedPnL > 0.5) status = 'PROFIT'
    else if (unrealizedPnL < -0.5) status = 'LOSS'

    positions.push({
      symbol: sym,
      companyName: companyNamesBySymbol.get(sym) || sym,
      quantity: Number(totalQty.toFixed(4)),
      avgPrice,
      totalInvested: investedAmount,
      currentPrice: curPrice,
      dayChange,
      dayChangePercent,
      currentValue,
      unrealizedPnL,
      unrealizedPnLPercent,
      portfolioWeightPercent: 0, // calculated below
      stopLoss: lastTrade?.stopLoss ?? null,
      targetPrice: lastTrade?.targetPrice ?? null,
      status,
      lastUpdated: quote?.lastUpdated || Date.now()
    })
  }

  // Calculate portfolio weight per position
  const totalEquity = Number((cashBalance + totalCurrentValue).toFixed(2))
  for (const pos of positions) {
    pos.portfolioWeightPercent = totalEquity > 0
      ? Number(((pos.currentValue / totalEquity) * 100).toFixed(2))
      : 0
  }

  // 4. Compute performance metrics
  const totalRealizedPnL = Number(closedTrades.reduce((acc, t) => acc + t.netPnL, 0).toFixed(2))
  const totalUnrealizedPnL = Number(positions.reduce((acc, p) => acc + p.unrealizedPnL, 0).toFixed(2))
  const netPnL = Number((totalEquity - initialCapital).toFixed(2))
  const netReturnPercent = initialCapital > 0 ? Number(((netPnL / initialCapital) * 100).toFixed(2)) : 0

  const winningTrades = closedTrades.filter(t => t.netPnL > 0)
  const losingTrades = closedTrades.filter(t => t.netPnL < 0)
  const totalTradesCount = closedTrades.length
  const winningTradesCount = winningTrades.length
  const losingTradesCount = losingTrades.length

  const winRatePercent = totalTradesCount > 0
    ? Number(((winningTradesCount / totalTradesCount) * 100).toFixed(2))
    : 0

  const grossGains = winningTrades.reduce((acc, t) => acc + t.netPnL, 0)
  const grossLosses = Math.abs(losingTrades.reduce((acc, t) => acc + t.netPnL, 0))
  const profitFactor = grossLosses > 0 ? Number((grossGains / grossLosses).toFixed(2)) : (grossGains > 0 ? 999 : 0)

  const avgWinAmount = winningTradesCount > 0 ? Number((grossGains / winningTradesCount).toFixed(2)) : 0
  const avgLossAmount = losingTradesCount > 0 ? Number((grossLosses / losingTradesCount).toFixed(2)) : 0

  const largestWin = winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.netPnL)) : 0
  const largestLoss = losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.netPnL)) : 0

  // Calculate Max Drawdown from closed trade progression
  let peakEquity = initialCapital
  let currentSimEquity = initialCapital
  let maxDrawdownAmount = 0

  for (const ct of closedTrades) {
    currentSimEquity += ct.netPnL
    if (currentSimEquity > peakEquity) {
      peakEquity = currentSimEquity
    }
    const dd = peakEquity - currentSimEquity
    if (dd > maxDrawdownAmount) {
      maxDrawdownAmount = dd
    }
  }

  const maxDrawdownPercent = peakEquity > 0
    ? Number(((maxDrawdownAmount / peakEquity) * 100).toFixed(2))
    : 0

  const metrics: BacktestMetrics = {
    totalEquity,
    cashBalance,
    initialCapital,
    totalInvested: Number(totalInvested.toFixed(2)),
    totalRealizedPnL,
    totalUnrealizedPnL,
    netPnL,
    netReturnPercent,
    totalTradesCount,
    winningTradesCount,
    losingTradesCount,
    winRatePercent,
    profitFactor,
    avgWinAmount,
    avgLossAmount,
    largestWin,
    largestLoss,
    maxDrawdownPercent
  }

  const strategyBreakdown = Array.from(strategyStats.entries()).map(([tag, stat]) => ({
    tag,
    tradesCount: stat.tradesCount,
    winRatePercent: stat.tradesCount > 0 ? Number(((stat.wins / stat.tradesCount) * 100).toFixed(2)) : 0,
    netPnL: stat.netPnL
  })).sort((a, b) => b.netPnL - a.netPnL)

  const portfolio: BacktestPortfolio = {
    id: portfolioId,
    userId: String(portfolioRow.user_id),
    name: String(portfolioRow.name),
    description: portfolioRow.description ? String(portfolioRow.description) : undefined,
    initialCapital,
    cashBalance,
    currency: String(portfolioRow.currency || 'INR'),
    createdAt: Number(portfolioRow.created_at),
    updatedAt: Number(portfolioRow.updated_at),
    metrics,
    positionsCount: positions.length,
    tradesCount: allTrades.length
  }

  return {
    portfolio,
    metrics,
    positions,
    trades: allTrades.reverse(), // most recent first
    closedTrades: closedTrades.reverse(),
    strategyBreakdown
  }
}
