<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  AreaSeries,
  ColorType,
  CrosshairMode
} from 'lightweight-charts'
import type { SchemeDetailResponse } from '~~/server/api/portfolio/[id]/mf/schemes/[code]/details.get'

const props = defineProps<{
  modelValue: boolean
  portfolioId: string
  schemeCode: number | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'record-transaction', scheme: { code: number; name: string; amc: string; category: string }): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val)
})

const colorMode = useColorMode()
const isLoading = ref(false)
const errorMsg = ref('')
const fundData = ref<SchemeDetailResponse | null>(null)

// Tabs: 'chart' | 'ledger'
const activeTab = ref<'chart' | 'ledger'>('chart')

// Timeframe: '1M' | '6M' | '1Y' | '3Y' | '5Y' | 'ALL'
const activeTimeframe = ref<'1M' | '6M' | '1Y' | '3Y' | '5Y' | 'ALL'>('1Y')
const timeframes = ['1M', '6M', '1Y', '3Y', '5Y', 'ALL'] as const

// Chart DOM reference and instance
const chartContainer = ref<HTMLDivElement | null>(null)
let chart: IChartApi | null = null
let areaSeries: ISeriesApi<'Area'> | null = null

// Hover HUD
const hoveredPoint = ref<{ date: string; nav: number } | null>(null)

// Ledger filtering & pagination
const ledgerTypeFilter = ref<'ALL' | 'BUY_SIP' | 'BUY_LUMPSUM' | 'REDEMPTION'>('ALL')
const ledgerSearch = ref('')
const currentPage = ref(1)
const pageSize = 15

// Fetch scheme details when modal opens or schemeCode changes
watch(
  [() => props.modelValue, () => props.schemeCode],
  async ([open, code]) => {
    if (open && code && code > 0) {
      await fetchSchemeDetails(code)
    } else if (!open) {
      cleanupChart()
    }
  },
  { immediate: true }
)

async function fetchSchemeDetails(code: number) {
  isLoading.value = true
  errorMsg.value = ''
  fundData.value = null

  try {
    const data = await $fetch<SchemeDetailResponse>(
      `/api/portfolio/${props.portfolioId}/mf/schemes/${code}/details`
    )
    fundData.value = data
    currentPage.value = 1

    await nextTick()
    if (activeTab.value === 'chart') {
      initChart()
      setTimeout(() => {
        if (!chart) initChart()
        else handleResize()
      }, 150)
      setTimeout(() => {
        if (!chart) initChart()
        else handleResize()
      }, 350)
    }
  } catch (err: any) {
    errorMsg.value = err?.data?.statusMessage || err?.message || 'Failed to load fund details'
  } finally {
    isLoading.value = false
  }
}

// Watch tab change to reinitialize chart when switching back
watch(activeTab, async (newTab) => {
  if (newTab === 'chart') {
    await nextTick()
    initChart()
    setTimeout(() => {
      if (!chart) initChart()
      else handleResize()
    }, 100)
  }
})

// Watch color mode to update chart colors
watch(() => colorMode.value, () => {
  if (chart) {
    applyChartTheme()
  }
})

// Filtered chart data based on active timeframe
const filteredChartData = computed(() => {
  if (!fundData.value || !fundData.value.historicalNav || fundData.value.historicalNav.length === 0) {
    return []
  }

  const all = fundData.value.historicalNav
  if (activeTimeframe.value === 'ALL') return all

  const now = new Date()
  const cutoff = new Date()
  if (activeTimeframe.value === '1M') cutoff.setMonth(now.getMonth() - 1)
  else if (activeTimeframe.value === '6M') cutoff.setMonth(now.getMonth() - 6)
  else if (activeTimeframe.value === '1Y') cutoff.setFullYear(now.getFullYear() - 1)
  else if (activeTimeframe.value === '3Y') cutoff.setFullYear(now.getFullYear() - 3)
  else if (activeTimeframe.value === '5Y') cutoff.setFullYear(now.getFullYear() - 5)

  const cutoffStr = cutoff.toISOString().split('T')[0]!
  const filtered = all.filter(pt => pt.time >= cutoffStr)
  return filtered.length > 0 ? filtered : all
})

