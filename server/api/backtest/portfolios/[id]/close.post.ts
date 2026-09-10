import { getTursoClient } from '../../../../utils/turso'
import { getLiveQuotes, toYahooTicker } from '../../../../utils/yahoo'
import { initBacktestTables } from '../../../../utils/backtest-db'
import type { BacktestTrade } from '~/types/backtest'

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

  // 1. Verify portfolio ownership
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

  // 2. Parse request
  const body = await readBody(event)
  const rawSymbol = typeof body?.symbol === 'string' ? body.symbol.trim().toUpperCase() : ''
  const cleanSymbol = rawSymbol.replace(/\.(NS|BO)$/i, '')
  const symbolWithNs = toYahooTicker(rawSymbol)

  if (!cleanSymbol) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Stock symbol is required'
    })
  }

  // 3. Determine remaining open shares
  const tradesRes = await db.execute({
    sql: 'SELECT trade_type, quantity, company_name FROM backtest_trades WHERE portfolio_id = ? AND symbol = ?',
    args: [portfolioId, cleanSymbol]
  })

  let openQuantity = 0
  let companyName = cleanSymbol
  for (const t of tradesRes.rows) {
    const type = String(t.trade_type).toUpperCase()
    const q = Number(t.quantity)
    if (type === 'BUY') openQuantity += q
    else if (type === 'SELL') openQuantity -= q
    if (t.company_name) companyName = String(t.company_name)
  }

  if (openQuantity <= 0.0001) {
    throw createError({
      statusCode: 400,
      statusMessage: `No open position found to close for '${cleanSymbol}'`
    })
  }

  // 4. Fetch live market price
  const liveQuotes = await getLiveQuotes([symbolWithNs])
  const quote = liveQuotes[symbolWithNs] || liveQuotes[cleanSymbol]
  if (!quote || quote.price <= 0) {
    throw createError({
      statusCode: 503,
      statusMessage: `Unable to fetch current live market price for '${cleanSymbol}'. Please try again.`
    })
  }

  const exitPrice = Number(quote.price.toFixed(2))
  const fees = Number((openQuantity * exitPrice * 0.0003).toFixed(2)) // Standard 0.03% brokerage
  const proceeds = (openQuantity * exitPrice) - fees
  const updatedCashBalance = Number((Number(pRow.cash_balance) + proceeds).toFixed(2))

  // 5. Insert SELL trade and update cash balance
  const tradeId = 'btrade-close-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36)
  const now = Date.now()

  await db.execute({
    sql: `INSERT INTO backtest_trades (
            id, portfolio_id, symbol, company_name, trade_type, quantity, price, fees,
            stop_loss, target_price, strategy_tag, notes, executed_at, created_at
          ) VALUES (?, ?, ?, ?, 'SELL', ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`,
    args: [
      tradeId,
      portfolioId,
      cleanSymbol,
      companyName,
      openQuantity,
      exitPrice,
      fees,
      body?.strategyTag || 'Market Exit',
      body?.notes || '1-click full position market close',
      now,
      now
    ]
  })

  await db.execute({
    sql: 'UPDATE backtest_portfolios SET cash_balance = ?, updated_at = ? WHERE id = ?',
    args: [updatedCashBalance, now, portfolioId]
  })

  return {
    id: tradeId,
    portfolioId,
    symbol: cleanSymbol,
    companyName,
    tradeType: 'SELL',
    quantity: openQuantity,
    price: exitPrice,
    fees,
    strategyTag: body?.strategyTag || 'Market Exit',
    notes: body?.notes || '1-click full position market close',
    executedAt: now,
    createdAt: now
  }
})
