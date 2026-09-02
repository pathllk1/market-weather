import { getTursoClient } from '../../utils/turso'
import type { DematAccount } from '~/types/portfolio'

export default defineEventHandler(async (event) => {
  const userId = event.context.user?.id || 'guest_default_user'
  const db = getTursoClient()

  let res = await db.execute({
    sql: `SELECT id, user_id, broker_name, account_name, client_id, depository, is_default, created_at, updated_at
          FROM demat_accounts
          WHERE user_id = ?
          ORDER BY is_default DESC, created_at ASC`,
    args: [userId]
  })



  const dematAccounts: DematAccount[] = res.rows.map(r => ({
    id: String(r.id),
    userId: String(r.user_id),
    brokerName: String(r.broker_name),
    accountName: String(r.account_name),
    clientId: r.client_id ? String(r.client_id) : undefined,
    depository: (r.depository as any) || 'CDSL',
    isDefault: Number(r.is_default) === 1,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at)
  }))

  return { dematAccounts }
})
