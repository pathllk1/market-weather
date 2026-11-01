<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  tickers?: Array<{ symbol: string, baseAsset?: string, quoteAsset?: string, name?: string }>
}>()

interface AssetStatus {
  symbol: string
  firstCandleDate: string | null
  lastCandleDate: string | null
  totalCandles: number
  lastSyncedAt: string | null
  pendingDays: number
  isUpToDate: boolean
  syncStatus: string
}

interface OverallStatus {
  success: boolean
  isSynchronized: boolean
  tablesReady?: boolean
  totalTracked: number
  upToDateCount: number
  pendingCount: number
  maxPendingDays: number
  lastSyncedAt: string | null
  error?: string
  assets: AssetStatus[]
}

interface BatchLogItem {
  id: number
  time: string
  symbol: string
  status: 'synced' | 'up_to_date' | 'error' | 'info'
  message: string
}

const status = ref<OverallStatus | null>(null)
const isLoadingStatus = ref(true)
const showModal = ref(false)
const activeTab = ref<'sync' | 'inspect' | 'schema'>('sync')
const copied = ref(false)

// Batch Queue State
const batchScope = ref<'top25' | 'top50' | 'top100' | 'all' | 'custom'>('top50')
const delayMs = ref(200)
const isQueueRunning = ref(false)
const isPaused = ref(false)
const queue = ref<string[]>([])
const currentIndex = ref(0)
const currentSymbol = ref('')
const syncedCoinsCount = ref(0)
const upToDateCoinsCount = ref(0)
const failedCoinsCount = ref(0)
const totalCandlesInserted = ref(0)
const batchLogs = ref<BatchLogItem[]>([])

const availableSymbols = computed(() => {
  if (Array.isArray(props.tickers) && props.tickers.length > 0) {
    return props.tickers.map(t => t.symbol)
  }
  return [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT',
    'AVAXUSDT', 'LINKUSDT', 'SUIUSDT', 'PEPEUSDT', 'SHIBUSDT', 'NEARUSDT', 'LTCUSDT',
    'BCHUSDT', 'UNIUSDT', 'APTUSDT', 'FETUSDT', 'DOTUSDT', 'TRXUSDT', 'POLUSDT',
    'RENDERUSDT', 'TAOUSDT', 'INJUSDT', 'ICPUSDT'
  ]
})

const progressPercent = computed(() => {
  if (queue.value.length === 0) return 0
  return Math.min(100, Math.round((currentIndex.value / queue.value.length) * 100))
})

const migrationSql = `-- 1. Crypto Daily OHLCV Table
CREATE TABLE IF NOT EXISTS public.crypto_daily_ohlcv (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    candle_date DATE NOT NULL,
    open_price NUMERIC(20, 8) NOT NULL,
    high_price NUMERIC(20, 8) NOT NULL,
    low_price NUMERIC(20, 8) NOT NULL,
    close_price NUMERIC(20, 8) NOT NULL,
    volume_base NUMERIC(24, 8) NOT NULL,
    volume_quote NUMERIC(24, 8) NOT NULL,
    source VARCHAR(30) DEFAULT 'binance_vision',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_symbol_candle_date UNIQUE (symbol, candle_date)
);

CREATE INDEX IF NOT EXISTS idx_crypto_ohlcv_symbol_date 
ON public.crypto_daily_ohlcv (symbol, candle_date DESC);

-- 2. Crypto Sync Metadata Table
CREATE TABLE IF NOT EXISTS public.crypto_sync_metadata (
    symbol VARCHAR(20) PRIMARY KEY,
    first_candle_date DATE,
    last_candle_date DATE,
    total_candles INTEGER DEFAULT 0,
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    sync_status VARCHAR(20) DEFAULT 'idle'
);

-- 3. Table Permissions & Grants
GRANT ALL ON TABLE public.crypto_daily_ohlcv TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.crypto_sync_metadata TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 4. Row Level Security
ALTER TABLE public.crypto_daily_ohlcv ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_sync_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on crypto_daily_ohlcv" 
ON public.crypto_daily_ohlcv FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow public read on crypto_sync_metadata" 
ON public.crypto_sync_metadata FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow service_role full access on crypto_daily_ohlcv" 
ON public.crypto_daily_ohlcv FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service_role full access on crypto_sync_metadata" 
ON public.crypto_sync_metadata FOR ALL TO service_role USING (true) WITH CHECK (true);`

