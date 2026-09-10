<script setup lang="ts">
import type { TradeType, BacktestLiveQuoteResponse } from '~/types/backtest'

const props = defineProps<{
  modelValue: boolean
  portfolioId: string
  availableCash: number
  heldQuantity?: number
  defaultSymbol?: string
  defaultType?: TradeType
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'trade-logged'): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val)
})

const tradeType = ref<TradeType>('BUY')
const symbol = ref('')
const companyName = ref('')
const quantity = ref<number | null>(null)
const price = ref<number | null>(null)
const fees = ref<number>(20)
const stopLoss = ref<number | null>(null)
const targetPrice = ref<number | null>(null)
const strategyTag = ref('Breakout 52W High')
const notes = ref('')

const isFetchingLive = ref(false)
const isSubmitting = ref(false)
const errorMessage = ref('')
const liveQuoteData = ref<BacktestLiveQuoteResponse | null>(null)

const STRATEGY_PRESETS = [
  'Breakout 52W High',
  'Pullback to 20 EMA',
  'RSI Oversold Bounce',
  'Supertrend Trend-Following',
  'Support Level Rebound',
  'MACD Bullish Cross',
  'Earnings Momentum',
  'Discretionary Manual'
]

interface SearchEquityItem {
  symbol: string
  cleanSymbol: string
  companyName: string
  price: number
  change: number
  changePercent: number
  overallScore: number
  rsi?: number
}

const searchResults = ref<SearchEquityItem[]>([])
const isSearching = ref(false)
const showDropdown = ref(false)
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

function handleSymbolInput(val: string) {
  symbol.value = val
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)

  const clean = val.trim()
  if (!clean) {
    searchResults.value = []
    showDropdown.value = false
    return
  }

  searchDebounceTimer = setTimeout(async () => {
    isSearching.value = true
    try {
      const res = await $fetch<{ results: SearchEquityItem[] }>('/api/market/search', {
        query: { q: clean }
      })
      searchResults.value = res.results || []
      showDropdown.value = searchResults.value.length > 0
    } catch {
      searchResults.value = []
    } finally {
      isSearching.value = false
    }
  }, 150)
}

function selectEquity(item: SearchEquityItem) {
  symbol.value = item.cleanSymbol || item.symbol.replace(/\.NS$/i, '')
  companyName.value = item.companyName
  price.value = item.price
  showDropdown.value = false
  searchResults.value = []
  fetchLivePrice()
}

function onInputBlur() {
  setTimeout(() => {
    showDropdown.value = false
  }, 200)
}

watch(() => props.modelValue, (open) => {
  if (open) {
    tradeType.value = props.defaultType || 'BUY'
    symbol.value = props.defaultSymbol || ''
    quantity.value = null
    price.value = null
    fees.value = 20
    stopLoss.value = null
    targetPrice.value = null
    strategyTag.value = 'Breakout 52W High'
    notes.value = ''
    errorMessage.value = ''
    liveQuoteData.value = null
    searchResults.value = []
    showDropdown.value = false

    if (symbol.value) {
      fetchLivePrice()
    }
  }
})

async function fetchLivePrice() {
  const sym = symbol.value.trim().toUpperCase()
  if (!sym) return

  isFetchingLive.value = true
  errorMessage.value = ''
  try {
    const data = await $fetch<BacktestLiveQuoteResponse>('/api/backtest/live-quote', {
      query: { symbol: sym }
    })
    liveQuoteData.value = data
    symbol.value = data.symbol
    companyName.value = data.companyName
    price.value = data.price
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }, message?: string }
    errorMessage.value = e.data?.statusMessage || e.message || 'Unable to fetch real-time price'
  } finally {
    isFetchingLive.value = false
  }
}

const totalCost = computed(() => {
  const q = Number(quantity.value) || 0
  const p = Number(price.value) || 0
  const f = Number(fees.value) || 0
  return (q * p) + f
})

const totalProceeds = computed(() => {
  const q = Number(quantity.value) || 0
  const p = Number(price.value) || 0
  const f = Number(fees.value) || 0
  return Math.max(0, (q * p) - f)
})

