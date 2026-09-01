import { getTursoClient } from '../../utils/turso'
import { logSecurityEvent } from '../../utils/audit'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user || user.role !== 'admin') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Access denied: Admin privileges required.'
    })
  }

  const body = await readBody(event)
  const type = body?.type // 'ip' or 'device'
  const id = body?.id

  if (!id || (type !== 'ip' && type !== 'device')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Type ("ip" or "device") and ID are required.'
    })
  }

  const db = getTursoClient()

  if (type === 'ip') {
    await db.execute({
      sql: 'DELETE FROM blacklist_ips WHERE id = ?',
      args: [id]
    })
  } else {
    await db.execute({
      sql: 'DELETE FROM blacklist_devices WHERE id = ?',
      args: [id]
    })
  }

  await logSecurityEvent({
    event,
    eventType: 'BLACKLIST_REMOVED',
    userId: user.id,
    status: 'SUCCESS',
    details: { type, id }
  })

  return { success: true, message: `${type.toUpperCase()} removed from blacklist.` }
})
