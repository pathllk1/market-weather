import { defineEventHandler, readBody, createError } from 'h3'
import { getSupabaseAdminClient, isSupabaseConfigured } from '../../../utils/supabase'
import { resolveCryptoUserId } from '../../../utils/crypto-user'

interface AlertPostBody {
  symbol?: string
  targetPriceInr?: number
  direction?: 'above' | 'below'
}

export default defineEventHandler(async (event) => {
  const userId = resolveCryptoUserId(event)
  const body = ((await readBody(event).catch(() => null)) || {}) as AlertPostBody

  const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : ''
  const targetPriceInr = typeof body.targetPriceInr === 'number' && body.targetPriceInr > 0 ? body.targetPriceInr : 0
  const direction = body.direction === 'below' ? 'below' : 'above'

  if (!symbol || targetPriceInr <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Valid symbol and targetPriceInr are required' })
  }

  if (!isSupabaseConfigured()) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase is not configured' })
  }

  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('crypto_price_alerts')
    .insert({
      user_id: userId,
      symbol,
      target_price_inr: targetPriceInr,
      direction,
      is_triggered: false
    })
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return {
    success: true,
    alert: {
      id: data.id,
      symbol: data.symbol,
      targetPriceInr: Number(data.target_price_inr),
      direction: data.direction,
      createdAt: new Date(data.created_at).getTime(),
      triggered: false
    }
  }
})
