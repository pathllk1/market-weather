import { verifyCsrfToken, generateCsrfToken } from '../utils/crypto'
import { COOKIE_CSRF_TOKEN } from '../utils/cookies'

export default defineEventHandler((event) => {
  const method = getMethod(event)
  const path = getRequestPath(event)

  // Ensure CSRF token cookie is set for all GET requests if not yet present
  if (method === 'GET') {
    const existingCookie = getCookie(event, COOKIE_CSRF_TOKEN)
    if (!existingCookie || !verifyCsrfToken(existingCookie)) {
      const freshToken = generateCsrfToken()
      setCookie(event, COOKIE_CSRF_TOKEN, freshToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 30 * 24 * 60 * 60
      })
    }
    return
  }

  // Only protect state-changing API endpoints
  if (!path.startsWith('/api/') || path.startsWith('/api/_nuxt_icon')) return

  // Exempt auth bootstrap and teardown endpoints from strict CSRF check
  const isAuthExempt = path === '/api/auth/login' || path === '/api/auth/register' || path === '/api/auth/logout'
  const cookieCsrf = getCookie(event, COOKIE_CSRF_TOKEN)
  const headerCsrf = getHeader(event, 'x-csrf-token')

  if (isAuthExempt && (!cookieCsrf || path === '/api/auth/logout')) {
    return
  }

  // Validate CSRF token
  const tokenToVerify = headerCsrf || cookieCsrf
  if (!tokenToVerify || !verifyCsrfToken(tokenToVerify)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Invalid or missing CSRF token. Request rejected for security.'
    })
  }

  // If both header and cookie are present, verify they match (Double Submit Cookie defense)
  if (headerCsrf && cookieCsrf && headerCsrf !== cookieCsrf) {
    throw createError({
      statusCode: 403,
      statusMessage: 'CSRF token mismatch between header and cookie.'
    })
  }
})
