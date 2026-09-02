import { getTursoClient } from '../../../utils/turso'
import type { PortfolioTrade } from '~/types/portfolio'

export default defineEventHandler(async (event) => {
  const portfolioId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const symbol = typeof query.symbol === 'string' ? query.symbol.trim().toUpperCase() : ''

  if (!portfolioId) {
    throw createError({ statusCode: 400, statusMessage: 'Portfolio ID is required' })
  }

  const db = getTursoClient()

  let sql = `SELECT id, portfolio_id, symbol, trade_type, trade_date, quantity, price_per_share,
                    brokerage, stt, exchange_charges, gst, sebi_fee, total_cost, notes, created_at, updated_at
             FROM portfolio_trades
             WHERE portfolio_id = ?`
  const args: any[] = [portfolioId]

  if (symbol) {
    sql += ` AND symbol = ?`
    args.push(symbol)
  }

  sql += ` ORDER BY trade_date DESC, created_at DESC`

  const res = await db.execute({ sql, args })

  const trades: PortfolioTrade[] = res.rows.map(r => ({
    id: String(r.id),
    portfolioId: String(r.portfolio_id),
    symbol: String(r.symbol),
    tradeType: r.trade_type as any,
    tradeDate: String(r.trade_date),
    quantity: Number(r.quantity),
    pricePerShare: Number(r.price_per_share),
    brokerage: Number(r.brokerage),
    stt: Number(r.stt),
    exchangeCharges: Number(r.exchange_charges),
    gst: Number(r.gst),
    sebiFee: Number(r.sebi_fee),
    totalCost: Number(r.total_cost),
    notes: r.notes ? String(r.notes) : undefined,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at)
  }))

  return { trades }
})
