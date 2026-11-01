import { getSupabaseAdminClient, isSupabaseConfigured } from '../supabase'
import {
  DEFAULT_TRACKED_CRYPTO_SYMBOLS,
  type DailyCandleRecord,
  type OverallSyncStatus,
  type SymbolSyncResult,
  type SymbolSyncStatus,
  type SyncExecutionReport
} from './types'
import { calculateSymbolSyncGap } from './gap-detector'
import { fetchHistoricalDailyCandles } from './binance-fetcher'

/**
 * Inspect the current synchronization status across all tracked crypto assets.
 * PURE READ-ONLY OPERATION: Performs zero database writes.
 */
export async function getOverallSyncStatus(): Promise<OverallSyncStatus> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      isSynchronized: false,
      tablesReady: false,
      totalTracked: DEFAULT_TRACKED_CRYPTO_SYMBOLS.length,
      upToDateCount: 0,
      pendingCount: DEFAULT_TRACKED_CRYPTO_SYMBOLS.length,
      maxPendingDays: 30,
      lastSyncedAt: null,
      error: 'Supabase credentials not configured in environment',
      assets: DEFAULT_TRACKED_CRYPTO_SYMBOLS.map(symbol => ({
        symbol,
        firstCandleDate: null,
        lastCandleDate: null,
        totalCandles: 0,
        lastSyncedAt: null,
        pendingDays: 30,
        isUpToDate: false,
        syncStatus: 'unconfigured'
      }))
    }
  }

  const supabase = getSupabaseAdminClient()

  // 1. Fetch metadata rows for all tracked symbols in a single query
  const { data: metadataRows, error } = await supabase
    .from('crypto_sync_metadata')
    .select('symbol, first_candle_date, last_candle_date, total_candles, last_synced_at, sync_status')
    .order('total_candles', { ascending: false })

  if (error) {
    if (error.code === 'PGRST205' || error.code === '42501') {
      const isPerm = error.code === '42501'
      const hint = isPerm
        ? 'Supabase table permissions missing. Run GRANT script in Supabase SQL editor.'
        : 'Supabase tables not found. Run migration SQL in Supabase SQL editor.'
      console.warn(`[SyncOrchestrator] ℹ️ ${hint}`)

      return {
        success: true,
        isSynchronized: false,
        tablesReady: false,
        totalTracked: DEFAULT_TRACKED_CRYPTO_SYMBOLS.length,
        upToDateCount: 0,
        pendingCount: DEFAULT_TRACKED_CRYPTO_SYMBOLS.length,
        maxPendingDays: 30,
        lastSyncedAt: null,
        error: isPerm ? 'Permission denied: Please run GRANT script in Supabase SQL editor.' : 'Tables not found in Supabase.',
        assets: DEFAULT_TRACKED_CRYPTO_SYMBOLS.map(symbol => ({
          symbol,
          firstCandleDate: null,
          lastCandleDate: null,
          totalCandles: 0,
          lastSyncedAt: null,
          pendingDays: 30,
          isUpToDate: false,
          syncStatus: isPerm ? 'permission_denied' : 'table_missing'
        }))
      }
    }
    console.error('[SyncOrchestrator] Error fetching metadata:', error.message)
  }

  const metaMap = new Map<string, {
    first_candle_date: string | null
    last_candle_date: string | null
    total_candles: number
    last_synced_at: string | null
    sync_status: string
  }>()

  if (Array.isArray(metadataRows)) {
    for (const row of metadataRows) {
      metaMap.set(row.symbol, {
        first_candle_date: row.first_candle_date,
        last_candle_date: row.last_candle_date,
        total_candles: Number(row.total_candles || 0),
        last_synced_at: row.last_synced_at,
        sync_status: row.sync_status || 'idle'
      })
    }
  }

  const assetStatuses: SymbolSyncStatus[] = []
  let upToDateCount = 0
  let pendingCount = 0
  let maxPendingDays = 0
  let latestSyncTimestamp: string | null = null

  const allSymbols = Array.from(new Set([
    ...DEFAULT_TRACKED_CRYPTO_SYMBOLS,
    ...metaMap.keys()
  ]))

  for (const symbol of allSymbols) {
    const meta = metaMap.get(symbol)
    const gap = calculateSymbolSyncGap(symbol, meta?.last_candle_date ?? null)

    if (gap.needsSync) {
      pendingCount++
      if (gap.pendingDays > maxPendingDays) {
        maxPendingDays = gap.pendingDays
      }
    } else {
      upToDateCount++
    }

    if (meta?.last_synced_at) {
      if (!latestSyncTimestamp || meta.last_synced_at > latestSyncTimestamp) {
        latestSyncTimestamp = meta.last_synced_at
      }
    }

    assetStatuses.push({
      symbol,
      firstCandleDate: meta?.first_candle_date ?? null,
      lastCandleDate: meta?.last_candle_date ?? null,
      totalCandles: meta?.total_candles ?? 0,
      lastSyncedAt: meta?.last_synced_at ?? null,
      pendingDays: gap.pendingDays,
      isUpToDate: !gap.needsSync,
      syncStatus: meta?.sync_status ?? 'idle'
    })
  }

  const isSynchronized = pendingCount === 0 && upToDateCount === allSymbols.length

  return {
    success: true,
    isSynchronized,
    tablesReady: true,
    totalTracked: allSymbols.length,
    upToDateCount,
    pendingCount,
    maxPendingDays,
    lastSyncedAt: latestSyncTimestamp,
    assets: assetStatuses
  }
}

