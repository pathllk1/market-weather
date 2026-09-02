<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import type {
  MarketStockSummary,
  ScreenerResponse,
  UserMarketView,
  MarketViewDetailResponse
} from '../../types/market'

definePageMeta({
  layout: 'default'
})

// Navigation mode: 'views' (Preferred OHLCV Views) | 'screener' (Full Market Matrix)
const activeTab = ref<'views' | 'screener'>('views')

// --- Screener State ---
const searchQuery = ref('')
const selectedPreset = ref('all')
const currentPage = ref(1)
const pageSize = ref(20)
const sortBy = ref('overall_score')
const sortOrder = ref<'asc' | 'desc'>('desc')

const isLoading = ref(false)
const stocks = ref<MarketStockSummary[]>([])
const pagination = ref({
  total: 0,
  page: 1,
  limit: 20,
  totalPages: 1
})
const summary = ref({
  totalStocks: 0,
  bullishCount: 0,
  bearishCount: 0,
  neutralCount: 0,
  advancingCount: 0,
  decliningCount: 0,
  avgScore: 0
})

// --- Custom Views (OHLCV) State ---
const userViews = ref<UserMarketView[]>([])
const activeViewId = ref<string | null>(null)
const activeViewDetail = ref<MarketViewDetailResponse | null>(null)
const isLoadingView = ref(false)
const isViewModalOpen = ref(false)
const viewBeingEdited = ref<UserMarketView | null>(null)

// --- Smart Auto-Refresh State (60s loop with tab visibility awareness) ---
const isAutoRefreshEnabled = ref(true)
const autoRefreshIntervalSec = 60
const countdown = ref(autoRefreshIntervalSec)
const lastUpdatedTime = ref<Date | null>(null)
const lastUpdatedText = ref('Just now')
const isManualRefreshing = ref(false)
let countdownTimer: ReturnType<typeof setInterval> | null = null
let relativeTimeTimer: ReturnType<typeof setInterval> | null = null

interface SearchEquityResult {
  symbol: string
  cleanSymbol: string
  companyName: string
  price: number
  overallScore: number
}

const quickAddSymbol = ref('')
const quickSearchSuggestions = ref<SearchEquityResult[]>([])
const isQuickSearching = ref(false)
const showQuickSearchDropdown = ref(false)
const activeSuggestionIndex = ref(-1)
const allAvailableSymbols = ref<{ symbol: string, company_name: string }[]>([])
const viewDisplayMode = ref<'table' | 'cards'>('table')
const hasUserManuallyToggledViewMode = ref(false)

function checkResponsiveViewMode() {
  if (typeof window === 'undefined') return
  if (!hasUserManuallyToggledViewMode.value) {
    viewDisplayMode.value = window.innerWidth < 768 ? 'cards' : 'table'
  }
}

// --- Detail Modal State (Charts & Radar) ---
const selectedSymbol = ref<string | null>(null)
const isModalOpen = ref(false)

function openDetail(symbol: string) {
  selectedSymbol.value = symbol
  isModalOpen.value = true
}

const presets = [
  { id: 'all', label: 'All Stocks', icon: 'i-lucide-layers' },
  { id: 'bullish', label: 'Top Bullish (Score ≥75)', icon: 'i-lucide-flame', color: 'success' },
  { id: 'oversold', label: 'Oversold (RSI ≤35)', icon: 'i-lucide-arrow-down-circle', color: 'warning' },
  { id: 'overbought', label: 'Overbought (RSI ≥70)', icon: 'i-lucide-alert-triangle', color: 'error' },
  { id: 'macd_cross', label: 'MACD Bullish Cross', icon: 'i-lucide-git-merge', color: 'primary' },
  { id: 'gainers', label: 'Top Gainers', icon: 'i-lucide-trending-up', color: 'success' },
  { id: 'losers', label: 'Top Losers', icon: 'i-lucide-trending-down', color: 'error' }
]

// --- Screener API Call ---
async function loadScreener() {
  try {
    isLoading.value = true
    const res = await $fetch<ScreenerResponse>('/api/market/screener', {
      query: {
        search: searchQuery.value,
        preset: selectedPreset.value,
        page: currentPage.value,
        limit: pageSize.value,
        sortBy: sortBy.value,
        sortOrder: sortOrder.value
      }
    })

    stocks.value = res.stocks || []
    pagination.value = res.pagination || { total: 0, page: 1, limit: 20, totalPages: 1 }
    summary.value = res.summary || summary.value

    // Cache symbols list for quick add selector
    if (allAvailableSymbols.value.length === 0 && res.stocks) {
      allAvailableSymbols.value = res.stocks.map(s => ({
        symbol: s.symbol,
        company_name: s.company_name
      }))
    }
  } catch (err) {
    console.error('Failed to load market screener data:', err)
  } finally {
    isLoading.value = false
  }
}

