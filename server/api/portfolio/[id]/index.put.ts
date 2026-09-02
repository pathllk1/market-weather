import { getTursoClient } from '../../../utils/turso'

export default defineEventHandler(async (event) => {
  const portfolioId = getRouterParam(event, 'id')
  if (!portfolioId) {
    throw createError({ statusCode: 400, statusMessage: 'Portfolio ID is required' })
  }

  const body = await readBody(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Portfolio name is required' })
  }

  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  const benchmarkSymbol = typeof body?.benchmarkSymbol === 'string' ? body.benchmarkSymbol.trim() : '^NSEI'
  const costMethod = ['FIFO', 'LIFO', 'AVG'].includes(body?.costMethod) ? body.costMethod : 'FIFO'
  const initialCapital = Number(body?.initialCapital) > 0 ? Number(body.initialCapital) : 1000000

  const db = getTursoClient()
  const now = Date.now()

  await db.execute({
    sql: `UPDATE portfolios 
          SET name = ?, description = ?, benchmark_symbol = ?, cost_method = ?, initial_capital = ?, updated_at = ?
          WHERE id = ?`,
    args: [name, description, benchmarkSymbol, costMethod, initialCapital, now, portfolioId]
  })

  return {
    success: true,
    message: 'Portfolio settings updated successfully.'
  }
})
