import { getTursoClient } from '../../../utils/turso'

export default defineEventHandler(async (event) => {
  const portfolioId = getRouterParam(event, 'id')
  if (!portfolioId) {
    throw createError({ statusCode: 400, statusMessage: 'Portfolio ID is required' })
  }

  const db = getTursoClient()

  // Delete all child records
  await db.execute({ sql: `DELETE FROM portfolio_trades WHERE portfolio_id = ?`, args: [portfolioId] })
  await db.execute({ sql: `DELETE FROM portfolio_targets WHERE portfolio_id = ?`, args: [portfolioId] })
  await db.execute({ sql: `DELETE FROM portfolio_alerts WHERE portfolio_id = ?`, args: [portfolioId] })
  await db.execute({ sql: `DELETE FROM portfolio_dividends WHERE portfolio_id = ?`, args: [portfolioId] })

  // Delete portfolio
  await db.execute({ sql: `DELETE FROM portfolios WHERE id = ?`, args: [portfolioId] })

  return {
    success: true,
    message: 'Portfolio deleted successfully.'
  }
})
