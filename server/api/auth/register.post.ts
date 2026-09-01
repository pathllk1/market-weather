import { getTursoClient } from '../../utils/turso'
import { hashPassword, generateCsrfToken } from '../../utils/crypto'
import { issueInitialTokenPair } from '../../utils/tokens'
import { setAuthCookies } from '../../utils/cookies'
import { getDeviceFingerprint, getClientIp, getUserAgent } from '../../utils/device'
import { logSecurityEvent } from '../../utils/audit'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  // Military-grade input validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!email || !emailRegex.test(email)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid email address format.'
    })
  }

  // Password policy: minimum 12 characters, at least one letter, one number, one special character
  if (!password || password.length < 12) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password must be at least 12 characters in length for military-grade protection.'
    })
  }

  const hasLetter = /[a-zA-Z]/.test(password)
  const hasDigit = /[0-9]/.test(password)
  const hasSpecial = /[^a-zA-Z0-9]/.test(password)

  if (!hasLetter || !hasDigit || !hasSpecial) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password must contain at least one letter, one number, and one special character.'
    })
  }

  const db = getTursoClient()

  // Check existing user
  const existingRes = await db.execute({
    sql: 'SELECT id FROM users WHERE email = ?',
    args: [email]
  })

  if (existingRes.rows.length > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'An account with this email address already exists.'
    })
  }

  // Hash password using memory-hard scrypt with unique salt
  const { hash, salt } = await hashPassword(password)
  const nowIso = new Date().toISOString()
  const username = email.split('@')[0] || 'user'
  const fullname = username

  // First user or specific domain can be admin, default to user
  const userCountRes = await db.execute('SELECT COUNT(*) as count FROM users')
  const userCountRow = userCountRes.rows[0]
  const isFirst = (userCountRow ? Number(userCountRow.count || 0) : 0) === 0
  const role = isFirst ? 'admin' : 'user'

  const insertResult = await db.execute({
    sql: `
      INSERT INTO users (
        username, email, fullname, password, password_hash, salt, role, failed_attempts, locked_until, is_active, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, 1, ?, ?)
    `,
    args: [username, email, fullname, hash, hash, salt, role, nowIso, nowIso]
  })

  const userId = String(insertResult.lastInsertRowid)

  // Issue initial token pair and create session
  const ip = getClientIp(event)
  const ua = getUserAgent(event)
  const { fingerprint, deviceName } = getDeviceFingerprint(event)

  const tokenPair = await issueInitialTokenPair(
    event,
    userId,
    email,
    role,
    fingerprint,
    deviceName,
    ip,
    ua
  )

  const csrfToken = generateCsrfToken()
  setAuthCookies(event, tokenPair.accessToken, tokenPair.refreshToken, csrfToken)

  await logSecurityEvent({
    event,
    eventType: 'USER_REGISTERED',
    userId,
    status: 'SUCCESS',
    details: { email, role }
  })

  return {
    success: true,
    user: {
      id: userId,
      email,
      role
    },
    sessionId: tokenPair.sessionId,
    expiresAt: tokenPair.expiresAt
  }
})
