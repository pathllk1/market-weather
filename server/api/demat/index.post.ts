import { getTursoClient } from '../../utils/turso'

export default defineEventHandler(async (event) => {
  const userId = event.context.user?.id || 'guest_default_user'
  const body = await readBody(event)

  const brokerName = typeof body?.brokerName === 'string' ? body.brokerName.trim() : ''
  const accountName = typeof body?.accountName === 'string' ? body.accountName.trim() : ''
  const clientId = typeof body?.clientId === 'string' ? body.clientId.trim() : null
  const depository = ['CDSL', 'NSDL'].includes(body?.depository) ? body.depository : 'CDSL'
  const isDefault = Boolean(body?.isDefault) ? 1 : 0

  if (!brokerName || !accountName) {
    throw createError({ statusCode: 400, statusMessage: 'Broker name and Account nickname are required.' })
  }

  const db = getTursoClient()
  const now = Date.now()
  const newId = crypto.randomUUID()

  // If this is set as default, reset other defaults for this user
  if (isDefault) {
    await db.execute({
      sql: `UPDATE demat_accounts SET is_default = 0 WHERE user_id = ?`,
      args: [userId]
    })
  }

  await db.execute({
    sql: `INSERT INTO demat_accounts (id, user_id, broker_name, account_name, client_id, depository, is_default, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [newId, userId, brokerName, accountName, clientId, depository, isDefault, now, now]
  })

  return {
    success: true,
    dematAccountId: newId,
    message: `Demat account '${accountName}' linked successfully.`
  }
})
