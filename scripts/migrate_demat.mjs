import { createClient } from '@libsql/client'
import fs from 'fs'

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf-8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const idx = l.indexOf('=')
      return [l.substring(0, idx).trim(), l.substring(idx + 1).trim()]
    })
)

const db = createClient({
  url: env.TURSO_DATABASE_URL,
  authToken: env.TURSO_AUTH_TOKEN
})

async function migrate() {
  console.log('Migrating Demat accounts schema...')

  // 1. Demat Accounts Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS demat_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      broker_name TEXT NOT NULL,
      account_name TEXT NOT NULL,
      client_id TEXT,
      depository TEXT NOT NULL DEFAULT 'CDSL',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  // 2. Add demat_account_id to portfolio_trades if not present
  try {
    await db.execute(`ALTER TABLE portfolio_trades ADD COLUMN demat_account_id TEXT;`)
  } catch (e) {
    if (!e?.message?.includes('duplicate column') && !e?.message?.includes('already exists')) {
      console.warn('Column add note:', e?.message)
    }
  }

  // 3. Indexes
  try {
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_demat_accounts_user ON demat_accounts(user_id);`)
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_portfolio_trades_demat ON portfolio_trades(demat_account_id);`)
  } catch (e) {
    // ignore
  }

  console.log('Demat accounts migration completed successfully!')
}

migrate().catch(console.error)
