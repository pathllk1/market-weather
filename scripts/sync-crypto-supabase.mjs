import { executeSmartSync } from '../server/utils/crypto-sync/sync-orchestrator.ts'

// Automatically load .env if running locally without injected environment
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env')
  } catch {
    // Environment may be injected by GitHub Actions or Docker
  }
}

async function run() {
  console.log('====================================================')
  console.log(' Supabase Crypto Smart-Sync & Backfill Headless Task')
  console.log('====================================================')

  const url = process.env.SUPABASE_URL
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !secretKey) {
    console.error('[SyncEngine] ❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
    process.exit(1)
  }

  console.log(`[SyncEngine] Target Supabase Instance: ${url}`)
  console.log(`[SyncEngine] Time: ${new Date().toISOString()}`)

  try {
    const report = await executeSmartSync()

    console.log(`[SyncEngine] Execution completed in ${report.executionTimeMs}ms`)
    console.log(`[SyncEngine] Total Candles Inserted: ${report.totalInserted}`)
    console.log(`[SyncEngine] Assets Processed: ${report.symbolsProcessed}`)

    for (const r of report.results) {
      const statusIcon = r.status === 'synced' ? '✅' : r.status === 'already_up_to_date' ? '⏸️' : '⚠️'
      console.log(`  ${statusIcon} ${r.symbol}: ${r.status} (${r.insertedCount} candles, range: ${r.startDate || 'N/A'} -> ${r.endDate || 'N/A'})`)
    }

    if (!report.success) {
      console.error('[SyncEngine] Sync finished with errors.')
      process.exit(1)
    }

    console.log('[SyncEngine] All assets successfully synchronized.')
  } catch (err) {
    console.error('[SyncEngine] Fatal error during sync execution:', err)
    process.exit(1)
  }
}

run()