// Watch timeframe change to update chart series
watch(activeTimeframe, () => {
  if (areaSeries && chart) {
    const data = filteredChartData.value
    areaSeries.setData(data as any)
    chart.timeScale().fitContent()
  }
})

let resizeObserver: ResizeObserver | null = null

function observeContainer() {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (!chartContainer.value) return

  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const w = Math.floor(entry.contentRect.width)
      if (w > 20) {
        if (!chart) {
          initChart()
        } else {
          chart.applyOptions({ width: w })
          chart.timeScale().fitContent()
        }
      }
    }
  })
  resizeObserver.observe(chartContainer.value)
}

function initChart() {
  if (!chartContainer.value || !fundData.value) return
  cleanupChart()

  const isDark = colorMode.value === 'dark'
  const clientW = chartContainer.value.clientWidth
  const parentW = chartContainer.value.parentElement?.clientWidth || 0
  const initialWidth = clientW > 20 ? clientW : (parentW > 20 ? parentW : 750)

  chart = createChart(chartContainer.value, {
    width: initialWidth,
    height: 300,
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: isDark ? '#9ca3af' : '#6b7280',
      fontSize: 11
    },
    grid: {
      vertLines: { color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)' },
      horzLines: { color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)' }
    },
    rightPriceScale: {
      borderColor: isDark ? '#374151' : '#e5e7eb',
      scaleMargins: { top: 0.1, bottom: 0.1 },
      autoScale: true
    },
    timeScale: {
      borderColor: isDark ? '#374151' : '#e5e7eb',
      timeVisible: false,
      fixLeftEdge: true,
      fixRightEdge: true
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: '#10b981',
        width: 1,
        style: 3,
        labelBackgroundColor: '#10b981'
      },
      horzLine: {
        color: '#10b981',
        width: 1,
        style: 3,
        labelBackgroundColor: '#10b981'
      }
    }
  })

  // Create area series using modern API
  areaSeries = chart.addSeries(AreaSeries, {
    topColor: 'rgba(16, 185, 129, 0.28)',
    bottomColor: 'rgba(16, 185, 129, 0.01)',
    lineColor: '#10b981',
    lineWidth: 2,
    priceFormat: {
      type: 'custom',
      formatter: (val: number) => '₹' + val.toFixed(2)
    }
  })

  const data = filteredChartData.value
  if (data && data.length > 0) {
    areaSeries.setData(data as any)
  }

  // Subscribe to crosshair move
  chart.subscribeCrosshairMove((param) => {
    if (!param.time || !param.seriesData || !areaSeries) {
      hoveredPoint.value = null
      return
    }
    const navVal = param.seriesData.get(areaSeries) as any
    if (navVal && typeof navVal.value === 'number') {
      hoveredPoint.value = {
        date: String(param.time),
        nav: navVal.value
      }
    } else {
      hoveredPoint.value = null
    }
  })

  chart.timeScale().fitContent()

  // Setup ResizeObserver & window resize listener
  observeContainer()
  window.addEventListener('resize', handleResize)

  // Staggered fitContent to ensure modal layout animations settle
  setTimeout(() => {
    handleResize()
    chart?.timeScale().fitContent()
  }, 100)

  setTimeout(() => {
    handleResize()
    chart?.timeScale().fitContent()
  }, 300)
}

function handleResize() {
  if (chart && chartContainer.value) {
    const w = chartContainer.value.clientWidth
    if (w > 20) {
      chart.applyOptions({ width: w })
      chart.timeScale().fitContent()
    }
  }
}

