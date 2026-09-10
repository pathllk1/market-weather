<script setup lang="ts">
import type {
  BacktestPortfolio,
  BacktestPortfolioDetailResponse,
  TradeType
} from '~/types/backtest'

useSeoMeta({
  title: 'Backtest Portfolio Workspace | Enterprise Trading Systems',
  description: 'Simulate manual backtest executions on genuine live market feeds with dynamic portfolio tracking and performance analytics.'
})

// Active portfolio and state
const portfolios = ref<BacktestPortfolio[]>([])
const activePortfolioId = ref<string>('')
const portfolioDetail = ref<BacktestPortfolioDetailResponse | null>(null)
const isLoading = ref(true)
const isRefreshing = ref(false)

// Tab state
const activeTab = ref<'positions' | 'ledger' | 'analytics'>('positions')

// Modal state
const isTradeModalOpen = ref(false)
const tradeModalSymbol = ref('')
const tradeModalType = ref<TradeType>('BUY')
const tradeModalHeldQty = ref<number | undefined>(undefined)
const isCreateModalOpen = ref(false)

// Fetch all portfolios
async function fetchPortfolios(selectId?: string) {
  try {
    const res = await $fetch<{ portfolios: BacktestPortfolio[] }>('/api/backtest/portfolios')
    portfolios.value = res.portfolios || []

    if (selectId && portfolios.value.some(p => p.id === selectId)) {
      activePortfolioId.value = selectId
    } else if (!activePortfolioId.value && portfolios.value.length > 0) {
      activePortfolioId.value = portfolios.value[0]!.id
    }

    if (activePortfolioId.value) {
      await loadPortfolioDetail(activePortfolioId.value)
    }
  } catch (err) {
    console.error('Failed to load backtest portfolios:', err)
  } finally {
    isLoading.value = false
  }
}

// Fetch detailed data for selected portfolio
async function loadPortfolioDetail(id: string) {
  isRefreshing.value = true
  try {
    const detail = await $fetch<BacktestPortfolioDetailResponse>(`/api/backtest/portfolios/${id}`)
    portfolioDetail.value = detail
  } catch (err) {
    console.error('Failed to load backtest portfolio details:', err)
  } finally {
    isRefreshing.value = false
  }
}

watch(activePortfolioId, (newId) => {
  if (newId) {
    loadPortfolioDetail(newId)
  }
})

// Trade modal triggers
function openNewTrade(type: TradeType = 'BUY', symbol?: string, heldQty?: number) {
  tradeModalType.value = type
  tradeModalSymbol.value = symbol || ''
  tradeModalHeldQty.value = heldQty
  isTradeModalOpen.value = true
}

function handleTradeMore(sym: string) {
  const pos = portfolioDetail.value?.positions.find(p => p.symbol === sym)
  openNewTrade('BUY', sym, pos?.quantity)
}

function onTradeLogged() {
  if (activePortfolioId.value) {
    loadPortfolioDetail(activePortfolioId.value)
    fetchPortfolios(activePortfolioId.value)
  }
}

function onPortfolioCreated(newId: string) {
  fetchPortfolios(newId)
}

