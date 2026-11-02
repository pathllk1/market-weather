import { defineEventHandler, createError } from 'h3'
import { getSupabaseAdminClient, isSupabaseConfigured } from '../../../../utils/supabase'
import { resolveCryptoUserId } from '../../../../utils/crypto-user'

export default defineEventHandler(async (event) => {
  const userId = resolveCryptoUserId(event)

  if (!isSupabaseConfigured()) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase is not configured' })
  }

  const supabase = getSupabaseAdminClient()

  // 1. Delete all user trades
  await supabase
    .from('crypto_paper_trades')
    .delete()
    .eq('user_id', userId)

  // 2. Reset wallet balance to ₹10 Lakh
  await supabase
    .from('crypto_paper_wallets')
    .upsert({
      user_id: userId,
      cash_inr: 1000000.00,
      updated_at: new Date().toISOString()
    })

  return {
    success: true,
    message: 'Paper trading wallet reset to ₹10,00,000 virtual balance',
    wallet: {
      cashInr: 1000000.00,
      positions: {},
      history: []
    }
  }
})

