import { getTursoClient } from '../../../../utils/turso'
import { initBacktestTables, computePortfolioDetails } from '../../../../utils/backtest-db'
import type { BacktestPortfolioDetailResponse } from '~/types/backtest'

export default defineEventHandler(async (event): Promise<BacktestPortfolioDetailResponse> => {
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

  // 1. Fetch portfolio
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

  // 2. Fetch all trades
  const tradesRes = await db.execute({
    sql: 'SELECT * FROM backtest_trades WHERE portfolio_id = ? ORDER BY executed_at ASC',
    args: [portfolioId]
  })

  // 3. Compute live positions, FIFO realized gains, and metrics
  return await computePortfolioDetails(pRow, tradesRes.rows)
})
