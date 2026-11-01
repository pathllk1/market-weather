import { defineEventHandler, readBody } from 'h3'
import { executeSmartSync } from '../../../utils/crypto-sync/sync-orchestrator'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{ symbols?: string[], seedDays?: number }>(event).catch(() => ({}))
    const symbols = Array.isArray(body?.symbols) && body.symbols.length > 0 ? body.symbols : undefined
    const seedDays = typeof body?.seedDays === 'number' && body.seedDays > 0 ? body.seedDays : 30

    const report = await executeSmartSync(symbols, seedDays)
    return report
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      executionTimeMs: 0,
      totalInserted: 0,
      symbolsProcessed: 0,
      error: message,
      results: [],
      timestamp: Date.now()
    }
  }
})

