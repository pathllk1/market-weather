import { defineEventHandler, readBody, getHeader, createError } from 'h3'
import { executeSmartSync } from '../../../utils/crypto-sync/sync-orchestrator'

interface TriggerBody {
  symbols?: string[]
  seedDays?: number
}

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'x-sync-secret')
  const cronSecret = process.env.CRON_SECRET
  const isAdmin = event.context.user?.role === 'admin'

  // Only users with admin role or callers with valid CRON_SECRET can trigger sync
  if (!isAdmin && (!cronSecret || authHeader !== cronSecret)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden: Administrator clearance or valid sync secret required to initiate backfill'
    })
  }

  try {
    const body = ((await readBody(event).catch(() => null)) || {}) as TriggerBody
    const symbols = Array.isArray(body.symbols) && body.symbols.length > 0 ? body.symbols : undefined
    const seedDays = typeof body.seedDays === 'number' && body.seedDays > 0 ? body.seedDays : 30

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
