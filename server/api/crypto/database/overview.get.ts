import { defineEventHandler } from 'h3'
import { getSupabaseAdminClient, isSupabaseConfigured } from '../../../utils/supabase'

export interface CryptoDatabaseSummary {
  totalCandles: number
  totalAssets: number
  pairsWithCandles: number
  minDate: string | null
  maxDate: string | null
  lastSyncedAt: string | null
}

export interface CryptoDatabaseAsset {
  symbol: string
  firstCandleDate: string | null
  lastCandleDate: string | null
  totalCandles: number
  lastSyncedAt: string | null
  syncStatus: string
  latestCandleDate: string | null
  latestOpen: number | null
  latestHigh: number | null
  latestLow: number | null
  latestClose: number | null
  latestVolumeBase: number | null
  latestVolumeQuote: number | null
  latestSource: string | null
}

export interface CryptoDatabaseOverviewResponse {
  success: boolean
  summary: CryptoDatabaseSummary
  assets: CryptoDatabaseAsset[]
  timestamp: number
  error?: string
}

export default defineEventHandler(async (): Promise<CryptoDatabaseOverviewResponse> => {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      summary: {
        totalCandles: 0,
        totalAssets: 0,
        pairsWithCandles: 0,
        minDate: null,
        maxDate: null,
        lastSyncedAt: null
      },
      assets: [],
      timestamp: Date.now(),
      error: 'Supabase credentials are not configured in environment.'
    }
  }

  try {
    const supabase = getSupabaseAdminClient()

    // 1. Fetch summary metrics from database view
    const { data: summaryData, error: summaryError } = await supabase
      .from('crypto_database_summary')
      .select('*')
      .maybeSingle()

    if (summaryError) {
      console.error('[CryptoDatabaseOverview] Error fetching summary view:', summaryError.message)
    }

    // 2. Fetch full assets ledger from database view
    const { data: assetsData, error: assetsError } = await supabase
      .from('crypto_database_assets_overview')
      .select('*')

    if (assetsError) {
      console.error('[CryptoDatabaseOverview] Error fetching assets view:', assetsError.message)
      throw new Error(`Database query failed: ${assetsError.message}`)
    }

    const summary: CryptoDatabaseSummary = {
      totalCandles: Number(summaryData?.total_candles || 0),
      totalAssets: Number(summaryData?.total_metadata || (assetsData?.length ?? 0)),
      pairsWithCandles: Number(summaryData?.pairs_with_candles || assetsData?.filter(a => Number(a.total_candles) > 0).length || 0),
      minDate: summaryData?.min_date || null,
      maxDate: summaryData?.max_date || null,
      lastSyncedAt: summaryData?.last_synced_at || null
    }

    const assets: CryptoDatabaseAsset[] = (assetsData || []).map(row => ({
      symbol: row.symbol,
      firstCandleDate: row.first_candle_date,
      lastCandleDate: row.last_candle_date,
      totalCandles: Number(row.total_candles || 0),
      lastSyncedAt: row.last_synced_at,
      syncStatus: row.sync_status || 'idle',
      latestCandleDate: row.latest_candle_date || null,
      latestOpen: row.latest_open != null ? Number(row.latest_open) : null,
      latestHigh: row.latest_high != null ? Number(row.latest_high) : null,
      latestLow: row.latest_low != null ? Number(row.latest_low) : null,
      latestClose: row.latest_close != null ? Number(row.latest_close) : null,
      latestVolumeBase: row.latest_volume_base != null ? Number(row.latest_volume_base) : null,
      latestVolumeQuote: row.latest_volume_quote != null ? Number(row.latest_volume_quote) : null,
      latestSource: row.latest_source || null
    }))

    return {
      success: true,
      summary,
      assets,
      timestamp: Date.now()
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      summary: {
        totalCandles: 0,
        totalAssets: 0,
        pairsWithCandles: 0,
        minDate: null,
        maxDate: null,
        lastSyncedAt: null
      },
      assets: [],
      timestamp: Date.now(),
      error: message
    }
  }
})
