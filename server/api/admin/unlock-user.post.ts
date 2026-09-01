import { unlockUserAccount } from '../../utils/lockout'
import { getTursoClient } from '../../utils/turso'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user || user.role !== 'admin') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Access denied: Admin privileges required.'
    })
  }

  const body = await readBody(event)
  const targetEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!targetEmail) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Target user email is required.'
    })
  }

  const db = getTursoClient()
  const userRes = await db.execute({
    sql: 'SELECT id FROM users WHERE email = ?',
    args: [targetEmail]
  })

  const row = userRes.rows[0]
  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found.'
    })
  }

  const targetUserId = String(row.id)
  const success = await unlockUserAccount(event, user.id, targetUserId)

  return { success, message: `Account for ${targetEmail} unlocked successfully.` }
})
