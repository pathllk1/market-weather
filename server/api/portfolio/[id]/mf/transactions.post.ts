import { getTursoClient } from '~~/server/utils/turso'
import { randomUUID } from 'crypto'
import { getMutualFundDetails } from '~~/server/utils/mfapi'

export default defineEventHandler(async (event) => {
  const portfolioId = getRouterParam(event, 'id')
  if (!portfolioId) {
    throw createError({ statusCode: 400, statusMessage: 'Portfolio ID is required' })
  }

  const body = await readBody(event)
  const schemeCode = parseInt(body.scheme_code || '0', 10)
  if (!schemeCode || isNaN(schemeCode)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid AMFI Scheme Code is required' })
  }

  const txType = (body.transaction_type || 'BUY_SIP').toUpperCase()
  if (!['BUY_SIP', 'BUY_LUMPSUM', 'REDEMPTION'].includes(txType)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid transaction type. Must be BUY_SIP, BUY_LUMPSUM, or REDEMPTION' })
  }

  const txDate = body.transaction_date || new Date().toISOString().split('T')[0]
  let nav = Number(body.nav) || 0
  let units = Number(body.units) || 0
  let amount = Number(body.amount) || 0

  // If scheme metadata not provided, fetch from MFAPI
  let schemeName = body.scheme_name || ''
  let amcName = body.amc_name || ''
  let category = body.category || ''

  if (!schemeName || nav <= 0) {
    const details = await getMutualFundDetails(schemeCode)
    if (details) {
      schemeName = schemeName || details.meta.scheme_name
      amcName = amcName || details.meta.fund_house
      category = category || details.meta.scheme_category
      if (nav <= 0 && details.data.length > 0) {
        // Try to match date or fallback to latest
        nav = Number(details.data[0]?.nav) || 10
      }
    }
  }

  if (nav <= 0) nav = 10 // Fallback nominal NAV

  // Ensure strict mathematical integrity: units = amount / nav
  if (amount > 0 && nav > 0) {
    units = Number((amount / nav).toFixed(4))
  } else if (units > 0 && nav > 0 && amount <= 0) {
    amount = Number((units * nav).toFixed(2))
  }

  if (units <= 0 || amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Valid units or investment amount is required' })
  }

  const stampDuty = txType !== 'REDEMPTION' ? Number((amount * 0.00005).toFixed(2)) : 0 // 0.005% stamp duty in India
  const txId = randomUUID()
  const db = getTursoClient()

  await db.execute({
    sql: `INSERT INTO portfolio_mf_transactions (
            id, portfolio_id, scheme_code, scheme_name, amc_name, category,
            transaction_type, transaction_date, nav, units, amount, stamp_duty,
            folio_number, holding_mode, demat_account_id, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      txId,
      portfolioId,
      schemeCode,
      schemeName || `Scheme #${schemeCode}`,
      amcName || 'Mutual Fund AMC',
      category || 'Other',
      txType,
      txDate,
      nav,
      units,
      amount,
      stampDuty,
      body.folio_number || null,
      body.holding_mode || 'DEMAT',
      body.demat_account_id || null,
      body.notes || null,
      Date.now()
    ]
  })

  return {
    success: true,
    transactionId: txId,
    message: `Recorded ${txType} of ${units} units in ${schemeName}`
  }
})
