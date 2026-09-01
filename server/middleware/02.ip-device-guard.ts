import { getClientIp, getDeviceFingerprint } from '../utils/device'
import { getTursoClient } from '../utils/turso'
import { logSecurityEvent } from '../utils/audit'

export default defineEventHandler(async (event) => {
  const path = getRequestPath(event)

  // Skip static assets and internal Nuxt requests
  if (
    path.startsWith('/_nuxt') ||
    path.startsWith('/__nuxt') ||
    path.startsWith('/api/_nuxt_icon') ||
    path.startsWith('/favicon.ico') ||
    path === '/blocked' ||
    path.startsWith('/api/public')
  ) {
    return
  }

  try {
    const ip = getClientIp(event)
    const { fingerprint } = getDeviceFingerprint(event)
    const db = getTursoClient()
    const now = Date.now()

    // 1. Check IP Blacklist
    const ipRes = await db.execute({
      sql: 'SELECT reason, expires_at FROM blacklist_ips WHERE ip_address = ?',
      args: [ip]
    })

    if (ipRes.rows.length > 0) {
      const row = ipRes.rows[0]
      if (row) {
        const expiresAt = row.expires_at ? Number(row.expires_at) : null

        if (!expiresAt || expiresAt > now) {
          await logSecurityEvent({
            event,
            eventType: 'BLACKLIST_TRIGGERED',
            status: 'ALERT',
            details: { type: 'IP', ip, reason: String(row.reason) }
          })

          if (path.startsWith('/api/')) {
            throw createError({
              statusCode: 403,
              statusMessage: 'Access Denied: Your IP address has been flagged and blacklisted by the security engine.'
            })
          } else {
            return sendRedirect(event, '/blocked?type=ip')
          }
        }
      }
    }

    // 2. Check Device Blacklist
    const deviceRes = await db.execute({
      sql: 'SELECT reason, expires_at FROM blacklist_devices WHERE device_fingerprint = ?',
      args: [fingerprint]
    })

    if (deviceRes.rows.length > 0) {
      const row = deviceRes.rows[0]
      if (row) {
        const expiresAt = row.expires_at ? Number(row.expires_at) : null

        if (!expiresAt || expiresAt > now) {
          await logSecurityEvent({
            event,
            eventType: 'BLACKLIST_TRIGGERED',
            status: 'ALERT',
            details: { type: 'DEVICE', fingerprint, reason: String(row.reason) }
          })

          if (path.startsWith('/api/')) {
            throw createError({
              statusCode: 403,
              statusMessage: 'Access Denied: Your device has been flagged and blacklisted by the security engine.'
            })
          } else {
            return sendRedirect(event, '/blocked?type=device')
          }
        }
      }
    }
  } catch (err: unknown) {
    // If it's a 403 error we created, rethrow it
    const error = err as { statusCode?: number }
    if (error?.statusCode === 403) throw err
    // Otherwise don't block request on unexpected db hiccup during boot
  }
})
