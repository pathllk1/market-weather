import { getTursoClient } from '../../../utils/turso'
import { initBacktestTables, computePortfolioDetails } from '../../../utils/backtest-db'
import type { BacktestPortfolio } from '~/types/backtest'

export default defineEventHandler(async (event): Promise<{ portfolios: BacktestPortfolio[] }> => {
  const userId = event.context.user?.id || 'guest_default_user'
  await initBacktestTables()

  const db = getTursoClient()

  // 1. Fetch user portfolios
  const pRes = await db.execute({
    sql: 'SELECT * FROM backtest_portfolios WHERE user_id = ? ORDER BY created_at DESC',
    args: [userId]
  })

  // If no portfolio exists for guest, auto-create a default one
  if (pRes.rows.length === 0) {
    const defaultId = 'backtest-default-' + Math.random().toString(36).substring(2, 9)
    const now = Date.now()
    await db.execute({
      sql: `INSERT INTO backtest_portfolios (id, user_id, name, description, initial_capital, cash_balance, currency, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        defaultId,
        userId,
        'Main Backtest Portfolio',
        'Primary manual backtesting and simulated strategy execution workspace',
        1000000,
        1000000,
        'INR',
        now,
        now
      ]
    })

    const freshRes = await db.execute({
      sql: 'SELECT * FROM backtest_portfolios WHERE id = ?',
      args: [defaultId]
    })
    pRes.rows.push(freshRes.rows[0]!)
  }

  const portfolioIds = pRes.rows.map(r => String(r.id))
  const placeholders = portfolioIds.map(() => '?').join(',')

  // 2. Fetch all trades for these portfolios
  const tradesRes = await db.execute({
    sql: `SELECT * FROM backtest_trades WHERE portfolio_id IN (${placeholders}) ORDER BY executed_at ASC`,
    args: portfolioIds
  })

  const tradesByPortfolio = new Map<string, Record<string, unknown>[]>()
  for (const row of tradesRes.rows) {
    const pid = String(row.portfolio_id)
    const list = tradesByPortfolio.get(pid) || []
    list.push(row)
    tradesByPortfolio.set(pid, list)
  }

  // 3. Compute summaries for each portfolio
  const portfolios: BacktestPortfolio[] = []
  for (const pRow of pRes.rows) {
    const pid = String(pRow.id)
    const pTrades = tradesByPortfolio.get(pid) || []
    const detail = await computePortfolioDetails(pRow, pTrades)
    portfolios.push(detail.portfolio)
  }

  return { portfolios }
})
