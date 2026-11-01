import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null
let _adminClient: SupabaseClient | null = null

export function getSupabaseConfig() {
  const config = useRuntimeConfig()
  const url = (config.supabaseUrl || process.env.SUPABASE_URL || '').trim()
  const anonKey = (config.public?.supabaseAnonKey || process.env.SUPABASE_ANON_KEY || '').trim()
  const serviceRoleKey = (config.supabaseServiceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

  return { url, anonKey, serviceRoleKey }
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey, serviceRoleKey } = getSupabaseConfig()
  return Boolean(url && (anonKey || serviceRoleKey))
}

/**
 * Public client for client/anon operations (abides by Row Level Security)
 */
export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    const { url, anonKey } = getSupabaseConfig()
    if (!url || !anonKey) {
      throw new Error('[Supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY')
    }
    _client = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  }
  return _client
}

/**
 * Safe getter that returns null if Supabase is not configured (never throws)
 */
export function getSupabaseClientSafe(): SupabaseClient | null {
  try {
    return getSupabaseClient()
  } catch {
    return null
  }
}

/**
 * Admin client for secure server-side operations (bypasses RLS, never expose to frontend)
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (!_adminClient) {
    const { url, serviceRoleKey, anonKey } = getSupabaseConfig()
    const secretKey = serviceRoleKey || anonKey
    if (!url || !secretKey) {
      throw new Error('[Supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }
    _adminClient = createClient(url, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  }
  return _adminClient
}

/**
 * Safe admin getter that returns null if Supabase is not configured (never throws)
 */
export function getSupabaseAdminClientSafe(): SupabaseClient | null {
  try {
    return getSupabaseAdminClient()
  } catch {
    return null
  }
}

/**
 * Health check utility to verify active Supabase connectivity with 5s timeout
 */
export async function checkSupabaseHealth(timeoutMs = 5000): Promise<{
  connected: boolean
  latencyMs: number
  url: string
  error?: string
}> {
  const { url, serviceRoleKey, anonKey } = getSupabaseConfig()
  const key = serviceRoleKey || anonKey
  const startTime = Date.now()

  if (!url || !key) {
    return {
      connected: false,
      latencyMs: 0,
      url: url || '(not configured)',
      error: 'SUPABASE_URL or API key is not configured'
    }
  }

  try {
    // Quick probe to PostgREST root endpoint with strict timeout
    const response = await fetch(`${url}/rest/v1/`, {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
      },
      signal: AbortSignal.timeout(timeoutMs)
    })

    const latencyMs = Date.now() - startTime
    if (response.ok || response.status < 500) {
      return {
        connected: true,
        latencyMs,
        url
      }
    }

    return {
      connected: false,
      latencyMs,
      url,
      error: `Supabase returned HTTP ${response.status}: ${response.statusText}`
    }
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime
    const error = err instanceof Error ? err.message : String(err)
    return {
      connected: false,
      latencyMs,
      url,
      error
    }
  }
}
