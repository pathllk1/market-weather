import { getTursoClient } from '../../utils/turso'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user || user.role !== 'admin') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Access denied: Admin privileges required.'
    })
  }

  const query = getQuery(event)
  const limit = Math.min(Math.max(Number(query.limit) || 50, 10), 200)
  const offset = Math.max(Number(query.offset) || 0, 0)
  const filterType = query.type ? String(query.type) : null

  const db = getTursoClient()

  let sql = 'SELECT * FROM audit_logs'
  const args: (string | number)[] = []

  if (filterType) {
    sql += ' WHERE event_type = ?'
    args.push(filterType)
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
  args.push(limit, offset)

  const result = await db.execute({ sql, args })

  const logs = result.rows.map((row) => {
    let parsedDetails = null
    if (row.details) {
      try {
        parsedDetails = JSON.parse(String(row.details))
      } catch {
        parsedDetails = String(row.details)
      }
    }

    return {
      id: String(row.id),
      userId: row.user_id ? String(row.user_id) : null,
      eventType: String(row.event_type),
      ipAddress: String(row.ip_address),
      userAgent: String(row.user_agent),
      deviceFingerprint: row.device_fingerprint ? String(row.device_fingerprint) : null,
      status: String(row.status),
      details: parsedDetails,
      createdAt: Number(row.created_at)
    }
  })

  return { logs }
})
