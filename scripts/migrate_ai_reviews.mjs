import { createClient } from '@libsql/client'
import fs from 'node:fs'

function loadEnv() {
  const env = {}
  if (fs.existsSync('.env')) {
    const lines = fs.readFileSync('.env', 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx !== -1) {
        env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
      }
    }
  }
  return env
}

const env = loadEnv()
const db = createClient({
  url: env.TURSO_DATABASE_URL || 'file:turso_security.db',
  authToken: env.TURSO_AUTH_TOKEN
})

async function run() {
  console.log('Running ai_technical_reviews table migration on Turso...')
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ai_technical_reviews (
      symbol TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      current_price REAL NOT NULL,
      ai_score INTEGER NOT NULL,
      ai_rating TEXT NOT NULL,
      confidence TEXT NOT NULL,
      time_horizon TEXT NOT NULL,
      executive_summary TEXT NOT NULL,
      key_strengths TEXT NOT NULL,
      key_risks TEXT NOT NULL,
      technical_levels TEXT NOT NULL,
      trading_tactics TEXT NOT NULL,
      model_used TEXT NOT NULL,
      algorithmic_score REAL NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_ai_reviews_score ON ai_technical_reviews(ai_score);`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_ai_reviews_updated ON ai_technical_reviews(updated_at DESC);`)
  console.log('Migration completed successfully!')
}

run().catch(console.error)
