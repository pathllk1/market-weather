<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

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

export interface CryptoDatabaseSummary {
  totalCandles: number
  totalAssets: number
  pairsWithCandles: number
  minDate: string | null
  maxDate: string | null
  lastSyncedAt: string | null
}

export interface StoredDailyCandle {
  symbol: string
  candle_date: string
  open_price: number
  high_price: number
  low_price: number
  close_price: number
  volume_base: number
  volume_quote: number
  source: string
}

const props = defineProps<{
  activeRate: number
  rateMode: 'domestic' | 'forex'
  formatInr: (val: number, options?: { compact?: boolean, decimals?: number }) => string
  formatUsd: (val: number, decimals?: number) => string
}>()

const isLoading = ref(true)
const fetchError = ref<string | null>(null)
const summary = ref<CryptoDatabaseSummary>({
  totalCandles: 0,
  totalAssets: 0,
  pairsWithCandles: 0,
  minDate: null,
  maxDate: null,
  lastSyncedAt: null
})
const allAssets = ref<CryptoDatabaseAsset[]>([])
const searchQuery = ref('')
const filterMode = ref<'all' | 'with_candles' | 'completed' | 'pending'>('with_candles')
const sortBy = ref<'candles' | 'symbol' | 'price' | 'volume' | 'date'>('candles')
const sortOrder = ref<'desc' | 'asc'>('desc')

// Pagination
const currentPage = ref(1)
const pageSize = ref(25)

// Modal for inspecting raw stored candles of a symbol
const isInspectOpen = ref(false)
const selectedInspectAsset = ref<CryptoDatabaseAsset | null>(null)
const inspectCandles = ref<StoredDailyCandle[]>([])
const isInspectLoading = ref(false)
const inspectError = ref<string | null>(null)

async function fetchDatabaseOverview() {
  isLoading.value = true
  fetchError.value = null

  try {
    const res = await $fetch<{
      success: boolean
      summary: CryptoDatabaseSummary
      assets: CryptoDatabaseAsset[]
      error?: string
    }>('/api/crypto/database/overview')

    if (!res.success) {
      throw new Error(res.error || 'Failed to fetch database overview')
    }

    summary.value = res.summary
    allAssets.value = res.assets
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    fetchError.value = message
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchDatabaseOverview()
})

const filteredAssets = computed(() => {
  let list = allAssets.value

  // Search filter
  const q = searchQuery.value.trim().toUpperCase()
  if (q) {
    list = list.filter(a => a.symbol.toUpperCase().includes(q))
  }

  // Status/Coverage filter
  if (filterMode.value === 'with_candles') {
    list = list.filter(a => a.totalCandles > 0)
  } else if (filterMode.value === 'completed') {
    list = list.filter(a => a.totalCandles >= 30)
  } else if (filterMode.value === 'pending') {
    list = list.filter(a => a.totalCandles === 0)
  }

  // Sorting
  const sorted = [...list].sort((a, b) => {
    let comparison = 0
    if (sortBy.value === 'candles') {
      comparison = a.totalCandles - b.totalCandles
    } else if (sortBy.value === 'symbol') {
      comparison = a.symbol.localeCompare(b.symbol)
    } else if (sortBy.value === 'price') {
      const pA = a.latestClose ?? -1
      const pB = b.latestClose ?? -1
      comparison = pA - pB
    } else if (sortBy.value === 'volume') {
      const vA = a.latestVolumeQuote ?? -1
      const vB = b.latestVolumeQuote ?? -1
      comparison = vA - vB
    } else if (sortBy.value === 'date') {
      const dA = a.lastSyncedAt || ''
      const dB = b.lastSyncedAt || ''
      comparison = dA.localeCompare(dB)
    }
    return sortOrder.value === 'asc' ? comparison : -comparison
  })

  return sorted
})

const totalPages = computed(() => {
  return Math.ceil(filteredAssets.value.length / pageSize.value) || 1
})

const paginatedAssets = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredAssets.value.slice(start, start + pageSize.value)
})

function handleSort(key: 'candles' | 'symbol' | 'price' | 'volume' | 'date') {
  if (sortBy.value === key) {
    sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
  } else {
    sortBy.value = key
    sortOrder.value = 'desc'
  }
  currentPage.value = 1
}

