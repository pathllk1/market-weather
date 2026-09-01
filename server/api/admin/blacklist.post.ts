import { getTursoClient } from '../../utils/turso'
import { generateUUID } from '../../utils/crypto'
import { logSecurityEvent } from '../../utils/audit'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user || user.role !== 'admin') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Access denied: Admin privileges required.'
    })
  }

  const body = await readBody(event)
  const type = body?.type // 'ip' or 'device'
  const value = typeof body?.value === 'string' ? body.value.trim() : ''
  const deviceName = typeof body?.deviceName === 'string' ? body.deviceName.trim() : null
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : 'Manual administrator security block'
  const durationHours = typeof body?.durationHours === 'number' ? body.durationHours : null

  if (!value || (type !== 'ip' && type !== 'device')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid type ("ip" or "device") and value are required.'
    })
  }

  const db = getTursoClient()
  const id = generateUUID()
  const now = Date.now()
  const expiresAt = durationHours ? now + (durationHours * 60 * 60 * 1000) : null

  if (type === 'ip') {
    await db.execute({
      sql: `
        INSERT INTO blacklist_ips (id, ip_address, reason, blocked_by, blocked_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(ip_address) DO UPDATE SET reason = excluded.reason, expires_at = excluded.expires_at, blocked_at = excluded.blocked_at
      `,
      args: [id, value, reason, user.email, now, expiresAt]
    })
  } else {
    await db.execute({
      sql: `
        INSERT INTO blacklist_devices (id, device_fingerprint, device_name, reason, blocked_by, blocked_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(device_fingerprint) DO UPDATE SET reason = excluded.reason, expires_at = excluded.expires_at, blocked_at = excluded.blocked_at
      `,
      args: [id, value, deviceName, reason, user.email, now, expiresAt]
    })
  }

  await logSecurityEvent({
    event,
    eventType: 'BLACKLIST_ADDED',
    userId: user.id,
    status: 'ALERT',
    details: { type, value, reason, expiresAt }
  })

  return { success: true, message: `${type.toUpperCase()} added to blacklist.` }
})
