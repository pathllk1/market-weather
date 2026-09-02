import { getTursoClient } from '../../../../utils/turso'
import { calculateIndianBrokerageCharges } from '../../../../utils/portfolio'
import type { TradeType } from '~/types/portfolio'

export default defineEventHandler(async (event) => {
  const portfolioId = getRouterParam(event, 'id')
  const tradeId = getRouterParam(event, 'tradeId')

  if (!portfolioId || !tradeId) {
    throw createError({ statusCode: 400, statusMessage: 'Portfolio ID and Trade ID are required' })
  }

  const body = await readBody(event)

  const rawSymbol = typeof body?.symbol === 'string' ? body.symbol.trim().toUpperCase() : ''
  const symbol = rawSymbol.endsWith('.NS') ? rawSymbol : `${rawSymbol}.NS`
  const tradeType: TradeType = ['BUY', 'SELL', 'DIVIDEND', 'BONUS', 'SPLIT', 'RIGHTS'].includes(body?.tradeType)
    ? body.tradeType
    : 'BUY'
  const tradeDate = typeof body?.tradeDate === 'string' ? body.tradeDate.trim() : new Date().toISOString().split('T')[0]!
  const quantity = Number(body?.quantity)
  const pricePerShare = Number(body?.pricePerShare)

  if (!symbol) {
    throw createError({ statusCode: 400, statusMessage: 'Stock symbol is required' })
  }
  if (!quantity || quantity <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Valid quantity is required' })
  }
  if (pricePerShare < 0) {
    throw createError({ statusCode: 400, statusMessage: 'Valid price per share is required' })
  }

  // Calculate regulatory charges
  let brokerage = Number(body?.brokerage) || 0
  let stt = Number(body?.stt) || 0
  let exchangeCharges = Number(body?.exchangeCharges) || 0
  let gst = Number(body?.gst) || 0
  let sebiFee = Number(body?.sebiFee) || 0
  let totalCost = Number(body?.totalCost)

  if (isNaN(totalCost) || totalCost <= 0) {
    const autoCharges = calculateIndianBrokerageCharges(
      tradeType === 'SELL' ? 'SELL' : 'BUY',
      quantity,
      pricePerShare
    )
    brokerage = autoCharges.brokerage
    stt = autoCharges.stt
    exchangeCharges = autoCharges.exchangeCharges
    gst = autoCharges.gst
    sebiFee = autoCharges.sebiFee
    totalCost = autoCharges.totalCost
  }

  const dematAccountId = typeof body?.dematAccountId === 'string' && body.dematAccountId.trim() ? body.dematAccountId.trim() : null
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : undefined
  const db = getTursoClient()
  const now = Date.now()

  const res = await db.execute({
    sql: `UPDATE portfolio_trades 
          SET demat_account_id = ?, symbol = ?, trade_type = ?, trade_date = ?, quantity = ?, price_per_share = ?,
              brokerage = ?, stt = ?, exchange_charges = ?, gst = ?, sebi_fee = ?, total_cost = ?, notes = ?, updated_at = ?
          WHERE id = ? AND portfolio_id = ?`,
    args: [
      dematAccountId,
      symbol,
      tradeType,
      tradeDate,
      quantity,
      pricePerShare,
      brokerage,
      stt,
      exchangeCharges,
      gst,
      sebiFee,
      totalCost,
      notes || null,
      now,
      tradeId,
      portfolioId
    ]
  })

  if (res.rowsAffected === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Trade record not found' })
  }

  // Update portfolio updated_at
  await db.execute({
    sql: `UPDATE portfolios SET updated_at = ? WHERE id = ?`,
    args: [now, portfolioId]
  })

  return {
    success: true,
    message: 'Trade updated successfully and Demat account re-attributed.'
  }
})
