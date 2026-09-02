import { getTursoClient } from '../../../utils/turso'
import type { PortfolioTrade } from '~/types/portfolio'

export default defineEventHandler(async (event) => {
  const portfolioId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const symbol = typeof query.symbol === 'string' ? query.symbol.trim().toUpperCase() : ''
  const dematId = typeof query.dematId === 'string' ? query.dematId.trim() : ''

  if (!portfolioId) {
    throw createError({ statusCode: 400, statusMessage: 'Portfolio ID is required' })
  }

  const db = getTursoClient()

  let sql = `SELECT pt.id, pt.portfolio_id, pt.demat_account_id, pt.symbol, pt.trade_type, pt.trade_date, pt.quantity, pt.price_per_share,
                    pt.brokerage, pt.stt, pt.exchange_charges, pt.gst, pt.sebi_fee, pt.total_cost, pt.notes, pt.created_at, pt.updated_at,
                    da.broker_name, da.account_name
             FROM portfolio_trades pt
             LEFT JOIN demat_accounts da ON da.id = pt.demat_account_id
             WHERE pt.portfolio_id = ?`
  const args: any[] = [portfolioId]

  if (symbol) {
    sql += ` AND pt.symbol = ?`
    args.push(symbol)
  }

  if (dematId) {
    sql += ` AND pt.demat_account_id = ?`
    args.push(dematId)
  }

  sql += ` ORDER BY pt.trade_date DESC, pt.created_at DESC`

  const res = await db.execute({ sql, args })

  const trades: PortfolioTrade[] = res.rows.map(r => ({
    id: String(r.id),
    portfolioId: String(r.portfolio_id),
    dematAccountId: r.demat_account_id ? String(r.demat_account_id) : undefined,
    brokerName: r.broker_name ? String(r.broker_name) : undefined,
    dematAccountName: r.account_name ? String(r.account_name) : undefined,
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
