import { getTursoClient } from './turso'
import type { H3Event } from 'h3'
import { logSecurityEvent } from './audit'

export const MAX_FAILED_ATTEMPTS = 5
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes

export interface LockoutCheckResult {
  isLocked: boolean
  remainingSeconds: number
  failedAttempts: number
}

/**
 * Check whether a user is currently locked out
 */
export async function checkUserLockout(userId: string): Promise<LockoutCheckResult> {
  const db = getTursoClient()
  const result = await db.execute({
    sql: 'SELECT failed_attempts, locked_until FROM users WHERE id = ?',
    args: [userId]
  })

  const row = result.rows[0]
  if (!row) {
    return { isLocked: false, remainingSeconds: 0, failedAttempts: 0 }
  }

  const failedAttempts = Number(row.failed_attempts || 0)
  const lockedUntil = row.locked_until ? Number(row.locked_until) : null
  const now = Date.now()

  if (lockedUntil && lockedUntil > now) {
    const remainingSeconds = Math.ceil((lockedUntil - now) / 1000)
    return {
      isLocked: true,
      remainingSeconds,
      failedAttempts
    }
  }

  // Lockout expired, can allow login attempt
  return {
    isLocked: false,
    remainingSeconds: 0,
    failedAttempts
  }
}

/**
 * Record a failed login attempt; lock user if failed_attempts reaches MAX_FAILED_ATTEMPTS
 */
export async function recordFailedLoginAttempt(
  event: H3Event,
  userId: string,
  email: string
): Promise<{ isNowLocked: boolean; remainingAttempts: number; lockoutSeconds: number }> {
  const db = getTursoClient()
  const now = Date.now()

  // Get current attempts
  const userRes = await db.execute({
    sql: 'SELECT failed_attempts FROM users WHERE id = ?',
    args: [userId]
  })

  const userRow = userRes.rows[0]
  const currentAttempts = userRow ? Number(userRow.failed_attempts || 0) : 0
  const newAttempts = currentAttempts + 1

  if (newAttempts >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = now + LOCKOUT_DURATION_MS
    await db.execute({
      sql: 'UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?',
      args: [newAttempts, lockedUntil, now, userId]
    })

    await logSecurityEvent({
      event,
      eventType: 'LOGIN_LOCKED_OUT',
      userId,
      status: 'ALERT',
      details: {
        email,
        failedAttempts: newAttempts,
        lockoutDurationSeconds: LOCKOUT_DURATION_MS / 1000
      }
    })

    return {
      isNowLocked: true,
      remainingAttempts: 0,
      lockoutSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000)
    }
  }

  // Under limit
  await db.execute({
    sql: 'UPDATE users SET failed_attempts = ?, updated_at = ? WHERE id = ?',
    args: [newAttempts, now, userId]
  })

  await logSecurityEvent({
    event,
    eventType: 'LOGIN_FAILED',
    userId,
    status: 'WARNING',
    details: {
      email,
      attemptNumber: newAttempts,
      remainingAttempts: MAX_FAILED_ATTEMPTS - newAttempts
    }
  })

  return {
    isNowLocked: false,
    remainingAttempts: MAX_FAILED_ATTEMPTS - newAttempts,
    lockoutSeconds: 0
  }
}

/**
 * Reset failed attempts on successful login
 */
export async function resetFailedLoginAttempts(userId: string): Promise<void> {
  const db = getTursoClient()
  const now = Date.now()
  await db.execute({
    sql: 'UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?',
    args: [now, userId]
  })
}

/**
 * Admin unlock function to manually unlock an account
 */
export async function unlockUserAccount(adminEvent: H3Event, adminUserId: string, targetUserId: string): Promise<boolean> {
  const db = getTursoClient()
  const now = Date.now()
  const res = await db.execute({
    sql: 'UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?',
    args: [now, targetUserId]
  })

  await logSecurityEvent({
    event: adminEvent,
    eventType: 'USER_UNLOCKED',
    userId: adminUserId,
    status: 'SUCCESS',
    details: {
      targetUserId,
      unlockedAt: now
    }
  })

  return res.rowsAffected > 0
}