// Periodic auto-refresh every 30s
let refreshTimer: NodeJS.Timeout | null = null
onMounted(() => {
  fetchPortfolios()
  refreshTimer = setInterval(() => {
    if (activePortfolioId.value && !isRefreshing.value) {
      loadPortfolioDetail(activePortfolioId.value)
    }
  }, 30_000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <div class="w-full min-h-screen bg-neutral-50/50 dark:bg-neutral-950 p-4 md:p-6 lg:p-8 space-y-6">
    <!-- Header Banner -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-200/80 dark:border-neutral-800/80 pb-5">
      <div>
        <div class="flex items-center gap-2.5">
          <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UIcon
              name="i-lucide-flask-conical"
              class="h-6 w-6"
            />
          </div>
          <div>
            <h1 class="text-xl md:text-2xl font-black tracking-tight text-neutral-900 dark:text-white flex items-center gap-2">
              Manual Backtest Workspace
              <span class="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Live Prices
              </span>
            </h1>
            <p class="text-xs text-neutral-500 dark:text-neutral-400">
              Paper trade and backtest trading setups with real-time dynamic valuations and strict P&L accounting
            </p>
          </div>
        </div>
      </div>

      <!-- Controls & Triggers -->
      <div class="flex flex-wrap items-center gap-2">
        <!-- Portfolio Selector -->
        <div
          v-if="portfolios.length > 0"
          class="min-w-[180px]"
        >
          <USelect
            v-model="activePortfolioId"
            :items="portfolios.map(p => ({ label: p.name, value: p.id }))"
            class="w-full text-xs font-semibold"
          />
        </div>

        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-folder-plus"
          @click="isCreateModalOpen = true"
        >
          New Workspace
        </UButton>

        <UButton
          color="neutral"
          variant="soft"
          size="sm"
          icon="i-lucide-refresh-cw"
          :loading="isRefreshing"
          title="Refresh live prices"
          @click="activePortfolioId && loadPortfolioDetail(activePortfolioId)"
        >
          Refresh
        </UButton>

        <UButton
          color="primary"
          size="sm"
          icon="i-lucide-plus"
          @click="openNewTrade('BUY')"
        >
          Log Trade
        </UButton>
      </div>
    </div>

    <!-- Loading State -->
    <div
      v-if="isLoading"
      class="flex flex-col items-center justify-center py-20 text-neutral-400 gap-2"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="h-8 w-8 animate-spin text-primary"
      />
      <span class="text-xs font-medium">Loading backtest portfolios and live valuations...</span>
    </div>

    <div
      v-else-if="portfolioDetail"
      class="space-y-6"
    >
      <!-- 1. Executive Metrics Banner -->
      <BacktestMetricsBanner
        :metrics="portfolioDetail.metrics"
        :currency="portfolioDetail.portfolio.currency"
      />

      <!-- 2. Navigation Tabs -->
      <div class="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-2">
        <div class="flex gap-1">
          <button
            type="button"
            class="px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2"
            :class="activeTab === 'positions' ? 'bg-primary text-white shadow-sm' : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
            @click="activeTab = 'positions'"
          >
            <UIcon
              name="i-lucide-briefcase"
              class="h-4 w-4"
            />
            Active Positions ({{ portfolioDetail.positions.length }})
          </button>

          <button
            type="button"
            class="px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2"
            :class="activeTab === 'ledger' ? 'bg-primary text-white shadow-sm' : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
            @click="activeTab = 'ledger'"
          >
            <UIcon
              name="i-lucide-scroll-text"
              class="h-4 w-4"
            />
            Trade Ledger & History
          </button>

          <button
            type="button"
            class="px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2"
            :class="activeTab === 'analytics' ? 'bg-primary text-white shadow-sm' : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
            @click="activeTab = 'analytics'"
          >
            <UIcon
              name="i-lucide-line-chart"
              class="h-4 w-4"
            />
            Strategy Analytics
          </button>
        </div>
      </div>

      <!-- TAB 1: POSITIONS -->
      <div v-if="activeTab === 'positions'">
        <BacktestPositionsTable
          :positions="portfolioDetail.positions"
          :portfolio-id="portfolioDetail.portfolio.id"
          @position-closed="onTradeLogged"
          @trade-more="handleTradeMore"
        />
      </div>

      <!-- TAB 2: LEDGER & HISTORY -->
      <div v-if="activeTab === 'ledger'">
        <BacktestTradeLedger
          :trades="portfolioDetail.trades"
          :closed-trades="portfolioDetail.closedTrades"
          :portfolio-id="portfolioDetail.portfolio.id"
          @trade-deleted="onTradeLogged"
        />
      </div>

      <!-- TAB 3: STRATEGY ANALYTICS -->
      <div v-if="activeTab === 'analytics'">
        <BacktestAnalyticsCard
          :metrics="portfolioDetail.metrics"
          :strategy-breakdown="portfolioDetail.strategyBreakdown"
        />
      </div>
    </div>

    <!-- Modals -->
    <BacktestTradeModal
      v-model="isTradeModalOpen"
      :portfolio-id="activePortfolioId"
      :available-cash="portfolioDetail?.metrics.cashBalance || 0"
      :held-quantity="tradeModalHeldQty"
      :default-symbol="tradeModalSymbol"
      :default-type="tradeModalType"
      @trade-logged="onTradeLogged"
    />

    <BacktestCreatePortfolioModal
      v-model="isCreateModalOpen"
      @portfolio-created="onPortfolioCreated"
    />
  </div>
</template>
