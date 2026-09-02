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
  console.log('Migrating portfolio tables...')

  await db.execute(`
    CREATE TABLE IF NOT EXISTS portfolios (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      benchmark_symbol TEXT NOT NULL DEFAULT '^NSEI',
      cost_method TEXT NOT NULL DEFAULT 'FIFO',
      currency TEXT NOT NULL DEFAULT 'INR',
      is_paper_trading INTEGER NOT NULL DEFAULT 0,
      initial_capital REAL NOT NULL DEFAULT 1000000,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS portfolio_trades (
      id TEXT PRIMARY KEY,
      portfolio_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      trade_type TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      quantity REAL NOT NULL,
      price_per_share REAL NOT NULL,
      brokerage REAL NOT NULL DEFAULT 0,
      stt REAL NOT NULL DEFAULT 0,
      exchange_charges REAL NOT NULL DEFAULT 0,
      gst REAL NOT NULL DEFAULT 0,
      sebi_fee REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS portfolio_targets (
      id TEXT PRIMARY KEY,
      portfolio_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      target_price REAL,
      stop_loss REAL,
      target_notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS portfolio_alerts (
      id TEXT PRIMARY KEY,
      portfolio_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      symbol TEXT NOT NULL,
      condition_type TEXT NOT NULL,
      threshold_value REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_triggered_at INTEGER DEFAULT NULL,
      created_at INTEGER NOT NULL
    );
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS portfolio_dividends (
      id TEXT PRIMARY KEY,
      portfolio_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      dividend_date TEXT NOT NULL,
      dividend_per_share REAL NOT NULL,
      total_credit REAL NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL
    );
  `)

  try {
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_portfolios_user ON portfolios(user_id, updated_at DESC);`)
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_portfolio_trades_port ON portfolio_trades(portfolio_id, trade_date ASC);`)
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_portfolio_trades_sym ON portfolio_trades(symbol);`)
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_portfolio_targets_port ON portfolio_targets(portfolio_id, symbol);`)
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_portfolio_alerts_port ON portfolio_alerts(portfolio_id, is_active);`)
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_portfolio_dividends_port ON portfolio_dividends(portfolio_id, dividend_date DESC);`)
  } catch (err) {
    console.warn('Index error:', err)
  }

  console.log('Portfolio migration completed successfully!')
}

migrate().catch(console.error)
