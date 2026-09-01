import { getTursoClient } from '../../../utils/turso'
import type { UserMarketView } from '~/types/market'

const DEFAULT_NIFTY_SYMBOLS = [
  'RELIANCE.NS',
  'TCS.NS',
  'HDFCBANK.NS',
  'INFY.NS',
  'ICICIBANK.NS',
  'BHARTIARTL.NS',
  'SBIN.NS',
  'ITC.NS',
  'HINDUNILVR.NS',
  'LT.NS'
]

export default defineEventHandler(async (event) => {
  const userId = event.context.user?.id || 'guest_default_user'
  const db = getTursoClient()

  // 1. Fetch user views
  const res = await db.execute({
    sql: `SELECT id, user_id, name, description, symbols, layout, is_default, created_at, updated_at 
          FROM user_market_views 
          WHERE user_id = ? 
          ORDER BY is_default DESC, updated_at DESC`,
    args: [userId]
  })

  // 2. If no views exist for this user, automatically seed "Nifty Core 10"
  if (res.rows.length === 0) {
    const newId = crypto.randomUUID()
    const now = Date.now()
    const initialSymbolsJson = JSON.stringify(DEFAULT_NIFTY_SYMBOLS)

    await db.execute({
      sql: `INSERT INTO user_market_views (id, user_id, name, description, symbols, layout, is_default, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'ohlcv', 1, ?, ?)`,
      args: [
        newId,
        userId,
        'Nifty Core 10',
        'High-liquidity benchmark leaders across Indian markets',
        initialSymbolsJson,
        now,
        now
      ]
    })

    const initialView: UserMarketView = {
      id: newId,
      name: 'Nifty Core 10',
      description: 'High-liquidity benchmark leaders across Indian markets',
      symbols: DEFAULT_NIFTY_SYMBOLS,
      layout: 'ohlcv',
      isDefault: true,
      stockCount: DEFAULT_NIFTY_SYMBOLS.length,
      createdAt: now,
      updatedAt: now
    }

    return { views: [initialView] }
  }

  // 3. Map DB rows to UserMarketView objects
  const views: UserMarketView[] = res.rows.map((r) => {
    let symbols: string[]
    try {
      symbols = JSON.parse(String(r.symbols || '[]'))
    } catch {
      symbols = []
    }

    return {
      id: String(r.id),
      name: String(r.name),
      description: r.description ? String(r.description) : undefined,
      symbols,
      layout: (String(r.layout) as 'ohlcv' | 'table' | 'cards') || 'ohlcv',
      isDefault: Boolean(r.is_default),
      stockCount: symbols.length,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at)
    }
  })

  return { views }
})