// --- Views API Calls ---
async function loadUserViews() {
  try {
    isLoadingView.value = true
    const res = await $fetch<{ views: UserMarketView[] }>('/api/market/views')
    userViews.value = res.views || []

    if (userViews.value.length > 0) {
      if (!activeViewId.value || !userViews.value.some(v => v.id === activeViewId.value)) {
        activeViewId.value = userViews.value[0]?.id || null
      }
      if (activeViewId.value) {
        await loadActiveView(activeViewId.value)
      }
    } else {
      activeViewId.value = null
      activeViewDetail.value = null
    }
  } catch (err) {
    console.error('Failed to load user views:', err)
  } finally {
    isLoadingView.value = false
  }
}

function updateRelativeTime() {
  if (!lastUpdatedTime.value) {
    lastUpdatedText.value = 'Just now'
    return
  }
  const diffSec = Math.floor((Date.now() - lastUpdatedTime.value.getTime()) / 1000)
  if (diffSec < 5) {
    lastUpdatedText.value = 'Just now'
  } else if (diffSec < 60) {
    lastUpdatedText.value = `${diffSec}s ago`
  } else {
    const min = Math.floor(diffSec / 60)
    lastUpdatedText.value = `${min}m ago`
  }
}

async function loadActiveView(viewId: string, force = false) {
  try {
    // Only show full loading skeleton if switching to a completely different view
    if (!activeViewDetail.value || activeViewDetail.value.view.id !== viewId) {
      isLoadingView.value = true
    } else {
      isManualRefreshing.value = true
    }
    const queryParam = force ? '?refresh=true' : ''
    const res = await $fetch<MarketViewDetailResponse>(`/api/market/views/${viewId}${queryParam}`)
    activeViewDetail.value = res
    lastUpdatedTime.value = new Date()
    countdown.value = autoRefreshIntervalSec
    updateRelativeTime()
  } catch (err) {
    console.error('Failed to load view details:', err)
  } finally {
    isLoadingView.value = false
    isManualRefreshing.value = false
  }
}

async function refreshActiveView(force = false) {
  if (!activeViewId.value) return
  await loadActiveView(activeViewId.value, force)
}

function startAutoRefresh() {
  stopAutoRefresh()
  countdown.value = autoRefreshIntervalSec

  countdownTimer = setInterval(async () => {
    // Only count down and poll if enabled, tab is active, in 'views' mode, and view selected
    if (!isAutoRefreshEnabled.value || document.hidden || activeTab.value !== 'views' || !activeViewId.value) {
      return
    }

    // Do not count down while a view fetch or refresh is actively in progress
    if (isManualRefreshing.value || isLoadingView.value) {
      return
    }

    if (countdown.value > 1) {
      countdown.value--
    } else {
      countdown.value = autoRefreshIntervalSec
      await refreshActiveView(true)
    }
  }, 1000)

  relativeTimeTimer = setInterval(updateRelativeTime, 3000)
}

function stopAutoRefresh() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  if (relativeTimeTimer) {
    clearInterval(relativeTimeTimer)
    relativeTimeTimer = null
  }
}

function handleVisibilityChange() {
  if (!document.hidden && lastUpdatedTime.value) {
    const elapsedSec = (Date.now() - lastUpdatedTime.value.getTime()) / 1000
    if (elapsedSec >= autoRefreshIntervalSec && isAutoRefreshEnabled.value && activeTab.value === 'views') {
      refreshActiveView(true)
    }
  }
}

function toggleAutoRefresh() {
  isAutoRefreshEnabled.value = !isAutoRefreshEnabled.value
  if (isAutoRefreshEnabled.value) {
    countdown.value = autoRefreshIntervalSec
  }
}

function handleSelectView(viewId: string) {
  activeViewId.value = viewId
  loadActiveView(viewId)
}

function openCreateModal() {
  viewBeingEdited.value = null
  isViewModalOpen.value = true
}

function openEditModal(view: UserMarketView) {
  viewBeingEdited.value = view
  isViewModalOpen.value = true
}

async function handleViewSaved(savedView: UserMarketView) {
  await loadUserViews()
  activeViewId.value = savedView.id
  await loadActiveView(savedView.id)
}

async function handleDeleteView(viewId: string) {
  if (!confirm('Are you sure you want to delete this preferred view?')) return
  try {
    await $fetch(`/api/market/views/${viewId}`, { method: 'DELETE' })
    if (activeViewId.value === viewId) {
      activeViewId.value = null
    }
    await loadUserViews()
  } catch (err) {
    console.error('Failed to delete view:', err)
  }
}

