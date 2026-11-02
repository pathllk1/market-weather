import { defineEventHandler, readBody } from 'h3'
import { getSupabaseAdminClient, isSupabaseConfigured } from '../../../utils/supabase'
import { resolveCryptoUserId } from '../../../utils/crypto-user'

interface LocalTradeItem {
  id?: string
  timestamp?: number
  symbol?: string
  side?: 'BUY' | 'SELL'
  priceInr?: number
  qty?: number
  grossTotalInr?: number
  tdsInr?: number
  netTotalInr?: number
}

interface LocalAlertItem {
  id?: string
  symbol?: string
  targetPriceInr?: number
  direction?: 'above' | 'below'
  createdAt?: number
  triggered?: boolean
}

interface MigrateLocalBody {
  watchlist?: string[]
  wallet?: {
    cashInr?: number
    history?: LocalTradeItem[]
  }
  alerts?: LocalAlertItem[]
}

export default defineEventHandler(async (event) => {
  const userId = resolveCryptoUserId(event)
  const body = ((await readBody(event).catch(() => null)) || {}) as MigrateLocalBody

  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' }
  }

  const supabase = getSupabaseAdminClient()
  let watchlistMigrated = 0
  let tradesMigrated = 0
  let alertsMigrated = 0

  try {
    // 1. Migrate Watchlist
    if (Array.isArray(body.watchlist) && body.watchlist.length > 0) {
      const rows = body.watchlist
        .filter((s): s is string => typeof s === 'string' && Boolean(s.trim()))
        .map(s => ({
          user_id: userId,
          symbol: s.trim().toUpperCase()
        }))

      if (rows.length > 0) {
        const { error } = await supabase
          .from('crypto_user_watchlists')
          .upsert(rows, { onConflict: 'user_id,symbol' })

        if (!error) watchlistMigrated = rows.length
      }
    }

    // 2. Migrate Wallet & Trades
    if (body.wallet) {
      const cashInr = typeof body.wallet.cashInr === 'number' ? body.wallet.cashInr : 1000000

      await supabase.from('crypto_paper_wallets').upsert({
        user_id: userId,
        cash_inr: cashInr,
        updated_at: new Date().toISOString()
      })

      if (Array.isArray(body.wallet.history) && body.wallet.history.length > 0) {
        const tradeRows = body.wallet.history
          .filter((t): t is LocalTradeItem => Boolean(t.symbol && t.qty && t.priceInr))
          .map(t => {
            const sym = (t.symbol || '').trim().toUpperCase()
            const gross = t.grossTotalInr || Number(((t.qty || 0) * (t.priceInr || 0)).toFixed(2))
            const tds = t.tdsInr || 0
            const net = t.netTotalInr || (t.side === 'SELL' ? gross - tds : gross)
            const dateStr = t.timestamp ? new Date(t.timestamp).toISOString() : new Date().toISOString()

            return {
              user_id: userId,
              symbol: sym,
              base_asset: sym.replace(/USDT$/, ''),
              side: t.side === 'SELL' ? 'SELL' : 'BUY',
              qty: t.qty || 0,
              price_inr: t.priceInr || 0,
              gross_inr: gross,
              tds_inr: tds,
              net_inr: net,
              executed_at: dateStr
            }
          })

        if (tradeRows.length > 0) {
          const { error } = await supabase.from('crypto_paper_trades').insert(tradeRows)
          if (!error) tradesMigrated = tradeRows.length
        }
      }
    }

    // 3. Migrate Alerts
    if (Array.isArray(body.alerts) && body.alerts.length > 0) {
      const alertRows = body.alerts
        .filter((a): a is LocalAlertItem => Boolean(a.symbol && a.targetPriceInr))
        .map(a => ({
          user_id: userId,
          symbol: (a.symbol || '').trim().toUpperCase(),
          target_price_inr: a.targetPriceInr || 0,
          direction: a.direction === 'below' ? 'below' : 'above',
          is_triggered: Boolean(a.triggered),
          created_at: a.createdAt ? new Date(a.createdAt).toISOString() : new Date().toISOString()
        }))

      if (alertRows.length > 0) {
        const { error } = await supabase.from('crypto_price_alerts').insert(alertRows)
        if (!error) alertsMigrated = alertRows.length
      }
    }

    return {
      success: true,
      migrated: {
        watchlistCount: watchlistMigrated,
        tradesCount: tradesMigrated,
        alertsCount: alertsMigrated
      }
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[MigrateLocal] Migration error:', errorMsg)
    return {
      success: false,
      error: errorMsg
    }
  }
})
