import { COOKIE_REFRESH_TOKEN, setAuthCookies, clearAuthCookies } from '../../utils/cookies'
import { rotateRefreshToken } from '../../utils/tokens'

export default defineEventHandler(async (event) => {
  const refreshToken = getCookie(event, COOKIE_REFRESH_TOKEN)

  if (!refreshToken) {
    clearAuthCookies(event)
    throw createError({
      statusCode: 401,
      statusMessage: 'No refresh token provided. Session ended.'
    })
  }

  const result = await rotateRefreshToken(event, refreshToken)

  if (!result.success || !result.tokenPair) {
    clearAuthCookies(event)
    throw createError({
      statusCode: 401,
      statusMessage: result.error || 'Failed to refresh token.'
    })
  }

  // Update cookies with new rotated pair
  setAuthCookies(
    event,
    result.tokenPair.accessToken,
    result.tokenPair.refreshToken
  )

  return {
    success: true,
    sessionId: result.tokenPair.sessionId,
    expiresAt: result.tokenPair.expiresAt
  }
})
