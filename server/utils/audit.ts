import type { H3Event } from 'h3'
import { getTursoClient } from './turso'
import { getClientIp, getUserAgent, getDeviceFingerprint } from './device'
import { generateUUID } from './crypto'

export type SecurityEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGIN_LOCKED_OUT'
  | 'LOGOUT'
  | 'TOKEN_REFRESH'
  | 'TOKEN_THEFT_DETECTED'
  | 'SESSION_REVOKED'
  | 'BLACKLIST_TRIGGERED'
  | 'BLACKLIST_ADDED'
  | 'BLACKLIST_REMOVED'
  | 'USER_UNLOCKED'
  | 'USER_REGISTERED'
  | 'ACCESS_DENIED'

export interface LogSecurityEventOptions {
  event: H3Event
  eventType: SecurityEventType
  userId?: string | null
  status: 'SUCCESS' | 'FAILURE' | 'WARNING' | 'ALERT'
  details?: Record<string, unknown> | string
}

export async function logSecurityEvent(options: LogSecurityEventOptions): Promise<void> {
  try {
    const db = getTursoClient()
    const id = generateUUID()
    const ipAddress = getClientIp(options.event)
    const userAgent = getUserAgent(options.event)
    const { fingerprint } = getDeviceFingerprint(options.event)
    const now = Date.now()

    const detailsStr = typeof options.details === 'object'
      ? JSON.stringify(options.details)
      : (options.details || null)

    await db.execute({
      sql: `
        INSERT INTO audit_logs (id, user_id, event_type, ip_address, user_agent, device_fingerprint, status, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        options.userId || null,
        options.eventType,
        ipAddress,
        userAgent,
        fingerprint,
        options.status,
        detailsStr,
        now
      ]
    })
  } catch (err) {
    // Audit logging should never crash the main application, but log severe warning
    console.error('[SECURITY AUDIT LOG ERROR]:', err)
  }
}
