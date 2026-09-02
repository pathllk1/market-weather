import { getTursoClient } from '../../utils/turso'

export default defineEventHandler(async (event) => {
  const userId = event.context.user?.id || 'guest_default_user'
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Demat account ID is required.' })
  }

  const db = getTursoClient()

  // Nullify demat_account_id on associated trades
  await db.execute({
    sql: `UPDATE portfolio_trades SET demat_account_id = NULL WHERE demat_account_id = ?`,
    args: [id]
  })

  const res = await db.execute({
    sql: `DELETE FROM demat_accounts WHERE id = ? AND user_id = ?`,
    args: [id, userId]
  })

  if (res.rowsAffected === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Demat account not found.' })
  }

  return {
    success: true,
    message: 'Demat account removed successfully.'
  }
})
