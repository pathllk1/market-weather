import { getTursoClient } from '~~/server/utils/turso'

export default defineEventHandler(async (event) => {
  const portfolioId = getRouterParam(event, 'id')
  const txId = getRouterParam(event, 'txId')

  if (!portfolioId || !txId) {
    throw createError({ statusCode: 400, statusMessage: 'Portfolio ID and Transaction ID are required' })
  }

  const db = getTursoClient()
  await db.execute({
    sql: `DELETE FROM portfolio_mf_transactions WHERE id = ? AND portfolio_id = ?`,
    args: [txId, portfolioId]
  })

  return { success: true, message: 'Mutual fund transaction removed' }
})
