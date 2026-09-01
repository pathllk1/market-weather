import { getTursoClient } from '../../utils/turso'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user || user.role !== 'admin') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Access denied: Admin privileges required.'
    })
  }

  const db = getTursoClient()

  const [ipsRes, devicesRes] = await Promise.all([
    db.execute('SELECT * FROM blacklist_ips ORDER BY blocked_at DESC'),
    db.execute('SELECT * FROM blacklist_devices ORDER BY blocked_at DESC')
  ])

  return {
    ips: ipsRes.rows.map((r) => ({
      id: String(r.id),
      ipAddress: String(r.ip_address),
      reason: String(r.reason),
      blockedBy: String(r.blocked_by),
      blockedAt: Number(r.blocked_at),
      expiresAt: r.expires_at ? Number(r.expires_at) : null
    })),
    devices: devicesRes.rows.map((r) => ({
      id: String(r.id),
      deviceFingerprint: String(r.device_fingerprint),
      deviceName: r.device_name ? String(r.device_name) : 'Unknown Device',
      reason: String(r.reason),
      blockedBy: String(r.blocked_by),
      blockedAt: Number(r.blocked_at),
      expiresAt: r.expires_at ? Number(r.expires_at) : null
    }))
  }
})
