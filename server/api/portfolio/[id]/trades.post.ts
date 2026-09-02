import { getTursoClient } from '../../../utils/turso'
import { calculateIndianBrokerageCharges } from '../../../utils/portfolio'
import type { TradeType } from '~/types/portfolio'

export default defineEventHandler(async (event) => {
  const portfolioId = getRouterParam(event, 'id')
  if (!portfolioId) {
    throw createError({ statusCode: 400, statusMessage: 'Portfolio ID is required' })
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

  // Calculate regulatory charges if not provided
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
  const tradeId = crypto.randomUUID()
  const now = Date.now()

  await db.execute({
    sql: `INSERT INTO portfolio_trades (id, portfolio_id, demat_account_id, symbol, trade_type, trade_date, quantity, price_per_share,
                                       brokerage, stt, exchange_charges, gst, sebi_fee, total_cost, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      tradeId,
      portfolioId,
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
      now
    ]
  })

  // Update portfolio updated_at
  await db.execute({
    sql: `UPDATE portfolios SET updated_at = ? WHERE id = ?`,
    args: [now, portfolioId]
  })

  return {
    success: true,
    tradeId,
    message: `Trade for ${quantity} shares of ${symbol} recorded successfully.`
  }
})