async function handleRemoveEquity(symbol: string) {
  if (!activeViewId.value) return
  try {
    await $fetch(`/api/market/views/${activeViewId.value}/equity`, {
      method: 'POST',
      body: { action: 'remove', symbol }
    })
    await loadActiveView(activeViewId.value)
    // Update count in sidebar view
    const found = userViews.value.find(v => v.id === activeViewId.value)
    if (found) {
      found.symbols = found.symbols.filter(s => s !== symbol)
      found.stockCount = found.symbols.length
    }
  } catch (err) {
    console.error('Failed to remove equity:', err)
  }
}

async function handleQuickAddEquity() {
  const sym = quickAddSymbol.value.trim().toUpperCase()
  if (!sym || !activeViewId.value) return

  try {
    await $fetch(`/api/market/views/${activeViewId.value}/equity`, {
      method: 'POST',
      body: { action: 'add', symbol: sym }
    })
    quickAddSymbol.value = ''
    await loadActiveView(activeViewId.value)
    // Update count in sidebar view
    const found = userViews.value.find(v => v.id === activeViewId.value)
    if (found && !found.symbols.includes(sym)) {
      found.symbols.push(sym)
      found.stockCount = found.symbols.length
    }
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    alert((err as any)?.data?.statusMessage || (err as Error).message || 'Failed to add equity.')
  }
}

let quickSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null
watch(quickAddSymbol, (q) => {
  const query = q.trim()
  activeSuggestionIndex.value = -1
  if (!query) {
    quickSearchSuggestions.value = []
    showQuickSearchDropdown.value = false
    return
  }

  if (quickSearchDebounceTimer) clearTimeout(quickSearchDebounceTimer)
  quickSearchDebounceTimer = setTimeout(async () => {
    isQuickSearching.value = true
    try {
      const res = await $fetch<{ results: SearchEquityResult[] }>('/api/market/search', {
        query: { q: query }
      })
      quickSearchSuggestions.value = res.results || []
      showQuickSearchDropdown.value = true
    } catch {
      quickSearchSuggestions.value = []
    } finally {
      isQuickSearching.value = false
    }
  }, 150)
})

function onQuickSearchKeydown(e: KeyboardEvent) {
  if (!showQuickSearchDropdown.value || quickSearchSuggestions.value.length === 0) {
    if (e.key === 'Enter') handleQuickAddEquity()
    return
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeSuggestionIndex.value = (activeSuggestionIndex.value + 1) % quickSearchSuggestions.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeSuggestionIndex.value = (activeSuggestionIndex.value - 1 + quickSearchSuggestions.value.length) % quickSearchSuggestions.value.length
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const target = quickSearchSuggestions.value[activeSuggestionIndex.value]
    if (target) {
      addSuggestedEquity(target.symbol)
    } else {
      handleQuickAddEquity()
    }
  } else if (e.key === 'Escape') {
    showQuickSearchDropdown.value = false
    activeSuggestionIndex.value = -1
  }
}

async function addSuggestedEquity(symbol: string) {
  if (!activeViewId.value) return
  try {
    await $fetch(`/api/market/views/${activeViewId.value}/equity`, {
      method: 'POST',
      body: { action: 'add', symbol }
    })
    quickAddSymbol.value = ''
    showQuickSearchDropdown.value = false
    await loadActiveView(activeViewId.value)
    const found = userViews.value.find(v => v.id === activeViewId.value)
    if (found && !found.symbols.includes(symbol)) {
      found.symbols.push(symbol)
      found.stockCount = found.symbols.length
    }
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    alert((err as any)?.data?.statusMessage || (err as Error).message || 'Failed to add equity.')
  }
}

async function addStockToView(symbol: string, viewId: string) {
  try {
    await $fetch(`/api/market/views/${viewId}/equity`, {
      method: 'POST',
      body: { action: 'add', symbol }
    })
    alert(`Added ${symbol} to view successfully!`)
    if (activeViewId.value === viewId) {
      await loadActiveView(viewId)
    }
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    alert((err as any)?.data?.statusMessage || (err as Error).message || 'Failed to add equity to view.')
  }
}

// Watchers
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(searchQuery, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    currentPage.value = 1
    loadScreener()
  }, 300)
})

watch([selectedPreset, pageSize], () => {
  currentPage.value = 1
  loadScreener()
})

watch(currentPage, () => {
  loadScreener()
})

function handleSort(col: string) {
  if (sortBy.value === col) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = col
    sortOrder.value = 'desc'
  }
  currentPage.value = 1
  loadScreener()
}

function getRsiColor(rsi?: number) {
  if (rsi === undefined || rsi === null) return 'neutral'
  if (rsi >= 70) return 'error'
  if (rsi <= 35) return 'warning'
  return 'neutral'
}

function getScoreColor(score?: number) {
  if (score === undefined || score === null) return 'neutral'
  if (score >= 75) return 'success'
  if (score >= 50) return 'primary'
  if (score >= 35) return 'warning'
  return 'error'
}

onMounted(() => {
  checkResponsiveViewMode()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', checkResponsiveViewMode)
  }
  loadUserViews()
  loadScreener()
  startAutoRefresh()
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
})

