import { createClient, type Client } from '@libsql/client'

let _client: Client | null = null

export function getTursoClient(): Client {
  if (!_client) {
    const config = useRuntimeConfig()
    const url = config.tursoDatabaseUrl || process.env.TURSO_DATABASE_URL || 'file:turso_security.db'
    const authToken = config.tursoAuthToken || process.env.TURSO_AUTH_TOKEN || undefined

    _client = createClient({
      url,
      authToken: authToken && authToken.trim() !== '' ? authToken.trim() : undefined
    })
  }
  return _client
}

async function safeAddColumn(db: Client, table: string, columnDef: string) {
  try {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${columnDef};`)
  } catch (err: any) {
    // Ignore error if column already exists
    if (!err?.message?.includes('duplicate column') && !err?.message?.includes('already exists')) {
      // ignore silently
    }
  }
}

export async function initTursoSchema(): Promise<void> {
  const db = getTursoClient()

  // 1. Users Table (create if not exists)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      password TEXT,
      salt TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER DEFAULT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  // Safely upgrade existing users table if it existed prior
  await safeAddColumn(db, 'users', 'password_hash TEXT')
  await safeAddColumn(db, 'users', 'salt TEXT')
  await safeAddColumn(db, 'users', 'failed_attempts INTEGER DEFAULT 0')
  await safeAddColumn(db, 'users', 'locked_until INTEGER DEFAULT NULL')
  await safeAddColumn(db, 'users', 'is_active INTEGER DEFAULT 1')

  // 2. Sessions Table (Valid till refresh token validity - 30 days)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_fingerprint TEXT NOT NULL,
      device_name TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      is_revoked INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `)

  // 3. Refresh Tokens Table (Rotation, Family Tracking, and Theft/Replay Detection)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      family_id TEXT,
      is_revoked INTEGER NOT NULL DEFAULT 0,
      replaced_by TEXT DEFAULT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)

  // Safely upgrade existing refresh_tokens table if it existed prior
  await safeAddColumn(db, 'refresh_tokens', 'session_id TEXT')
  await safeAddColumn(db, 'refresh_tokens', 'family_id TEXT')
  await safeAddColumn(db, 'refresh_tokens', 'is_revoked INTEGER DEFAULT 0')
  await safeAddColumn(db, 'refresh_tokens', 'replaced_by TEXT DEFAULT NULL')

  // 4. IP Blacklist Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS blacklist_ips (
      id TEXT PRIMARY KEY,
      ip_address TEXT UNIQUE NOT NULL,
      reason TEXT NOT NULL,
      blocked_by TEXT NOT NULL DEFAULT 'system',
      blocked_at INTEGER NOT NULL,
      expires_at INTEGER DEFAULT NULL
    );
  `)

  // 5. Device Blacklist Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS blacklist_devices (
      id TEXT PRIMARY KEY,
      device_fingerprint TEXT UNIQUE NOT NULL,
      device_name TEXT,
      reason TEXT NOT NULL,
      blocked_by TEXT NOT NULL DEFAULT 'system',
      blocked_at INTEGER NOT NULL,
      expires_at INTEGER DEFAULT NULL
    );
  `)

  // 6. Security Audit Logs Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      event_type TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      device_fingerprint TEXT,
      status TEXT NOT NULL,
      details TEXT,
      created_at INTEGER NOT NULL
    );
  `)

  // 7. User Preferred Market Views Table (max 20 per user)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_market_views (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      symbols TEXT NOT NULL DEFAULT '[]',
      layout TEXT NOT NULL DEFAULT 'ohlcv',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  // Indexes for high-performance parameterized lookups
  try {
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`)
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);`)
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);`)
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);`)
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_blacklist_ips_ip ON blacklist_ips(ip_address);`)
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_blacklist_devices_fp ON blacklist_devices(device_fingerprint);`)
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);`)
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_candles_symbol_date ON historical_candles(symbol, date);`)
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_technical_score ON technical_analysis(overall_score);`)
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_technical_symbol ON technical_analysis(symbol);`)
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_user_market_views_user ON user_market_views(user_id, updated_at DESC);`)
  } catch {
    // Indexes might already exist
  }
}
