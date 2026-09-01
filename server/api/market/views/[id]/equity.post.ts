import { getTursoClient } from '../../../../utils/turso'

export default defineEventHandler(async (event) => {
  const userId = event.context.user?.id || 'guest_default_user'
  const viewId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!viewId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'View ID is required.'
    })
  }

  const action = body?.action === 'remove' ? 'remove' : 'add'
  const inputSymbol = typeof body?.symbol === 'string' ? body.symbol.trim().toUpperCase() : ''

  if (!inputSymbol) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Symbol is required.'
    })
  }

  const rawSymbol = inputSymbol.endsWith('.NS') ? inputSymbol : `${inputSymbol}.NS`

  const db = getTursoClient()

  // 1. Verify view existence and ownership
  const viewRes = await db.execute({
    sql: 'SELECT id, symbols FROM user_market_views WHERE id = ? AND user_id = ?',
    args: [viewId, userId]
  })

  const row = viewRes.rows[0]
  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'View not found or unauthorized.'
    })
  }

  let symbols: string[]
  try {
    symbols = JSON.parse(String(row.symbols || '[]'))
  } catch {
    symbols = []
  }

  if (action === 'add') {
    // 2. Validate equity exists in DB
    const stockRes = await db.execute({
      sql: 'SELECT symbol FROM technical_analysis WHERE symbol = ?',
      args: [rawSymbol]
    })
    if (stockRes.rows.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: `Equity symbol '${rawSymbol}' is not recognized in the system.`
      })
    }

    // 3. Enforce maximum 50 equities per view limit
    if (symbols.length >= 50 && !symbols.includes(rawSymbol)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Limit reached: A view can contain a maximum of 50 equities.'
      })
    }

    if (!symbols.includes(rawSymbol)) {
      symbols.push(rawSymbol)
    }
  } else {
    // Remove
    symbols = symbols.filter(s => s !== rawSymbol)
  }

  const now = Date.now()
  const symbolsJson = JSON.stringify(symbols)

  // 4. Update view
  await db.execute({
    sql: 'UPDATE user_market_views SET symbols = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    args: [symbolsJson, now, viewId, userId]
  })

  return {
    success: true,
    viewId,
    symbol: rawSymbol,
    action,
    symbols,
    stockCount: symbols.length
  }
})
