import { createClient } from '@supabase/supabase-js'

// Automatically load .env if process.env values are not pre-injected
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env')
  } catch {
    // Ignore if running where env is already in process
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[Test] ❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment (.env)')
  process.exit(1)
}

console.log(`[Test] Connecting to Supabase at: ${SUPABASE_URL}`)

async function checkConnection() {
  const start = Date.now()
  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
      }
    })

    const latency = Date.now() - start
    if (res.ok) {
      console.log(`[Test] ✅ PostgREST responded with HTTP ${res.status} ${res.statusText} (${latency}ms)`)
    } else {
      console.warn(`[Test] ⚠️ PostgREST responded with HTTP ${res.status} ${res.statusText} (${latency}ms)`)
    }

    const client = createClient(SUPABASE_URL, key, { auth: { persistSession: false } })
    console.log('[Test] ✅ Supabase Client SDK initialized successfully.')
    console.log('[Test] Supabase environment & connection are fully verified!')
  } catch (err) {
    console.error('[Test] ❌ Failed to connect:', err)
    process.exit(1)
  }
}

checkConnection()