/**
 * Execute smart-sync and backfill missing daily candles into Supabase.
 * NOTE: Only called on explicit user action (e.g. UI click or cron).
 */
export async function executeSmartSync(
  symbols: string[] = [...DEFAULT_TRACKED_CRYPTO_SYMBOLS],
  defaultSeedDays = 30
): Promise<SyncExecutionReport> {
  const startTime = Date.now()
  if (!isSupabaseConfigured()) {
    throw new Error('[SyncOrchestrator] Supabase is not configured. Aborting sync.')
  }

  const supabase = getSupabaseAdminClient()
  const results: SymbolSyncResult[] = []
  let totalInserted = 0

  for (const symbol of symbols) {
    try {
      // 1. Fetch latest state for this symbol
      const { data: meta } = await supabase
        .from('crypto_sync_metadata')
        .select('first_candle_date, last_candle_date, total_candles')
        .eq('symbol', symbol)
        .maybeSingle()

      const gap = calculateSymbolSyncGap(symbol, meta?.last_candle_date ?? null, defaultSeedDays)

      if (!gap.needsSync) {
        results.push({
          symbol,
          insertedCount: 0,
          startDate: gap.startDate,
          endDate: gap.endDate,
          success: true,
          status: 'already_up_to_date'
        })
        continue
      }

      // Mark metadata status as in_progress
      await supabase
        .from('crypto_sync_metadata')
        .upsert({
          symbol,
          sync_status: 'in_progress',
          last_synced_at: new Date().toISOString()
        })

      // 2. Fetch missing slice
      const candles = await fetchHistoricalDailyCandles(symbol, gap.startTimeMs, gap.endTimeMs)

      if (candles.length === 0) {
        await supabase
          .from('crypto_sync_metadata')
          .update({ sync_status: 'idle' })
          .eq('symbol', symbol)

        results.push({
          symbol,
          insertedCount: 0,
          startDate: gap.startDate,
          endDate: gap.endDate,
          success: true,
          status: 'skipped',
          error: 'No candle records returned from exchange data feeds'
        })
        continue
      }

      // 3. Idempotent batch upsert into Supabase (composite unique key handles conflict)
      const { error: upsertError } = await supabase
        .from('crypto_daily_ohlcv')
        .upsert(candles, { onConflict: 'symbol,candle_date' })

      if (upsertError) {
        throw new Error(`Supabase upsert error: ${upsertError.message}`)
      }

      totalInserted += candles.length

      // 4. Update metadata record
      const sortedDates = candles.map(c => c.candle_date).sort()
      const newestDate = sortedDates[sortedDates.length - 1] ?? gap.endDate
      const oldestDate = sortedDates[0] ?? gap.startDate
      const previousTotal = Number(meta?.total_candles || 0)
      const firstEverDate = meta?.first_candle_date || oldestDate

      await supabase
        .from('crypto_sync_metadata')
        .upsert({
          symbol,
          first_candle_date: firstEverDate,
          last_candle_date: newestDate,
          total_candles: previousTotal + candles.length,
          last_synced_at: new Date().toISOString(),
          sync_status: 'idle'
        })

      results.push({
        symbol,
        insertedCount: candles.length,
        startDate: oldestDate,
        endDate: newestDate,
        success: true,
        status: 'synced'
      })
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error(`[SyncOrchestrator] Sync failed for ${symbol}:`, errorMsg)

      // Revert status to error in metadata
      try {
        await supabase
          .from('crypto_sync_metadata')
          .upsert({
            symbol,
            sync_status: 'error',
            last_synced_at: new Date().toISOString()
          })
      } catch {
        // Silently ignore secondary metadata write failure
      }

      results.push({
        symbol,
        insertedCount: 0,
        startDate: '',
        endDate: '',
        success: false,
        status: 'error',
        error: errorMsg
      })
    }
  }

  const executionTimeMs = Date.now() - startTime

  return {
    success: results.some(r => r.success),
    executionTimeMs,
    totalInserted,
    symbolsProcessed: symbols.length,
    results,
    timestamp: Date.now()
  }
}

/**
 * Retrieve stored historical daily candles for charts or backtesting
 */
export async function getHistoricalCandlesFromSupabase(
  symbol: string,
  limitDays = 30
): Promise<DailyCandleRecord[]> {
  if (!isSupabaseConfigured()) {
    return []
  }

  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('crypto_daily_ohlcv')
    .select('symbol, candle_date, open_price, high_price, low_price, close_price, volume_base, volume_quote, source')
    .eq('symbol', symbol)
    .order('candle_date', { ascending: false })
    .limit(limitDays)

  if (error || !Array.isArray(data)) {
    return []
  }

  // Reverse to chronological order (oldest to newest)
  return data.reverse() as DailyCandleRecord[]
}
