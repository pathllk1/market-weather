import { defineEventHandler } from 'h3'
import { getOverallSyncStatus } from '../../../utils/crypto-sync/sync-orchestrator'

export default defineEventHandler(async () => {
  try {
    const status = await getOverallSyncStatus()
    return status
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      isSynchronized: false,
      totalTracked: 0,
      upToDateCount: 0,
      pendingCount: 0,
      maxPendingDays: 0,
      lastSyncedAt: null,
      error: message,
      assets: []
    }
  }
})