function applyChartTheme() {
  if (!chart) return
  const isDark = colorMode.value === 'dark'
  chart.applyOptions({
    layout: {
      textColor: isDark ? '#9ca3af' : '#6b7280'
    },
    grid: {
      vertLines: { color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)' },
      horzLines: { color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)' }
    },
    rightPriceScale: {
      borderColor: isDark ? '#374151' : '#e5e7eb'
    },
    timeScale: {
      borderColor: isDark ? '#374151' : '#e5e7eb'
    }
  })
}

function cleanupChart() {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (chart) {
    window.removeEventListener('resize', handleResize)
    chart.remove()
    chart = null
    areaSeries = null
  }
}

onUnmounted(() => {
  cleanupChart()
})

// Filtered Transactions in Ledger
const filteredTransactions = computed(() => {
  if (!fundData.value) return []
  let list = fundData.value.transactions

  if (ledgerTypeFilter.value !== 'ALL') {
    list = list.filter(t => t.transactionType === ledgerTypeFilter.value)
  }

  if (ledgerSearch.value.trim()) {
    const q = ledgerSearch.value.toLowerCase().trim()
    list = list.filter(t =>
      t.transactionDate.includes(q) ||
      (t.notes && t.notes.toLowerCase().includes(q)) ||
      (t.folioNumber && t.folioNumber.toLowerCase().includes(q))
    )
  }

  return list
})

const totalPages = computed(() => Math.ceil(filteredTransactions.value.length / pageSize) || 1)
const paginatedTransactions = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredTransactions.value.slice(start, start + pageSize)
})

