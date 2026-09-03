import { getTursoClient } from '~~/server/utils/turso'

export default defineEventHandler(async (event) => {
  const portfolioId = getRouterParam(event, 'id')
  if (!portfolioId) {
    throw createError({ statusCode: 400, statusMessage: 'Portfolio ID is required' })
  }

  const db = getTursoClient()
  const result = await db.execute({
    sql: 'DELETE FROM portfolio_mf_transactions WHERE portfolio_id = ?',
    args: [portfolioId]
  })

  return {
    success: true,
    deletedCount: result.rowsAffected,
    message: `Successfully cleared ${result.rowsAffected} mutual fund transactions for this portfolio.`
  }
})
