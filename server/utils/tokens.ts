import type { H3Event } from 'h3'
import { getTursoClient } from './turso'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './jwt'
import { hashSha512, generateUUID } from './crypto'
import { logSecurityEvent } from './audit'

export interface TokenPair {
  accessToken: string
  refreshToken: string
  sessionId: string
  expiresAt: number
}

/**
 * Issue an initial token pair upon login
 */
export async function issueInitialTokenPair(
  event: H3Event,
  userId: string,
  email: string,
  role: string,
  deviceFingerprint: string,
  deviceName: string,
  ipAddress: string,
  userAgent: string
): Promise<TokenPair> {
  const db = getTursoClient()
  const sessionId = generateUUID()
  const familyId = generateUUID()
  const now = Date.now()
  const sessionExpiresAt = now + (30 * 24 * 60 * 60 * 1000) // 30 days

  // 1. Create Session
  await db.execute({
    sql: `
      INSERT INTO sessions (id, user_id, device_fingerprint, device_name, ip_address, user_agent, is_revoked, created_at, last_active_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `,
    args: [sessionId, userId, deviceFingerprint, deviceName, ipAddress, userAgent, now, now, sessionExpiresAt]
  })

  // 2. Sign HS256 Access Token (15 min)
  const accessResult = await signAccessToken({
    userId,
    email,
    role,
    sessionId
  })

  // 3. Sign HS512 Refresh Token (30 days)
  const refreshResult = await signRefreshToken({
    userId,
    sessionId,
    familyId
  })

  // 4. Store Refresh Token Hash in DB
  const tokenHash = hashSha512(refreshResult.token)
  await db.execute({
    sql: `
      INSERT INTO refresh_tokens (session_id, user_id, token_hash, family_id, is_revoked, replaced_by, expires_at, created_at)
      VALUES (?, ?, ?, ?, 0, NULL, ?, ?)
    `,
    args: [sessionId, Number(userId) || userId, tokenHash, familyId, refreshResult.expiresAt * 1000, now]
  })

  return {
    accessToken: accessResult.token,
    refreshToken: refreshResult.token,
    sessionId,
    expiresAt: accessResult.expiresAt
  }
}

/**
 * Rotate Refresh Token with Token Reuse (Theft) Detection
 */
