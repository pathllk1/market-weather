import { getTursoClient } from '../../../../utils/turso'

export default defineEventHandler(async (event) => {
  const portfolioId = getRouterParam(event, 'id')
  const tradeId = getRouterParam(event, 'tradeId')

  if (!portfolioId || !tradeId) {
    throw createError({ statusCode: 400, statusMessage: 'Portfolio ID and Trade ID are required' })
  }

  const db = getTursoClient()

  const res = await db.execute({
    sql: `DELETE FROM portfolio_trades WHERE id = ? AND portfolio_id = ?`,
    args: [tradeId, portfolioId]
  })

  if (res.rowsAffected === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Trade not found' })
  }

  // Update portfolio updated_at
  await db.execute({
    sql: `UPDATE portfolios SET updated_at = ? WHERE id = ?`,
    args: [Date.now(), portfolioId]
  })

  return {
    success: true,
    message: 'Trade removed successfully.'
  }
})
