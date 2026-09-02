import { getTursoClient } from '../../../utils/turso'

export default defineEventHandler(async (event) => {
  const portfolioId = getRouterParam(event, 'id')
  if (!portfolioId) {
    throw createError({ statusCode: 400, statusMessage: 'Portfolio ID is required' })
  }

  const body = await readBody(event)
  const rawSymbol = typeof body?.symbol === 'string' ? body.symbol.trim().toUpperCase() : ''
  const symbol = rawSymbol.endsWith('.NS') ? rawSymbol : `${rawSymbol}.NS`
  const targetPrice = body?.targetPrice !== undefined && body?.targetPrice !== null ? Number(body.targetPrice) : null
  const stopLoss = body?.stopLoss !== undefined && body?.stopLoss !== null ? Number(body.stopLoss) : null
  const targetNotes = typeof body?.targetNotes === 'string' ? body.targetNotes.trim() : null

  if (!symbol) {
    throw createError({ statusCode: 400, statusMessage: 'Symbol is required' })
  }

  const db = getTursoClient()
  const now = Date.now()

  // Check if target already exists for this symbol in this portfolio
  const existing = await db.execute({
    sql: `SELECT id FROM portfolio_targets WHERE portfolio_id = ? AND symbol = ?`,
    args: [portfolioId, symbol]
  })

  if (existing.rows.length > 0) {
    await db.execute({
      sql: `UPDATE portfolio_targets SET target_price = ?, stop_loss = ?, target_notes = ?, updated_at = ?
            WHERE portfolio_id = ? AND symbol = ?`,
      args: [targetPrice, stopLoss, targetNotes, now, portfolioId, symbol]
    })
  } else {
    await db.execute({
      sql: `INSERT INTO portfolio_targets (id, portfolio_id, symbol, target_price, stop_loss, target_notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [crypto.randomUUID(), portfolioId, symbol, targetPrice, stopLoss, targetNotes, now, now]
    })
  }

  return {
    success: true,
    message: `Target & Stop-loss updated for ${symbol}`
  }
})