onUnmounted(() => {
  stopAutoRefresh()
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', checkResponsiveViewMode)
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
})
</script>

<template>
  <div class="w-full px-4 sm:px-6 py-3.5 space-y-3.5">
    <!-- Streamlined Compact Header Strip (Ultra High-Density) -->
    <div class="w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-2 flex flex-wrap items-center justify-between gap-3 shadow-xs">
      <div class="flex items-center gap-3">
        <h1 class="text-base font-black text-neutral-900 dark:text-white tracking-tight flex items-center gap-2">
          <span>Market Intelligence</span>
          <span class="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {{ summary.totalStocks || '494' }} Equities Live
          </span>
        </h1>
      </div>

      <!-- Quick Metrics Ribbon (Single row, compact badges) -->
      <div class="flex items-center flex-wrap gap-2 text-[11px]">
        <div class="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/60 px-2.5 py-1">
          <span class="text-neutral-500 dark:text-neutral-400 text-[10px] font-medium">Breadth:</span>
          <span class="font-bold text-emerald-600 dark:text-emerald-400">{{ summary.advancingCount }} Adv</span>
          <span class="text-neutral-400">/</span>
          <span class="font-bold text-rose-600 dark:text-rose-400">{{ summary.decliningCount }} Dec</span>
        </div>

        <div class="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/60 px-2.5 py-1">
          <span class="text-neutral-500 dark:text-neutral-400 text-[10px] font-medium">Bullish:</span>
          <span class="font-bold text-emerald-600 dark:text-emerald-400">{{ summary.bullishCount }}</span>
        </div>

        <div class="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/60 px-2.5 py-1">
          <span class="text-neutral-500 dark:text-neutral-400 text-[10px] font-medium">Bearish:</span>
          <span class="font-bold text-rose-600 dark:text-rose-400">{{ summary.bearishCount }}</span>
        </div>

        <div class="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/60 px-2.5 py-1">
          <span class="text-neutral-500 dark:text-neutral-400 text-[10px] font-medium">Avg Score:</span>
          <span class="font-bold text-primary">{{ summary.avgScore }}/100</span>
        </div>
      </div>
    </div>

    <!-- Mode Switcher Navigation Tabs -->
    <div class="flex items-center justify-between border-b border-default/60 pb-3">
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all"
          :class="activeTab === 'views' ? 'bg-primary text-white shadow-md' : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'"
          @click="activeTab = 'views'"
        >
          <UIcon
            name="i-lucide-candlestick-chart"
            class="h-4 w-4"
          />
          <span>Preferred Views (OHLCV)</span>
          <UBadge
            v-if="userViews.length > 0"
            variant="solid"
            :color="activeTab === 'views' ? 'neutral' : 'primary'"
            size="xs"
            class="ml-1"
          >
            {{ userViews.length }}
          </UBadge>
        </button>

        <button
          type="button"
          class="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all"
          :class="activeTab === 'screener' ? 'bg-primary text-white shadow-md' : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'"
          @click="activeTab = 'screener'"
        >
          <UIcon
            name="i-lucide-table-properties"
            class="h-4 w-4"
          />
          <span>Market Screener</span>
          <span class="text-[10px] font-normal opacity-80">(All 494 Equities)</span>
        </button>
      </div>

      <!-- Right action button -->
      <div class="flex items-center gap-2">
        <UButton
          v-if="activeTab === 'views'"
          size="sm"
          color="primary"
          variant="soft"
          icon="i-lucide-plus"
          :disabled="userViews.length >= 20"
          @click="openCreateModal"
        >
          New View
        </UButton>
      </div>
    </div>

    <!-- TAB 1: PREFERRED VIEWS (OHLCV) WITH LEFT SIDEBAR -->
    <div
      v-if="activeTab === 'views'"
      class="flex flex-col lg:flex-row items-start gap-6 w-full"
    >
      <!-- Left Panel: View Sidebar -->
      <MarketViewSidebar
        :views="userViews"
        :selected-view-id="activeViewId"
        :loading="isLoadingView"
        class="shrink-0"
        @select="handleSelectView"
        @create="openCreateModal"
        @edit="openEditModal"
        @delete="handleDeleteView"
      />

      <!-- Right Panel: Active View Content Area -->
      <main class="flex-1 w-full min-w-0 space-y-5">
        <!-- View Header Card (relative z-30 to ensure floating autocomplete sits above table) -->
        <div
          v-if="activeViewDetail?.view"
          class="relative z-30 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm"
        >
          <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div class="space-y-1 min-w-0">
              <div class="flex items-center gap-2.5">
                <h2 class="text-lg font-black text-neutral-900 dark:text-white truncate">
                  {{ activeViewDetail.view.name }}
                </h2>
                <UBadge
                  color="primary"
                  variant="subtle"
                  size="xs"
                >
                  {{ activeViewDetail.view.stockCount }} Equities
                </UBadge>
                <span class="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  <span class="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Yahoo Quotes
                </span>
              </div>
              <p
                v-if="activeViewDetail.view.description"
                class="text-xs text-neutral-500 dark:text-neutral-400"
              >
                {{ activeViewDetail.view.description }}
              </p>
            </div>

            <!-- Action & Search Toolbar (Full-width on mobile, expanded on desktop) -->
            <div class="relative z-40 flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full xl:w-auto">
              <!-- Quick Add Equity Input Toolbar with Live Autocomplete Dropdown -->
              <div class="flex items-center gap-2 w-full md:w-auto flex-1">
                <div class="relative w-full md:w-80 lg:w-96 xl:w-[420px]">
                  <UInput
                    v-model="quickAddSymbol"
                    placeholder="Type symbol to add (e.g. TATA, INFY)..."
                    size="sm"
                    class="w-full"
                    icon="i-lucide-search"
                    @focus="quickSearchSuggestions.length > 0 ? (showQuickSearchDropdown = true) : null"
                    @keydown="onQuickSearchKeydown"
                  />

                  <!-- Floating Dropdown Suggestions while typing (Solid 100% Opaque Background) -->
                  <div
                    v-if="showQuickSearchDropdown && (quickSearchSuggestions.length > 0 || isQuickSearching)"
                    class="absolute left-0 top-full z-[100] mt-1.5 max-h-80 w-full overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-1.5 shadow-2xl ring-1 ring-black/10 dark:ring-white/10 divide-y divide-neutral-100 dark:divide-neutral-800"
                  >
                    <div
                      v-if="isQuickSearching"
                      class="flex items-center justify-center p-3.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400"
                    >
                      <UIcon
                        name="i-lucide-loader-2"
                        class="mr-2 h-4 w-4 animate-spin text-primary"
                      />
                      <span>Searching 494 Indian equities...</span>
                    </div>

                    <div
                      v-else-if="quickSearchSuggestions.length === 0"
                      class="p-3.5 text-center text-xs font-medium text-neutral-500 dark:text-neutral-400"
                    >
                      No matching equities found
                    </div>

                    <div
                      v-for="(item, idx) in quickSearchSuggestions"
                      :key="item.symbol"
                      class="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 transition-colors"
                      :class="activeSuggestionIndex === idx ? 'bg-primary/15 dark:bg-primary/25' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'"
                      @click="addSuggestedEquity(item.symbol)"
                    >
                      <div class="min-w-0 flex-1 pr-2">
                        <div class="flex items-center gap-1.5">
                          <span class="font-black text-xs text-neutral-900 dark:text-white">{{ item.cleanSymbol }}</span>
                          <span class="rounded bg-neutral-100 dark:bg-neutral-800 px-1 py-0.2 font-mono text-[9px] font-semibold text-neutral-600 dark:text-neutral-400">NSE</span>
                          <span
                            v-if="activeViewDetail?.view.symbols.includes(item.symbol)"
                            class="rounded bg-emerald-500/15 px-1.5 py-0.2 text-[9px] font-bold text-emerald-600 dark:text-emerald-400"
                          >
                            In View
                          </span>
                        </div>
                        <div class="truncate text-[11px] font-normal text-neutral-500 dark:text-neutral-400">
                          {{ item.companyName }}
                        </div>
                      </div>

                      <div class="flex items-center gap-2 shrink-0">
                        <span
                          v-if="item.price"
                          class="font-mono text-xs font-black text-neutral-900 dark:text-white"
                        >₹{{ item.price }}</span>
                        <UButton
                          size="xs"
                          color="primary"
                          variant="soft"
                          :disabled="activeViewDetail?.view.symbols.includes(item.symbol)"
                          icon="i-lucide-plus"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <UButton
                  size="sm"
                  color="primary"
                  variant="solid"
                  class="shrink-0"
                  :disabled="!quickAddSymbol.trim()"
                  @click="handleQuickAddEquity"
                >
                  Add
                </UButton>
              </div>

              <!-- Controls Toolbar -->
              <div class="flex items-center justify-between md:justify-end gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                <!-- Smart Live Telemetry & Refresh Controller -->
                <div class="flex items-center gap-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100/70 dark:bg-neutral-800/60 px-2.5 py-1">
                  <!-- Status & Auto-refresh toggle button -->
                  <button
                    type="button"
                    class="flex items-center gap-1.5 text-xs font-semibold transition-colors select-none"
                    :class="isAutoRefreshEnabled ? 'text-neutral-900 dark:text-white hover:text-primary' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'"
                    :title="isAutoRefreshEnabled ? 'Auto-refresh active (60s loop). Click to pause.' : 'Auto-refresh paused. Click to resume.'"
                    @click="toggleAutoRefresh"
                  >
                    <span class="relative flex h-2 w-2">
                      <span
                        v-if="isAutoRefreshEnabled"
                        class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
                      />
                      <span
                        class="relative inline-flex rounded-full h-2 w-2"
                        :class="isAutoRefreshEnabled ? 'bg-emerald-500' : 'bg-neutral-400'"
                      />
                    </span>
                    <span class="font-mono text-[11px]">
                      {{ isAutoRefreshEnabled ? `Auto (${countdown}s)` : 'Paused' }}
                    </span>
                  </button>

                  <span class="h-3 w-px bg-neutral-300 dark:bg-neutral-700" />

                  <!-- Relative Time of Last Sync -->
                  <span
                    class="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono hidden sm:inline-block"
                    :title="lastUpdatedTime ? lastUpdatedTime.toLocaleTimeString() : ''"
                  >
                    {{ lastUpdatedText }}
                  </span>

                  <!-- Manual Force-Refresh Button -->
                  <button
                    type="button"
                    class="flex items-center justify-center p-1 rounded-md text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-neutral-700/60 transition-all"
                    :class="{ 'opacity-50 pointer-events-none': isManualRefreshing || isLoadingView }"
                    title="Force refresh quotes from Yahoo Finance"
                    @click="activeViewId && refreshActiveView(true)"
                  >
                    <UIcon
                      name="i-lucide-refresh-cw"
                      class="h-3.5 w-3.5"
                      :class="{ 'animate-spin text-primary': isManualRefreshing || isLoadingView }"
                    />
                  </button>
                </div>

                <!-- Layout Switcher (Table vs Cards) -->
                <div class="flex items-center rounded-xl border border-default/60 p-0.5 bg-muted/30">
                  <button
                    type="button"
                    class="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all"
                    :class="viewDisplayMode === 'table' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                    title="Institutional Table View"
                    @click="viewDisplayMode = 'table'; hasUserManuallyToggledViewMode = true"
                  >
                    <UIcon
                      name="i-lucide-table-properties"
                      class="h-3.5 w-3.5"
                    />
                    <span>Table</span>
                  </button>
                  <button
                    type="button"
                    class="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all"
                    :class="viewDisplayMode === 'cards' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                    title="Card Matrix View"
                    @click="viewDisplayMode = 'cards'; hasUserManuallyToggledViewMode = true"
                  >
                    <UIcon
                      name="i-lucide-layout-grid"
                      class="h-3.5 w-3.5"
                    />
                    <span>Cards</span>
                  </button>
                </div>

                <UButton
                  size="sm"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-settings-2"
                  title="Configure View"
                  @click="openEditModal(activeViewDetail.view)"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Equities Data Display (Table by Default, Cards Option) -->
        <div v-if="activeViewDetail?.equities && activeViewDetail.equities.length > 0">
          <MarketViewOhlcvTable
            v-if="viewDisplayMode === 'table'"
            :equities="activeViewDetail.equities"
            @inspect="openDetail"
            @remove="handleRemoveEquity"
          />

          <div
            v-else
            class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          >
            <MarketViewOhlcvCard
              v-for="equity in activeViewDetail.equities"
              :key="equity.symbol"
              :equity="equity"
              @inspect="openDetail"
              @remove="handleRemoveEquity"
            />
          </div>
        </div>

        <!-- Empty State in Active View -->
        <div
          v-else-if="!isLoadingView"
          class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-default/70 bg-surface/50 p-12 text-center"
        >
          <UIcon
            name="i-lucide-layers"
            class="mb-3 h-10 w-10 text-muted-foreground"
          />
          <h3 class="text-sm font-bold text-highlight">
            No Equities in this View
          </h3>
          <p class="mt-1 max-w-sm text-xs text-muted-foreground">
            Add equities using the input above or browse the Market Screener tab to discover and pin stocks to this view.
          </p>
          <div class="mt-4 flex items-center gap-2">
            <UButton
              size="sm"
              color="primary"
              variant="outline"
              icon="i-lucide-search"
              @click="activeTab = 'screener'"
            >
              Browse Screener
            </UButton>
          </div>
        </div>

        <!-- Loading State Skeleton -->
        <div
          v-if="isLoadingView"
          class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          <div
            v-for="i in 6"
            :key="i"
            class="h-48 animate-pulse rounded-xl border border-default/50 bg-muted/30 p-4"
          />
        </div>
      </main>
    </div>

    <!-- TAB 2: FULL MARKET SCREENER MATRIX -->
    <div
      v-else-if="activeTab === 'screener'"
      class="space-y-6"
    >
      <!-- Filter Toolbar -->
      <UCard class="w-full">
        <div class="space-y-4">
          <!-- Search & Settings Controls -->
          <div class="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div class="w-full sm:max-w-xl lg:max-w-2xl flex-1">
              <UInput
                v-model="searchQuery"
                icon="i-lucide-search"
                placeholder="Search by symbol or company name (e.g. RELIANCE, TCS)..."
                size="sm"
                class="w-full"
              />
            </div>

            <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
              <span class="text-xs text-muted">Rows:</span>
              <div class="flex gap-1">
                <UButton
                  v-for="size in [20, 50, 100]"
                  :key="size"
                  :variant="pageSize === size ? 'solid' : 'ghost'"
                  :color="pageSize === size ? 'primary' : 'neutral'"
                  size="xs"
                  @click="pageSize = size"
                >
                  {{ size }}
                </UButton>
              </div>

              <UButton
                color="neutral"
                variant="outline"
                size="xs"
                icon="i-lucide-refresh-cw"
                :loading="isLoading"
                @click="loadScreener"
              >
                Refresh
              </UButton>
            </div>
          </div>

          <!-- Filter Presets Badges -->
          <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-default/60">
            <span class="text-xs font-semibold text-muted mr-1">Pre-built Screens:</span>
            <UButton
              v-for="p in presets"
              :key="p.id"
              :variant="selectedPreset === p.id ? 'solid' : 'subtle'"
              :color="(selectedPreset === p.id ? (p.color || 'primary') : 'neutral') as any"
              size="xs"
              :icon="p.icon"
              @click="selectedPreset = p.id"
            >
              {{ p.label }}
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- Main Screener Data Matrix Table -->
      <UCard
        class="w-full overflow-hidden"
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-default bg-muted/40 font-semibold text-muted select-none">
                <th
                  class="p-3 cursor-pointer hover:text-foreground transition-colors"
                  @click="handleSort('symbol')"
                >
                  <div class="flex items-center gap-1">
                    Symbol & Name
                    <UIcon
                      v-if="sortBy === 'symbol'"
                      :name="sortOrder === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'"
                      class="w-3 h-3 text-primary"
                    />
                  </div>
                </th>

                <th
                  class="p-3 text-right cursor-pointer hover:text-foreground transition-colors"
                  @click="handleSort('current_price')"
                >
                  <div class="flex items-center justify-end gap-1">
                    Price
                    <UIcon
                      v-if="sortBy === 'current_price'"
                      :name="sortOrder === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'"
                      class="w-3 h-3 text-primary"
                    />
                  </div>
                </th>

                <th
                  class="p-3 text-right cursor-pointer hover:text-foreground transition-colors"
                  @click="handleSort('percentage_change')"
                >
                  <div class="flex items-center justify-end gap-1">
                    Day Change
                    <UIcon
                      v-if="sortBy === 'percentage_change'"
                      :name="sortOrder === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'"
                      class="w-3 h-3 text-primary"
                    />
                  </div>
                </th>

                <th
                  class="p-3 text-center cursor-pointer hover:text-foreground transition-colors"
                  @click="handleSort('rsi_14')"
                >
                  <div class="flex items-center justify-center gap-1">
                    RSI (14)
                    <UIcon
                      v-if="sortBy === 'rsi_14'"
                      :name="sortOrder === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'"
                      class="w-3 h-3 text-primary"
                    />
                  </div>
                </th>

                <th class="p-3 text-center">
                  MACD Hist
                </th>

                <th class="p-3 text-center">
                  Supertrend
                </th>

                <th
                  class="p-3 text-center cursor-pointer hover:text-foreground transition-colors"
                  @click="handleSort('overall_score')"
                >
                  <div class="flex items-center justify-center gap-1">
                    Quant Score
                    <UIcon
                      v-if="sortBy === 'overall_score'"
                      :name="sortOrder === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'"
                      class="w-3 h-3 text-primary"
                    />
                  </div>
                </th>

                <th class="p-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody class="divide-y divide-default">
              <tr
                v-if="isLoading"
                class="text-center"
              >
                <td
                  colspan="8"
                  class="p-12 text-muted"
                >
                  <div class="flex flex-col items-center justify-center gap-2">
                    <UIcon
                      name="i-lucide-loader-2"
                      class="w-6 h-6 animate-spin text-primary"
                    />
                    <span>Loading market data...</span>
                  </div>
                </td>
              </tr>

              <tr
                v-else-if="stocks.length === 0"
                class="text-center"
              >
                <td
                  colspan="8"
                  class="p-12 text-muted"
                >
                  <div class="flex flex-col items-center justify-center gap-2">
                    <UIcon
                      name="i-lucide-table-properties"
                      class="w-8 h-8 text-muted/50"
                    />
                    <span class="font-medium">No equities match your filter criteria</span>
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="primary"
                      @click="searchQuery = ''; selectedPreset = 'all'"
                    >
                      Clear Filters
                    </UButton>
                  </div>
                </td>
              </tr>

              <tr
                v-for="stock in stocks"
                :key="stock.symbol"
                class="hover:bg-muted/30 transition-colors cursor-pointer"
                @click="openDetail(stock.symbol)"
              >
                <td class="p-3">
                  <div class="flex items-center gap-2">
                    <div>
                      <div class="font-bold text-foreground flex items-center gap-1.5">
                        {{ stock.symbol }}
                        <span class="text-[10px] font-normal px-1 py-0.2 rounded bg-muted text-muted font-mono">NSE</span>
                      </div>
                      <div class="text-[11px] text-muted truncate max-w-[200px] sm:max-w-[280px]">
                        {{ stock.company_name }}
                      </div>
                    </div>
                  </div>
                </td>

                <td class="p-3 text-right font-mono font-medium">
                  ₹{{ stock.current_price?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
                </td>

                <td class="p-3 text-right font-mono">
                  <div
                    :class="stock.percentage_change >= 0 ? 'text-success' : 'text-error'"
                    class="font-semibold"
                  >
                    {{ stock.percentage_change >= 0 ? '+' : '' }}{{ stock.percentage_change?.toFixed(2) }}%
                  </div>
                  <div class="text-[10px] text-muted">
                    {{ stock.price_change >= 0 ? '+' : '' }}{{ stock.price_change?.toFixed(2) }}
                  </div>
                </td>

                <td class="p-3 text-center font-mono">
                  <UBadge
                    :color="getRsiColor(stock.rsi_14) as any"
                    variant="subtle"
                    size="xs"
                  >
                    {{ stock.rsi_14?.toFixed(1) }}
                  </UBadge>
                </td>

                <td class="p-3 text-center font-mono">
                  <span
                    v-if="stock.macd_hist !== undefined && stock.macd_hist !== null"
                    :class="stock.macd_hist >= 0 ? 'text-success font-semibold' : 'text-error font-semibold'"
                  >
                    {{ stock.macd_hist >= 0 ? '+' : '' }}{{ stock.macd_hist.toFixed(2) }}
                  </span>
                  <span
                    v-else
                    class="text-muted"
                  >-</span>
                </td>

                <td class="p-3 text-center">
                  <UBadge
                    :color="(stock.supertrend_trend === '1' || stock.supertrend_trend === '1.0' || stock.supertrend_trend?.toLowerCase() === 'bullish') ? 'success' : 'error'"
                    variant="subtle"
                    size="xs"
                  >
                    {{ (stock.supertrend_trend === '1' || stock.supertrend_trend === '1.0' || stock.supertrend_trend?.toLowerCase() === 'bullish') ? 'Bullish' : 'Bearish' }}
                  </UBadge>
                </td>

                <td class="p-3 text-center">
                  <UBadge
                    :color="getScoreColor(stock.overall_score) as any"
                    variant="solid"
                    size="xs"
                    class="font-mono font-bold px-2 py-0.5"
                  >
                    {{ stock.overall_score }}
                  </UBadge>
                </td>

                <td
                  class="p-3 text-right"
                  @click.stop
                >
                  <div class="flex items-center justify-end gap-1.5">
                    <!-- Quick Add to Active View Button -->
                    <UButton
                      v-if="activeViewId"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-plus"
                      title="Add to active view"
                      @click="addStockToView(stock.symbol, activeViewId)"
                    />

                    <UButton
                      color="primary"
                      variant="soft"
                      size="xs"
                      icon="i-lucide-candlestick-chart"
                      @click="openDetail(stock.symbol)"
                    >
                      Analyze
                    </UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination Footer -->
        <template #footer>
          <div class="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div class="text-muted">
              Page {{ pagination.page }} of {{ pagination.totalPages }} ({{ pagination.total }} stocks)
            </div>

            <div class="flex items-center gap-1.5">
              <UButton
                color="neutral"
                variant="outline"
                size="xs"
                icon="i-lucide-chevron-left"
                :disabled="pagination.page <= 1"
                @click="currentPage--"
              >
                Previous
              </UButton>

              <span class="px-2 font-mono text-muted">
                {{ pagination.page }} / {{ pagination.totalPages }}
              </span>

              <UButton
                color="neutral"
                variant="outline"
                size="xs"
                icon="i-lucide-chevron-right"
                :disabled="pagination.page >= pagination.totalPages"
                @click="currentPage++"
              >
                Next
              </UButton>
            </div>
          </div>
        </template>
      </UCard>
    </div>

    <!-- Create / Edit Preferred View Modal -->
    <MarketCreateViewModal
      v-model="isViewModalOpen"
      :view-to-edit="viewBeingEdited"
      :available-symbols="allAvailableSymbols"
      @saved="handleViewSaved"
    />

    <!-- Deep-Dive Modal (Candlestick Chart & Indicator Radar) -->
    <MarketStockDetailModal
      v-model="isModalOpen"
      :symbol="selectedSymbol"
    />
  </div>
</template>
