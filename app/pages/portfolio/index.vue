<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type {
  Portfolio,
  HoldingPosition,
  PortfolioSummaryResponse,
  PortfolioTrade,
  TaxSummary,
  RebalanceItem,
  TradeType
} from '~/types/portfolio'

// Page Meta & SEO
useHead({
  title: 'Enterprise Portfolio Management — Market Intelligence & Risk Suite',
  meta: [
    {
      name: 'description',
      content: 'Institutional-grade equity portfolio management, real-time mark-to-market holdings, risk metrics, tax loss harvesting, and rebalancing.'
    }
  ]
})

// State: Portfolio List & Selection
const portfolios = ref<Portfolio[]>([])
const activePortfolioId = ref<string>('')
const isLoadingPortfolios = ref(true)
const isRefreshing = ref(false)

// State: Active Portfolio Data
const summary = ref<PortfolioSummaryResponse | null>(null)
const trades = ref<PortfolioTrade[]>([])
const taxSummary = ref<TaxSummary | null>(null)
const rebalancePlan = ref<RebalanceItem[]>([])

// Master Mode Switcher: Tab 1 (Enterprise Analytics) vs Tab 2 (Operations)
const masterMode = ref<'analytics' | 'operations'>('analytics')

// State: Operational Sub-Tabs
type PortfolioTab = 'holdings' | 'risk' | 'allocation' | 'trades' | 'rebalance' | 'tax'
const activeTab = ref<PortfolioTab>('holdings')

const tabs = [
  { id: 'holdings', label: 'Holdings & Positions', icon: 'i-lucide-layers' },
  { id: 'risk', label: 'Risk & Analytics', icon: 'i-lucide-shield-alert' },
  { id: 'allocation', label: 'Asset Allocation', icon: 'i-lucide-pie-chart' },
  { id: 'trades', label: 'Trades Ledger', icon: 'i-lucide-scroll-text' },
  { id: 'rebalance', label: 'Rebalancing Advisor', icon: 'i-lucide-scale' },
  { id: 'tax', label: 'Capital Gains & Tax', icon: 'i-lucide-receipt' }
] as const

// Modals State
const isTradeModalOpen = ref(false)
const tradeModalSymbol = ref('')
const tradeModalType = ref<TradeType>('BUY')
const tradeToEdit = ref<PortfolioTrade | null>(null)

const isTargetModalOpen = ref(false)
const targetModalHolding = ref<HoldingPosition | null>(null)

const isPortfolioModalOpen = ref(false)
const portfolioToEdit = ref<Portfolio | null>(null)

const isStockDetailModalOpen = ref(false)
const selectedStockSymbol = ref('')

const isDematModalOpen = ref(false)
const selectedDematFilter = ref('')

// Search & Filter within Holdings
const holdingsSearch = ref('')

// Multi-Demat Broker Capital Allocation
const brokerAllocation = computed(() => {
  if (!summary.value) return []
  const brokerMap = new Map<string, number>()
  let totalVal = 0

  for (const h of summary.value.holdings) {
    if (h.dematBreakdown && h.dematBreakdown.length > 0) {
      for (const d of h.dematBreakdown) {
        const b = d.brokerName || 'Other Broker'
        brokerMap.set(b, (brokerMap.get(b) || 0) + d.currentValue)
        totalVal += d.currentValue
      }
    } else {
      brokerMap.set('General Broker', (brokerMap.get('General Broker') || 0) + h.currentValue)
      totalVal += h.currentValue
    }
  }

  const BROKER_COLORS: Record<string, string> = {
    Zerodha: '#387ed1',
    Groww: '#00d09c',
    Upstox: '#5d33ec',
    'Angel One': '#f04438',
    'ICICI Direct': '#f36e21',
    'HDFC Sky': '#004c8f',
    Dhan: '#2174ea',
    'Kotak Neo': '#e21927'
  }

  return Array.from(brokerMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([broker, val]) => ({
      name: broker,
      value: Number(val.toFixed(2)),
      percentage: totalVal > 0 ? Number(((val / totalVal) * 100).toFixed(1)) : 0,
      color: BROKER_COLORS[broker] || '#6366f1'
    }))
})

const activePortfolio = computed(() => {
  return portfolios.value.find(p => p.id === activePortfolioId.value) || portfolios.value[0] || null
})

const filteredHoldings = computed(() => {
  if (!summary.value) return []
  const list = summary.value.holdings
  if (!holdingsSearch.value.trim()) return list
  const q = holdingsSearch.value.toLowerCase().trim()
  return list.filter(h =>
    h.symbol.toLowerCase().includes(q) ||
    h.companyName.toLowerCase().includes(q) ||
    h.sector?.toLowerCase().includes(q)
  )
})

// API Operations
async function fetchPortfolios(selectId?: string) {
  try {
    isLoadingPortfolios.value = true
    const res = await $fetch<{ portfolios: Portfolio[] }>('/api/portfolio')
    portfolios.value = res.portfolios || []
    if (portfolios.value.length > 0) {
      if (selectId && portfolios.value.some(p => p.id === selectId)) {
        activePortfolioId.value = selectId
      } else if (!activePortfolioId.value || !portfolios.value.some(p => p.id === activePortfolioId.value)) {
        activePortfolioId.value = portfolios.value[0]!.id
      }
      await loadActivePortfolioData()
    } else {
      activePortfolioId.value = ''
      summary.value = null
      trades.value = []
      taxSummary.value = null
      rebalancePlan.value = []
    }
  } catch (err) {
    console.error('Failed to fetch portfolios:', err)
  } finally {
    isLoadingPortfolios.value = false
  }
}

