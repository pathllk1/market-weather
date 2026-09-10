import { getTursoClient } from '../../../../utils/turso'
import { initBacktestTables } from '../../../../utils/backtest-db'

export default defineEventHandler(async (event) => {
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

  // Verify ownership
  const pRes = await db.execute({
    sql: 'SELECT id FROM backtest_portfolios WHERE id = ? AND user_id = ?',
    args: [portfolioId, userId]
  })

  if (pRes.rows.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Backtest portfolio not found'
    })
  }

  // Delete portfolio trades and portfolio record
  await db.execute({
    sql: 'DELETE FROM backtest_trades WHERE portfolio_id = ?',
    args: [portfolioId]
  })

  await db.execute({
    sql: 'DELETE FROM backtest_portfolios WHERE id = ?',
    args: [portfolioId]
  })

  return { success: true, message: 'Backtest portfolio deleted successfully' }
})