async function fetchStatus() {
  try {
    isLoadingStatus.value = true
    const res = await $fetch<OverallStatus>('/api/crypto/sync/status')
    status.value = res
  } catch (err) {
    console.warn('[CryptoSyncBar] Failed to fetch sync status:', err)
  } finally {
    isLoadingStatus.value = false
  }
}

function addLog(symbol: string, itemStatus: 'synced' | 'up_to_date' | 'error' | 'info', message: string) {
  const time = new Date().toLocaleTimeString()
  batchLogs.value.unshift({
    id: Date.now() + Math.random(),
    time,
    symbol,
    status: itemStatus,
    message
  })
  if (batchLogs.value.length > 50) {
    batchLogs.value.pop()
  }
}

function prepareQueue(): string[] {
  const all = availableSymbols.value
  if (batchScope.value === 'top25') return all.slice(0, 25)
  if (batchScope.value === 'top50') return all.slice(0, 50)
  if (batchScope.value === 'top100') return all.slice(0, 100)
  return all
}

async function startBatchSync() {
  if (isQueueRunning.value) return

  queue.value = prepareQueue()
  currentIndex.value = 0
  currentSymbol.value = queue.value[0] || ''
  syncedCoinsCount.value = 0
  upToDateCoinsCount.value = 0
  failedCoinsCount.value = 0
  totalCandlesInserted.value = 0
  batchLogs.value = []
  isQueueRunning.value = true
  isPaused.value = false

  addLog('QUEUE', 'info', `Initialized batch queue: ${queue.value.length} assets queued with ${delayMs.value}ms pacing delay`)

  while (currentIndex.value < queue.value.length) {
    if (!isQueueRunning.value) {
      addLog('QUEUE', 'info', 'Batch sync stopped by user')
      break
    }

    while (isPaused.value && isQueueRunning.value) {
      await new Promise(r => setTimeout(r, 200))
    }
    if (!isQueueRunning.value) break

    const symbol = queue.value[currentIndex.value]
    if (!symbol) break
    currentSymbol.value = symbol

    try {
      const res = await $fetch<{
        success: boolean
        totalInserted: number
        symbolsProcessed: number
        results: Array<{
          symbol: string
          insertedCount: number
          status: 'synced' | 'already_up_to_date' | 'error' | 'skipped'
          error?: string
        }>
      }>('/api/crypto/sync/trigger', {
        method: 'POST',
        body: { symbols: [symbol], seedDays: 30 }
      })

      const item = res.results?.[0]
      if (item?.status === 'synced') {
        syncedCoinsCount.value++
        totalCandlesInserted.value += (item.insertedCount || 0)
        addLog(symbol, 'synced', `Synced ${item.insertedCount} daily candles into Supabase`)
      } else if (item?.status === 'already_up_to_date') {
        upToDateCoinsCount.value++
        addLog(symbol, 'up_to_date', 'Already up to date (0 new candles)')
      } else {
        failedCoinsCount.value++
        addLog(symbol, 'error', item?.error || 'Failed to sync')
      }
    } catch (err: unknown) {
      failedCoinsCount.value++
      const msg = err instanceof Error ? err.message : String(err)
      addLog(symbol, 'error', msg)
    }

    currentIndex.value++

    if (delayMs.value > 0 && currentIndex.value < queue.value.length) {
      await new Promise(r => setTimeout(r, delayMs.value))
    }
  }

  isQueueRunning.value = false
  currentSymbol.value = ''
  addLog('COMPLETE', 'info', `Batch complete! Processed ${currentIndex.value} coins, inserted ${totalCandlesInserted.value} total candles`)
  await fetchStatus()
}

