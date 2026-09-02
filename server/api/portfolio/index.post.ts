import { getTursoClient } from '../../utils/turso'

export default defineEventHandler(async (event) => {
  const userId = event.context.user?.id || 'guest_default_user'
  const body = await readBody(event)

  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Portfolio name is required'
    })
  }

  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  const benchmarkSymbol = typeof body?.benchmarkSymbol === 'string' ? body.benchmarkSymbol.trim() : '^NSEI'
  const costMethod = ['FIFO', 'LIFO', 'AVG'].includes(body?.costMethod) ? body.costMethod : 'FIFO'
  const currency = typeof body?.currency === 'string' ? body.currency.trim() : 'INR'
  const isPaperTrading = Boolean(body?.isPaperTrading) ? 1 : 0
  const initialCapital = Number(body?.initialCapital) > 0 ? Number(body.initialCapital) : 1000000

  const db = getTursoClient()
  const newId = crypto.randomUUID()
  const now = Date.now()

  await db.execute({
    sql: `INSERT INTO portfolios (id, user_id, name, description, benchmark_symbol, cost_method, currency, is_paper_trading, initial_capital, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      newId,
      userId,
      name,
      description,
      benchmarkSymbol,
      costMethod,
      currency,
      isPaperTrading,
      initialCapital,
      now,
      now
    ]
  })

  return {
    success: true,
    portfolioId: newId,
    message: `Portfolio '${name}' created successfully.`
  }
})
