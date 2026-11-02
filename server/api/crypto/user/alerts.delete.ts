import { defineEventHandler, readBody, createError } from 'h3'
import { getSupabaseAdminClient, isSupabaseConfigured } from '../../../utils/supabase'
import { resolveCryptoUserId } from '../../../utils/crypto-user'

interface AlertDeleteBody {
  id?: string
}

export default defineEventHandler(async (event) => {
  const userId = resolveCryptoUserId(event)
  const body = ((await readBody(event).catch(() => null)) || {}) as AlertDeleteBody
  const alertId = typeof body.id === 'string' ? body.id.trim() : ''

  if (!alertId) {
    throw createError({ statusCode: 400, statusMessage: 'Alert ID is required' })
  }

  if (!isSupabaseConfigured()) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase is not configured' })
  }

  const supabase = getSupabaseAdminClient()

  const { error } = await supabase
    .from('crypto_price_alerts')
    .delete()
    .eq('id', alertId)
    .eq('user_id', userId)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { success: true, id: alertId, action: 'deleted' }
})
