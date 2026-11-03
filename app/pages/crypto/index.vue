<script setup lang="ts">
import { ref } from 'vue'
import { useCrypto } from '../../composables/useCrypto'
import CryptoHeaderStrip from '../../components/crypto/CryptoHeaderStrip.vue'
import CryptoToolbar from '../../components/crypto/CryptoToolbar.vue'
import CryptoChart from '../../components/crypto/CryptoChart.vue'
import CryptoTable from '../../components/crypto/CryptoTable.vue'
import CryptoCardGrid from '../../components/crypto/CryptoCardGrid.vue'
import CryptoCalculatorModal from '../../components/crypto/CryptoCalculatorModal.vue'
import CryptoDetailModal from '../../components/crypto/CryptoDetailModal.vue'
import CryptoHistoryModal from '../../components/crypto/CryptoHistoryModal.vue'
import CryptoPaperTradeModal from '../../components/crypto/CryptoPaperTradeModal.vue'
import CryptoSignalsModal from '../../components/crypto/CryptoSignalsModal.vue'
import CryptoArbitrageModal from '../../components/crypto/CryptoArbitrageModal.vue'
import CryptoAlertModal from '../../components/crypto/CryptoAlertModal.vue'
import CryptoStickyDock from '../../components/crypto/CryptoStickyDock.vue'
import CryptoSyncBar from '../../components/crypto/CryptoSyncBar.vue'
import CryptoDatabaseVaultTab from '../../components/crypto/CryptoDatabaseVaultTab.vue'

useHead({
  title: 'Crypto INR Terminal | Real-Time Indian Currency Crypto Intelligence',
  meta: [
    {
      name: 'description',
      content: 'Real-time cryptocurrency intelligence terminal in Indian Currency (INR). Live streaming from Binance Vision with 30-Day history, paper trading simulation, technical signals, and 1% TDS calculations.'
    }
  ]
})

// Tab Navigation State: 'live' (Default) or 'database' (Supabase DB Stored Records)
const activeTab = ref<'live' | 'database'>('live')

const {
  tickers,
  inrRates,
  rateMode,
  activeRate,
  connectionStatus,
  isPaused,
  lastTickTime,
  searchQuery,
  activeCategory,
  sortBy,
  sortDirection,
  displayMode,
  selectedAsset,
  isDetailOpen,
  isCalcOpen,
  isHistoryOpen,
  isTradeOpen,
  isSignalsOpen,
  isArbitrageOpen,
  isAlertOpen,
  calcPresetSymbol,
  tickFlashes,
  filteredTickers,
  totalTurnoverInr,
  topGainer,
  topLoser,
  marketSentiment,
  watchlist,
  paperWallet,
  priceAlerts,
  formatInr,
  formatUsd,
  setRateMode,
  togglePause,
  openDetailModal,
  openCalculatorModal,
  openHistoryModal,
  openTradeModal,
  openSignalsModal,
  openArbitrageModal,
  openAlertModal,
  toggleWatchlist,
  isInWatchlist,
  executePaperTrade,
  resetPaperWallet,
  addPriceAlert,
  removePriceAlert
} = useCrypto()

function handleSortChange(key: 'volume' | 'price' | 'change' | 'name') {
  if (sortBy.value === key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = key
    sortDirection.value = 'desc'
  }
}

