export interface DailyCandleRecord {
  symbol: string
  candle_date: string // YYYY-MM-DD
  open_price: number
  high_price: number
  low_price: number
  close_price: number
  volume_base: number
  volume_quote: number
  source: string
}

export interface CryptoSyncMetadataRow {
  symbol: string
  first_candle_date: string | null
  last_candle_date: string | null
  total_candles: number
  last_synced_at: string | null
  sync_status: 'idle' | 'in_progress' | 'error'
}

export interface SymbolSyncStatus {
  symbol: string
  firstCandleDate: string | null
  lastCandleDate: string | null
  totalCandles: number
  lastSyncedAt: string | null
  pendingDays: number
  isUpToDate: boolean
  syncStatus: string
}

export interface OverallSyncStatus {
  success: boolean
  isSynchronized: boolean
  tablesReady: boolean
  totalTracked: number
  upToDateCount: number
  pendingCount: number
  maxPendingDays: number
  lastSyncedAt: string | null
  error?: string
  assets: SymbolSyncStatus[]
}

export interface SymbolSyncResult {
  symbol: string
  insertedCount: number
  startDate: string
  endDate: string
  success: boolean
  status: 'synced' | 'already_up_to_date' | 'error' | 'skipped'
  error?: string
}

export interface SyncExecutionReport {
  success: boolean
  executionTimeMs: number
  totalInserted: number
  symbolsProcessed: number
  results: SymbolSyncResult[]
  timestamp: number
}

/**
 * Top major high-liquidity crypto assets tracked for historical backfill
 */
export const DEFAULT_TRACKED_CRYPTO_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'LINKUSDT',
  'SUIUSDT'
] as const

export type TrackedCryptoSymbol = (typeof DEFAULT_TRACKED_CRYPTO_SYMBOLS)[number]
