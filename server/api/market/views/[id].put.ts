import { getTursoClient } from '../../../utils/turso'
import type { UserMarketView } from '~/types/market'

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

  const db = getTursoClient()

  // 1. Verify existence and ownership
  const existingRes = await db.execute({
    sql: 'SELECT id, symbols FROM user_market_views WHERE id = ? AND user_id = ?',
    args: [viewId, userId]
  })

  if (existingRes.rows.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'View not found or unauthorized.'
    })
  }

  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 50) : undefined
  const description = typeof body?.description === 'string' ? body.description.trim().slice(0, 200) : undefined
  const layout = body?.layout === 'table' || body?.layout === 'cards' ? body.layout : (body?.layout ? 'ohlcv' : undefined)
  const isDefault = typeof body?.isDefault === 'boolean' ? (body.isDefault ? 1 : 0) : undefined

  let symbolsJson: string | undefined
  let symbolsArray: string[] | undefined
  if (Array.isArray(body?.symbols)) {
    symbolsArray = body.symbols.filter((s: unknown) => typeof s === 'string').map((s: string) => s.trim().toUpperCase())
    symbolsJson = JSON.stringify(symbolsArray)
  }

  const now = Date.now()

  // 2. Perform updates
  const setClauses: string[] = ['updated_at = ?']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const args: any[] = [now]

  if (name !== undefined) {
    setClauses.push('name = ?')
    args.push(name)
  }
  if (description !== undefined) {
    setClauses.push('description = ?')
    args.push(description)
  }
  if (layout !== undefined) {
    setClauses.push('layout = ?')
    args.push(layout)
  }
  if (symbolsJson !== undefined) {
    setClauses.push('symbols = ?')
    args.push(symbolsJson)
  }
  if (isDefault !== undefined) {
    setClauses.push('is_default = ?')
    args.push(isDefault)
  }

  args.push(viewId, userId)

  await db.execute({
    sql: `UPDATE user_market_views SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`,
    args
  })

  // 3. Return updated view
  const updatedRes = await db.execute({
    sql: `SELECT id, user_id, name, description, symbols, layout, is_default, created_at, updated_at 
          FROM user_market_views 
          WHERE id = ? AND user_id = ?`,
    args: [viewId, userId]
  })

  const r = updatedRes.rows[0]
  if (!r) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to retrieve updated view.' })
  }

  let finalSymbols: string[]
  try {
    finalSymbols = JSON.parse(String(r.symbols || '[]'))
  } catch {
    finalSymbols = []
  }

  const updatedView: UserMarketView = {
    id: String(r.id),
    name: String(r.name),
    description: r.description ? String(r.description) : undefined,
    symbols: finalSymbols,
    layout: (String(r.layout) as 'ohlcv' | 'table' | 'cards') || 'ohlcv',
    isDefault: Boolean(r.is_default),
    stockCount: finalSymbols.length,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at)
  }

  return { success: true, view: updatedView }
})
