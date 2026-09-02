import { getTursoClient } from '~~/server/utils/turso'

export default defineEventHandler(async (event) => {
  const portfolioId = getRouterParam(event, 'id')
  if (!portfolioId) {
    throw createError({ statusCode: 400, statusMessage: 'Portfolio ID is required' })
  }

  const query = getQuery(event)
  const schemeCode = query.schemeCode ? parseInt(String(query.schemeCode), 10) : undefined

  const db = getTursoClient()
  let sql = `SELECT t.id, t.portfolio_id, t.scheme_code, t.scheme_name, t.amc_name, t.category,
                    t.transaction_type, t.transaction_date, t.nav, t.units, t.amount, t.stamp_duty,
                    t.folio_number, t.holding_mode, t.demat_account_id, t.notes, t.created_at,
                    d.broker_name, d.account_name as demat_account_name
             FROM portfolio_mf_transactions t
             LEFT JOIN demat_accounts d ON t.demat_account_id = d.id
             WHERE t.portfolio_id = ?`
  const args: any[] = [portfolioId]

  if (schemeCode) {
    sql += ` AND t.scheme_code = ?`
    args.push(schemeCode)
  }

  sql += ` ORDER BY t.transaction_date DESC, t.created_at DESC`

  const res = await db.execute({ sql, args })
  return {
    transactions: res.rows
  }
})
