import { getTursoClient } from '~~/server/utils/turso'
import { randomUUID } from 'crypto'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const userId = user?.id || 'guest_user'

  const body = await readBody(event)
  const name = String(body.name || '').trim()
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'View name is required' })
  }

  const schemeCodes = Array.isArray(body.scheme_codes) ? body.scheme_codes.map((c: any) => Number(c)) : []
  const description = body.description ? String(body.description).trim() : null
  const isDefault = body.is_default ? 1 : 0

  const db = getTursoClient()
  const viewId = randomUUID()
  const now = Date.now()

  if (isDefault) {
    await db.execute({
      sql: `UPDATE user_mf_views SET is_default = 0 WHERE user_id = ?`,
      args: [userId]
    })
  }

  await db.execute({
    sql: `INSERT INTO user_mf_views (id, user_id, name, description, scheme_codes, is_default, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [viewId, userId, name, description, JSON.stringify(schemeCodes), isDefault, now, now]
  })

  return {
    success: true,
    view: {
      id: viewId,
      name,
      description,
      scheme_codes: schemeCodes,
      is_default: Boolean(isDefault)
    }
  }
})
