import { getTursoClient } from '../../utils/turso'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const sessionId = event.context.sessionId

  if (!user || !user.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized. No active session.'
    })
  }

  const db = getTursoClient()

  // Query fresh user record
  const userRes = await db.execute({
    sql: 'SELECT id, email, role, created_at FROM users WHERE id = ? AND is_active = 1',
    args: [user.id]
  })

  const row = userRes.rows[0]
  if (!row) {
    throw createError({
      statusCode: 401,
      statusMessage: 'User account not found or deactivated.'
    })
  }

  // Query current session details if available
  let sessionData = null
  if (sessionId) {
    const sessionRes = await db.execute({
      sql: 'SELECT id, device_name, ip_address, created_at, last_active_at, expires_at FROM sessions WHERE id = ? AND is_revoked = 0',
      args: [sessionId]
    })
    if (sessionRes.rows.length > 0 && sessionRes.rows[0]) {
      const s = sessionRes.rows[0]
      sessionData = {
        id: String(s.id),
        deviceName: String(s.device_name),
        ipAddress: String(s.ip_address),
        createdAt: Number(s.created_at),
        lastActiveAt: Number(s.last_active_at),
        expiresAt: Number(s.expires_at)
      }
    }
  }

  return {
    user: {
      id: String(row.id),
      email: String(row.email),
      role: String(row.role),
      createdAt: Number(row.created_at)
    },
    session: sessionData
  }
})
