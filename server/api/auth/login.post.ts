import { getTursoClient } from '../../utils/turso'
import { verifyPassword, hashPassword, generateCsrfToken } from '../../utils/crypto'
import { checkUserLockout, recordFailedLoginAttempt, resetFailedLoginAttempts } from '../../utils/lockout'
import { issueInitialTokenPair } from '../../utils/tokens'
import { setAuthCookies } from '../../utils/cookies'
import { getDeviceFingerprint, getClientIp, getUserAgent } from '../../utils/device'
import { logSecurityEvent } from '../../utils/audit'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!email || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email and password are required.'
    })
  }

  const db = getTursoClient()

  // 1. Fetch user by email (support both legacy and military-grade columns)
  const userRes = await db.execute({
    sql: 'SELECT id, email, password_hash, password, salt, role, is_active FROM users WHERE email = ?',
    args: [email]
  })

  const user = userRes.rows[0]

  if (!user) {
    // Prevent user enumeration: log generic failure and return 401
    await logSecurityEvent({
      event,
      eventType: 'LOGIN_FAILED',
      status: 'WARNING',
      details: { email, reason: 'Account not found' }
    })

    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid credentials. Please verify your email and password.'
    })
  }

  const userId = String(user.id)
  const isActive = user.is_active !== undefined ? Number(user.is_active) === 1 : true

  if (!isActive) {
    throw createError({
      statusCode: 403,
      statusMessage: 'This account has been deactivated. Please contact an administrator.'
    })
  }

  // 2. Enforce Lockout Guard (5 Continuous Failed Attempts)
  const lockoutStatus = await checkUserLockout(userId)
  if (lockoutStatus.isLocked) {
    throw createError({
      statusCode: 423,
      statusMessage: `Account locked due to 5 continuous failed attempts. Try again in ${lockoutStatus.remainingSeconds} seconds.`
    })
  }

  // 3. Constant-Time Password Verification (with auto-upgrade for legacy passwords)
  let isMatch = false

  if (user.password_hash && user.salt) {
    isMatch = await verifyPassword(password, String(user.password_hash), String(user.salt))
  } else if (user.password) {
    if (String(user.password) === password) {
      isMatch = true
      // Seamlessly upgrade legacy password to scrypt + 32-byte salt
      const upgraded = await hashPassword(password)
      await db.execute({
        sql: 'UPDATE users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?',
        args: [upgraded.hash, upgraded.salt, Date.now(), userId]
      })
    }
  }

  if (!isMatch) {
    const attemptResult = await recordFailedLoginAttempt(event, userId, email)

    if (attemptResult.isNowLocked) {
      throw createError({
        statusCode: 423,
        statusMessage: `Account locked! 5 continuous failed attempts reached. Access blocked for ${attemptResult.lockoutSeconds} seconds.`
      })
    }

    throw createError({
      statusCode: 401,
      statusMessage: `Invalid credentials. ${attemptResult.remainingAttempts} attempt(s) remaining before security lockout.`
    })
  }

  // 4. Authentication Success: Reset failed counter
  await resetFailedLoginAttempts(userId)

  // 5. Issue HS256 Access Token + HS512 Refresh Token
  const ip = getClientIp(event)
  const ua = getUserAgent(event)
  const { fingerprint, deviceName } = getDeviceFingerprint(event)

  const tokenPair = await issueInitialTokenPair(
    event,
    userId,
    String(user.email),
    String(user.role || 'user'),
    fingerprint,
    deviceName,
    ip,
    ua
  )

  // 6. Set HttpOnly SameSite=Strict cookies
  const csrfToken = generateCsrfToken()
  setAuthCookies(event, tokenPair.accessToken, tokenPair.refreshToken, csrfToken)

  await logSecurityEvent({
    event,
    eventType: 'LOGIN_SUCCESS',
    userId,
    status: 'SUCCESS',
    details: { email, deviceName, ip }
  })

  return {
    success: true,
    user: {
      id: userId,
      email: String(user.email),
      role: String(user.role || 'user')
    },
    sessionId: tokenPair.sessionId,
    expiresAt: tokenPair.expiresAt
  }
})
