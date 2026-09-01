import { createClient } from '@libsql/client'
import fs from 'node:fs'

// Load environment variables from .env
function loadEnv() {
  const env = {}
  if (fs.existsSync('.env')) {
    const lines = fs.readFileSync('.env', 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim()
        const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
        env[key] = val
      }
    }
  }
  return env
}

const env = loadEnv()
const url = env.TURSO_DATABASE_URL || 'file:turso_security.db'
const authToken = env.TURSO_AUTH_TOKEN || undefined

const client = createClient({
  url,
  authToken: authToken && authToken.trim() !== '' ? authToken.trim() : undefined
})

function formatTime(val) {
  if (!val) return 'N/A'
  const num = Number(val)
  if (!isNaN(num) && num > 1000000000) {
    return new Date(num).toLocaleString()
  }
  const d = new Date(val)
  return isNaN(d.getTime()) ? String(val) : d.toLocaleString()
}

console.log('='.repeat(70))
console.log('        DATABASE DATA INSPECTION TOOL')
console.log('='.repeat(70))
console.log(`Database URL : ${url}`)
console.log(`Timestamp    : ${new Date().toLocaleString()}\n`)

async function inspectTable(tableName, query, transform) {
  try {
    const res = await client.execute(query)
    console.log(`--- [TABLE: ${tableName}] (Total Records: ${res.rows.length}) ---`)
    if (res.rows.length === 0) {
      console.log('  (No records found)\n')
      return
    }
    const formatted = res.rows.map(row => transform ? transform(row) : row)
    console.table(formatted)
    console.log('')
  } catch (err) {
    console.log(`Table "${tableName}": ${err.message}\n`)
  }
}

// 1. Users
await inspectTable(
  'users',
  'SELECT id, username, email, role, failed_attempts, locked_until, is_active, created_at FROM users ORDER BY id ASC LIMIT 25',
  row => ({
    ID: row.id,
    Username: row.username,
    Email: row.email,
    Role: row.role,
    'Failed Attempts': row.failed_attempts ?? 0,
    Locked: row.locked_until ? `Until ${formatTime(row.locked_until)}` : 'No',
    Active: row.is_active === 1 || row.is_active === '1' ? 'Yes' : 'No',
    'Created At': formatTime(row.created_at)
  })
)

// 2. Active Sessions
await inspectTable(
  'sessions',
  'SELECT id, user_id, device_name, ip_address, is_revoked, created_at, last_active_at, expires_at FROM sessions ORDER BY created_at DESC LIMIT 15',
  row => ({
    'Session ID': String(row.id).slice(0, 8) + '...',
    'User ID': row.user_id,
    Device: row.device_name,
    IP: row.ip_address,
    Revoked: row.is_revoked === 1 ? 'Yes' : 'No',
    'Last Active': formatTime(row.last_active_at),
    Expires: formatTime(row.expires_at)
  })
)

// 3. Refresh Tokens
await inspectTable(
  'refresh_tokens',
  'SELECT id, user_id, session_id, family_id, is_revoked, expires_at, created_at FROM refresh_tokens ORDER BY id DESC LIMIT 15',
  row => ({
    ID: row.id,
    'User ID': row.user_id,
    'Session ID': row.session_id ? String(row.session_id).slice(0, 8) + '...' : 'N/A',
    'Family ID': row.family_id ? String(row.family_id).slice(0, 8) + '...' : 'N/A',
    Revoked: row.is_revoked === 1 ? 'Yes' : 'No',
    Expires: formatTime(row.expires_at),
    Created: formatTime(row.created_at)
  })
)

// 4. IP Access Blocks
await inspectTable(
  'blacklist_ips',
  'SELECT id, ip_address, reason, blocked_by, blocked_at, expires_at FROM blacklist_ips ORDER BY blocked_at DESC LIMIT 15',
  row => ({
    IP: row.ip_address,
    Reason: row.reason,
    'Blocked By': row.blocked_by,
    'Blocked At': formatTime(row.blocked_at),
    'Expires At': row.expires_at ? formatTime(row.expires_at) : 'Permanent'
  })
)

// 5. Device Access Blocks
await inspectTable(
  'blacklist_devices',
  'SELECT id, device_fingerprint, device_name, reason, blocked_by, blocked_at FROM blacklist_devices ORDER BY blocked_at DESC LIMIT 15',
  row => ({
    Fingerprint: String(row.device_fingerprint).slice(0, 12) + '...',
    Device: row.device_name || 'Unknown',
    Reason: row.reason,
    'Blocked By': row.blocked_by,
    'Blocked At': formatTime(row.blocked_at)
  })
)

// 6. Security Audit Logs
await inspectTable(
  'audit_logs',
  'SELECT id, event_type, status, user_id, ip_address, details, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 15',
  row => ({
    Event: row.event_type,
    Status: row.status,
    'User ID': row.user_id || 'N/A',
    IP: row.ip_address,
    Details: row.details ? (String(row.details).slice(0, 35) + (String(row.details).length > 35 ? '...' : '')) : '',
    Timestamp: formatTime(row.created_at)
  })
)

// 7. General Table Counts Summary
try {
  const tablesRes = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC")
  console.log('='.repeat(70))
  console.log('            ALL TABLES RECORD COUNT SUMMARY')
  console.log('='.repeat(70))
  const summaries = []
  for (const t of tablesRes.rows) {
    try {
      const countRes = await client.execute(`SELECT COUNT(*) as count FROM "${t.name}"`)
      summaries.push({
        'Table Name': t.name,
        'Record Count': Number(countRes.rows[0].count)
      })
    } catch {
      summaries.push({ 'Table Name': t.name, 'Record Count': 'Error' })
    }
  }
  console.table(summaries)
} catch (e) {
  console.error('Failed to list tables:', e.message)
}

console.log('\nDatabase inspection complete.')
