<script setup lang="ts">
import { ref, watch } from 'vue'
import type { StockDetailResponse } from '../../types/market'

const props = defineProps<{
  modelValue: boolean
  symbol: string | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'trade', symbol: string, type: 'BUY' | 'SELL'): void
}>()

const isOpen = ref(props.modelValue)

watch(() => props.modelValue, (val) => {
  isOpen.value = val
  if (val && props.symbol) {
    loadStockDetails()
  }
})

watch(isOpen, (val) => {
  emit('update:modelValue', val)
})

watch(() => props.symbol, (newSymbol) => {
  if (newSymbol && isOpen.value) {
    loadStockDetails()
  }
})

const isLoading = ref(false)
const stockData = ref<StockDetailResponse | null>(null)
const activeTab = ref('chart')

const tabItems = [
  { label: 'Candlestick Chart & Range', icon: 'i-lucide-candlestick-chart', value: 'chart' },
  { label: 'Technical Indicators Radar', icon: 'i-lucide-gauge', value: 'radar' },
  { label: 'Fundamental Analysis', icon: 'i-lucide-pie-chart', value: 'fundamentals' }
]

async function loadStockDetails() {
  if (!props.symbol) return
  try {
    isLoading.value = true
    const res = await $fetch<StockDetailResponse>(`/api/market/stock`, {
      query: { symbol: props.symbol }
    })
    stockData.value = res
  } catch (err) {
    console.error('Failed to load stock details:', err)
  } finally {
    isLoading.value = false
  }
}

function getScoreColor(score: number) {
  if (score >= 75) return 'success'
  if (score >= 50) return 'primary'
  if (score >= 35) return 'warning'
  return 'error'
}

function handleTradeClick(type: 'BUY' | 'SELL' = 'BUY') {
  if (!stockData.value) return
  emit('trade', stockData.value.symbol, type)
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :ui="{
      content: 'sm:max-w-5xl md:max-w-6xl lg:max-w-7xl xl:max-w-[1400px] w-[calc(100vw-2rem)] max-h-[92vh] flex flex-col',
      body: 'flex-1 overflow-y-auto p-4 sm:p-6'
    }"
  >
    <template #header>
      <div
        v-if="stockData"
        class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full pr-6"
      >
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-bold">
              {{ stockData.symbol }}
            </h3>
            <UBadge
              :color="getScoreColor(stockData.overallScore)"
              variant="subtle"
              size="sm"
            >
              Score: {{ stockData.overallScore }}/100 • {{ stockData.overallRating }}
            </UBadge>
          </div>
          <p class="text-xs text-muted">
            {{ stockData.companyName }}
          </p>
        </div>

        <div class="flex items-center gap-3">
          <div class="text-right">
            <div class="text-base font-mono font-bold">
              ₹{{ stockData.currentPrice?.toFixed(2) }}
            </div>
            <div
              class="text-xs font-mono font-semibold"
              :class="stockData.percentageChange >= 0 ? 'text-success' : 'text-error'"
            >
              {{ stockData.percentageChange >= 0 ? '+' : '' }}{{ stockData.priceChange?.toFixed(2) }}
              ({{ stockData.percentageChange >= 0 ? '+' : '' }}{{ stockData.percentageChange?.toFixed(2) }}%)
            </div>
          </div>

          <!-- Trade Action Buttons -->
          <div class="flex items-center gap-1.5 border-l border-neutral-200 dark:border-neutral-800 pl-3">
            <button
              type="button"
              class="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-all cursor-pointer whitespace-nowrap active:scale-95"
              title="Record BUY trade for this stock"
              @click="handleTradeClick('BUY')"
            >
              <UIcon name="i-lucide-plus" class="h-3.5 w-3.5" />
              <span>BUY</span>
            </button>
            <button
              type="button"
              class="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-xs transition-all cursor-pointer whitespace-nowrap active:scale-95"
              title="Record SELL trade for this stock"
              @click="handleTradeClick('SELL')"
            >
              <UIcon name="i-lucide-minus" class="h-3.5 w-3.5" />
              <span>SELL</span>
            </button>
          </div>
        </div>
      </div>
      <div
        v-else-if="isLoading"
        class="flex items-center gap-2"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="animate-spin text-primary"
        />
        <span class="text-sm font-semibold">Loading stock intelligence...</span>
      </div>
    </template>

    <template #body>
      <div
        v-if="isLoading && !stockData"
        class="flex justify-center items-center py-16"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="animate-spin text-3xl text-primary"
        />
      </div>

      <div
        v-else-if="stockData"
        class="space-y-4"
      >
        <!-- 52-Week Range & Key High-Level Stats Bar -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-muted/20 border border-default rounded-lg text-xs">
          <div>
            <span class="text-muted text-[10px] block">52-Week High</span>
            <span class="font-mono font-semibold text-success">₹{{ stockData.ranges.high52w?.toFixed(2) }}</span>
          </div>
          <div>
            <span class="text-muted text-[10px] block">52-Week Low</span>
            <span class="font-mono font-semibold text-error">₹{{ stockData.ranges.low52w?.toFixed(2) }}</span>
          </div>
          <div>
            <span class="text-muted text-[10px] block">52-Week Avg Volume</span>
            <span class="font-mono font-semibold">{{ stockData.ranges.avgVolume52w?.toLocaleString() }}</span>
          </div>
          <div>
            <span class="text-muted text-[10px] block">Last Analysis Sync</span>
            <span class="text-muted truncate block">{{ stockData.lastUpdated }}</span>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <UTabs
          v-model="activeTab"
          :items="tabItems"
          size="sm"
          color="primary"
          class="w-full"
        />

        <!-- Tab 1: Candlestick & Volume Chart -->
        <div
          v-if="activeTab === 'chart'"
          class="pt-2"
        >
          <MarketStockChart :symbol="stockData.symbol" />
        </div>

        <!-- Tab 2: Technical Indicators Radar -->
        <div
          v-else-if="activeTab === 'radar'"
          class="pt-2"
        >
          <MarketIndicatorRadar
            :signals="stockData.signals"
            :current-price="stockData.currentPrice"
          />
        </div>

        <!-- Tab 3: Fundamental Analysis -->
        <div
          v-else-if="activeTab === 'fundamentals'"
          class="pt-2"
        >
          <MarketStockFundamentals
            :symbol="stockData.symbol"
            :current-price="stockData.currentPrice"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
