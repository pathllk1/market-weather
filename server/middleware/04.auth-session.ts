import { COOKIE_ACCESS_TOKEN, COOKIE_REFRESH_TOKEN, setAuthCookies, clearAuthCookies } from '../utils/cookies'
import { verifyAccessToken } from '../utils/jwt'
import { rotateRefreshToken } from '../utils/tokens'

declare module 'h3' {
  interface H3EventContext {
    user?: {
      id: string
      email: string
      role: string
    } | null
    sessionId?: string | null
  }
}

export default defineEventHandler(async (event) => {
  const path = getRequestPath(event)

  // Skip static assets and internal icon endpoints
  if (
    path.startsWith('/_nuxt') ||
    path.startsWith('/__nuxt') ||
    path.startsWith('/api/_nuxt_icon') ||
    path.startsWith('/favicon.ico')
  ) {
    return
  }

  const rawAccessToken = getCookie(event, COOKIE_ACCESS_TOKEN)
  const rawRefreshToken = getCookie(event, COOKIE_REFRESH_TOKEN)

  // Case A: Access token exists and is valid
  if (rawAccessToken) {
    const accessPayload = await verifyAccessToken(rawAccessToken)
    if (accessPayload && accessPayload.sub) {
      event.context.user = {
        id: accessPayload.sub,
        email: accessPayload.email,
        role: accessPayload.role
      }
      event.context.sessionId = accessPayload.sid
      return
    }
  }

  // Case B: Access token is missing or expired, but Refresh token is available (In-Band Auto-Refresh)
  if (rawRefreshToken) {
    const rotateResult = await rotateRefreshToken(event, rawRefreshToken)

    if (rotateResult.success && rotateResult.tokenPair) {
      // Refresh succeeded: update HttpOnly SameSite=Strict cookies in the response
      setAuthCookies(
        event,
        rotateResult.tokenPair.accessToken,
        rotateResult.tokenPair.refreshToken
      )

      // Decode new access token to populate context
      const newPayload = await verifyAccessToken(rotateResult.tokenPair.accessToken)
      if (newPayload) {
        event.context.user = {
          id: newPayload.sub,
          email: newPayload.email,
          role: newPayload.role
        }
        event.context.sessionId = newPayload.sid
        return
      }
    } else {
      // Both tokens expired or theft detected: clear cookies immediately
      clearAuthCookies(event)
      event.context.user = null
      event.context.sessionId = null
    }
  } else {
    event.context.user = null
    event.context.sessionId = null
  }
})
