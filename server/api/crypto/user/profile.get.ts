import { defineEventHandler } from 'h3'
import { getSupabaseAdminClient, isSupabaseConfigured } from '../../../utils/supabase'
import {
  resolveCryptoUserId,
  computePaperPositions,
  type PaperTradeRecord,
  type PriceAlertRecord
} from '../../../utils/crypto-user'

export default defineEventHandler(async (event) => {
  const userId = resolveCryptoUserId(event)

  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error: 'Supabase is not configured',
      userId,
      watchlist: [],
      wallet: {
        cashInr: 1000000,
        positions: {},
        history: []
      },
      alerts: []
    }
  }

  const supabase = getSupabaseAdminClient()

  try {
    // 1. Fetch user watchlist, wallet balance, trades, and alerts in parallel
    const [watchlistRes, walletRes, tradesRes, alertsRes] = await Promise.all([
      supabase
        .from('crypto_user_watchlists')
        .select('symbol')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),

      supabase
        .from('crypto_paper_wallets')
        .select('cash_inr')
        .eq('user_id', userId)
        .maybeSingle(),

      supabase
        .from('crypto_paper_trades')
        .select('id, user_id, symbol, base_asset, side, qty, price_inr, gross_inr, tds_inr, net_inr, executed_at')
        .eq('user_id', userId)
        .order('executed_at', { ascending: false }),

      supabase
        .from('crypto_price_alerts')
        .select('id, symbol, target_price_inr, direction, is_triggered, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
    ])

    // Ensure wallet exists or create default
    let cashInr = 1000000
    if (walletRes.data) {
      cashInr = Number(walletRes.data.cash_inr || 1000000)
    } else {
      await supabase.from('crypto_paper_wallets').upsert({
        user_id: userId,
        cash_inr: 1000000
      })
    }

    const rawTrades = (tradesRes.data || []) as PaperTradeRecord[]
    const positions = computePaperPositions(rawTrades)

    const history = rawTrades.map(t => ({
      id: t.id,
      timestamp: new Date(t.executed_at).getTime(),
      symbol: t.symbol,
      side: t.side,
      priceInr: Number(t.price_inr),
      qty: Number(t.qty),
      grossTotalInr: Number(t.gross_inr),
      tdsInr: Number(t.tds_inr),
      netTotalInr: Number(t.net_inr)
    }))

    const watchlist = (watchlistRes.data || []).map(w => w.symbol)

    const alerts: PriceAlertRecord[] = (alertsRes.data || []).map(a => ({
      id: a.id,
      symbol: a.symbol,
      targetPriceInr: Number(a.target_price_inr),
      direction: a.direction as 'above' | 'below',
      createdAt: new Date(a.created_at).getTime(),
      triggered: Boolean(a.is_triggered)
    }))

    return {
      success: true,
      userId,
      watchlist,
      wallet: {
        cashInr,
        positions,
        history
      },
      alerts
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[CryptoUserProfile] Failed to load user profile:', errorMsg)
    return {
      success: false,
      error: errorMsg,
      userId,
      watchlist: [],
      wallet: {
        cashInr: 1000000,
        positions: {},
        history: []
      },
      alerts: []
    }
  }
})

