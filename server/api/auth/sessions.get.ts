import { getTursoClient } from '../../utils/turso'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const currentSessionId = event.context.sessionId

  if (!user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized.'
    })
  }

  const db = getTursoClient()
  const now = Date.now()

  const result = await db.execute({
    sql: `
      SELECT id, device_name, ip_address, created_at, last_active_at, expires_at
      FROM sessions
      WHERE user_id = ? AND is_revoked = 0 AND expires_at > ?
      ORDER BY last_active_at DESC
    `,
    args: [user.id, now]
  })

  const sessions = result.rows.map((row) => ({
    id: String(row.id),
    deviceName: String(row.device_name),
    ipAddress: String(row.ip_address),
    createdAt: Number(row.created_at),
    lastActiveAt: Number(row.last_active_at),
    expiresAt: Number(row.expires_at),
    isCurrent: String(row.id) === currentSessionId
  }))

  return { sessions }
})