async function loadActivePortfolioData() {
  if (!activePortfolioId.value) return
  isRefreshing.value = true
  try {
    const dematParam = selectedDematFilter.value ? `?dematId=${selectedDematFilter.value}` : ''
    const [sumRes, tradesRes, taxRes, rebRes] = await Promise.all([
      $fetch<PortfolioSummaryResponse>(`/api/portfolio/${activePortfolioId.value}/summary${dematParam}`),
      $fetch<{ trades: PortfolioTrade[] }>(`/api/portfolio/${activePortfolioId.value}/trades${dematParam}`),
      $fetch<TaxSummary>(`/api/portfolio/${activePortfolioId.value}/tax`),
      $fetch<{ plan: RebalanceItem[] }>(`/api/portfolio/${activePortfolioId.value}/rebalance`)
    ])

    summary.value = sumRes
    trades.value = tradesRes.trades || []
    taxSummary.value = taxRes
    rebalancePlan.value = rebRes.plan || []
  } catch (err) {
    console.error('Failed to load portfolio details:', err)
  } finally {
    isRefreshing.value = false
  }
}

watch(activePortfolioId, () => {
  loadActivePortfolioData()
})

watch(selectedDematFilter, () => {
  loadActivePortfolioData()
})

// Modal Open Handlers
function openAddTrade(sym = '', type: TradeType = 'BUY') {
  tradeToEdit.value = null
  tradeModalSymbol.value = sym
  tradeModalType.value = type
  isTradeModalOpen.value = true
}

function openEditTrade(trade: PortfolioTrade) {
  tradeToEdit.value = trade
  tradeModalSymbol.value = trade.symbol
  tradeModalType.value = trade.tradeType
  isTradeModalOpen.value = true
}

function openTargetModal(holding: HoldingPosition) {
  targetModalHolding.value = holding
  isTargetModalOpen.value = true
}

function openCreatePortfolio() {
  portfolioToEdit.value = null
  isPortfolioModalOpen.value = true
}

function openEditPortfolio() {
  portfolioToEdit.value = activePortfolio.value
  isPortfolioModalOpen.value = true
}

function openStockChart(sym: string) {
  selectedStockSymbol.value = sym
  isStockDetailModalOpen.value = true
}

function handleStockModalTrade(sym: string, type: TradeType = 'BUY') {
  isStockDetailModalOpen.value = false
  openAddTrade(sym, type)
}

async function handleDeleteTrade(tradeId: string) {
  if (!confirm('Are you sure you want to remove this trade record?')) return
  try {
    await $fetch(`/api/portfolio/${activePortfolioId.value}/trades/${tradeId}`, { method: 'DELETE' })
    await loadActivePortfolioData()
  } catch (err) {
    alert('Failed to delete trade')
  }
}

async function handleDeletePortfolio() {
  if (!confirm(`Are you sure you want to delete portfolio '${activePortfolio.value?.name}' and all associated trade records?`)) return
  try {
    await $fetch(`/api/portfolio/${activePortfolioId.value}`, { method: 'DELETE' })
    activePortfolioId.value = ''
    await fetchPortfolios()
  } catch (err) {
    alert('Failed to delete portfolio')
  }
}

