import { getTursoClient } from '../../../../utils/turso'
import { getLiveQuotes, toYahooTicker } from '../../../../utils/yahoo'
import { initBacktestTables } from '../../../../utils/backtest-db'
import type { BacktestTrade, TradeType } from '~/types/backtest'

export default defineEventHandler(async (event): Promise<BacktestTrade> => {
  const userId = event.context.user?.id || 'guest_default_user'
  const portfolioId = getRouterParam(event, 'id')

  if (!portfolioId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Portfolio ID is required'
    })
  }

  await initBacktestTables()
  const db = getTursoClient()

  // 1. Verify portfolio exists and belongs to user
  const pRes = await db.execute({
    sql: 'SELECT * FROM backtest_portfolios WHERE id = ? AND user_id = ?',
    args: [portfolioId, userId]
  })

  const pRow = pRes.rows[0]
  if (!pRow) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Backtest portfolio not found'
    })
  }

  let cashBalance = Number(pRow.cash_balance ?? pRow.initial_capital)

  // 2. Parse and sanitize trade request
  const body = await readBody(event)
  const rawSymbol = typeof body?.symbol === 'string' ? body.symbol.trim().toUpperCase() : ''
  const cleanSymbol = rawSymbol.replace(/\.(NS|BO)$/i, '')
  const symbolWithNs = toYahooTicker(rawSymbol)

  const tradeType = String(body?.tradeType || 'BUY').toUpperCase() as TradeType
  const quantity = Math.max(0.0001, Number(body?.quantity) || 0)
  const fees = Math.max(0, Number(body?.fees) || 0)
  const stopLoss = body?.stopLoss !== undefined && body?.stopLoss !== null ? Number(body.stopLoss) : null
  const targetPrice = body?.targetPrice !== undefined && body?.targetPrice !== null ? Number(body.targetPrice) : null
  const strategyTag = typeof body?.strategyTag === 'string' ? body.strategyTag.trim() : null
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : null
  const executedAt = Number(body?.executedAt) || Date.now()

  if (!cleanSymbol) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Stock symbol is required'
    })
  }

  if (quantity <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Quantity must be greater than zero'
    })
  }

  // 3. Resolve execution price & company name
  let executionPrice = Number(body?.price) || 0
  let companyName = typeof body?.companyName === 'string' ? body.companyName.trim() : ''

  // If live price requested or no price provided, fetch live quote
  if (body?.useLivePrice || executionPrice <= 0) {
    const liveQuotes = await getLiveQuotes([symbolWithNs])
    const quote = liveQuotes[symbolWithNs] || liveQuotes[cleanSymbol]
    if (!quote || quote.price <= 0) {
      throw createError({
        statusCode: 400,
        statusMessage: `Unable to fetch live price for symbol '${cleanSymbol}'. Please specify execution price manually.`
      })
    }
    executionPrice = quote.price
  }

  // Lookup company name from technical_analysis if missing
  if (!companyName) {
    const techRes = await db.execute({
      sql: 'SELECT company_name FROM technical_analysis WHERE symbol IN (?, ?) LIMIT 1',
      args: [cleanSymbol, symbolWithNs]
    })
    companyName = techRes.rows[0]?.company_name ? String(techRes.rows[0].company_name) : cleanSymbol
  }

  // 4. Validate balances
  const totalAmount = quantity * executionPrice

  if (tradeType === 'BUY') {
    const totalRequiredCash = totalAmount + fees
    if (totalRequiredCash > cashBalance + 0.01) {
      throw createError({
        statusCode: 400,
        statusMessage: `Insufficient cash balance. Required: ₹${totalRequiredCash.toFixed(2)}, Available: ₹${cashBalance.toFixed(2)}`
      })
    }
    cashBalance -= totalRequiredCash
  } else if (tradeType === 'SELL') {
    // Check existing open shares for this symbol in this portfolio
    const existingTradesRes = await db.execute({
      sql: 'SELECT trade_type, quantity FROM backtest_trades WHERE portfolio_id = ? AND symbol = ?',
      args: [portfolioId, cleanSymbol]
    })

    let currentlyHeldQty = 0
    for (const t of existingTradesRes.rows) {
      const type = String(t.trade_type).toUpperCase()
      const q = Number(t.quantity)
      if (type === 'BUY') currentlyHeldQty += q
      else if (type === 'SELL') currentlyHeldQty -= q
    }

    if (quantity > currentlyHeldQty + 0.0001) {
      throw createError({
        statusCode: 400,
        statusMessage: `Insufficient shares to sell. You currently hold ${currentlyHeldQty.toFixed(2)} shares of ${cleanSymbol}, but attempted to sell ${quantity.toFixed(2)}.`
      })
    }

    const netProceeds = totalAmount - fees
    cashBalance += netProceeds
  }

  // 5. Atomic database write
  const tradeId = 'btrade-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36)
  const now = Date.now()

  await db.execute({
    sql: `INSERT INTO backtest_trades (
            id, portfolio_id, symbol, company_name, trade_type, quantity, price, fees,
            stop_loss, target_price, strategy_tag, notes, executed_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      tradeId,
      portfolioId,
      cleanSymbol,
      companyName,
      tradeType,
      quantity,
      Number(executionPrice.toFixed(2)),
      Number(fees.toFixed(2)),
      stopLoss,
      targetPrice,
      strategyTag,
      notes,
      executedAt,
      now
    ]
  })

  // Update portfolio cash balance and updated_at
  await db.execute({
    sql: 'UPDATE backtest_portfolios SET cash_balance = ?, updated_at = ? WHERE id = ?',
    args: [Number(cashBalance.toFixed(2)), now, portfolioId]
  })

  return {
    id: tradeId,
    portfolioId,
    symbol: cleanSymbol,
    companyName,
    tradeType,
    quantity,
    price: Number(executionPrice.toFixed(2)),
    fees: Number(fees.toFixed(2)),
    stopLoss,
    targetPrice,
    strategyTag,
    notes,
    executedAt,
    createdAt: now
  }
})
