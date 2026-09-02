import { getTursoClient } from '~~/server/utils/turso'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const userId = user?.id || 'guest_user'
  const viewId = getRouterParam(event, 'id')

  if (!viewId) {
    throw createError({ statusCode: 400, statusMessage: 'View ID is required' })
  }

  const db = getTursoClient()

  // Prevent deleting if it's the last view
  const countRes = await db.execute({
    sql: `SELECT COUNT(*) as cnt FROM user_mf_views WHERE user_id = ?`,
    args: [userId]
  })
  const total = Number(countRes.rows[0]?.cnt) || 0
  if (total <= 1) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot delete the only remaining view' })
  }

  await db.execute({
    sql: `DELETE FROM user_mf_views WHERE id = ? AND user_id = ?`,
    args: [viewId, userId]
  })

  // Ensure there's still a default view
  const defaultCheck = await db.execute({
    sql: `SELECT id FROM user_mf_views WHERE user_id = ? AND is_default = 1`,
    args: [userId]
  })
  if (defaultCheck.rows.length === 0) {
    await db.execute({
      sql: `UPDATE user_mf_views SET is_default = 1 WHERE id = (SELECT id FROM user_mf_views WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1)`,
      args: [userId]
    })
  }

  return { success: true }
})
