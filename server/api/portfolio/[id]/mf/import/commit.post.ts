import { getTursoClient } from '~~/server/utils/turso'
import { randomUUID } from 'crypto'
import type { CASTransaction } from '~~/server/utils/casParser'

export default defineEventHandler(async (event) => {
  const portfolioId = getRouterParam(event, 'id')
  if (!portfolioId) {
    throw createError({ statusCode: 400, statusMessage: 'Portfolio ID is required' })
  }

  const body = await readBody(event)
  const incomingTxns = (body.transactions || []) as CASTransaction[]
  const dematAccountId = body.demat_account_id || null

  // Filter only transactions marked for import
  const toInsert = incomingTxns.filter(t => t.selected !== false && Number(t.schemeCode) > 0)

  if (toInsert.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No transactions selected for import' })
  }

  const db = getTursoClient()
  const now = Date.now()

  // Strict server-side duplicate prevention check against existing transactions
  const existingRes = await db.execute({
    sql: `SELECT scheme_code, transaction_date, amount, units 
          FROM portfolio_mf_transactions 
          WHERE portfolio_id = ?`,
    args: [portfolioId]
  })

  const existingSet = new Set<string>()
  for (const row of existingRes.rows as any[]) {
    const code = Number(row.scheme_code)
    const date = String(row.transaction_date)
    const amt = Number(row.amount || 0).toFixed(2)
    existingSet.add(`${code}_${date}_${amt}`)
  }

  // Deduplicate incoming transactions
  const deduplicatedToInsert = toInsert.filter(t => {
    const key = `${Number(t.schemeCode)}_${t.transactionDate}_${Number(t.amount).toFixed(2)}`
    return !existingSet.has(key)
  })

  if (deduplicatedToInsert.length === 0) {
    return {
      success: true,
      insertedCount: 0,
      message: 'All selected transactions have already been imported previously. Zero duplicates inserted.'
    }
  }

  let insertedCount = 0

  // Chunk inserts in batches of 50 to avoid SQLite argument limits
  const CHUNK_SIZE = 50
  for (let i = 0; i < deduplicatedToInsert.length; i += CHUNK_SIZE) {
    const chunk = deduplicatedToInsert.slice(i, i + CHUNK_SIZE)

    const stmts = chunk.map((t) => {
      const txId = randomUUID()
      return {
        sql: `INSERT INTO portfolio_mf_transactions (
                id, portfolio_id, scheme_code, scheme_name, amc_name, category,
                transaction_type, transaction_date, nav, units, amount, stamp_duty,
                folio_number, holding_mode, demat_account_id, notes, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          txId,
          portfolioId,
          Number(t.schemeCode),
          t.schemeName || `Scheme #${t.schemeCode}`,
          t.amcName || 'Mutual Fund',
          t.category || 'Other Equity Fund',
          t.transactionType,
          t.transactionDate,
          Number(t.nav) || 10,
          Number(t.units) || 0,
          Number(t.amount) || 0,
          Number(t.stampDuty) || 0,
          t.folioNumber || null,
          t.holdingMode || 'PHYSICAL',
          t.holdingMode === 'DEMAT' ? dematAccountId : null,
          t.description || null,
          now
        ]
      }
    })

    await db.batch(stmts, 'write')
    insertedCount += chunk.length
  }

  return {
    success: true,
    insertedCount,
    message: `Successfully imported ${insertedCount} transactions into mutual fund portfolio.`
  }
})