function handleFilterChange(mode: 'all' | 'with_candles' | 'completed' | 'pending') {
  filterMode.value = mode
  currentPage.value = 1
}

async function openInspectModal(asset: CryptoDatabaseAsset) {
  selectedInspectAsset.value = asset
  isInspectOpen.value = true
  isInspectLoading.value = true
  inspectError.value = null
  inspectCandles.value = []

  try {
    const res = await $fetch<{
      success: boolean
      symbol: string
      candles: StoredDailyCandle[]
      error?: string
    }>(`/api/crypto/sync/history?symbol=${asset.symbol}&days=365`)

    if (!res.success) {
      throw new Error(res.error || 'Failed to fetch historical database candles')
    }

    inspectCandles.value = res.candles
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    inspectError.value = message
  } finally {
    isInspectLoading.value = false
  }
}

function closeInspectModal() {
  isInspectOpen.value = false
  selectedInspectAsset.value = null
  inspectCandles.value = []
}

function formatDbDateTime(isoStr: string | null): string {
  if (!isoStr) return '—'
  try {
    const d = new Date(isoStr)
    return d.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return isoStr
  }
}

function exportFilteredAssetsCsv() {
  const headers = [
    'Symbol',
    'Total Stored Candles',
    'First Stored Date',
    'Last Stored Date',
    'Latest Stored Close (USD)',
    'Latest Stored Close (INR)',
    'Latest Stored High (USD)',
    'Latest Stored Low (USD)',
    'Latest Stored Volume Quote',
    'Data Source',
    'Last Synced'
  ]

  const rows = filteredAssets.value.map(a => [
    a.symbol,
    a.totalCandles,
    a.firstCandleDate || '',
    a.lastCandleDate || '',
    a.latestClose ?? '',
    a.latestClose != null ? (a.latestClose * props.activeRate).toFixed(2) : '',
    a.latestHigh ?? '',
    a.latestLow ?? '',
    a.latestVolumeQuote ?? '',
    a.latestSource || '',
    a.lastSyncedAt || ''
  ])

  const csvContent = [headers.join(','), ...rows.map(r => r.map(val => `"${val}"`).join(','))].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', `supabase-crypto-vault-${new Date().toISOString().slice(0, 10)}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function exportInspectCandlesCsv() {
  if (!selectedInspectAsset.value || inspectCandles.value.length === 0) return

  const headers = [
    'Date',
    'Symbol',
    'Open (USD)',
    'High (USD)',
    'Low (USD)',
    'Close (USD)',
    'Close (INR)',
    'Base Volume',
    'Quote Volume (USD)',
    'Source'
  ]

  const rows = inspectCandles.value.map(c => [
    c.candle_date,
    c.symbol,
    c.open_price,
    c.high_price,
    c.low_price,
    c.close_price,
    (Number(c.close_price) * props.activeRate).toFixed(2),
    c.volume_base,
    c.volume_quote,
    c.source
  ])

  const csvContent = [headers.join(','), ...rows.map(r => r.map(val => `"${val}"`).join(','))].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', `${selectedInspectAsset.value.symbol}-supabase-candles-${new Date().toISOString().slice(0, 10)}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Sparkline SVG path generator for inspected candles
const inspectSparklinePoints = computed(() => {
  if (inspectCandles.value.length < 2) return ''
  const prices = inspectCandles.value.map(c => Number(c.close_price))
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const width = 600
  const height = 120

  const points = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * width
    const y = height - ((p - min) / range) * (height - 20) - 10
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  return points.join(' ')
})

const inspectStats = computed(() => {
  if (inspectCandles.value.length === 0) return null
  const closes = inspectCandles.value.map(c => Number(c.close_price))
  const highs = inspectCandles.value.map(c => Number(c.high_price))
  const lows = inspectCandles.value.map(c => Number(c.low_price))
  const totalVolQuote = inspectCandles.value.reduce((acc, c) => acc + Number(c.volume_quote || 0), 0)

  const firstClose = closes[0]
  const lastClose = closes[closes.length - 1]
  const periodChangePercent = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0

  return {
    highest: Math.max(...highs),
    lowest: Math.min(...lows),
    latest: lastClose,
    periodChangePercent,
    totalVolumeQuote: totalVolQuote,
    candleCount: inspectCandles.value.length
  }
})
</script>

<template>
  <div class="w-full space-y-3.5">
    <!-- Ultra-Compact Database Status & Actions Strip (Low Vertical Footprint) -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white px-4 py-2.5 rounded-xl border border-slate-200/90 shadow-2xs">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
          <UIcon
            name="i-lucide-database"
            class="w-3.5 h-3.5 text-indigo-600"
          />
          <span>Supabase PostgreSQL Vault</span>
        </span>
        <span class="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
          crypto_daily_ohlcv (20,840)
        </span>
        <span class="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
          crypto_sync_metadata (836)
        </span>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <button
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all cursor-pointer disabled:opacity-50"
          :disabled="isLoading"
          @click="fetchDatabaseOverview"
        >
          <UIcon
            name="i-lucide-refresh-cw"
            class="w-3.5 h-3.5 text-slate-600"
            :class="{ 'animate-spin': isLoading }"
          />
          <span>{{ isLoading ? 'Refreshing...' : 'Refresh' }}</span>
        </button>

        <button
          class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-all cursor-pointer disabled:opacity-50"
          :disabled="filteredAssets.length === 0"
          @click="exportFilteredAssetsCsv"
        >
          <UIcon
            name="i-lucide-download"
            class="w-3.5 h-3.5"
          />
          <span>Export CSV</span>
        </button>
      </div>
    </div>

    <!-- Error Banner (if query failed) -->
    <div
      v-if="fetchError"
      class="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start justify-between gap-3"
    >
      <div class="flex items-start gap-2.5">
        <UIcon
          name="i-lucide-alert-triangle"
          class="w-4 h-4 text-rose-600 shrink-0 mt-0.5"
        />
        <div>
          <div class="font-bold">
            Database Query Error
          </div>
          <div class="mt-0.5 text-rose-700 text-xs">
            {{ fetchError }}
          </div>
        </div>
      </div>
      <button
        class="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 shrink-0 cursor-pointer"
        @click="fetchDatabaseOverview"
      >
        Retry
      </button>
    </div>

    <!-- 4 Executive KPI Cards Strip (High-Density, Compact Height) -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <!-- KPI 1: Total Stored Candles -->
      <div class="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200/90 shadow-2xs relative overflow-hidden group hover:border-indigo-300 transition-all">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Stored Candles</span>
          <div class="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <UIcon
              name="i-lucide-database"
              class="w-4 h-4"
            />
          </div>
        </div>
        <div class="mt-1.5 flex items-baseline gap-2">
          <span class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {{ summary.totalCandles.toLocaleString() }}
          </span>
          <span class="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
            Rows
          </span>
        </div>
        <div class="mt-1 text-[11px] text-slate-500 flex items-center gap-1.5">
          <UIcon
            name="i-lucide-check-circle-2"
            class="w-3 h-3 text-emerald-500"
          />
          <span>Persisted in PostgreSQL</span>
        </div>
      </div>

      <!-- KPI 2: Tracked Symbols -->
      <div class="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200/90 shadow-2xs relative overflow-hidden group hover:border-blue-300 transition-all">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Database Asset Pairs</span>
          <div class="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <UIcon
              name="i-lucide-coins"
              class="w-4 h-4"
            />
          </div>
        </div>
        <div class="mt-1.5 flex items-baseline gap-2">
          <span class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {{ summary.pairsWithCandles.toLocaleString() }}
          </span>
          <span class="text-[11px] font-semibold text-slate-400">
            / {{ summary.totalAssets.toLocaleString() }} tracked
          </span>
        </div>
        <div class="mt-1 text-[11px] text-slate-500 flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <span>{{ summary.pairsWithCandles }} pairs with daily history</span>
        </div>
      </div>

      <!-- KPI 3: Date Span Depth -->
      <div class="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200/90 shadow-2xs relative overflow-hidden group hover:border-emerald-300 transition-all">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Historical Coverage</span>
          <div class="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <UIcon
              name="i-lucide-calendar-range"
              class="w-4 h-4"
            />
          </div>
        </div>
        <div class="mt-1.5">
          <div class="text-xs sm:text-sm font-black text-slate-900 tracking-tight font-mono">
            {{ summary.minDate || '—' }} <span class="text-slate-400 font-normal">to</span> {{ summary.maxDate || '—' }}
          </div>
        </div>
        <div class="mt-1 text-[11px] text-emerald-700 font-semibold flex items-center gap-1.5">
          <UIcon
            name="i-lucide-layers"
            class="w-3 h-3"
          />
          <span>33-Day Continuous Depth</span>
        </div>
      </div>

      <!-- KPI 4: Last Engine Sync -->
      <div class="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200/90 shadow-2xs relative overflow-hidden group hover:border-amber-300 transition-all">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Last DB Ingestion</span>
          <div class="w-7 h-7 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <UIcon
              name="i-lucide-clock"
              class="w-4 h-4"
            />
          </div>
        </div>
        <div class="mt-1.5">
          <div class="text-xs sm:text-sm font-bold text-slate-900 truncate">
            {{ formatDbDateTime(summary.lastSyncedAt) }}
          </div>
        </div>
        <div class="mt-1 text-[11px] text-slate-500 flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Bybit & Binance Vision</span>
        </div>
      </div>
    </div>

    <!-- Interactive Database Toolbar & Filters -->
    <div class="bg-white rounded-xl p-3 sm:p-3.5 border border-slate-200/90 shadow-2xs space-y-2.5">
      <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <!-- Search Bar -->
        <div class="relative flex-1 max-w-md">
          <UIcon
            name="i-lucide-search"
            class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
          />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search symbol in Supabase (e.g. BTC, ETH, SOL, ADA)..."
            class="w-full pl-10 pr-10 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-slate-50/50"
            @input="currentPage = 1"
          >
          <button
            v-if="searchQuery"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            @click="searchQuery = ''; currentPage = 1"
          >
            <UIcon
              name="i-lucide-x"
              class="w-4 h-4"
            />
          </button>
        </div>

        <!-- Filter Mode Chips -->
        <div class="flex flex-wrap items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
          <button
            class="px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
            :class="filterMode === 'with_candles' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'"
            @click="handleFilterChange('with_candles')"
          >
            <span>With Candles</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
              {{ summary.pairsWithCandles }}
            </span>
          </button>

          <button
            class="px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
            :class="filterMode === 'completed' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'"
            @click="handleFilterChange('completed')"
          >
            <span>30+ Days Full</span>
          </button>

          <button
            class="px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
            :class="filterMode === 'pending' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'"
            @click="handleFilterChange('pending')"
          >
            <span>Pending (0)</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
              {{ summary.totalAssets - summary.pairsWithCandles }}
            </span>
          </button>

          <button
            class="px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
            :class="filterMode === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'"
            @click="handleFilterChange('all')"
          >
            <span>All Metadata ({{ summary.totalAssets }})</span>
          </button>
        </div>
      </div>

      <!-- Sorting Bar & Counter -->
      <div class="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 gap-2">
        <div class="font-medium">
          Showing <span class="font-bold text-slate-900">{{ ((currentPage - 1) * pageSize) + 1 }}</span> to
          <span class="font-bold text-slate-900">{{ Math.min(currentPage * pageSize, filteredAssets.length) }}</span> of
          <span class="font-bold text-slate-900">{{ filteredAssets.length }}</span> database pairs
        </div>

        <!-- Quick Sort Pills -->
        <div class="flex items-center gap-2">
          <span class="text-slate-400 font-semibold">Sort by:</span>
          <button
            class="px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-colors"
            :class="sortBy === 'candles' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
            @click="handleSort('candles')"
          >
            Candles {{ sortBy === 'candles' ? (sortOrder === 'desc' ? '↓' : '↑') : '' }}
          </button>
          <button
            class="px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-colors"
            :class="sortBy === 'symbol' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
            @click="handleSort('symbol')"
          >
            Symbol {{ sortBy === 'symbol' ? (sortOrder === 'asc' ? 'A-Z' : 'Z-A') : '' }}
          </button>
          <button
            class="px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-colors"
            :class="sortBy === 'price' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
            @click="handleSort('price')"
          >
            DB Close {{ sortBy === 'price' ? (sortOrder === 'desc' ? '↓' : '↑') : '' }}
          </button>
          <button
            class="px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-colors"
            :class="sortBy === 'volume' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
            @click="handleSort('volume')"
          >
            24h Volume {{ sortBy === 'volume' ? (sortOrder === 'desc' ? '↓' : '↑') : '' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Main Database Table -->
    <div class="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
      <!-- Loading Skeleton -->
      <div
        v-if="isLoading"
        class="p-12 flex flex-col items-center justify-center text-center"
      >
        <UIcon
          name="i-lucide-database"
          class="w-8 h-8 text-indigo-500 animate-bounce mb-2"
        />
        <div class="text-xs font-bold text-slate-800">
          Fetching complete PostgreSQL records from Supabase...
        </div>
        <div class="text-[11px] text-slate-400 mt-0.5">
          Loading 836 metadata rows and joining 20,840 daily OHLCV records
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="filteredAssets.length === 0"
        class="p-12 flex flex-col items-center justify-center text-center"
      >
        <UIcon
          name="i-lucide-search"
          class="w-8 h-8 text-slate-300 mb-2"
        />
        <div class="text-xs font-bold text-slate-800">
          No database records found
        </div>
        <div class="text-[11px] text-slate-400 mt-0.5 max-w-sm">
          No crypto pairs match your current search query or filter selection in Supabase.
        </div>
      </div>

      <!-- Data Table -->
      <div
        v-else
        class="overflow-x-auto"
      >
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-slate-50/80 border-b border-slate-200/90 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <th class="py-2.5 px-3.5 w-10 text-center">
                #
              </th>
              <th
                class="py-2.5 px-3.5 cursor-pointer hover:text-slate-900"
                @click="handleSort('symbol')"
              >
                Symbol
              </th>
              <th
                class="py-2.5 px-3.5 cursor-pointer hover:text-slate-900"
                @click="handleSort('candles')"
              >
                Candles in DB
              </th>
              <th class="py-2.5 px-3.5">
                DB Date Range
              </th>
              <th
                class="py-2.5 px-3.5 text-right cursor-pointer hover:text-slate-900"
                @click="handleSort('price')"
              >
                Latest DB Close
              </th>
              <th class="py-2.5 px-3.5 text-right">
                Latest High / Low (DB)
              </th>
              <th
                class="py-2.5 px-3.5 text-right cursor-pointer hover:text-slate-900"
                @click="handleSort('volume')"
              >
                DB 24h Volume
              </th>
              <th class="py-2.5 px-3.5 text-center">
                Source
              </th>
              <th
                class="py-2.5 px-3.5 cursor-pointer hover:text-slate-900"
                @click="handleSort('date')"
              >
                Last Synced
              </th>
              <th class="py-2.5 px-3.5 text-right">
                Action
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 text-xs text-slate-700">
            <tr
              v-for="(asset, idx) in paginatedAssets"
              :key="asset.symbol"
              class="hover:bg-indigo-50/30 transition-colors"
            >
              <!-- Index -->
              <td class="py-2.5 px-3.5 text-center text-slate-400 font-mono text-[11px]">
                {{ ((currentPage - 1) * pageSize) + idx + 1 }}
              </td>

              <!-- Symbol -->
              <td class="py-2.5 px-3.5 font-bold text-slate-900">
                <div class="flex items-center gap-2">
                  <div class="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 font-black text-xs shrink-0">
                    {{ asset.symbol.replace(/USDT$/, '').slice(0, 3) }}
                  </div>
                  <div>
                    <div class="font-extrabold text-slate-900 tracking-tight text-xs sm:text-sm">
                      {{ asset.symbol }}
                    </div>
                    <div class="text-[10px] text-slate-400 font-normal">
                      {{ asset.symbol.replace(/USDT$/, '') }} / USDT
                    </div>
                  </div>
                </div>
              </td>

              <!-- Candles in DB with mini visual progress bar -->
              <td class="py-2.5 px-3.5">
                <div class="flex items-center gap-2">
                  <span
                    class="font-mono font-bold text-xs px-2 py-0.5 rounded-md"
                    :class="asset.totalCandles >= 30 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : (asset.totalCandles > 0 ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-400')"
                  >
                    {{ asset.totalCandles }} / 33
                  </span>
                  <div class="w-14 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all"
                      :class="asset.totalCandles >= 30 ? 'bg-emerald-500' : (asset.totalCandles > 0 ? 'bg-blue-500' : 'bg-slate-300')"
                      :style="{ width: `${Math.min(100, (asset.totalCandles / 33) * 100)}%` }"
                    />
                  </div>
                </div>
              </td>

              <!-- Date Range -->
              <td class="py-2.5 px-3.5 font-mono text-[11px] text-slate-600">
                <div v-if="asset.firstCandleDate && asset.lastCandleDate">
                  <span>{{ asset.firstCandleDate }}</span>
                  <span class="text-slate-400 mx-1">→</span>
                  <span class="font-bold text-slate-900">{{ asset.lastCandleDate }}</span>
                </div>
                <div
                  v-else
                  class="text-slate-400 italic"
                >
                  No candles recorded
                </div>
              </td>

              <!-- Latest DB Close -->
              <td class="py-2.5 px-3.5 text-right">
                <div v-if="asset.latestClose != null">
                  <div class="font-black text-slate-900 text-xs sm:text-sm">
                    ₹ {{ formatInr(asset.latestClose * activeRate) }}
                  </div>
                  <div class="text-[10px] text-slate-400 font-mono">
                    $ {{ formatUsd(asset.latestClose) }}
                  </div>
                </div>
                <div
                  v-else
                  class="text-slate-400 italic"
                >
                  —
                </div>
              </td>

              <!-- Latest High / Low (DB) -->
              <td class="py-2.5 px-3.5 text-right font-mono text-[11px]">
                <div v-if="asset.latestHigh != null && asset.latestLow != null">
                  <div class="text-emerald-700 font-semibold">
                    H: $ {{ formatUsd(asset.latestHigh) }}
                  </div>
                  <div class="text-rose-700 font-semibold">
                    L: $ {{ formatUsd(asset.latestLow) }}
                  </div>
                </div>
                <div
                  v-else
                  class="text-slate-400 italic"
                >
                  —
                </div>
              </td>

              <!-- DB 24h Volume -->
              <td class="py-2.5 px-3.5 text-right">
                <div v-if="asset.latestVolumeQuote != null">
                  <div class="font-bold text-slate-900 font-mono text-[11px]">
                    $ {{ (asset.latestVolumeQuote / 1e6).toFixed(2) }}M
                  </div>
                  <div class="text-[10px] text-slate-400">
                    ₹ {{ ((asset.latestVolumeQuote * activeRate) / 1e7).toFixed(2) }} Cr
                  </div>
                </div>
                <div
                  v-else
                  class="text-slate-400 italic"
                >
                  —
                </div>
              </td>

              <!-- Source -->
              <td class="py-2.5 px-3.5 text-center">
                <span
                  v-if="asset.latestSource"
                  class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full uppercase"
                  :class="asset.latestSource === 'bybit' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200'"
                >
                  {{ asset.latestSource }}
                </span>
                <span
                  v-else
                  class="text-[10px] text-slate-400"
                >—</span>
              </td>

              <!-- Last Synced -->
              <td class="py-2.5 px-3.5 text-[11px] text-slate-500 whitespace-nowrap">
                {{ formatDbDateTime(asset.lastSyncedAt) }}
              </td>

              <!-- Action -->
              <td class="py-2.5 px-3.5 text-right">
                <button
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  :class="asset.totalCandles > 0 ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white border border-indigo-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'"
                  :disabled="asset.totalCandles === 0"
                  @click="openInspectModal(asset)"
                >
                  <UIcon
                    name="i-lucide-bar-chart-2"
                    class="w-3.5 h-3.5"
                  />
                  <span>Inspect DB</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
      <div
        v-if="filteredAssets.length > 0"
        class="p-3 bg-slate-50/80 border-t border-slate-200/90 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600"
      >
        <div class="flex items-center gap-3">
          <span>Rows per page:</span>
          <select
            v-model="pageSize"
            class="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            @change="currentPage = 1"
          >
            <option :value="15">
              15
            </option>
            <option :value="25">
              25
            </option>
            <option :value="50">
              50
            </option>
            <option :value="100">
              100
            </option>
          </select>
          <span class="text-slate-400">|</span>
          <span>Page {{ currentPage }} of {{ totalPages }}</span>
        </div>

        <div class="flex items-center gap-1.5">
          <button
            class="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            :disabled="currentPage === 1"
            title="First Page"
            @click="currentPage = 1"
          >
            <UIcon
              name="i-lucide-chevrons-left"
              class="w-4 h-4"
            />
          </button>
          <button
            class="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            :disabled="currentPage === 1"
            title="Previous Page"
            @click="currentPage--"
          >
            <UIcon
              name="i-lucide-chevron-left"
              class="w-4 h-4"
            />
          </button>

          <span class="px-3 py-1 font-bold text-slate-900 bg-white rounded-lg border border-slate-200">
            {{ currentPage }}
          </span>

          <button
            class="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            :disabled="currentPage === totalPages"
            title="Next Page"
            @click="currentPage++"
          >
            <UIcon
              name="i-lucide-chevron-right"
              class="w-4 h-4"
            />
          </button>
          <button
            class="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            :disabled="currentPage === totalPages"
            title="Last Page"
            @click="currentPage = totalPages"
          >
            <UIcon
              name="i-lucide-chevrons-right"
              class="w-4 h-4"
            />
          </button>
        </div>
      </div>
    </div>

    <!-- Inspect Modal: Direct Daily Candles from PostgreSQL -->
    <div
      v-if="isInspectOpen && selectedInspectAsset"
      class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
    >
      <div class="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full p-5 sm:p-6 relative my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <!-- Close Button -->
        <button
          class="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          @click="closeInspectModal"
        >
          <UIcon
            name="i-lucide-x"
            class="w-5 h-5"
          />
        </button>

        <!-- Header -->
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 font-black text-sm shrink-0">
              {{ selectedInspectAsset.symbol.replace(/USDT$/, '').slice(0, 4) }}
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-xl font-black text-slate-900">
                  {{ selectedInspectAsset.symbol }}
                </h3>
                <span class="text-xs font-mono font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                  {{ selectedInspectAsset.totalCandles }} Daily Candles in Supabase
                </span>
                <span class="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  PostgreSQL OHLCV
                </span>
              </div>
              <div class="text-xs text-slate-400 mt-0.5">
                Direct read from Supabase table <code class="text-slate-600 font-mono">crypto_daily_ohlcv</code> · Converted @ ₹{{ activeRate.toFixed(2) }}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 pr-8 sm:pr-0">
            <button
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 shadow-xs transition-all cursor-pointer disabled:opacity-50"
              :disabled="inspectCandles.length === 0"
              @click="exportInspectCandlesCsv"
            >
              <UIcon
                name="i-lucide-download"
                class="w-3.5 h-3.5"
              />
              <span>Download CSV</span>
            </button>
          </div>
        </div>

        <!-- Modal Body -->
        <div class="mt-4 space-y-4">
          <!-- Loading State -->
          <div
            v-if="isInspectLoading"
            class="py-16 flex flex-col items-center justify-center text-center"
          >
            <UIcon
              name="i-lucide-database"
              class="w-8 h-8 text-indigo-600 animate-spin mb-2"
            />
            <div class="text-xs font-bold text-slate-700">
              Retrieving stored daily candles from PostgreSQL...
            </div>
          </div>

          <!-- Error State -->
          <div
            v-else-if="inspectError"
            class="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs"
          >
            {{ inspectError }}
          </div>

          <div
            v-else
            class="space-y-4"
          >
            <!-- Stats Strip for Symbol -->
            <div
              v-if="inspectStats"
              class="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 text-xs"
            >
              <div>
                <span class="text-slate-400 text-[10px] font-semibold uppercase">Latest DB Close</span>
                <div class="font-black text-slate-900 text-sm mt-0.5">
                  ₹ {{ formatInr(inspectStats.latest * activeRate) }}
                </div>
                <div class="text-[11px] text-slate-500 font-mono">
                  $ {{ formatUsd(inspectStats.latest) }}
                </div>
              </div>

              <div>
                <span class="text-slate-400 text-[10px] font-semibold uppercase">Period Change</span>
                <div
                  class="font-black text-sm mt-0.5 flex items-center gap-1"
                  :class="inspectStats.periodChangePercent >= 0 ? 'text-emerald-600' : 'text-rose-600'"
                >
                  <UIcon :name="inspectStats.periodChangePercent >= 0 ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'" />
                  <span>{{ inspectStats.periodChangePercent >= 0 ? '+' : '' }}{{ inspectStats.periodChangePercent.toFixed(2) }}%</span>
                </div>
                <div class="text-[11px] text-slate-500">
                  Across {{ inspectStats.candleCount }} daily bars
                </div>
              </div>

              <div>
                <span class="text-slate-400 text-[10px] font-semibold uppercase">Stored High / Low</span>
                <div class="font-bold text-emerald-700 text-xs mt-0.5">
                  Max: $ {{ formatUsd(inspectStats.highest) }}
                </div>
                <div class="font-bold text-rose-700 text-xs">
                  Min: $ {{ formatUsd(inspectStats.lowest) }}
                </div>
              </div>

              <div>
                <span class="text-slate-400 text-[10px] font-semibold uppercase">Total Volume in DB</span>
                <div class="font-black text-slate-900 text-sm mt-0.5">
                  $ {{ (inspectStats.totalVolumeQuote / 1e6).toFixed(2) }}M
                </div>
                <div class="text-[11px] text-slate-500">
                  ₹ {{ ((inspectStats.totalVolumeQuote * activeRate) / 1e7).toFixed(2) }} Cr
                </div>
              </div>
            </div>

            <!-- Sparkline Visualizer -->
            <div
              v-if="inspectCandles.length > 1"
              class="bg-slate-900 rounded-xl p-4 text-white relative overflow-hidden"
            >
              <div class="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span class="font-bold text-indigo-300">Database Price Curve (Daily Closes)</span>
                <span class="font-mono text-[11px]">{{ inspectCandles[0].candle_date }} → {{ inspectCandles[inspectCandles.length - 1].candle_date }}</span>
              </div>
              <svg
                class="w-full h-24 overflow-visible"
                viewBox="0 0 600 120"
                preserveAspectRatio="none"
              >
                <!-- Area gradient -->
                <defs>
                  <linearGradient
                    id="dbChartGrad"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stop-color="#6366f1"
                      stop-opacity="0.4"
                    />
                    <stop
                      offset="100%"
                      stop-color="#6366f1"
                      stop-opacity="0.0"
                    />
                  </linearGradient>
                </defs>
                <polygon
                  :points="`0,120 ${inspectSparklinePoints} 600,120`"
                  fill="url(#dbChartGrad)"
                />
                <polyline
                  :points="inspectSparklinePoints"
                  fill="none"
                  stroke="#818cf8"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>

            <!-- Historical Daily Candles Table -->
            <div class="max-h-72 overflow-y-auto border border-slate-200 rounded-xl">
              <table class="w-full text-left border-collapse text-xs">
                <thead class="bg-slate-50 sticky top-0 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th class="py-2.5 px-3">
                      Date
                    </th>
                    <th class="py-2.5 px-3 text-right">
                      Open (USD)
                    </th>
                    <th class="py-2.5 px-3 text-right">
                      High (USD)
                    </th>
                    <th class="py-2.5 px-3 text-right">
                      Low (USD)
                    </th>
                    <th class="py-2.5 px-3 text-right">
                      Close (USD)
                    </th>
                    <th class="py-2.5 px-3 text-right">
                      Close (₹ INR)
                    </th>
                    <th class="py-2.5 px-3 text-right">
                      Quote Volume
                    </th>
                    <th class="py-2.5 px-3 text-center">
                      Source
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 font-mono text-[11px]">
                  <tr
                    v-for="candle in inspectCandles"
                    :key="candle.candle_date"
                    class="hover:bg-slate-50"
                  >
                    <td class="py-2 px-3 font-bold text-slate-900">
                      {{ candle.candle_date }}
                    </td>
                    <td class="py-2 px-3 text-right text-slate-600">
                      {{ formatUsd(Number(candle.open_price)) }}
                    </td>
                    <td class="py-2 px-3 text-right text-emerald-700">
                      {{ formatUsd(Number(candle.high_price)) }}
                    </td>
                    <td class="py-2 px-3 text-right text-rose-700">
                      {{ formatUsd(Number(candle.low_price)) }}
                    </td>
                    <td
                      class="py-2 px-3 text-right font-bold"
                      :class="Number(candle.close_price) >= Number(candle.open_price) ? 'text-emerald-600' : 'text-rose-600'"
                    >
                      {{ formatUsd(Number(candle.close_price)) }}
                    </td>
                    <td class="py-2 px-3 text-right font-sans font-bold text-slate-900">
                      ₹ {{ formatInr(Number(candle.close_price) * activeRate) }}
                    </td>
                    <td class="py-2 px-3 text-right text-slate-500">
                      ${{ (Number(candle.volume_quote) / 1e6).toFixed(2) }}M
                    </td>
                    <td class="py-2 px-3 text-center">
                      <span class="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
                        {{ candle.source }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
