import { getTursoClient } from '../../../utils/turso'
import { initBacktestTables } from '../../../utils/backtest-db'
import type { BacktestPortfolio } from '~/types/backtest'

export default defineEventHandler(async (event): Promise<BacktestPortfolio> => {
  const userId = event.context.user?.id || 'guest_default_user'
  await initBacktestTables()

  const body = await readBody(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  const initialCapital = Math.max(1000, Number(body?.initialCapital) || 1000000)
  const currency = typeof body?.currency === 'string' ? body.currency.trim().toUpperCase() : 'INR'

  if (!name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Portfolio name is required'
    })
  }

  const db = getTursoClient()
  const id = 'backtest-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36)
  const now = Date.now()

  await db.execute({
    sql: `INSERT INTO backtest_portfolios (id, user_id, name, description, initial_capital, cash_balance, currency, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      userId,
      name,
      description || null,
      initialCapital,
      initialCapital, // initial cash balance equals initial capital
      currency,
      now,
      now
    ]
  })

  return {
    id,
    userId,
    name,
    description: description || undefined,
    initialCapital,
    cashBalance: initialCapital,
    currency,
    createdAt: now,
    updatedAt: now,
    positionsCount: 0,
    tradesCount: 0
  }
})