// Formatters
function fmtCur(val: number) {
  return '₹' + (val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtLakhCr(val: number) {
  const abs = Math.abs(val || 0)
  if (abs >= 10000000) return '₹' + (val / 10000000).toFixed(2) + ' Cr'
  if (abs >= 100000) return '₹' + (val / 100000).toFixed(2) + ' L'
  return fmtCur(val)
}

onMounted(async () => {
  await fetchPortfolios()
  const route = useRoute()
  if (route.query.action === 'trade' && typeof route.query.symbol === 'string') {
    const sym = route.query.symbol
    const type = (route.query.type as TradeType) || 'BUY'
    openAddTrade(sym, type)
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- 1. LOADING SKELETON (Prevents hydration mismatch between SSR & client initial render) -->
    <div
      v-if="isLoadingPortfolios"
      class="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-12 text-center space-y-4 max-w-xl mx-auto shadow-xs my-16"
    >
      <div class="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
        <UIcon name="i-lucide-loader-2" class="h-6 w-6 animate-spin" />
      </div>
      <p class="text-xs text-neutral-400 font-medium">Loading portfolio intelligence...</p>
    </div>

    <!-- 2. EMPTY STATE WHEN USER HAS NO PORTFOLIOS -->
    <div
      v-else-if="portfolios.length === 0"
      class="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-12 text-center space-y-5 max-w-xl mx-auto shadow-xs my-16"
    >
      <div class="h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
        <UIcon name="i-lucide-briefcase" class="h-8 w-8" />
      </div>
      <div class="space-y-2">
        <h2 class="text-xl font-black text-neutral-900 dark:text-white">No Portfolios Created Yet</h2>
        <p class="text-xs text-neutral-500 leading-relaxed max-w-md mx-auto">
          You have not added any portfolios yet. Create your first portfolio to track your stocks, link your Zerodha/Groww/Upstox Demat accounts, and monitor real-time P&L.
        </p>
      </div>
      <div class="pt-2">
        <button
          type="button"
          class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold shadow-md hover:bg-primary-dark transition-all cursor-pointer"
          @click="openCreatePortfolio()"
        >
          <UIcon name="i-lucide-folder-plus" class="h-4 w-4" />
          <span>Create Your First Portfolio</span>
        </button>
      </div>
    </div>

    <!-- MAIN DASHBOARD WHEN PORTFOLIOS EXIST -->
    <div v-else class="space-y-6">
      <!-- TOP EXECUTIVE HEADER & PORTFOLIO SWITCHER -->
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-5">
      <div>
        <div class="flex items-center gap-2.5 flex-wrap">
          <h1 class="text-xl sm:text-2xl font-black text-neutral-900 dark:text-white tracking-tight flex items-center gap-2">
            <UIcon name="i-lucide-briefcase" class="h-6 w-6 text-primary" />
            <span>Portfolio Intelligence</span>
          </h1>

          <!-- Portfolio Selector Dropdown -->
          <div class="relative">
            <select
              v-model="activePortfolioId"
              class="rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs font-bold text-neutral-900 dark:text-white shadow-xs focus:outline-hidden focus:border-primary cursor-pointer"
            >
              <option v-for="p in portfolios" :key="p.id" :value="p.id">
                {{ p.name }} {{ p.isPaperTrading ? '(Paper Trading)' : '' }}
              </option>
            </select>
          </div>

          <!-- Badges -->
          <UBadge
            v-if="activePortfolio?.isPaperTrading"
            color="warning"
            variant="subtle"
            size="xs"
            class="font-mono"
          >
            🎮 VIRTUAL PAPER TRADING
          </UBadge>
          <UBadge
            v-else
            color="success"
            variant="subtle"
            size="xs"
            class="font-mono"
          >
            LIVE MARKS
          </UBadge>

          <UBadge color="neutral" variant="subtle" size="xs" class="font-mono">
            COST: {{ activePortfolio?.costMethod || 'FIFO' }}
          </UBadge>
          <UBadge color="neutral" variant="subtle" size="xs" class="font-mono">
            BENCHMARK: {{ activePortfolio?.benchmarkSymbol || 'NIFTY 50' }}
          </UBadge>
        </div>

        <p class="text-xs text-neutral-500 mt-1 max-w-2xl">
          {{ activePortfolio?.description || 'Institutional-grade multi-asset portfolio accounting, risk metrics, and tax analytics.' }}
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-bold text-neutral-700 dark:text-neutral-300 hover:text-primary transition-all shadow-xs"
          :disabled="isRefreshing"
          @click="loadActivePortfolioData"
        >
          <UIcon name="i-lucide-rotate-cw" class="h-3.5 w-3.5" :class="{ 'animate-spin': isRefreshing }" />
          <span>Refresh</span>
        </button>

        <button
          type="button"
          class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-all shadow-xs"
          @click="openAddTrade()"
        >
          <UIcon name="i-lucide-plus-circle" class="h-3.5 w-3.5" />
          <span>Record Trade</span>
        </button>

        <UDropdownMenu
          :items="[
            [{ label: 'Create New Portfolio', icon: 'i-lucide-folder-plus', onSelect: openCreatePortfolio }],
            [{ label: 'Portfolio Settings', icon: 'i-lucide-settings', onSelect: openEditPortfolio }],
            [{ label: 'Delete Portfolio', icon: 'i-lucide-trash-2', color: 'error', onSelect: handleDeletePortfolio }]
          ]"
        >
          <button
            type="button"
            class="p-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 hover:text-primary transition-all"
          >
            <UIcon name="i-lucide-more-vertical" class="h-4 w-4" />
          </button>
        </UDropdownMenu>
      </div>
    </div>

    <!-- MASTER TWO-TIER TAB SWITCHER -->
    <div class="flex items-center gap-2 p-1.5 rounded-2xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/80 max-w-fit">
      <button
        type="button"
        class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
        :class="masterMode === 'analytics'
          ? 'bg-white dark:bg-neutral-900 text-primary shadow-xs'
          : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
        @click="masterMode = 'analytics'"
      >
        <UIcon name="i-lucide-line-chart" class="h-4 w-4" />
        <span>Enterprise Analytics Dashboard</span>
        <UBadge color="primary" variant="subtle" size="xs">Canvas 60fps</UBadge>
      </button>

      <button
        type="button"
        class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
        :class="masterMode === 'operations'
          ? 'bg-white dark:bg-neutral-900 text-primary shadow-xs'
          : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
        @click="masterMode = 'operations'"
      >
        <UIcon name="i-lucide-layers" class="h-4 w-4" />
        <span>Holdings & Operations</span>
        <UBadge color="neutral" variant="subtle" size="xs">{{ summary?.holdings.length || 0 }}</UBadge>
      </button>
    </div>

    <!-- TAB 1: ENTERPRISE ANALYTICS DASHBOARD (CANVAS CHARTS) -->
    <div v-show="masterMode === 'analytics'">
      <ClientOnly>
        <PortfolioDashboardTab
          :summary="summary"
          :active-portfolio="activePortfolio"
          @open-trade="openAddTrade"
          @open-stock="openStockChart"
        />
        <template #fallback>
          <div class="h-96 flex items-center justify-center text-neutral-400">
            <UIcon name="i-lucide-loader-2" class="h-8 w-8 animate-spin text-primary" />
          </div>
        </template>
      </ClientOnly>
    </div>

    <!-- TAB 2: HOLDINGS & OPERATIONS MANAGEMENT -->
    <div v-show="masterMode === 'operations'" class="space-y-6">
      <!-- EXECUTIVE METRICS BANNER (5 Stat Cards) -->
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
      <!-- 1. Portfolio Value -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-xs">
        <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
          Total Net Worth
        </span>
        <div class="text-xl sm:text-2xl font-black font-mono text-neutral-900 dark:text-white">
          {{ fmtCur(summary?.portfolio.totalValue || 0) }}
        </div>
        <div class="text-[11px] text-neutral-500 font-mono mt-1 flex items-center gap-1">
          <span>Cash: {{ fmtCur(summary?.portfolio.cashBalance || 0) }}</span>
        </div>
      </div>

      <!-- 2. Invested Amount & Total Return -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-xs">
        <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
          Total Invested
        </span>
        <div class="text-xl sm:text-2xl font-black font-mono text-neutral-900 dark:text-white">
          {{ fmtCur(summary?.portfolio.totalInvested || 0) }}
        </div>
        <div class="text-[11px] font-mono mt-1 font-bold">
          <span>Unrealized: </span>
          <span :class="(summary?.portfolio.unrealizedPnL || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'">
            {{ (summary?.portfolio.unrealizedPnL || 0) >= 0 ? '+' : '' }}{{ fmtCur(summary?.portfolio.unrealizedPnL || 0) }}
            ({{ (summary?.portfolio.unrealizedPnLPct || 0) >= 0 ? '+' : '' }}{{ summary?.portfolio.unrealizedPnLPct }}%)
          </span>
        </div>
      </div>

      <!-- 3. Today's Day Gain -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-xs">
        <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
          Today's P&L (1D)
        </span>
        <div
          class="text-xl sm:text-2xl font-black font-mono"
          :class="(summary?.portfolio.dayPnL || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'"
        >
          {{ (summary?.portfolio.dayPnL || 0) >= 0 ? '+' : '' }}{{ fmtCur(summary?.portfolio.dayPnL || 0) }}
        </div>
        <div class="text-[11px] font-mono mt-1 font-bold" :class="(summary?.portfolio.dayPnL || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'">
          {{ (summary?.portfolio.dayPnLPct || 0) >= 0 ? '+' : '' }}{{ summary?.portfolio.dayPnLPct }}% vs Yesterday
        </div>
      </div>

      <!-- 4. Realized P&L & Booked Gains -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-xs">
        <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
          Realized Gains
        </span>
        <div
          class="text-xl sm:text-2xl font-black font-mono"
          :class="(summary?.portfolio.realizedPnL || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'"
        >
          {{ (summary?.portfolio.realizedPnL || 0) >= 0 ? '+' : '' }}{{ fmtCur(summary?.portfolio.realizedPnL || 0) }}
        </div>
        <div class="text-[11px] text-neutral-500 font-mono mt-1">
          <span>{{ summary?.portfolio.tradesCount || 0 }} total executed trades</span>
        </div>
      </div>

      <!-- 5. Risk Beta & Sharpe Ratio -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-xs">
        <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
          Portfolio Beta & Risk
        </span>
        <div class="text-xl sm:text-2xl font-black font-mono text-neutral-900 dark:text-white flex items-center gap-2">
          <span>β {{ summary?.riskMetrics.beta || 1.0 }}</span>
          <span class="text-xs font-normal text-neutral-400">Sharpe: {{ summary?.riskMetrics.sharpeRatio || 0 }}</span>
        </div>
        <div class="text-[11px] font-mono mt-1 text-neutral-500">
          <span>Max Drawdown: <strong class="text-rose-500">{{ summary?.riskMetrics.maxDrawdownPct }}%</strong></span>
        </div>
      </div>
    </div>

    <!-- DEMAT ACCOUNT SLICER BAR -->
    <div class="flex items-center justify-between gap-3 p-2.5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/60 overflow-x-auto no-scrollbar">
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold text-neutral-500 flex items-center gap-1.5 pl-1.5 whitespace-nowrap">
          <UIcon name="i-lucide-wallet" class="h-3.5 w-3.5 text-primary" />
          <span>Demat Filter:</span>
        </span>

        <!-- All Accounts Pill -->
        <button
          type="button"
          class="px-3 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer"
          :class="!selectedDematFilter
            ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-xs'
            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
          @click="selectedDematFilter = ''"
        >
          All Demats (Consolidated)
        </button>

        <!-- Individual Account Pills -->
        <button
          v-for="d in summary?.dematAccounts"
          :key="d.id"
          type="button"
          class="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer"
          :class="selectedDematFilter === d.id
            ? 'bg-primary text-white shadow-xs'
            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
          @click="selectedDematFilter = d.id"
        >
          <span>{{ d.accountName }}</span>
          <UBadge color="neutral" variant="subtle" size="xs" class="text-[9px]">{{ d.brokerName }}</UBadge>
        </button>
      </div>

      <button
        type="button"
        class="flex items-center gap-1.5 px-3 py-1 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300 hover:text-primary transition-all whitespace-nowrap ml-auto cursor-pointer"
        @click="isDematModalOpen = true"
      >
        <UIcon name="i-lucide-settings-2" class="h-3.5 w-3.5" />
        <span>Manage Demat Accounts</span>
      </button>
    </div>

    <!-- TAB NAVIGATION BAR -->
    <div class="flex items-center gap-1.5 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto no-scrollbar">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        class="flex items-center gap-2 px-3.5 py-2.5 border-b-2 text-xs font-bold transition-all whitespace-nowrap select-none"
        :class="activeTab === t.id
          ? 'border-primary text-primary'
          : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
        @click="activeTab = t.id"
      >
        <UIcon :name="t.icon" class="h-4 w-4" />
        <span>{{ t.label }}</span>
        <UBadge
          v-if="t.id === 'holdings'"
          color="neutral"
          variant="subtle"
          size="xs"
          class="font-mono text-[10px]"
        >
          {{ summary?.holdings.length || 0 }}
        </UBadge>
      </button>
    </div>

    <!-- TAB 1: HOLDINGS & LIVE POSITIONS -->
    <div v-if="activeTab === 'holdings'" class="space-y-4">
      <!-- Search & Quick Filters -->
      <div class="flex items-center justify-between gap-3">
        <div class="relative w-full max-w-xs">
          <input
            v-model="holdingsSearch"
            type="text"
            placeholder="Filter holdings by symbol, name, or sector..."
            class="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:outline-hidden focus:border-primary"
          />
        </div>
        <div class="text-xs text-neutral-500 font-mono">
          Showing {{ filteredHoldings.length }} of {{ summary?.holdings.length || 0 }} assets
        </div>
      </div>

      <!-- Holdings Table -->
      <div class="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs">
        <table class="w-full text-left text-xs font-mono">
          <thead class="bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 font-bold uppercase text-[10px] tracking-wider">
            <tr>
              <th class="p-3.5">Asset</th>
              <th class="p-3.5 text-right">Quantity</th>
              <th class="p-3.5 text-right">Avg Cost</th>
              <th class="p-3.5 text-right">LTP (Market)</th>
              <th class="p-3.5 text-right">Invested</th>
              <th class="p-3.5 text-right">Current Value</th>
              <th class="p-3.5 text-right">Unrealized P&L</th>
              <th class="p-3.5 text-right">Weight</th>
              <th class="p-3.5 text-center">Target / Stop</th>
              <th class="p-3.5 text-center">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-200 dark:divide-neutral-800 font-medium">
            <tr
              v-for="h in filteredHoldings"
              :key="h.symbol"
              class="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40 transition-colors"
            >
              <!-- Asset -->
              <td class="p-3.5">
                <div class="flex items-center gap-2">
                  <div>
                    <button
                      type="button"
                      class="font-bold text-neutral-900 dark:text-white hover:text-primary transition-colors text-left font-mono"
                      @click="openStockChart(h.symbol)"
                    >
                      {{ h.symbol }}
                    </button>
                    <span class="text-neutral-500 text-[11px] font-sans block truncate max-w-[140px]">
                      {{ h.companyName }}
                    </span>
                    <UBadge color="neutral" variant="subtle" size="xs" class="text-[9px] mt-0.5">
                      {{ h.sector }}
                    </UBadge>
                  </div>
                </div>
              </td>

              <!-- Quantity & Multi-Demat Breakdown -->
              <td class="p-3.5 text-right font-bold text-neutral-900 dark:text-white">
                <div>{{ h.quantity }}</div>
                <div v-if="h.dematBreakdown && h.dematBreakdown.length > 0" class="flex flex-col items-end gap-0.5 mt-1 font-sans text-[10px]">
                  <span
                    v-for="b in h.dematBreakdown"
                    :key="b.dematId"
                    class="px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 font-mono text-[9px]"
                  >
                    {{ b.brokerName }}: {{ b.quantity }}
                  </span>
                </div>
              </td>

              <!-- Avg Cost -->
              <td class="p-3.5 text-right text-neutral-700 dark:text-neutral-300">
                ₹{{ h.averageCost.toFixed(2) }}
              </td>

              <!-- LTP -->
              <td class="p-3.5 text-right">
                <div class="font-bold text-neutral-900 dark:text-white">₹{{ h.currentPrice.toFixed(2) }}</div>
                <span
                  class="text-[10px] font-bold"
                  :class="h.priceChange >= 0 ? 'text-emerald-500' : 'text-rose-500'"
                >
                  {{ h.priceChange >= 0 ? '+' : '' }}{{ h.priceChange.toFixed(2) }} ({{ h.percentageChange }}%)
                </span>
              </td>

              <!-- Invested -->
              <td class="p-3.5 text-right text-neutral-600 dark:text-neutral-400">
                {{ fmtCur(h.investedAmount) }}
              </td>

              <!-- Current Value -->
              <td class="p-3.5 text-right font-bold text-neutral-900 dark:text-white">
                {{ fmtCur(h.currentValue) }}
              </td>

              <!-- Unrealized P&L -->
              <td class="p-3.5 text-right">
                <div
                  class="inline-flex flex-col items-end px-2 py-0.5 rounded-lg"
                  :class="h.unrealizedPnL >= 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'"
                >
                  <span class="font-bold">{{ h.unrealizedPnL >= 0 ? '+' : '' }}{{ fmtCur(h.unrealizedPnL) }}</span>
                  <span class="text-[10px]">{{ h.unrealizedPnLPct >= 0 ? '+' : '' }}{{ h.unrealizedPnLPct }}%</span>
                </div>
              </td>

              <!-- Weight -->
              <td class="p-3.5 text-right">
                <div class="font-bold text-neutral-900 dark:text-white">{{ h.portfolioWeightPct }}%</div>
                <div class="w-14 h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 ml-auto mt-1 overflow-hidden">
                  <div class="h-full bg-primary" :style="{ width: Math.min(100, h.portfolioWeightPct * 3) + '%' }" />
                </div>
              </td>

              <!-- Target / Stop -->
              <td class="p-3.5 text-center text-[11px]">
                <button
                  type="button"
                  class="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  @click="openTargetModal(h)"
                >
                  <div v-if="h.targetPrice || h.stopLoss" class="space-y-0.5">
                    <span v-if="h.targetPrice" class="text-emerald-600 dark:text-emerald-400 block font-bold">T: ₹{{ h.targetPrice }}</span>
                    <span v-if="h.stopLoss" class="text-rose-600 dark:text-rose-400 block font-bold">SL: ₹{{ h.stopLoss }}</span>
                  </div>
                  <span v-else class="text-neutral-400 hover:text-primary flex items-center justify-center gap-1">
                    <UIcon name="i-lucide-crosshair" class="h-3 w-3" />
                    <span>Set</span>
                  </span>
                </button>
              </td>

              <!-- Actions -->
              <td class="p-3.5 text-center">
                <div class="flex items-center justify-center gap-1">
                  <button
                    type="button"
                    class="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                    title="Buy more shares"
                    @click="openAddTrade(h.symbol, 'BUY')"
                  >
                    <UIcon name="i-lucide-plus" class="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    class="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    title="Sell shares"
                    @click="openAddTrade(h.symbol, 'SELL')"
                  >
                    <UIcon name="i-lucide-minus" class="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    class="p-1.5 rounded-lg text-neutral-400 hover:text-primary hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    title="View TradingView Stock Chart"
                    @click="openStockChart(h.symbol)"
                  >
                    <UIcon name="i-lucide-candlestick-chart" class="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>

            <tr v-if="filteredHoldings.length === 0">
              <td colspan="10" class="p-8 text-center text-neutral-500">
                No active holdings found in this portfolio.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 2: RISK & QUANTITATIVE ANALYTICS -->
    <div v-if="activeTab === 'risk'" class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- Beta Meter -->
        <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-neutral-400 uppercase tracking-wider">Portfolio Beta (β)</span>
            <UBadge :color="(summary?.riskMetrics.beta || 1) > 1.2 ? 'warning' : 'success'" variant="subtle" size="xs">
              {{ (summary?.riskMetrics.beta || 1) > 1 ? 'Aggressive' : 'Defensive' }}
            </UBadge>
          </div>
          <div class="text-3xl font-black font-mono text-neutral-900 dark:text-white">
            {{ summary?.riskMetrics.beta }}
          </div>
          <p class="text-xs text-neutral-500 leading-relaxed">
            Measures volatility relative to NIFTY 50 (β = 1.0). Your portfolio is {{ (summary?.riskMetrics.beta || 1) > 1 ? 'more' : 'less' }} volatile than the broader market.
          </p>
        </div>

        <!-- Sharpe Ratio -->
        <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-neutral-400 uppercase tracking-wider">Sharpe Ratio</span>
            <UBadge color="primary" variant="subtle" size="xs">Rf: 6.50%</UBadge>
          </div>
          <div class="text-3xl font-black font-mono text-neutral-900 dark:text-white">
            {{ summary?.riskMetrics.sharpeRatio }}
          </div>
          <p class="text-xs text-neutral-500 leading-relaxed">
            Risk-adjusted excess return per unit of total risk above the RBI repo benchmark rate.
          </p>
        </div>

        <!-- 1-Day Value at Risk (VaR) -->
        <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-neutral-400 uppercase tracking-wider">1-Day VaR (95%)</span>
            <UBadge color="error" variant="subtle" size="xs">Tail Risk</UBadge>
          </div>
          <div class="text-3xl font-black font-mono text-rose-500">
            {{ fmtCur(summary?.riskMetrics.var95Pct || 0) }}
          </div>
          <p class="text-xs text-neutral-500 leading-relaxed">
            95% statistical confidence that maximum single-day capital loss will not exceed this threshold.
          </p>
        </div>
      </div>

      <!-- Enterprise Analytics Banner (Canvas Charts) -->
      <div class="rounded-2xl border border-primary/20 bg-primary/5 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-line-chart" class="h-5 w-5 text-primary" />
            <h3 class="font-bold text-sm text-neutral-900 dark:text-white">
              Interactive Canvas Performance Engine
            </h3>
            <UBadge color="primary" variant="subtle" size="xs">Canvas 60fps</UBadge>
          </div>
          <p class="text-xs text-neutral-500 max-w-xl">
            Interactive multi-timeframe equity curves, benchmark correlation overlays (NIFTY 50), and drawdown underwater analysis are available in the Enterprise Dashboard.
          </p>
        </div>
        <button
          type="button"
          class="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-dark transition-all cursor-pointer whitespace-nowrap self-start sm:self-center"
          @click="masterMode = 'analytics'"
        >
          <span>Open Canvas Charts</span>
          <UIcon name="i-lucide-arrow-right" class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- TAB 3: ASSET ALLOCATION (SECTORS, MARKET CAPS & BROKERS) -->
    <div v-if="activeTab === 'allocation'" class="grid grid-cols-1 md:grid-cols-3 gap-5">
      <!-- Sector Breakdown -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
        <h3 class="font-bold text-sm text-neutral-900 dark:text-white flex items-center gap-2">
          <UIcon name="i-lucide-pie-chart" class="h-4 w-4 text-primary" />
          <span>Sector Diversification</span>
        </h3>

        <div class="space-y-3 font-mono text-xs">
          <div
            v-for="s in summary?.sectorAllocation"
            :key="s.name"
            class="space-y-1"
          >
            <div class="flex items-center justify-between">
              <span class="font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5 font-sans">
                <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: s.color }" />
                <span>{{ s.name }} ({{ s.count }} stocks)</span>
              </span>
              <span class="font-bold text-neutral-900 dark:text-white">{{ s.percentage }}% ({{ fmtCur(s.value) }})</span>
            </div>
            <div class="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
              <div class="h-full rounded-full" :style="{ width: s.percentage + '%', backgroundColor: s.color }" />
            </div>
          </div>
        </div>
      </div>

      <!-- Market Cap Mix -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
        <h3 class="font-bold text-sm text-neutral-900 dark:text-white flex items-center gap-2">
          <UIcon name="i-lucide-bar-chart-2" class="h-4 w-4 text-primary" />
          <span>Market Capitalization Exposure</span>
        </h3>

        <div class="space-y-3 font-mono text-xs">
          <div
            v-for="c in summary?.marketCapAllocation"
            :key="c.name"
            class="space-y-1"
          >
            <div class="flex items-center justify-between">
              <span class="font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5 font-sans">
                <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: c.color }" />
                <span>{{ c.name }}</span>
              </span>
              <span class="font-bold text-neutral-900 dark:text-white">{{ c.percentage }}% ({{ fmtCur(c.value) }})</span>
            </div>
            <div class="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
              <div class="h-full rounded-full" :style="{ width: c.percentage + '%', backgroundColor: c.color }" />
            </div>
          </div>
        </div>
      </div>

      <!-- Multi-Demat Broker Capital Allocation -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
        <h3 class="font-bold text-sm text-neutral-900 dark:text-white flex items-center gap-2">
          <UIcon name="i-lucide-wallet" class="h-4 w-4 text-primary" />
          <span>Demat / Broker Distribution</span>
        </h3>

        <div class="space-y-3 font-mono text-xs">
          <div
            v-for="b in brokerAllocation"
            :key="b.name"
            class="space-y-1"
          >
            <div class="flex items-center justify-between">
              <span class="font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5 font-sans">
                <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: b.color }" />
                <span>{{ b.name }}</span>
              </span>
              <span class="font-bold text-neutral-900 dark:text-white">{{ b.percentage }}% ({{ fmtCur(b.value) }})</span>
            </div>
            <div class="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
              <div class="h-full rounded-full" :style="{ width: b.percentage + '%', backgroundColor: b.color }" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 4: TRADES LEDGER -->
    <div v-if="activeTab === 'trades'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-sm text-neutral-900 dark:text-white">Chronological Execution Ledger</h3>
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs cursor-pointer"
          @click="openAddTrade()"
        >
          <UIcon name="i-lucide-plus" class="h-3.5 w-3.5" />
          <span>Log Order</span>
        </button>
      </div>

      <div class="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs">
        <table class="w-full text-left text-xs font-mono">
          <thead class="bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 font-bold uppercase text-[10px] tracking-wider">
            <tr>
              <th class="p-3.5">Date</th>
              <th class="p-3.5">Type</th>
              <th class="p-3.5">Symbol</th>
              <th class="p-3.5">Demat / Broker</th>
              <th class="p-3.5 text-right">Quantity</th>
              <th class="p-3.5 text-right">Price</th>
              <th class="p-3.5 text-right">Charges (STT/GST)</th>
              <th class="p-3.5 text-right">Total Outflow</th>
              <th class="p-3.5">Notes</th>
              <th class="p-3.5 text-center">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-200 dark:divide-neutral-800 font-medium">
            <tr v-for="t in trades" :key="t.id" class="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30">
              <td class="p-3.5 text-neutral-600 dark:text-neutral-400">{{ t.tradeDate }}</td>
              <td class="p-3.5">
                <UBadge
                  :color="t.tradeType === 'BUY' ? 'success' : t.tradeType === 'SELL' ? 'error' : 'primary'"
                  variant="subtle"
                  size="xs"
                >
                  {{ t.tradeType }}
                </UBadge>
              </td>
              <td class="p-3.5 font-bold text-neutral-900 dark:text-white">{{ t.symbol }}</td>
              <td class="p-3.5">
                <UBadge color="neutral" variant="subtle" size="xs">
                  {{ t.brokerName || summary?.dematAccounts?.find(d => d.id === t.dematAccountId)?.brokerName || 'Unassigned' }}
                </UBadge>
              </td>
              <td class="p-3.5 text-right font-bold">{{ t.quantity }}</td>
              <td class="p-3.5 text-right">₹{{ t.pricePerShare.toFixed(2) }}</td>
              <td class="p-3.5 text-right text-neutral-500">₹{{ (t.stt + t.exchangeCharges + t.gst + t.sebiFee).toFixed(2) }}</td>
              <td class="p-3.5 text-right font-bold text-neutral-900 dark:text-white">{{ fmtCur(t.totalCost) }}</td>
              <td class="p-3.5 text-neutral-500 text-[11px] font-sans truncate max-w-xs">{{ t.notes || '—' }}</td>
              <td class="p-3.5 text-center">
                <div class="flex items-center justify-center gap-1.5">
                  <button
                    type="button"
                    class="p-1.5 rounded-lg text-neutral-400 hover:text-primary hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    title="Edit Trade & Reassign Demat Account"
                    @click="openEditTrade(t)"
                  >
                    <UIcon name="i-lucide-pencil" class="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    class="p-1.5 rounded-lg text-neutral-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                    title="Delete trade"
                    @click="handleDeleteTrade(t.id)"
                  >
                    <UIcon name="i-lucide-trash-2" class="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="trades.length === 0">
              <td colspan="10" class="p-8 text-center text-neutral-500">No trades recorded yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 5: REBALANCING ADVISOR -->
    <div v-if="activeTab === 'rebalance'" class="space-y-4">
      <div class="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex items-center justify-between">
        <div>
          <h3 class="font-bold text-sm text-primary flex items-center gap-1.5">
            <UIcon name="i-lucide-scale" class="h-4 w-4" />
            <span>Target Weight Rebalancing Model</span>
          </h3>
          <p class="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
            Optimal allocation engine targeting equal risk distribution across core holdings.
          </p>
        </div>
      </div>

      <div class="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs">
        <table class="w-full text-left text-xs font-mono">
          <thead class="bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 font-bold uppercase text-[10px] tracking-wider">
            <tr>
              <th class="p-3.5">Asset</th>
              <th class="p-3.5 text-right">Current Weight</th>
              <th class="p-3.5 text-right">Target Weight</th>
              <th class="p-3.5 text-right">Deviation</th>
              <th class="p-3.5 text-center">Recommended Action</th>
              <th class="p-3.5 text-right">Units to Trade</th>
              <th class="p-3.5">Rationale</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-200 dark:divide-neutral-800 font-medium">
            <tr v-for="item in rebalancePlan" :key="item.symbol" class="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30">
              <td class="p-3.5 font-bold text-neutral-900 dark:text-white">{{ item.symbol }}</td>
              <td class="p-3.5 text-right font-bold">{{ item.currentWeightPct }}%</td>
              <td class="p-3.5 text-right text-neutral-500">{{ item.targetWeightPct }}%</td>
              <td class="p-3.5 text-right font-bold" :class="item.deviationPct > 0 ? 'text-amber-500' : item.deviationPct < 0 ? 'text-blue-500' : 'text-neutral-400'">
                {{ item.deviationPct > 0 ? '+' : '' }}{{ item.deviationPct }}%
              </td>
              <td class="p-3.5 text-center">
                <UBadge
                  :color="item.action === 'BUY' ? 'success' : item.action === 'SELL' ? 'error' : 'neutral'"
                  variant="subtle"
                  size="xs"
                >
                  {{ item.action }}
                </UBadge>
              </td>
              <td class="p-3.5 text-right font-bold">{{ item.sharesToTrade }} shares</td>
              <td class="p-3.5 text-neutral-500 text-[11px] font-sans">{{ item.rationale }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 6: CAPITAL GAINS & TAX STATEMENT -->
    <div v-if="activeTab === 'tax'" class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- STCG Card -->
        <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-neutral-400 uppercase tracking-wider">Short-Term Gains (STCG)</span>
            <UBadge color="neutral" variant="subtle" size="xs">Tax Rate: 15%</UBadge>
          </div>
          <div class="text-2xl font-black font-mono text-neutral-900 dark:text-white">
            {{ fmtCur(taxSummary?.stcgTotalGain || 0) }}
          </div>
          <div class="text-xs text-neutral-500 font-mono">
            Estimated Tax: <strong class="text-rose-500">{{ fmtCur(taxSummary?.stcgEstimatedTax || 0) }}</strong>
          </div>
        </div>

        <!-- LTCG Card -->
        <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-neutral-400 uppercase tracking-wider">Long-Term Gains (LTCG)</span>
            <UBadge color="neutral" variant="subtle" size="xs">Tax Rate: 10%</UBadge>
          </div>
          <div class="text-2xl font-black font-mono text-neutral-900 dark:text-white">
            {{ fmtCur(taxSummary?.ltcgTotalGain || 0) }}
          </div>
          <div class="text-xs text-neutral-500 font-mono">
            Exemption Used: {{ fmtCur(taxSummary?.ltcgExemptionUsed || 0) }} / ₹1,00,000
          </div>
        </div>

        <!-- Total Tax Liability -->
        <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-neutral-400 uppercase tracking-wider">Total Tax Liability</span>
            <UBadge color="error" variant="subtle" size="xs">{{ taxSummary?.financialYear }}</UBadge>
          </div>
          <div class="text-2xl font-black font-mono text-rose-500">
            {{ fmtCur(taxSummary?.totalTaxLiability || 0) }}
          </div>
          <div class="text-xs text-neutral-500 font-mono">
            Based on current financial year tax provisions.
          </div>
        </div>
      </div>

      <!-- Tax-Loss Harvesting Opportunities -->
      <div
        v-if="taxSummary?.taxLossHarvestingOpportunities && taxSummary.taxLossHarvestingOpportunities.length > 0"
        class="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-3"
      >
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-sparkles" class="h-5 w-5 text-emerald-500" />
          <h3 class="font-bold text-sm text-emerald-700 dark:text-emerald-300">
            Tax-Loss Harvesting Opportunities Detected
          </h3>
        </div>
        <p class="text-xs text-neutral-600 dark:text-neutral-400">
          You can offset realized short-term and long-term capital gains by booking losses in underperforming positions:
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            v-for="opp in taxSummary.taxLossHarvestingOpportunities"
            :key="opp.symbol"
            class="p-3 rounded-xl border border-emerald-200/50 dark:border-emerald-800/40 bg-white dark:bg-neutral-900 text-xs font-mono space-y-1"
          >
            <div class="flex justify-between font-bold">
              <span>{{ opp.symbol }} ({{ opp.quantity }} shares)</span>
              <span class="text-rose-500">-₹{{ opp.unrealizedLoss.toFixed(2) }}</span>
            </div>
            <p class="text-[11px] text-neutral-500 font-sans">{{ opp.suggestion }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

    <!-- EMBEDDED MODALS -->
    <PortfolioTradeModal
      v-model="isTradeModalOpen"
      :portfolio-id="activePortfolioId"
      :default-symbol="tradeModalSymbol"
      :default-type="tradeModalType"
      :trade-to-edit="tradeToEdit"
      @saved="loadActivePortfolioData"
    />

    <PortfolioTargetModal
      v-if="targetModalHolding"
      v-model="isTargetModalOpen"
      :portfolio-id="activePortfolioId"
      :symbol="targetModalHolding.symbol"
      :current-price="targetModalHolding.currentPrice"
      :initial-target="targetModalHolding.targetPrice"
      :initial-stop-loss="targetModalHolding.stopLoss"
      @saved="loadActivePortfolioData"
    />

    <PortfolioModal
      v-model="isPortfolioModalOpen"
      :portfolio-to-edit="portfolioToEdit"
      @saved="fetchPortfolios"
    />

    <PortfolioDematAccountModal
      v-model="isDematModalOpen"
      @updated="loadActivePortfolioData"
    />

    <!-- Stock Detail Modal with Enterprise Lightweight Charts -->
    <MarketStockDetailModal
      v-model="isStockDetailModalOpen"
      :symbol="selectedStockSymbol"
      @trade="handleStockModalTrade"
    />
  </div>
</template>