function fmtCur(val: number) {
  return '₹' + (val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function handleOpenLog() {
  if (!fundData.value) return
  emit('record-transaction', {
    code: fundData.value.schemeCode,
    name: fundData.value.schemeName,
    amc: fundData.value.amcName,
    category: fundData.value.category
  })
  isOpen.value = false
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :ui="{
      content: 'sm:max-w-4xl w-[calc(100vw-2rem)] flex flex-col max-h-[92vh]',
      body: 'p-4 sm:p-6 space-y-5 overflow-y-auto'
    }"
  >
    <template #header>
      <div class="flex items-start justify-between w-full pr-4">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge color="primary" variant="subtle" size="xs">
              {{ fundData?.category || 'Mutual Fund' }}
            </UBadge>
            <UBadge color="neutral" variant="outline" size="xs" class="font-mono">
              #{{ fundData?.schemeCode || props.schemeCode }}
            </UBadge>
            <UBadge
              v-if="fundData?.holdingMode"
              :color="fundData.holdingMode === 'PHYSICAL' ? 'neutral' : 'info'"
              variant="subtle"
              size="xs"
            >
              {{ fundData.holdingMode === 'PHYSICAL' ? 'Physical Folio' : 'Demat' }}
            </UBadge>
            <span v-if="fundData?.folioNumber" class="text-xs text-neutral-400 font-mono">
              Folio: {{ fundData.folioNumber }}
            </span>
          </div>
          <h2 class="text-lg sm:text-xl font-bold text-neutral-900 dark:text-white leading-tight">
            {{ fundData?.schemeName || 'Mutual Fund Analytics' }}
          </h2>
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            {{ fundData?.amcName || 'Asset Management Company' }}
          </p>
        </div>

        <!-- Live NAV Card -->
        <div v-if="fundData" class="text-right shrink-0">
          <div class="text-xs text-neutral-400">Live AMFI NAV</div>
          <div class="text-lg sm:text-xl font-mono font-bold text-neutral-900 dark:text-white">
            ₹{{ fundData.currentNav.toFixed(2) }}
          </div>
          <div
            v-if="fundData.oneDayChangePct !== 0"
            class="text-xs font-semibold flex items-center justify-end gap-0.5"
            :class="fundData.oneDayChangePct >= 0 ? 'text-emerald-500' : 'text-rose-500'"
          >
            <UIcon :name="fundData.oneDayChangePct >= 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'" class="h-3 w-3" />
            <span>{{ fundData.oneDayChangePct >= 0 ? '+' : '' }}{{ fundData.oneDayChangePct.toFixed(2) }}%</span>
          </div>
        </div>
      </div>
    </template>

    <template #body>
      <!-- Loading State -->
      <div v-if="isLoading" class="py-16 text-center space-y-3">
        <UIcon name="i-lucide-loader-2" class="animate-spin h-8 w-8 text-primary mx-auto" />
        <p class="text-xs text-neutral-500 font-mono">Loading historical NAV series & cash flows...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="errorMsg" class="py-12 text-center space-y-3 text-rose-500">
        <UIcon name="i-lucide-alert-circle" class="h-8 w-8 mx-auto" />
        <p class="text-sm font-semibold">{{ errorMsg }}</p>
        <UButton color="neutral" variant="outline" size="sm" @click="fetchSchemeDetails(props.schemeCode!)">
          Retry
        </UButton>
      </div>

      <!-- Main Content -->
      <div v-else-if="fundData" class="space-y-5">
        <!-- 1. Key Performance Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <!-- XIRR Card -->
          <div class="p-3.5 rounded-2xl bg-primary/5 dark:bg-primary/10 border border-primary/20 relative overflow-hidden">
            <div class="text-[11px] font-semibold text-primary uppercase tracking-wider flex items-center justify-between">
              <span>True XIRR</span>
              <UIcon name="i-lucide-sparkles" class="h-3.5 w-3.5" />
            </div>
            <div class="mt-1 flex items-baseline gap-1">
              <span
                class="text-2xl font-bold font-mono"
                :class="(fundData.xirr ?? 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'"
              >
                {{ fundData.xirr !== null ? ((fundData.xirr >= 0 ? '+' : '') + fundData.xirr.toFixed(2) + '%') : 'N/A' }}
              </span>
              <span class="text-[11px] text-neutral-400">p.a.</span>
            </div>
            <p class="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
              Annualized return on cash flows
            </p>
          </div>

          <!-- Current Valuation Card -->
          <div class="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60">
            <div class="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Current Valuation
            </div>
            <div class="text-xl font-bold font-mono text-neutral-900 dark:text-white mt-1">
              {{ fmtCur(fundData.currentValue) }}
            </div>
            <div class="text-[10px] text-neutral-400 mt-1">
              Cost: <span class="font-mono font-semibold">{{ fmtCur(fundData.totalInvested) }}</span>
            </div>
          </div>

          <!-- Absolute Gain/Loss Card -->
          <div class="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60">
            <div class="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Unrealized Profit
            </div>
            <div
              class="text-xl font-bold font-mono mt-1"
              :class="fundData.unrealizedPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'"
            >
              {{ fundData.unrealizedPnL >= 0 ? '+' : '' }}{{ fmtCur(fundData.unrealizedPnL) }}
            </div>
            <div
              class="text-[10px] font-semibold mt-1"
              :class="fundData.unrealizedPnLPct >= 0 ? 'text-emerald-500' : 'text-rose-500'"
            >
              {{ fundData.unrealizedPnLPct >= 0 ? '+' : '' }}{{ fundData.unrealizedPnLPct.toFixed(2) }}% Absolute
            </div>
          </div>

          <!-- Units Held Card -->
          <div class="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60">
            <div class="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Units Held
            </div>
            <div class="text-xl font-bold font-mono text-neutral-900 dark:text-white mt-1">
              {{ fundData.totalUnits.toFixed(4) }}
            </div>
            <div class="text-[10px] text-neutral-400 mt-1">
              Avg NAV: <span class="font-mono font-semibold">₹{{ fundData.avgNav.toFixed(2) }}</span>
            </div>
          </div>
        </div>

        <!-- 2. Sub-Navigation Tabs -->
        <div class="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800">
          <div class="flex items-center gap-6">
            <button
              type="button"
              class="pb-2.5 text-xs font-bold transition-all cursor-pointer relative"
              :class="activeTab === 'chart'
                ? 'text-primary border-b-2 border-primary'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'"
              @click="activeTab = 'chart'"
            >
              <div class="flex items-center gap-1.5">
                <UIcon name="i-lucide-line-chart" class="h-4 w-4" />
                <span>Historical NAV & Returns</span>
              </div>
            </button>
            <button
              type="button"
              class="pb-2.5 text-xs font-bold transition-all cursor-pointer relative"
              :class="activeTab === 'ledger'
                ? 'text-primary border-b-2 border-primary'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'"
              @click="activeTab = 'ledger'"
            >
              <div class="flex items-center gap-1.5">
                <UIcon name="i-lucide-receipt" class="h-4 w-4" />
                <span>Transaction History ({{ fundData.transactions.length }})</span>
              </div>
            </button>
          </div>

          <!-- Timeframe selector (only visible in chart tab) -->
          <div v-if="activeTab === 'chart'" class="flex items-center gap-1 p-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs">
            <button
              v-for="tf in timeframes"
              :key="tf"
              type="button"
              class="px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer"
              :class="activeTimeframe === tf
                ? 'bg-primary text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
              @click="activeTimeframe = tf"
            >
              {{ tf }}
            </button>
          </div>
        </div>

        <!-- 3. TAB 1: CHART VIEW -->
        <div v-show="activeTab === 'chart'" class="space-y-2">
          <!-- Chart HUD Readout -->
          <div class="flex items-center justify-between text-xs px-1">
            <div class="flex items-center gap-2">
              <span class="text-neutral-400">Date:</span>
              <span class="font-mono font-semibold text-neutral-900 dark:text-white">
                {{ hoveredPoint?.date || 'Latest NAV' }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-neutral-400">NAV:</span>
              <span class="font-mono font-bold text-emerald-500">
                ₹{{ (hoveredPoint?.nav || fundData.currentNav).toFixed(2) }}
              </span>
            </div>
          </div>

          <!-- TradingView Lightweight Chart Container -->
          <div
            ref="chartContainer"
            class="w-full h-[300px] rounded-2xl bg-neutral-50/50 dark:bg-neutral-800/30 border border-neutral-200 dark:border-neutral-800 p-2"
          />

          <!-- Buy Markers Summary -->
          <div v-if="fundData.buyMarkers.length > 0" class="flex items-center justify-between text-[11px] text-neutral-400 px-1 pt-1">
            <div class="flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
              <span>Recorded {{ fundData.buyMarkers.length }} purchase points on this fund</span>
            </div>
            <span v-if="fundData.firstInvestmentDate">
              Invested since: <strong class="text-neutral-300 font-mono">{{ fundData.firstInvestmentDate }}</strong>
            </span>
          </div>
        </div>

        <!-- 4. TAB 2: TRANSACTION HISTORY LEDGER -->
        <div v-show="activeTab === 'ledger'" class="space-y-3">
          <!-- Ledger Toolbar -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div class="flex items-center gap-1.5">
              <button
                v-for="t in (['ALL', 'BUY_SIP', 'BUY_LUMPSUM', 'REDEMPTION'] as const)"
                :key="t"
                type="button"
                class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                :class="ledgerTypeFilter === t
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-xs'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'"
                @click="ledgerTypeFilter = t; currentPage = 1"
              >
                {{ t === 'ALL' ? 'All' : t === 'BUY_SIP' ? 'SIPs' : t === 'BUY_LUMPSUM' ? 'Lumpsum' : 'Redemptions' }}
              </button>
            </div>

            <div class="relative w-full sm:w-60">
              <UIcon name="i-lucide-search" class="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
              <input
                v-model="ledgerSearch"
                type="text"
                placeholder="Search date, notes..."
                class="w-full pl-8 pr-3 py-1 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white focus:outline-hidden focus:border-primary"
              />
            </div>
          </div>

          <!-- Ledger Table -->
          <div class="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 font-semibold">
                  <th class="p-2.5">Date</th>
                  <th class="p-2.5">Action</th>
                  <th class="p-2.5 text-right">Amount (₹)</th>
                  <th class="p-2.5 text-right">NAV (₹)</th>
                  <th class="p-2.5 text-right">Units</th>
                  <th class="p-2.5 text-right">Balance Units</th>
                  <th class="p-2.5">Notes</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-neutral-100 dark:divide-neutral-800/60 font-mono">
                <tr
                  v-for="tx in paginatedTransactions"
                  :key="tx.id"
                  class="hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 transition-colors"
                >
                  <td class="p-2.5 whitespace-nowrap text-neutral-900 dark:text-white font-medium">
                    {{ tx.transactionDate }}
                  </td>
                  <td class="p-2.5 whitespace-nowrap font-sans font-semibold">
                    <span
                      class="px-2 py-0.5 rounded text-[10px]"
                      :class="tx.transactionType === 'BUY_SIP'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : tx.transactionType === 'BUY_LUMPSUM'
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'"
                    >
                      {{ tx.transactionType === 'BUY_SIP' ? 'SIP' : tx.transactionType === 'BUY_LUMPSUM' ? 'Lumpsum' : 'Redemption' }}
                    </span>
                  </td>
                  <td class="p-2.5 text-right whitespace-nowrap font-bold text-neutral-900 dark:text-white">
                    ₹{{ tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }) }}
                  </td>
                  <td class="p-2.5 text-right whitespace-nowrap text-neutral-500 dark:text-neutral-400">
                    ₹{{ tx.nav.toFixed(2) }}
                  </td>
                  <td
                    class="p-2.5 text-right whitespace-nowrap font-bold"
                    :class="tx.transactionType === 'REDEMPTION' ? 'text-rose-500' : 'text-emerald-500'"
                  >
                    {{ tx.transactionType === 'REDEMPTION' ? '-' : '+' }}{{ tx.units.toFixed(4) }}
                  </td>
                  <td class="p-2.5 text-right whitespace-nowrap text-neutral-600 dark:text-neutral-300 font-medium">
                    {{ tx.runningUnits.toFixed(4) }}
                  </td>
                  <td class="p-2.5 text-neutral-400 text-[11px] font-sans truncate max-w-[150px]">
                    {{ tx.notes || '—' }}
                  </td>
                </tr>

                <tr v-if="paginatedTransactions.length === 0">
                  <td colspan="7" class="py-8 text-center text-neutral-400 font-sans">
                    No transactions found matching your criteria.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div v-if="totalPages > 1" class="flex items-center justify-between text-xs text-neutral-400 px-1 pt-1">
            <div>
              Showing {{ ((currentPage - 1) * pageSize) + 1 }} - {{ Math.min(currentPage * pageSize, filteredTransactions.length) }} of {{ filteredTransactions.length }} transactions
            </div>
            <div class="flex items-center gap-1 font-mono">
              <button
                type="button"
                :disabled="currentPage <= 1"
                class="px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 disabled:opacity-30 cursor-pointer"
                @click="currentPage--"
              >
                Prev
              </button>
              <span class="px-2 font-bold">{{ currentPage }} / {{ totalPages }}</span>
              <button
                type="button"
                :disabled="currentPage >= totalPages"
                class="px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 disabled:opacity-30 cursor-pointer"
                @click="currentPage++"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between w-full">
        <div>
          <span v-if="fundData?.realizedPnL" class="text-xs text-neutral-400">
            Past Realized P&L:
            <strong :class="fundData.realizedPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'">
              {{ fundData.realizedPnL >= 0 ? '+' : '' }}{{ fmtCur(fundData.realizedPnL) }}
            </strong>
          </span>
        </div>

        <div class="flex items-center gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            class="cursor-pointer"
            @click="isOpen = false"
          >
            Close
          </UButton>
          <UButton
            v-if="fundData"
            color="primary"
            size="sm"
            icon="i-lucide-plus-circle"
            class="cursor-pointer font-bold"
            @click="handleOpenLog"
          >
            Record SIP / Investment
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
