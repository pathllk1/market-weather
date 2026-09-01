import { revokeSession } from '../../utils/tokens'
import { getTursoClient } from '../../utils/turso'
import { clearAuthCookies } from '../../utils/cookies'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const currentSessionId = event.context.sessionId

  if (!user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized.'
    })
  }

  const body = await readBody(event)
  const targetSessionId = body?.sessionId
  const revokeAllOthers = body?.revokeAllOthers === true

  const db = getTursoClient()

  if (revokeAllOthers) {
    // Revoke all sessions except the current one
    await db.execute({
      sql: 'UPDATE sessions SET is_revoked = 1 WHERE user_id = ? AND id != ?',
      args: [user.id, currentSessionId || '']
    })
    await db.execute({
      sql: `
        UPDATE refresh_tokens SET is_revoked = 1 
        WHERE user_id = ? AND session_id != ?
      `,
      args: [user.id, currentSessionId || '']
    })

    return { success: true, message: 'All other active sessions revoked successfully.' }
  }

  if (!targetSessionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Session ID is required to revoke.'
    })
  }

  // Verify ownership
  const verifyRes = await db.execute({
    sql: 'SELECT id FROM sessions WHERE id = ? AND user_id = ?',
    args: [targetSessionId, user.id]
  })

  if (verifyRes.rows.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Session not found or does not belong to you.'
    })
  }

  await revokeSession(event, targetSessionId, user.id)

  // If revoking current session, clear cookies
  if (targetSessionId === currentSessionId) {
    clearAuthCookies(event)
  }

  return { success: true, message: 'Session revoked successfully.' }
})
