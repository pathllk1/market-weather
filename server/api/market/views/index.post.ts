import { getTursoClient } from '../../../utils/turso'
import type { UserMarketView } from '~/types/market'

export default defineEventHandler(async (event) => {
  const userId = event.context.user?.id || 'guest_default_user'
  const body = await readBody(event)

  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 50) {
    throw createError({
      statusCode: 400,
      statusMessage: 'View name is required and must not exceed 50 characters.'
    })
  }

  const description = typeof body?.description === 'string' ? body.description.trim().slice(0, 200) : ''
  const symbols = Array.isArray(body?.symbols)
    ? body.symbols.filter((s: unknown) => typeof s === 'string').map((s: string) => s.trim().toUpperCase())
    : []

  const layout = body?.layout === 'table' || body?.layout === 'cards' ? body.layout : 'ohlcv'

  const db = getTursoClient()

  // 1. Enforce max 20 views per user constraint
  const countRes = await db.execute({
    sql: 'SELECT COUNT(*) as total FROM user_market_views WHERE user_id = ?',
    args: [userId]
  })

  const totalViews = Number(countRes.rows[0]?.total || 0)
  if (totalViews >= 20) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Limit reached: You can create a maximum of 20 preferred views.'
    })
  }

  const newId = crypto.randomUUID()
  const now = Date.now()
  const symbolsJson = JSON.stringify(symbols)

  // 2. Insert new view
  await db.execute({
    sql: `INSERT INTO user_market_views (id, user_id, name, description, symbols, layout, is_default, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    args: [newId, userId, name, description, symbolsJson, layout, now, now]
  })

  const newView: UserMarketView = {
    id: newId,
    name,
    description: description || undefined,
    symbols,
    layout,
    isDefault: false,
    stockCount: symbols.length,
    createdAt: now,
    updatedAt: now
  }

  return { success: true, view: newView }
})
