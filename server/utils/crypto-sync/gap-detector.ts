export interface SyncGapCalculation {
  symbol: string
  needsSync: boolean
  lastCandleDate: string | null
  startDate: string
  endDate: string
  startTimeMs: number
  endTimeMs: number
  pendingDays: number
  isInitialSeed: boolean
}

/**
 * Calculates the exact missing date range for a given symbol
 * @param symbol The asset symbol (e.g. BTCUSDT)
 * @param lastCandleDate The latest recorded candle date in Supabase (YYYY-MM-DD or null)
 * @param defaultSeedDays Default days to backfill on a fresh database (default: 30)
 */
export function calculateSymbolSyncGap(
  symbol: string,
  lastCandleDate: string | null,
  defaultSeedDays = 30
): SyncGapCalculation {
  // Today at 00:00:00.000 UTC
  const now = new Date()
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const todayIso = todayUtc.toISOString().split('T')[0] ?? ''

  // Case 1: Fresh Database / Never Synced
  if (!lastCandleDate) {
    const seedStartUtc = new Date(todayUtc.getTime() - defaultSeedDays * 86400 * 1000)
    const seedStartIso = seedStartUtc.toISOString().split('T')[0] ?? ''

    return {
      symbol,
      needsSync: true,
      lastCandleDate: null,
      startDate: seedStartIso,
      endDate: todayIso,
      startTimeMs: seedStartUtc.getTime(),
      endTimeMs: todayUtc.getTime(),
      pendingDays: defaultSeedDays,
      isInitialSeed: true
    }
  }

  // Case 2: Existing History in Database
  const lastDateUtc = new Date(`${lastCandleDate}T00:00:00.000Z`)
  const nextMissingDateUtc = new Date(lastDateUtc.getTime() + 86400 * 1000)
  const nextMissingDateIso = nextMissingDateUtc.toISOString().split('T')[0] ?? ''

  // If next missing date is >= today, we already have yesterday's closed candle
  if (nextMissingDateUtc >= todayUtc) {
    return {
      symbol,
      needsSync: false,
      lastCandleDate,
      startDate: nextMissingDateIso,
      endDate: todayIso,
      startTimeMs: nextMissingDateUtc.getTime(),
      endTimeMs: todayUtc.getTime(),
      pendingDays: 0,
      isInitialSeed: false
    }
  }

  // Calculate missing days gap
  const diffMs = todayUtc.getTime() - lastDateUtc.getTime()
  const pendingDays = Math.max(1, Math.floor(diffMs / (86400 * 1000)))

  return {
    symbol,
    needsSync: true,
    lastCandleDate,
    startDate: nextMissingDateIso,
    endDate: todayIso,
    startTimeMs: nextMissingDateUtc.getTime(),
    endTimeMs: todayUtc.getTime(),
    pendingDays,
    isInitialSeed: false
  }
}
