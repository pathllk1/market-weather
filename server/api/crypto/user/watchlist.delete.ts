import { defineEventHandler, readBody, createError } from 'h3'
import { getSupabaseAdminClient, isSupabaseConfigured } from '../../../utils/supabase'
import { resolveCryptoUserId } from '../../../utils/crypto-user'

interface WatchlistBody {
  symbol?: string
}

export default defineEventHandler(async (event) => {
  const userId = resolveCryptoUserId(event)
  const body = ((await readBody(event).catch(() => null)) || {}) as WatchlistBody
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : ''

  if (!symbol) {
    throw createError({ statusCode: 400, statusMessage: 'Symbol is required' })
  }

  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' }
  }

  const supabase = getSupabaseAdminClient()

  const { error } = await supabase
    .from('crypto_user_watchlists')
    .delete()
    .eq('user_id', userId)
    .eq('symbol', symbol)

  if (error) {
    console.error('[WatchlistDELETE] Delete error:', error.message)
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { success: true, symbol, action: 'removed' }
})