export async function rotateRefreshToken(
  event: H3Event,
  rawRefreshToken: string
): Promise<{ success: boolean; tokenPair?: TokenPair; error?: string; isTheft?: boolean }> {
  // 1. Verify HS512 cryptographic signature
  const payload = await verifyRefreshToken(rawRefreshToken)
  if (!payload || !payload.sub || !payload.sid || !payload.fid) {
    return { success: false, error: 'Invalid or expired refresh token signature' }
  }

  const db = getTursoClient()
  const tokenHash = hashSha512(rawRefreshToken)
  const now = Date.now()

  // 2. Query stored token record
  const tokenRes = await db.execute({
    sql: 'SELECT * FROM refresh_tokens WHERE token_hash = ?',
    args: [tokenHash]
  })

  const storedToken = tokenRes.rows[0]
  if (!storedToken) {
    return { success: false, error: 'Refresh token not recognized in registry' }
  }

  const sessionId = String(storedToken.session_id)
  const userId = String(storedToken.user_id)
  const familyId = String(storedToken.family_id)
  const isRevoked = Number(storedToken.is_revoked) === 1
  const replacedBy = storedToken.replaced_by ? String(storedToken.replaced_by) : null

  // 3. Check Session Status
  const sessionRes = await db.execute({
    sql: 'SELECT * FROM sessions WHERE id = ?',
    args: [sessionId]
  })

  const sessionRow = sessionRes.rows[0]
  if (!sessionRow || Number(sessionRow.is_revoked) === 1) {
    return { success: false, error: 'Session has been revoked or expired' }
  }

  // 4. Check Token Reuse Attack
  if (isRevoked || replacedBy) {
    // Check for concurrency grace period (15 seconds)
    const tokenCreatedAt = Number(storedToken.created_at)
    const isWithinGracePeriod = (now - tokenCreatedAt) < 15000

    if (!isWithinGracePeriod) {
      // SECURITY BREACH: Token Reuse Attack Detected!
      // Revoke the entire token family and the session immediately!
      await db.execute({
        sql: 'UPDATE refresh_tokens SET is_revoked = 1 WHERE family_id = ?',
        args: [familyId]
      })

      await db.execute({
        sql: 'UPDATE sessions SET is_revoked = 1 WHERE id = ?',
        args: [sessionId]
      })

      await logSecurityEvent({
        event,
        eventType: 'TOKEN_THEFT_DETECTED',
        userId,
        status: 'ALERT',
        details: {
          sessionId,
          familyId,
          reusedTokenId: String(storedToken.id),
          action: 'Revoked entire token family and terminated session'
        }
      })

      return {
        success: false,
        error: 'Token reuse detected. All active tokens in this family have been revoked for your security.',
        isTheft: true
      }
    }
  }

  // 5. Query user data to embed in new access token
  const userRes = await db.execute({
    sql: 'SELECT email, role, is_active FROM users WHERE id = ?',
    args: [userId]
  })

  const user = userRes.rows[0]
  if (!user || Number(user.is_active) === 0) {
    return { success: false, error: 'User account is inactive or removed' }
  }

  const email = String(user.email)
  const role = String(user.role)

  // 6. Generate NEW Access Token (HS256 15m)
  const newAccess = await signAccessToken({
    userId,
    email,
    role,
    sessionId
  })

  // 7. Generate NEW Refresh Token (HS512 30d in same family)
  const newRefresh = await signRefreshToken({
    userId,
    sessionId,
    familyId
  })

  const newTokenHash = hashSha512(newRefresh.token)

  // 8. Atomic Rotation: Revoke old token, mark replaced_by, insert new token
  await db.execute({
    sql: 'UPDATE refresh_tokens SET is_revoked = 1, replaced_by = ? WHERE id = ?',
    args: [newRefresh.jti, String(storedToken.id)]
  })

  await db.execute({
    sql: `
      INSERT INTO refresh_tokens (session_id, user_id, token_hash, family_id, is_revoked, replaced_by, expires_at, created_at)
      VALUES (?, ?, ?, ?, 0, NULL, ?, ?)
    `,
    args: [sessionId, Number(userId) || userId, newTokenHash, familyId, newRefresh.expiresAt * 1000, now]
  })

  // 9. Update Session activity
  await db.execute({
    sql: 'UPDATE sessions SET last_active_at = ? WHERE id = ?',
    args: [now, sessionId]
  })

  await logSecurityEvent({
    event,
    eventType: 'TOKEN_REFRESH',
    userId,
    status: 'SUCCESS',
    details: {
      sessionId,
      familyId,
      oldTokenId: String(storedToken.id),
      newTokenId: newRefresh.jti
    }
  })

  return {
    success: true,
    tokenPair: {
      accessToken: newAccess.token,
      refreshToken: newRefresh.token,
      sessionId,
      expiresAt: newAccess.expiresAt
    }
  }
}

/**
 * Revoke session and all tokens in its family
 */
export async function revokeSession(event: H3Event, sessionId: string, userId?: string): Promise<boolean> {
  const db = getTursoClient()

  // Revoke session
  await db.execute({
    sql: 'UPDATE sessions SET is_revoked = 1 WHERE id = ?',
    args: [sessionId]
  })

  // Revoke all tokens for this session
  await db.execute({
    sql: 'UPDATE refresh_tokens SET is_revoked = 1 WHERE session_id = ?',
    args: [sessionId]
  })

  await logSecurityEvent({
    event,
    eventType: 'SESSION_REVOKED',
    userId: userId || null,
    status: 'SUCCESS',
    details: { sessionId }
  })

  return true
}
