import { getTursoClient } from '../../../../../utils/turso'
import { initBacktestTables } from '../../../../../utils/backtest-db'

export default defineEventHandler(async (event) => {
  const userId = event.context.user?.id || 'guest_default_user'
  const portfolioId = getRouterParam(event, 'id')
  const tradeId = getRouterParam(event, 'tradeId')

  if (!portfolioId || !tradeId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Portfolio ID and Trade ID are required'
    })
  }

  await initBacktestTables()
  const db = getTursoClient()

  // Verify ownership
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

  // Fetch the trade to reverse cash impact
  const tradeRes = await db.execute({
    sql: 'SELECT * FROM backtest_trades WHERE id = ? AND portfolio_id = ?',
    args: [tradeId, portfolioId]
  })

  const trade = tradeRes.rows[0]
  if (!trade) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Trade execution not found'
    })
  }

  const tradeType = String(trade.trade_type).toUpperCase()
  const qty = Number(trade.quantity)
  const price = Number(trade.price)
  const fees = Number(trade.fees || 0)
  const tradeValue = qty * price

  let cashBalance = Number(pRow.cash_balance)
  if (tradeType === 'BUY') {
    // Reverse BUY: add back cash
    cashBalance += (tradeValue + fees)
  } else if (tradeType === 'SELL') {
    // Reverse SELL: deduct proceeds
    cashBalance -= (tradeValue - fees)
  }

  // Delete trade
  await db.execute({
    sql: 'DELETE FROM backtest_trades WHERE id = ? AND portfolio_id = ?',
    args: [tradeId, portfolioId]
  })

  // Update cash balance
  await db.execute({
    sql: 'UPDATE backtest_portfolios SET cash_balance = ?, updated_at = ? WHERE id = ?',
    args: [Number(cashBalance.toFixed(2)), Date.now(), portfolioId]
  })

  return { success: true, message: 'Trade execution deleted and balance restored' }
})