function scrollToChart() {
  if (typeof window !== 'undefined') {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}
</script>

<template>
  <div class="w-full min-h-screen bg-slate-50/70 text-slate-900 pb-20">
    <!-- Page Header Banner (Compact, Low Vertical Footprint) -->
    <div class="w-full bg-white border-b border-slate-200/90 py-3.5 sm:py-4 px-4 sm:px-6 lg:px-8 mb-4 shadow-2xs">
      <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <div class="flex items-center gap-2 mb-0.5">
            <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
              <span class="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
              INR Crypto Intelligence Terminal
            </span>
          </div>

          <h1 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Crypto Intelligence</span>
            <span class="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600">
              in Indian Rupees (₹)
            </span>
          </h1>
          <p class="text-xs text-slate-500 mt-0.5">
            Real-time streaming prices, 30-day verified history, paper trading simulations, and 1% TDS calculations for {{ tickers.length || '700+' }} active pairs.
          </p>
        </div>

        <!-- Right Quick Controls -->
        <div class="flex items-center gap-2.5 flex-wrap">
          <!-- Currency Toggle Badge -->
          <div class="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              class="px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
              :class="rateMode === 'domestic' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'"
              @click="setRateMode('domestic')"
            >
              <span class="w-2 h-2 rounded-full bg-emerald-500" />
              Domestic (₹ {{ inrRates.domesticRate.toFixed(2) }})
            </button>
            <button
              class="px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
              :class="rateMode === 'forex' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'"
              @click="setRateMode('forex')"
            >
              <span class="w-2 h-2 rounded-full bg-blue-500" />
              Forex (₹ {{ inrRates.forexRate.toFixed(2) }})
            </button>
          </div>

          <!-- Supabase Smart-Sync Status & Action -->
          <CryptoSyncBar :tickers="tickers" />

          <!-- Quick Calculator Button -->
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 text-white shadow-2xs hover:bg-slate-800 transition-all cursor-pointer"
            @click="openCalculatorModal('BTCUSDT')"
          >
            <UIcon
              name="i-lucide-calculator"
              class="w-4 h-4 text-amber-400"
            />
            <span class="hidden sm:inline">1% TDS</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Main Full-Width Content Canvas -->
    <div class="w-full px-4 sm:px-6 lg:px-8 space-y-4">
      <!-- High-Performance Dual Tab Navigation System -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-200/90 pb-2.5">
        <div class="flex items-center gap-2 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
          <!-- Tab 1: Live Terminal (Default & Untouched) -->
          <button
            class="px-3.5 sm:px-4 py-2 rounded-lg font-bold text-xs sm:text-sm transition-all cursor-pointer flex items-center gap-2"
            :class="activeTab === 'live' ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80' : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'"
            @click="activeTab = 'live'"
          >
            <UIcon
              name="i-lucide-activity"
              class="w-4 h-4 text-emerald-500"
            />
            <span>Live Terminal</span>
            <span class="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Real-Time
            </span>
          </button>

          <!-- Tab 2: Database Stored Data (Complete Supabase Data) -->
          <button
            class="px-3.5 sm:px-4 py-2 rounded-lg font-bold text-xs sm:text-sm transition-all cursor-pointer flex items-center gap-2"
            :class="activeTab === 'database' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'"
            @click="activeTab = 'database'"
          >
            <UIcon
              name="i-lucide-database"
              class="w-4 h-4"
              :class="activeTab === 'database' ? 'text-white' : 'text-indigo-600'"
            />
            <span>Database Vault</span>
            <span
              class="text-[10px] font-bold px-1.5 py-0.2 rounded-full"
              :class="activeTab === 'database' ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'"
            >
              PostgreSQL (20K+ Candles)
            </span>
          </button>
        </div>

        <!-- Mode Context Subtitle Badge -->
        <div class="flex items-center gap-2 text-xs text-slate-500">
          <template v-if="activeTab === 'live'">
            <span class="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span class="font-medium">Binance Vision WebSocket Feed & Live Signals</span>
          </template>
          <template v-else>
            <span class="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
            <span class="font-medium">Supabase PostgreSQL Engine · 836 Tracked Pairs</span>
          </template>
        </div>
      </div>

      <!-- TAB 1: Live Intelligence Terminal (Preserved 100% Unmodified) -->
      <div
        v-show="activeTab === 'live'"
        class="space-y-4"
      >
        <!-- 1. Executive Metric KPI Cards -->
        <CryptoHeaderStrip
          :inr-rates="inrRates"
          :rate-mode="rateMode"
          :active-rate="activeRate"
          :total-turnover-inr="totalTurnoverInr"
          :top-gainer="topGainer"
          :top-loser="topLoser"
          :market-sentiment="marketSentiment"
          :connection-status="connectionStatus"
          :last-tick-time="lastTickTime"
          :format-inr="formatInr"
          @select-asset="selectedAsset = $event"
          @set-rate-mode="setRateMode"
        />

        <!-- 2. Interactive Candlestick & Area Dynamic Chart -->
        <ClientOnly>
          <CryptoChart
            :asset="selectedAsset"
            :active-rate="activeRate"
            :rate-mode="rateMode"
            :format-inr="formatInr"
            :format-usd="formatUsd"
          />
          <template #fallback>
            <div class="h-[460px] w-full bg-white rounded-xl border border-slate-200/90 shadow-xs mb-4 flex items-center justify-center text-xs text-slate-400 font-semibold">
              Initializing Live Chart...
            </div>
          </template>
        </ClientOnly>

        <!-- 3. Toolbar & Category Filters -->
        <CryptoToolbar
          :tickers="tickers"
          :search-query="searchQuery"
          :active-category="activeCategory"
          :sort-by="sortBy"
          :sort-direction="sortDirection"
          :display-mode="displayMode"
          :is-paused="isPaused"
          :total-assets-count="tickers.length"
          :watchlist-count="watchlist.length"
          @update:search-query="searchQuery = $event"
          @update:active-category="activeCategory = $event"
          @update:sort-by="sortBy = $event"
          @update:display-mode="displayMode = $event"
          @toggle-sort-direction="sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'"
          @toggle-pause="togglePause"
          @open-calculator="openCalculatorModal(selectedAsset?.symbol || 'BTCUSDT')"
        />

        <!-- 4. Data Display (Table or Grid) -->
        <div v-if="displayMode === 'table'">
          <CryptoTable
            :tickers="filteredTickers"
            :selected-asset="selectedAsset"
            :tick-flashes="tickFlashes"
            :watchlist="watchlist"
            :sort-by="sortBy"
            :sort-direction="sortDirection"
            :format-inr="formatInr"
            :format-usd="formatUsd"
            @select-asset="selectedAsset = $event"
            @open-detail="openDetailModal"
            @open-history="openHistoryModal"
            @open-trade="openTradeModal"
            @open-signals="openSignalsModal"
            @open-calculator="openCalculatorModal"
            @toggle-watchlist="toggleWatchlist"
            @change-sort="handleSortChange"
          />
        </div>
        <div v-else>
          <CryptoCardGrid
            :tickers="filteredTickers"
            :selected-asset="selectedAsset"
            :tick-flashes="tickFlashes"
            :watchlist="watchlist"
            :format-inr="formatInr"
            :format-usd="formatUsd"
            @select-asset="selectedAsset = $event"
            @open-detail="openDetailModal"
            @open-history="openHistoryModal"
            @open-trade="openTradeModal"
            @open-signals="openSignalsModal"
            @open-calculator="openCalculatorModal"
            @toggle-watchlist="toggleWatchlist"
          />
        </div>
      </div>

      <!-- TAB 2: Database Historical Vault (100% Genuine Database Data) -->
      <div v-show="activeTab === 'database'">
        <CryptoDatabaseVaultTab
          :active-rate="activeRate"
          :rate-mode="rateMode"
          :format-inr="formatInr"
          :format-usd="formatUsd"
        />
      </div>
    </div>

    <!-- Modals Suite for Selected Crypto -->

    <!-- Modal 1: 30-Day Historical Data & Ledger -->
    <CryptoHistoryModal
      :is-open="isHistoryOpen"
      :asset="selectedAsset"
      :active-rate="activeRate"
      :format-inr="formatInr"
      :format-usd="formatUsd"
      @close="isHistoryOpen = false"
      @open-trade="openTradeModal"
      @open-calculator="openCalculatorModal"
    />

    <!-- Modal 2: Paper Trading & Virtual Execution -->
    <CryptoPaperTradeModal
      :is-open="isTradeOpen"
      :asset="selectedAsset"
      :active-rate="activeRate"
      :paper-wallet="paperWallet"
      :format-inr="formatInr"
      :format-usd="formatUsd"
      @close="isTradeOpen = false"
      @execute-trade="executePaperTrade"
      @reset-wallet="resetPaperWallet"
    />

    <!-- Modal 3: Technical Signals & Support/Resistance Pivot Points -->
    <CryptoSignalsModal
      :is-open="isSignalsOpen"
      :asset="selectedAsset"
      :active-rate="activeRate"
      :format-inr="formatInr"
      :format-usd="formatUsd"
      @close="isSignalsOpen = false"
      @open-trade="openTradeModal"
    />

    <!-- Modal 4: Arbitrage & Domestic Spread Matrix -->
    <CryptoArbitrageModal
      :is-open="isArbitrageOpen"
      :asset="selectedAsset"
      :inr-rates="inrRates"
      :format-inr="formatInr"
      :format-usd="formatUsd"
      @close="isArbitrageOpen = false"
      @open-calculator="openCalculatorModal"
    />

    <!-- Modal 5: Live Price & Volatility Alert Trigger -->
    <CryptoAlertModal
      :is-open="isAlertOpen"
      :asset="selectedAsset"
      :price-alerts="priceAlerts"
      :format-inr="formatInr"
      @close="isAlertOpen = false"
      @add-alert="addPriceAlert($event.symbol, $event.targetPriceInr, $event.direction)"
      @remove-alert="removePriceAlert"
    />

    <!-- Modal 6: Indian 1% TDS & VDA Tax Calculator -->
    <CryptoCalculatorModal
      :is-open="isCalcOpen"
      :tickers="tickers"
      :preset-symbol="calcPresetSymbol"
      :active-rate="activeRate"
      :format-inr="formatInr"
      @close="isCalcOpen = false"
    />

    <!-- Modal 7: Live Order Book Depth Microstructure -->
    <CryptoDetailModal
      :is-open="isDetailOpen"
      :asset="selectedAsset"
      :active-rate="activeRate"
      :format-inr="formatInr"
      :format-usd="formatUsd"
      @close="isDetailOpen = false"
      @open-calculator="openCalculatorModal"
    />

    <!-- Sticky Bottom Selected Crypto Dock -->
    <CryptoStickyDock
      :asset="selectedAsset"
      :tick-flashes="tickFlashes"
      :is-starred="selectedAsset ? isInWatchlist(selectedAsset.symbol) : false"
      :format-inr="formatInr"
      :format-usd="formatUsd"
      @open-history="openHistoryModal"
      @open-trade="openTradeModal"
      @open-signals="openSignalsModal"
      @open-arbitrage="openArbitrageModal"
      @open-alert="openAlertModal"
      @open-calculator="openCalculatorModal"
      @open-detail="openDetailModal"
      @toggle-watchlist="toggleWatchlist"
      @scroll-to-chart="scrollToChart"
    />
  </div>
</template>
