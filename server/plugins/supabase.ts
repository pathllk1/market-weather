import { checkSupabaseHealth, isSupabaseConfigured } from '../utils/supabase'

export default defineNitroPlugin(() => {
  if (!isSupabaseConfigured()) {
    console.warn('[Supabase] ⚠️  SUPABASE_URL or API keys not configured in environment. Supabase connection skipped (server running normally).')
    return
  }

  // Non-blocking health probe: Nitro boots and binds port instantly without waiting
  checkSupabaseHealth(5000)
    .then((health) => {
      if (health.connected) {
        console.log(`[Supabase] ✅ Connected successfully to ${health.url} [latency: ${health.latencyMs}ms]`)
      } else {
        console.warn(`[Supabase] ⚠️  Connection probe failed: ${health.error || 'Server unreachable'}. App continuing in fallback mode (server unaffected).`)
      }
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[Supabase] ⚠️  Non-fatal probe error: ${message}. Server running normally.`)
    })
})