function togglePauseQueue() {
  isPaused.value = !isPaused.value
  addLog('QUEUE', 'info', isPaused.value ? 'Batch paused by user' : 'Batch resumed')
}

function stopQueue() {
  isQueueRunning.value = false
  isPaused.value = false
  fetchStatus()
}

async function copySql() {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(migrationSql)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2500)
  }
}

onMounted(() => {
  fetchStatus()
})

onUnmounted(() => {
  isQueueRunning.value = false
})
</script>

<template>
  <div class="relative flex items-center">
    <!-- Trigger Button -->
    <div class="flex items-center gap-1.5">
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer"
        :class="[
          isQueueRunning ? 'bg-indigo-600 text-white animate-pulse'
          : status?.tablesReady === false ? 'bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100'
            : status?.isSynchronized ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 hover:shadow-sm'
        ]"
        :title="status?.tablesReady === false ? 'Supabase tables missing. Click to view SQL' : 'Open Supabase Smart-Sync Batch Engine'"
        @click="showModal = true"
      >
        <UIcon
          v-if="isQueueRunning"
          name="i-lucide-loader-2"
          class="w-3.5 h-3.5 animate-spin"
        />
        <UIcon
          v-else-if="status?.tablesReady === false"
          name="i-lucide-alert-circle"
          class="w-3.5 h-3.5 text-amber-600"
        />
        <UIcon
          v-else-if="status?.isSynchronized"
          name="i-lucide-database"
          class="w-3.5 h-3.5 text-emerald-600"
        />
        <UIcon
          v-else
          name="i-lucide-database-zap"
          class="w-3.5 h-3.5"
        />

        <span>
          <template v-if="isQueueRunning">
            Syncing: {{ currentSymbol }} ({{ progressPercent }}%)
          </template>
          <template v-else-if="status?.tablesReady === false">
            Setup Supabase Tables
          </template>
          <template v-else-if="status?.isSynchronized">
            Supabase Synced ({{ status.totalTracked }})
          </template>
          <template v-else>
            Sync Supabase ({{ status?.totalTracked || 10 }} Tracked)
          </template>
        </span>
      </button>
    </div>

    <!-- Smart Batch Sync & Inspection Modal -->
    <Teleport to="body">
      <div
        v-if="showModal"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
        @click.self="isQueueRunning ? null : (showModal = false)"
      >
        <div class="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <!-- Modal Header -->
          <div class="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/70">
            <div class="flex items-center gap-2.5">
              <div class="p-2 rounded-xl bg-blue-600 text-white shadow-xs">
                <UIcon
                  name="i-lucide-database"
                  class="w-5 h-5"
                />
              </div>
              <div>
                <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Supabase Smart-Sync Batch Engine</span>
                  <span
                    v-if="isQueueRunning"
                    class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 animate-pulse"
                  >
                    {{ isPaused ? 'Paused' : 'Running' }}
                  </span>
                  <span
                    v-else-if="status?.isSynchronized"
                    class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700"
                  >
                    {{ status.totalTracked }} Synced
                  </span>
                </h3>
                <p class="text-xs text-slate-500">
                  Rate-limited client batching with gap detection and zero server overload
                </p>
              </div>
            </div>

            <!-- Tab Buttons -->
            <div class="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl text-xs font-semibold">
              <button
                class="px-2.5 py-1 rounded-lg transition-all"
                :class="activeTab === 'sync' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'"
                @click="activeTab = 'sync'"
              >
                Batch Runner
              </button>
              <button
                class="px-2.5 py-1 rounded-lg transition-all"
                :class="activeTab === 'inspect' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'"
                @click="activeTab = 'inspect'"
              >
                Database ({{ status?.totalTracked || 0 }})
              </button>
              <button
                class="px-2.5 py-1 rounded-lg transition-all"
                :class="activeTab === 'schema' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'"
                @click="activeTab = 'schema'"
              >
                SQL Setup
              </button>
              <button
                class="p-1 rounded-lg text-slate-400 hover:text-slate-600 ml-1"
                @click="showModal = false"
              >
                <UIcon
                  name="i-lucide-x"
                  class="w-4 h-4"
                />
              </button>
            </div>
          </div>

          <!-- Modal Body Content -->
          <div class="p-5 overflow-y-auto space-y-4 flex-1">
            <!-- TAB 1: BATCH RUNNER -->
            <div
              v-if="activeTab === 'sync'"
              class="space-y-4"
            >
              <!-- Scope Selection (When Idle) -->
              <div
                v-if="!isQueueRunning && currentIndex === 0"
                class="space-y-3"
              >
                <label class="block text-xs font-bold text-slate-700">Select Batch Scope to Synchronize:</label>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    class="p-3 rounded-xl border text-left transition-all cursor-pointer"
                    :class="batchScope === 'top25' ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20' : 'border-slate-200 hover:bg-slate-50'"
                    @click="batchScope = 'top25'"
                  >
                    <div class="text-xs font-bold text-slate-900">
                      Top 25 Volume
                    </div>
                    <div class="text-[11px] text-slate-500">
                      ~5-8 sec sync
                    </div>
                  </button>
                  <button
                    class="p-3 rounded-xl border text-left transition-all cursor-pointer"
                    :class="batchScope === 'top50' ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20' : 'border-slate-200 hover:bg-slate-50'"
                    @click="batchScope = 'top50'"
                  >
                    <div class="text-xs font-bold text-slate-900">
                      Top 50 Volume
                    </div>
                    <div class="text-[11px] text-slate-500">
                      Recommended
                    </div>
                  </button>
                  <button
                    class="p-3 rounded-xl border text-left transition-all cursor-pointer"
                    :class="batchScope === 'top100' ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20' : 'border-slate-200 hover:bg-slate-50'"
                    @click="batchScope = 'top100'"
                  >
                    <div class="text-xs font-bold text-slate-900">
                      Top 100 Volume
                    </div>
                    <div class="text-[11px] text-slate-500">
                      ~25-30 sec
                    </div>
                  </button>
                  <button
                    class="p-3 rounded-xl border text-left transition-all cursor-pointer"
                    :class="batchScope === 'all' ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20' : 'border-slate-200 hover:bg-slate-50'"
                    @click="batchScope = 'all'"
                  >
                    <div class="text-xs font-bold text-slate-900">
                      All Cryptos
                    </div>
                    <div class="text-[11px] text-slate-500">
                      {{ availableSymbols.length }} pairs
                    </div>
                  </button>
                </div>

                <!-- Pace Control -->
                <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                  <div>
                    <span class="font-bold text-slate-700">Pacing Delay: </span>
                    <span class="text-slate-500">{{ delayMs }}ms per request (prevents 429 rate limit)</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <button
                      class="px-2 py-1 rounded bg-white border border-slate-200 text-xs font-semibold hover:bg-slate-100"
                      :class="delayMs === 100 ? 'border-blue-500 text-blue-600' : ''"
                      @click="delayMs = 100"
                    >
                      Fast (100ms)
                    </button>
                    <button
                      class="px-2 py-1 rounded bg-white border border-slate-200 text-xs font-semibold hover:bg-slate-100"
                      :class="delayMs === 200 ? 'border-blue-500 text-blue-600' : ''"
                      @click="delayMs = 200"
                    >
                      Normal (200ms)
                    </button>
                    <button
                      class="px-2 py-1 rounded bg-white border border-slate-200 text-xs font-semibold hover:bg-slate-100"
                      :class="delayMs === 400 ? 'border-blue-500 text-blue-600' : ''"
                      @click="delayMs = 400"
                    >
                      Safe (400ms)
                    </button>
                  </div>
                </div>
              </div>

              <!-- Real-time Progress Bar & Status (When running or has progress) -->
              <div
                v-if="isQueueRunning || currentIndex > 0"
                class="space-y-3"
              >
                <!-- Top Status Banner -->
                <div class="flex items-center justify-between text-xs">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-slate-900">
                      {{ isQueueRunning ? `Syncing ${currentSymbol}...` : 'Batch Finished' }}
                    </span>
                    <span class="text-slate-500">({{ currentIndex }} / {{ queue.length }})</span>
                  </div>
                  <span class="font-black text-blue-600 text-sm">{{ progressPercent }}%</span>
                </div>

                <!-- Progress Bar -->
                <div class="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
                  <div
                    class="h-full bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 transition-all duration-300"
                    :style="{ width: `${progressPercent}%` }"
                  />
                </div>

                <!-- 4 Live Counters -->
                <div class="grid grid-cols-4 gap-2 text-center text-xs">
                  <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div class="text-slate-400 text-[10px] uppercase font-bold">
                      Processed
                    </div>
                    <div class="text-sm font-black text-slate-900">
                      {{ currentIndex }} / {{ queue.length }}
                    </div>
                  </div>
                  <div class="p-2.5 bg-emerald-50 rounded-xl border border-emerald-100">
                    <div class="text-emerald-600 text-[10px] uppercase font-bold">
                      Newly Synced
                    </div>
                    <div class="text-sm font-black text-emerald-700">
                      {{ syncedCoinsCount }}
                    </div>
                  </div>
                  <div class="p-2.5 bg-blue-50 rounded-xl border border-blue-100">
                    <div class="text-blue-600 text-[10px] uppercase font-bold">
                      Up To Date
                    </div>
                    <div class="text-sm font-black text-blue-700">
                      {{ upToDateCoinsCount }}
                    </div>
                  </div>
                  <div class="p-2.5 bg-purple-50 rounded-xl border border-purple-100">
                    <div class="text-purple-600 text-[10px] uppercase font-bold">
                      Total Candles
                    </div>
                    <div class="text-sm font-black text-purple-700">
                      {{ totalCandlesInserted }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Terminal-style Live Feed Logs -->
              <div class="space-y-1.5">
                <div class="flex items-center justify-between text-xs font-bold text-slate-600">
                  <span>Live Execution Feed:</span>
                  <span class="text-[10px] text-slate-400">{{ batchLogs.length }} events</span>
                </div>
                <div class="bg-slate-950 text-slate-200 p-3 rounded-xl font-mono text-[11px] h-48 overflow-y-auto space-y-1 border border-slate-800">
                  <div
                    v-if="batchLogs.length === 0"
                    class="text-slate-500 italic py-8 text-center"
                  >
                    Queue is ready. Select batch scope and click "Start Batch Sync".
                  </div>
                  <div
                    v-for="log in batchLogs"
                    :key="log.id"
                    class="flex items-start gap-2 leading-relaxed"
                  >
                    <span class="text-slate-500 text-[10px]">[{{ log.time }}]</span>
                    <span
                      class="font-bold shrink-0"
                      :class="log.status === 'synced' ? 'text-emerald-400' : log.status === 'up_to_date' ? 'text-blue-400' : log.status === 'error' ? 'text-rose-400' : 'text-amber-400'"
                    >
                      {{ log.symbol }}:
                    </span>
                    <span class="text-slate-300">{{ log.message }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- TAB 2: DATABASE INSPECTION -->
            <div
              v-else-if="activeTab === 'inspect'"
              class="space-y-3"
            >
              <div class="flex items-center justify-between">
                <h4 class="text-xs font-bold text-slate-800">
                  Stored Supabase Assets ({{ status?.totalTracked || 0 }} tracked)
                </h4>
                <button
                  class="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  @click="fetchStatus"
                >
                  <UIcon
                    name="i-lucide-refresh-cw"
                    class="w-3 h-3"
                  /> Refresh Table
                </button>
              </div>

              <div class="max-h-80 overflow-y-auto rounded-xl border border-slate-200">
                <table class="w-full text-xs text-left">
                  <thead class="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 sticky top-0">
                    <tr>
                      <th class="p-2">
                        Symbol
                      </th>
                      <th class="p-2">
                        First Candle
                      </th>
                      <th class="p-2">
                        Latest Candle
                      </th>
                      <th class="p-2">
                        Total Candles
                      </th>
                      <th class="p-2 text-right">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 text-slate-700">
                    <tr
                      v-for="asset in status?.assets || []"
                      :key="asset.symbol"
                      class="hover:bg-slate-50"
                    >
                      <td class="p-2 font-bold text-slate-900">
                        {{ asset.symbol }}
                      </td>
                      <td class="p-2 text-slate-500">
                        {{ asset.firstCandleDate || '-' }}
                      </td>
                      <td class="p-2 font-semibold">
                        {{ asset.lastCandleDate || 'Unsynced' }}
                      </td>
                      <td class="p-2 font-bold text-blue-600">
                        {{ asset.totalCandles }}
                      </td>
                      <td class="p-2 text-right">
                        <span
                          v-if="asset.isUpToDate"
                          class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600"
                        >
                          Synced
                        </span>
                        <span
                          v-else
                          class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600"
                        >
                          {{ asset.pendingDays }}d gap
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- TAB 3: SQL SCHEMA & PERMISSIONS -->
            <div
              v-else-if="activeTab === 'schema'"
              class="space-y-3"
            >
              <div class="flex items-center justify-between">
                <p class="text-xs text-slate-600">
                  Supabase migration & table permission script:
                </p>
                <div class="flex items-center gap-2">
                  <a
                    href="https://supabase.com/dashboard/project/ekcvbhkqjnncgjkcnuhz/sql/new"
                    target="_blank"
                    class="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700 flex items-center gap-1 shadow-xs"
                  >
                    <UIcon
                      name="i-lucide-external-link"
                      class="w-3 h-3"
                    /> Open Supabase SQL Editor
                  </a>
                  <button
                    class="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs hover:bg-slate-200 flex items-center gap-1 cursor-pointer"
                    @click="copySql"
                  >
                    <UIcon
                      name="i-lucide-copy"
                      class="w-3 h-3"
                    />
                    {{ copied ? 'Copied!' : 'Copy SQL' }}
                  </button>
                </div>
              </div>
              <pre class="bg-slate-900 text-slate-200 p-3 rounded-xl text-xs font-mono max-h-72 overflow-y-auto leading-relaxed border border-slate-800">{{ migrationSql }}</pre>
            </div>
          </div>

          <!-- Modal Footer Controls -->
          <div class="p-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <div class="text-xs text-slate-500">
              <span
                v-if="isQueueRunning"
                class="font-semibold text-indigo-600 flex items-center gap-1.5"
              >
                <span class="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                Processing 1 by 1 at {{ delayMs }}ms interval...
              </span>
              <span v-else>Safe execution: zero timeouts, zero rate limits</span>
            </div>

            <!-- Action Cluster -->
            <div class="flex items-center gap-2">
              <template v-if="isQueueRunning">
                <button
                  class="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                  @click="togglePauseQueue"
                >
                  <UIcon
                    :name="isPaused ? 'i-lucide-play' : 'i-lucide-pause'"
                    class="w-3.5 h-3.5 inline mr-1"
                  />
                  {{ isPaused ? 'Resume' : 'Pause' }}
                </button>
                <button
                  class="px-3.5 py-2 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-xs"
                  @click="stopQueue"
                >
                  <UIcon
                    name="i-lucide-square"
                    class="w-3.5 h-3.5 inline mr-1"
                  /> Stop Queue
                </button>
              </template>
              <template v-else>
                <button
                  class="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                  @click="showModal = false"
                >
                  Close
                </button>
                <button
                  class="px-5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md cursor-pointer transition-all"
                  @click="activeTab = 'sync'; startBatchSync()"
                >
                  <UIcon
                    name="i-lucide-play"
                    class="w-3.5 h-3.5 inline mr-1"
                  />
                  Start Batch Sync
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
