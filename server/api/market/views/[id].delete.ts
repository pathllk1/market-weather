import { getTursoClient } from '../../../utils/turso'

export default defineEventHandler(async (event) => {
  const userId = event.context.user?.id || 'guest_default_user'
  const viewId = getRouterParam(event, 'id')

  if (!viewId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'View ID is required.'
    })
  }

  const db = getTursoClient()

  // 1. Verify existence
  const existingRes = await db.execute({
    sql: 'SELECT id, is_default FROM user_market_views WHERE id = ? AND user_id = ?',
    args: [viewId, userId]
  })

  if (existingRes.rows.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'View not found or unauthorized.'
    })
  }

  const isDefault = Boolean(existingRes.rows[0]?.is_default)

  // 2. Delete view
  await db.execute({
    sql: 'DELETE FROM user_market_views WHERE id = ? AND user_id = ?',
    args: [viewId, userId]
  })

  // 3. If deleted view was default, promote the newest view to default
  if (isDefault) {
    const remainingRes = await db.execute({
      sql: 'SELECT id FROM user_market_views WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
      args: [userId]
    })
    if (remainingRes.rows.length > 0 && remainingRes.rows[0]) {
      const nextDefaultId = String(remainingRes.rows[0].id)
      await db.execute({
        sql: 'UPDATE user_market_views SET is_default = 1 WHERE id = ?',
        args: [nextDefaultId]
      })
    }
  }

  return { success: true, deletedId: viewId }
})
