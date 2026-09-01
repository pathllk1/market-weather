import { clearAuthCookies, COOKIE_REFRESH_TOKEN } from '../../utils/cookies'
import { verifyRefreshToken } from '../../utils/jwt'
import { revokeSession } from '../../utils/tokens'
import { logSecurityEvent } from '../../utils/audit'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  let sessionId = event.context.sessionId

  // If sessionId not in context, try extracting from refresh token cookie
  if (!sessionId) {
    const rawRefresh = getCookie(event, COOKIE_REFRESH_TOKEN)
    if (rawRefresh) {
      const payload = await verifyRefreshToken(rawRefresh)
      if (payload?.sid) {
        sessionId = payload.sid
      }
    }
  }

  if (sessionId) {
    await revokeSession(event, sessionId, user?.id)
  }

  clearAuthCookies(event)

  if (user?.id) {
    await logSecurityEvent({
      event,
      eventType: 'LOGOUT',
      userId: user.id,
      status: 'SUCCESS',
      details: { sessionId }
    })
  }

  return { success: true }
})