const riskRewardRatio = computed(() => {
  const p = Number(price.value) || 0
  const sl = Number(stopLoss.value) || 0
  const tp = Number(targetPrice.value) || 0

  if (!p || !sl || !tp) return null
  const risk = Math.abs(p - sl)
  const reward = Math.abs(tp - p)
  if (risk === 0) return null
  return (reward / risk).toFixed(2)
})

function setQuickQty(qty: number) {
  quantity.value = qty
}

async function handleExecuteTrade() {
  if (!symbol.value.trim()) {
    errorMessage.value = 'Please enter a valid stock symbol'
    return
  }
  if (!quantity.value || quantity.value <= 0) {
    errorMessage.value = 'Quantity must be greater than zero'
    return
  }
  if (!price.value || price.value <= 0) {
    errorMessage.value = 'Execution price must be greater than zero'
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''

  try {
    await $fetch(`/api/backtest/portfolios/${props.portfolioId}/trades`, {
      method: 'POST',
      body: {
        symbol: symbol.value.trim().toUpperCase(),
        companyName: companyName.value || symbol.value.trim().toUpperCase(),
        tradeType: tradeType.value,
        quantity: quantity.value,
        price: price.value,
        fees: fees.value,
        stopLoss: stopLoss.value || null,
        targetPrice: targetPrice.value || null,
        strategyTag: strategyTag.value,
        notes: notes.value || null,
        executedAt: Date.now()
      }
    })

    emit('trade-logged')
    isOpen.value = false
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }, message?: string }
    errorMessage.value = e.data?.statusMessage || e.message || 'Failed to execute backtest trade'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="isOpen">
    <template #content>
      <div class="p-6 space-y-5">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <div class="flex items-center gap-2">
            <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UIcon
                name="i-lucide-candlestick-chart"
                class="h-5 w-5"
              />
            </div>
            <div>
              <h3 class="text-base font-bold text-neutral-900 dark:text-white">
                Execute Backtest Order
              </h3>
              <p class="text-xs text-neutral-500 dark:text-neutral-400">
                Simulate execution on genuine live or custom prices
              </p>
            </div>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            size="xs"
            @click="isOpen = false"
          />
        </div>

        <!-- Buy / Sell Mode Tabs -->
        <div class="grid grid-cols-2 gap-2 p-1 bg-neutral-100 dark:bg-neutral-800/80 rounded-xl">
          <button
            type="button"
            class="py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5"
            :class="tradeType === 'BUY' ? 'bg-emerald-600 text-white shadow-sm' : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
            @click="tradeType = 'BUY'"
          >
            <UIcon
              name="i-lucide-arrow-down-left"
              class="h-4 w-4"
            />
            BUY (LONG)
          </button>
          <button
            type="button"
            class="py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5"
            :class="tradeType === 'SELL' ? 'bg-rose-600 text-white shadow-sm' : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
            @click="tradeType = 'SELL'"
          >
            <UIcon
              name="i-lucide-arrow-up-right"
              class="h-4 w-4"
            />
            SELL (EXIT / SHORT)
          </button>
        </div>

        <!-- Symbol & Live Price Fetcher with Autocomplete -->
        <div class="space-y-1.5 relative">
          <div class="flex items-center justify-between text-xs font-medium text-neutral-700 dark:text-neutral-300">
            <span>Symbol / Ticker</span>
            <button
              type="button"
              class="text-primary hover:underline flex items-center gap-1 text-xs"
              :disabled="isFetchingLive"
              @click="fetchLivePrice"
            >
              <UIcon
                :name="isFetchingLive ? 'i-lucide-loader-2' : 'i-lucide-zap'"
                :class="{ 'animate-spin': isFetchingLive }"
                class="h-3.5 w-3.5"
              />
              <span>Fetch Live Market Price</span>
            </button>
          </div>
          <div class="relative flex gap-2">
            <div class="relative flex-1">
              <UInput
                :model-value="symbol"
                placeholder="Type symbol or company (e.g. RELIANCE, TCS)..."
                class="w-full uppercase font-mono"
                autocomplete="off"
                @update:model-value="handleSymbolInput"
                @focus="handleSymbolInput(symbol)"
                @blur="onInputBlur"
                @keyup.enter="fetchLivePrice"
              />
              <UIcon
                v-if="isSearching"
                name="i-lucide-loader-2"
                class="absolute right-3 top-2.5 h-4 w-4 animate-spin text-neutral-400 pointer-events-none"
              />
            </div>
            <UButton
              color="primary"
              variant="soft"
              size="sm"
              :loading="isFetchingLive"
              @click="fetchLivePrice"
            >
              Quote
            </UButton>

            <!-- Autocomplete Results Dropdown -->
            <div
              v-if="showDropdown && searchResults.length > 0"
              class="absolute left-0 top-full mt-1.5 z-50 w-full rounded-xl border border-neutral-200/90 dark:border-neutral-700/90 bg-white/95 dark:bg-neutral-900/95 p-1.5 shadow-2xl backdrop-blur-md max-h-56 overflow-y-auto"
            >
              <button
                v-for="item in searchResults"
                :key="item.symbol"
                type="button"
                class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                @mousedown.prevent="selectEquity(item)"
              >
                <div class="min-w-0 pr-2">
                  <div class="flex items-center gap-1.5">
                    <strong class="font-bold text-neutral-900 dark:text-white font-mono">{{ item.cleanSymbol }}</strong>
                    <span class="rounded bg-neutral-100 dark:bg-neutral-800 px-1 py-0.2 text-[9px] text-neutral-500 font-mono">NSE</span>
                  </div>
                  <span class="text-neutral-500 dark:text-neutral-400 text-[11px] block truncate max-w-[220px]">
                    {{ item.companyName }}
                  </span>
                </div>
                <div class="text-right shrink-0">
                  <div class="font-mono font-bold text-neutral-900 dark:text-white">
                    ₹{{ item.price.toFixed(2) }}
                  </div>
                  <div
                    class="text-[10px] font-medium"
                    :class="item.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
                  >
                    {{ item.change >= 0 ? '+' : '' }}{{ item.changePercent.toFixed(2) }}%
                  </div>
                </div>
              </button>
            </div>
          </div>

          <!-- Live Quote Indicator Pill -->
          <div
            v-if="liveQuoteData"
            class="flex flex-wrap items-center gap-2 pt-1 text-xs bg-neutral-50 dark:bg-neutral-800/50 p-2.5 rounded-lg border border-neutral-200/60 dark:border-neutral-700/60"
          >
            <span class="font-bold text-neutral-900 dark:text-white">{{ liveQuoteData.companyName }}</span>
            <span class="font-mono font-semibold text-primary">₹{{ liveQuoteData.price.toFixed(2) }}</span>
            <span
              class="font-medium px-1.5 py-0.5 rounded text-[11px]"
              :class="liveQuoteData.change >= 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'"
            >
              {{ liveQuoteData.change >= 0 ? '+' : '' }}{{ liveQuoteData.change.toFixed(2) }} ({{ liveQuoteData.changePercent.toFixed(2) }}%)
            </span>
            <span
              v-if="liveQuoteData.rsi"
              class="text-neutral-500 dark:text-neutral-400 text-[11px]"
            >
              RSI: {{ liveQuoteData.rsi.toFixed(1) }}
            </span>
          </div>
        </div>

        <!-- Quantity & Execution Price -->
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-xs font-medium text-neutral-700 dark:text-neutral-300">
              <span>Quantity (Shares)</span>
              <span
                v-if="tradeType === 'SELL' && heldQuantity !== undefined"
                class="text-neutral-400 text-[11px]"
              >
                Held: {{ heldQuantity }}
              </span>
            </div>
            <UInput
              v-model.number="quantity"
              type="number"
              min="1"
              step="1"
              placeholder="Shares"
              class="w-full font-mono"
            />
            <div class="flex gap-1 pt-0.5">
              <button
                v-for="q in [10, 25, 50, 100]"
                :key="q"
                type="button"
                class="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400"
                @click="setQuickQty(q)"
              >
                +{{ q }}
              </button>
            </div>
          </div>

          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-xs font-medium text-neutral-700 dark:text-neutral-300">
              <span>Execution Price (₹)</span>
            </div>
            <UInput
              v-model.number="price"
              type="number"
              min="0.01"
              step="0.05"
              placeholder="Price"
              class="w-full font-mono"
            />
          </div>
        </div>

        <!-- Stop Loss & Target Price with R:R Ratio -->
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-xs font-medium text-neutral-700 dark:text-neutral-300">Stop Loss (₹)</label>
            <UInput
              v-model.number="stopLoss"
              type="number"
              step="0.05"
              placeholder="Optional SL"
              class="w-full font-mono text-xs"
            />
          </div>
          <div class="space-y-1">
            <div class="flex items-center justify-between text-xs font-medium text-neutral-700 dark:text-neutral-300">
              <span>Target Price (₹)</span>
              <span
                v-if="riskRewardRatio"
                class="text-emerald-500 font-semibold text-[10px]"
              >
                R:R 1:{{ riskRewardRatio }}
              </span>
            </div>
            <UInput
              v-model.number="targetPrice"
              type="number"
              step="0.05"
              placeholder="Optional Target"
              class="w-full font-mono text-xs"
            />
          </div>
        </div>

        <!-- Strategy Tag & Notes -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-xs font-medium text-neutral-700 dark:text-neutral-300">Strategy Setup Tag</label>
            <USelect
              v-model="strategyTag"
              :items="STRATEGY_PRESETS"
              class="w-full text-xs"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs font-medium text-neutral-700 dark:text-neutral-300">Brokerage / Fees (₹)</label>
            <UInput
              v-model.number="fees"
              type="number"
              min="0"
              step="1"
              placeholder="20"
              class="w-full font-mono text-xs"
            />
          </div>
        </div>

        <!-- Notes -->
        <div class="space-y-1">
          <label class="text-xs font-medium text-neutral-700 dark:text-neutral-300">Trade Rationale / Notes</label>
          <UTextarea
            v-model="notes"
            :rows="2"
            placeholder="e.g. 52-week high breakout with volume expansion above 20 EMA..."
            class="w-full text-xs"
          />
        </div>

        <!-- Order Summary & Available Cash -->
        <div class="rounded-xl bg-neutral-50 dark:bg-neutral-800/40 p-3.5 border border-neutral-200/80 dark:border-neutral-700/80 space-y-1.5 text-xs">
          <div class="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
            <span>Available Cash Balance:</span>
            <span class="font-mono font-semibold text-neutral-900 dark:text-white">₹{{ availableCash.toLocaleString('en-IN', { maximumFractionDigits: 2 }) }}</span>
          </div>
          <div class="flex items-center justify-between font-bold text-neutral-900 dark:text-white text-sm pt-1 border-t border-neutral-200/60 dark:border-neutral-700/60">
            <span>{{ tradeType === 'BUY' ? 'Total Required Cost:' : 'Estimated Net Proceeds:' }}</span>
            <span class="font-mono text-primary">₹{{ (tradeType === 'BUY' ? totalCost : totalProceeds).toLocaleString('en-IN', { maximumFractionDigits: 2 }) }}</span>
          </div>
        </div>

        <!-- Error Message -->
        <div
          v-if="errorMessage"
          class="p-3 text-xs rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 flex items-center gap-2"
        >
          <UIcon
            name="i-lucide-alert-circle"
            class="h-4 w-4 shrink-0"
          />
          <span>{{ errorMessage }}</span>
        </div>

        <!-- Submit Actions -->
        <div class="flex justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <UButton
            color="neutral"
            variant="ghost"
            @click="isOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            :color="tradeType === 'BUY' ? 'primary' : 'error'"
            :loading="isSubmitting"
            @click="handleExecuteTrade"
          >
            {{ tradeType === 'BUY' ? 'Confirm Buy Order' : 'Confirm Sell Order' }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
