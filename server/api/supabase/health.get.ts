import { defineEventHandler } from 'h3'
import { checkSupabaseHealth, getSupabaseConfig } from '../../utils/supabase'

export default defineEventHandler(async () => {
  const config = getSupabaseConfig()
  const health = await checkSupabaseHealth()

  return {
    success: health.connected,
    service: 'supabase',
    status: health.connected ? 'healthy' : 'unreachable',
    url: config.url,
    latencyMs: health.latencyMs,
    hasAnonKey: Boolean(config.anonKey),
    hasServiceRoleKey: Boolean(config.serviceRoleKey),
    error: health.error,
    timestamp: Date.now()
  }
})

