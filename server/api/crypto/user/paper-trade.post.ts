import { defineEventHandler, readBody, createError } from 'h3'
import { getSupabaseAdminClient, isSupabaseConfigured } from '../../../utils/supabase'
import {
  resolveCryptoUserId,
  computePaperPositions,
  type PaperTradeRecord
} from '../../../utils/crypto-user'

interface PaperTradeBody {
  symbol?: string
  baseAsset?: string
  side?: 'BUY' | 'SELL'
  qty?: number
  priceInr?: number
}

export default defineEventHandler(async (event) => {
  const userId = resolveCryptoUserId(event)
  const body = ((await readBody(event).catch(() => null)) || {}) as PaperTradeBody

  const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : ''
  const side = body.side === 'SELL' ? 'SELL' : 'BUY'
  const qty = typeof body.qty === 'number' && body.qty > 0 ? body.qty : 0
  const priceInr = typeof body.priceInr === 'number' && body.priceInr > 0 ? body.priceInr : 0
  const baseAsset = body.baseAsset || symbol.replace(/USDT$/, '')

  if (!symbol || qty <= 0 || priceInr <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid trade parameters' })
  }

  if (!isSupabaseConfigured()) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase is not configured' })
  }

  const supabase = getSupabaseAdminClient()

  // 1. Fetch current wallet balance and previous trades
  const [walletRes, tradesRes] = await Promise.all([
    supabase
      .from('crypto_paper_wallets')
      .select('cash_inr')
      .eq('user_id', userId)
      .maybeSingle(),

    supabase
      .from('crypto_paper_trades')
      .select('id, user_id, symbol, base_asset, side, qty, price_inr, gross_inr, tds_inr, net_inr, executed_at')
      .eq('user_id', userId)
      .order('executed_at', { ascending: false })
  ])

  let currentCash = walletRes.data ? Number(walletRes.data.cash_inr) : 1000000
  const previousTrades = (tradesRes.data || []) as PaperTradeRecord[]
  const currentPositions = computePaperPositions(previousTrades)

  const grossInr = Number((qty * priceInr).toFixed(2))

  if (side === 'BUY') {
    if (currentCash < grossInr) {
      throw createError({
        statusCode: 400,
        statusMessage: `Insufficient virtual cash balance (Required: ₹${grossInr.toLocaleString('en-IN')}, Available: ₹${currentCash.toLocaleString('en-IN')})`
      })
    }

    currentCash = Number((currentCash - grossInr).toFixed(2))
    const tdsInr = 0
    const netInr = grossInr

    // Record trade
    const { data: newTrade, error: tradeErr } = await supabase
      .from('crypto_paper_trades')
      .insert({
        user_id: userId,
        symbol,
        base_asset: baseAsset,
        side: 'BUY',
        qty,
        price_inr: priceInr,
        gross_inr: grossInr,
        tds_inr: tdsInr,
        net_inr: netInr
      })
      .select()
      .single()

    if (tradeErr) {
      throw createError({ statusCode: 500, statusMessage: tradeErr.message })
    }

    // Update wallet balance
    await supabase.from('crypto_paper_wallets').upsert({
      user_id: userId,
      cash_inr: currentCash,
      updated_at: new Date().toISOString()
    })

    const updatedTrades = [newTrade as PaperTradeRecord, ...previousTrades]
    const updatedPositions = computePaperPositions(updatedTrades)

    return {
      success: true,
      message: `Executed paper BUY: ${qty} ${baseAsset} @ ₹${priceInr.toLocaleString('en-IN')}`,
      wallet: {
        cashInr: currentCash,
        positions: updatedPositions,
        history: updatedTrades.map(t => ({
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
      }
    }
  } else {
    // SELL trade
    const holding = currentPositions[symbol]
    if (!holding || holding.qty < (qty - 0.00000001)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Insufficient coin holdings to sell (Holding: ${holding ? holding.qty : 0} ${baseAsset}, Attempted: ${qty})`
      })
    }

    const tdsInr = Number((grossInr * 0.01).toFixed(2)) // 1% Indian TDS
    const netInr = Number((grossInr - tdsInr).toFixed(2))
    currentCash = Number((currentCash + netInr).toFixed(2))

    // Record trade
    const { data: newTrade, error: tradeErr } = await supabase
      .from('crypto_paper_trades')
      .insert({
        user_id: userId,
        symbol,
        base_asset: baseAsset,
        side: 'SELL',
        qty,
        price_inr: priceInr,
        gross_inr: grossInr,
        tds_inr: tdsInr,
        net_inr: netInr
      })
      .select()
      .single()

    if (tradeErr) {
      throw createError({ statusCode: 500, statusMessage: tradeErr.message })
    }

    // Update wallet balance
    await supabase.from('crypto_paper_wallets').upsert({
      user_id: userId,
      cash_inr: currentCash,
      updated_at: new Date().toISOString()
    })

    const updatedTrades = [newTrade as PaperTradeRecord, ...previousTrades]
    const updatedPositions = computePaperPositions(updatedTrades)

    return {
      success: true,
      message: `Executed paper SELL: ${qty} ${baseAsset} (1% TDS: ₹${tdsInr.toLocaleString('en-IN')})`,
      wallet: {
        cashInr: currentCash,
        positions: updatedPositions,
        history: updatedTrades.map(t => ({
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
      }
    }
  }
})
