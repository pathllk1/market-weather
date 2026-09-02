import { getTursoClient } from '~~/server/utils/turso'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const userId = user?.id || 'guest_user'
  const viewId = getRouterParam(event, 'id')

  if (!viewId) {
    throw createError({ statusCode: 400, statusMessage: 'View ID is required' })
  }

  const body = await readBody(event)
  const db = getTursoClient()

  // Check existence
  const existing = await db.execute({
    sql: `SELECT id FROM user_mf_views WHERE id = ? AND user_id = ?`,
    args: [viewId, userId]
  })
  if (existing.rows.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'View not found' })
  }

  const updates: string[] = []
  const args: any[] = []

  if (body.name !== undefined) {
    updates.push('name = ?')
    args.push(String(body.name).trim())
  }
  if (body.description !== undefined) {
    updates.push('description = ?')
    args.push(body.description ? String(body.description).trim() : null)
  }
  if (body.scheme_codes !== undefined) {
    updates.push('scheme_codes = ?')
    const codes = Array.isArray(body.scheme_codes) ? body.scheme_codes.map((c: any) => Number(c)) : []
    args.push(JSON.stringify(codes))
  }
  if (body.is_default !== undefined) {
    const isDefault = body.is_default ? 1 : 0
    if (isDefault) {
      await db.execute({
        sql: `UPDATE user_mf_views SET is_default = 0 WHERE user_id = ?`,
        args: [userId]
      })
    }
    updates.push('is_default = ?')
    args.push(isDefault)
  }

  updates.push('updated_at = ?')
  args.push(Date.now())

  args.push(viewId, userId)

  await db.execute({
    sql: `UPDATE user_mf_views SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
    args
  })

  return { success: true }
})
