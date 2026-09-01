import { createClient } from '@libsql/client'
import fs from 'node:fs'
import path from 'node:path'

// Helper to parse .env file
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) {
    console.warn('[WARN] .env file not found at:', envPath)
    return {}
  }
  const content = fs.readFileSync(envPath, 'utf-8')
  const env = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const equalsIdx = trimmed.indexOf('=')
    if (equalsIdx !== -1) {
      const key = trimmed.slice(0, equalsIdx).trim()
      let val = trimmed.slice(equalsIdx + 1).trim()
      // Remove optional surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      env[key] = val
    }
  }
  return env
}

async function testTursoConnection() {
  console.log('\n========================================')
  console.log('   TURSO DATABASE CONNECTION DIAGNOSTIC')
  console.log('========================================\n')

  const env = loadEnv()
  const url = process.env.TURSO_DATABASE_URL || env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN || env.TURSO_AUTH_TOKEN

  console.log('Configuration Check:')
  console.log('  Database URL :', url || '[NOT SET]')
  console.log('  Auth Token   :', authToken ? `${authToken.slice(0, 15)}...${authToken.slice(-10)} (Length: ${authToken.length})` : '[NOT SET]')

  if (!url) {
    console.error('\n❌ ERROR: TURSO_DATABASE_URL is missing.')
    process.exit(1)
  }

  // Token analysis if it's a remote URL
  const isRemote = url.startsWith('libsql://') || url.startsWith('https://')
  if (isRemote && !authToken) {
    console.warn('\n⚠️ WARNING: Remote Turso database specified without TURSO_AUTH_TOKEN.')
  }

  if (authToken) {
    try {
      const parts = authToken.split('.')
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'))
        console.log('\nToken JWT Payload:')
        console.log('  Access Type  :', payload.a || 'N/A')
        console.log('  Issued At    :', payload.iat ? new Date(payload.iat * 1000).toISOString() : 'N/A')
        console.log('  Expiration   :', payload.exp ? new Date(payload.exp * 1000).toISOString() : 'None (Persistent)')
        console.log('  Database ID  :', payload.id || 'N/A')
      }
    } catch {
      console.log('  Token format : [Non-standard / opaque string]')
    }
  }

  console.log('\nInitiating connection to Turso...')
  const startTime = Date.now()

  try {
    const client = createClient({
      url,
      authToken: authToken && authToken.trim() !== '' ? authToken.trim() : undefined
    })

    // Execute simple query
    const result = await client.execute('SELECT 1 as connected, datetime("now") as server_time;')
    const elapsed = Date.now() - startTime

    console.log('\n✅ SUCCESS: Connected to Turso database!')
    console.log('  Response Time :', `${elapsed} ms`)
    console.log('  Query Result  :', JSON.stringify(result.rows[0]))

    // Test tables existence
    console.log('\nChecking schema tables...')
    const tablesResult = await client.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream_%';
    `)

    const tables = tablesResult.rows.map(r => r.name)
    console.log('  Existing Tables in Database:', tables.length > 0 ? tables.join(', ') : '[No tables created yet]')

    console.log('\n========================================')
    console.log('   ALL TURSO CHECKS PASSED SUCCESSFULLY')
    console.log('========================================\n')
  } catch (err) {
    const elapsed = Date.now() - startTime
    console.error(`\n❌ CONNECTION FAILED (${elapsed} ms):`)
    console.error('  Error Name   :', err.name)
    console.error('  Error Message:', err.message)

    if (err.message && err.message.includes('401')) {
      console.error('\n🔍 TROUBLESHOOTING 401 UNAUTHORIZED:')
      console.error('  1. The TURSO_AUTH_TOKEN in .env may be invalid, expired, or revoked.')
      console.error('  2. Generate a fresh auth token using Turso CLI:')
      console.error('     turso db tokens create data-anjan1')
      console.error('  3. Or verify that the token belongs to database: data-anjan1')
    }

    console.log('\n========================================')
    console.log('   DIAGNOSTIC FINISHED WITH ERRORS')
    console.log('========================================\n')
    process.exit(1)
  }
}

testTursoConnection()
