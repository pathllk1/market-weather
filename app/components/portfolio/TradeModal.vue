<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { TradeType, PortfolioTrade } from '~/types/portfolio'

const props = defineProps<{
  modelValue: boolean
  portfolioId: string
  defaultSymbol?: string
  defaultType?: TradeType
  tradeToEdit?: PortfolioTrade | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'saved'): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const symbol = ref(props.defaultSymbol || '')
const tradeType = ref<TradeType>(props.defaultType || 'BUY')
const tradeDate = ref(new Date().toISOString().split('T')[0]!)
const quantity = ref<number | undefined>(undefined)
const pricePerShare = ref<number | undefined>(undefined)
const notes = ref('')
const isSubmitting = ref(false)
const errorMessage = ref('')

const dematAccounts = ref<Array<{ id: string; accountName: string; brokerName: string; depository?: string; isDefault: boolean }>>([])
const selectedDematId = ref('')

function populateFormFromTrade(t: PortfolioTrade | null | undefined) {
  if (t) {
    symbol.value = t.symbol
    searchQuery.value = t.symbol
    tradeType.value = t.tradeType
    tradeDate.value = t.tradeDate
    quantity.value = t.quantity
    pricePerShare.value = t.pricePerShare
    selectedDematId.value = t.dematAccountId || ''
    notes.value = t.notes || ''
  } else {
    symbol.value = props.defaultSymbol || ''
    searchQuery.value = props.defaultSymbol || ''
    tradeType.value = props.defaultType || 'BUY'
    tradeDate.value = new Date().toISOString().split('T')[0]!
    quantity.value = undefined
    pricePerShare.value = undefined
    notes.value = ''
  }
}

async function loadDematAccounts() {
  try {
    const res = await $fetch<{ dematAccounts: any[] }>('/api/demat')
    dematAccounts.value = res.dematAccounts || []
    if (dematAccounts.value.length > 0 && !selectedDematId.value) {
      const def = dematAccounts.value.find(d => d.isDefault) || dematAccounts.value[0]
      if (def) selectedDematId.value = def.id
    }
  } catch (err) {
    console.error('Failed to load Demat accounts:', err)
  }
}

watch(() => props.modelValue, (val) => {
  if (val) {
    loadDematAccounts()
    populateFormFromTrade(props.tradeToEdit)
  }
})

watch(() => props.tradeToEdit, (val) => {
  if (props.modelValue) {
    populateFormFromTrade(val)
  }
})

// Symbol search
const searchQuery = ref(props.defaultSymbol || '')
const searchResults = ref<Array<{ symbol: string; companyName?: string; company_name?: string; price?: number; current_price?: number }>>([])
const isSearching = ref(false)

watch(() => props.defaultSymbol, (val) => {
  if (val) {
    symbol.value = val
    searchQuery.value = val
  }
})

watch(() => props.defaultType, (val) => {
  if (val) tradeType.value = val
})

let searchTimeout: any = null
function handleSearchInput(e: Event) {
  const q = (e.target as HTMLInputElement).value
  searchQuery.value = q
  if (searchTimeout) clearTimeout(searchTimeout)
  if (!q || q.length < 2) {
    searchResults.value = []
    return
  }
  searchTimeout = setTimeout(async () => {
    isSearching.value = true
    try {
      const res = await $fetch<{ results: any[] }>('/api/market/search', {
        query: { q, limit: 6 }
      })
      searchResults.value = res.results || []
    } catch {
      searchResults.value = []
    } finally {
      isSearching.value = false
    }
  }, 250)
}

function selectSymbol(item: { symbol: string; companyName?: string; company_name?: string; price?: number; current_price?: number }) {
  symbol.value = item.symbol
  const name = item.companyName || item.company_name || ''
  searchQuery.value = name ? `${item.symbol} - ${name}` : item.symbol
  const p = item.price ?? item.current_price
  if (p && (!pricePerShare.value || pricePerShare.value <= 0)) {
    pricePerShare.value = p
  }
  searchResults.value = []
}

// Live calculation of Indian regulatory charges
const charges = computed(() => {
  const qty = Number(quantity.value) || 0
  const price = Number(pricePerShare.value) || 0
  const turnOver = qty * price

  if (turnOver <= 0) {
    return { brokerage: 0, stt: 0, exchange: 0, gst: 0, sebi: 0, stampDuty: 0, totalCharges: 0, totalCost: 0 }
  }

  const brokerage = 0 // Zero delivery brokerage
  const stt = Number((turnOver * 0.001).toFixed(2)) // 0.1% STT
  const exchange = Number((turnOver * 0.0000345).toFixed(2)) // 0.00345%
  const gst = Number(((brokerage + exchange) * 0.18).toFixed(2)) // 18% on exchange charges
  const sebi = Number(((turnOver / 10000000) * 10).toFixed(2)) // ₹10/Cr
  const stampDuty = tradeType.value === 'BUY' ? Number((turnOver * 0.00015).toFixed(2)) : 0

  const totalCharges = Number((brokerage + stt + exchange + gst + sebi + stampDuty).toFixed(2))
  const totalCost = tradeType.value === 'BUY'
    ? Number((turnOver + totalCharges).toFixed(2))
    : Number((turnOver - totalCharges).toFixed(2))

  return { brokerage, stt, exchange, gst, sebi, stampDuty, totalCharges, totalCost }
})

async function handleSubmit() {
  if (!symbol.value) {
    errorMessage.value = 'Please select a valid stock symbol.'
    return
  }
  if (!quantity.value || quantity.value <= 0) {
    errorMessage.value = 'Please enter a valid quantity.'
    return
  }
  if (pricePerShare.value === undefined || pricePerShare.value < 0) {
    errorMessage.value = 'Please enter a valid price.'
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''

  try {
    const endpoint = props.tradeToEdit
      ? `/api/portfolio/${props.portfolioId}/trades/${props.tradeToEdit.id}`
      : `/api/portfolio/${props.portfolioId}/trades`
    const method = props.tradeToEdit ? 'PUT' : 'POST'

    await $fetch(endpoint, {
      method,
      body: {
        symbol: symbol.value,
        tradeType: tradeType.value,
        tradeDate: tradeDate.value,
        quantity: quantity.value,
        pricePerShare: pricePerShare.value,
        brokerage: charges.value.brokerage,
        stt: charges.value.stt,
        exchangeCharges: charges.value.exchange,
        gst: charges.value.gst,
        sebiFee: charges.value.sebi,
        totalCost: charges.value.totalCost,
        dematAccountId: selectedDematId.value || null,
        notes: notes.value
      }
    })

    emit('saved')
    isOpen.value = false
    // reset
    quantity.value = undefined
    pricePerShare.value = undefined
    notes.value = ''
  } catch (err: any) {
    errorMessage.value = err?.data?.statusMessage || 'Failed to record trade'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="tradeToEdit ? 'Edit Trade & Reassign Demat' : 'Record Portfolio Trade'"
    :description="tradeToEdit ? 'Change executing Demat account (e.g. Angel One to Zerodha), quantity, or price' : 'Log equity buy, sell, or corporate actions'"
    :ui="{ content: 'sm:max-w-lg' }"
  >
    <template #body>
      <div class="space-y-4">
        <!-- Trade Type Selector -->
        <div class="grid grid-cols-4 gap-1.5 p-1 rounded-xl bg-neutral-100 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60">
        <button
          v-for="t in (['BUY', 'SELL', 'BONUS', 'SPLIT'] as const)"
          :key="t"
          type="button"
          class="py-1.5 rounded-lg text-xs font-bold transition-all text-center"
          :class="tradeType === t
            ? (t === 'BUY' ? 'bg-emerald-500 text-white shadow-xs' : t === 'SELL' ? 'bg-rose-500 text-white shadow-xs' : 'bg-primary text-white shadow-xs')
            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
          @click="tradeType = t"
        >
          {{ t }}
        </button>
      </div>

      <!-- Demat Account Selector -->
      <div v-if="dematAccounts.length > 0">
        <label class="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1 flex items-center justify-between">
          <span>Executing Demat Account</span>
          <span class="text-[11px] text-neutral-400 font-normal">Brokers: Zerodha, Groww, Upstox...</span>
        </label>
        <select
          v-model="selectedDematId"
          class="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-900 dark:text-white focus:outline-hidden focus:border-primary cursor-pointer"
        >
          <option v-for="d in dematAccounts" :key="d.id" :value="d.id">
            {{ d.accountName }} ({{ d.brokerName }} • {{ d.depository }})
          </option>
        </select>
      </div>

      <!-- Form Inputs -->
      <form class="space-y-3" @submit.prevent="handleSubmit">
        <!-- Stock Symbol with Live Search -->
        <div class="relative">
          <label class="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            Search Stock / Equity Symbol
          </label>
          <div class="relative">
            <input
              type="text"
              :value="searchQuery"
              placeholder="e.g. RELIANCE, TCS, HDFCBANK..."
              class="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3.5 py-2 text-xs font-medium text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:border-primary"
              @input="handleSearchInput"
            />
            <UIcon
              v-if="isSearching"
              name="i-lucide-loader-2"
              class="absolute right-3 top-2.5 h-4 w-4 animate-spin text-neutral-400"
            />
          </div>

          <!-- Dropdown Results -->
          <div
            v-if="searchResults.length > 0"
            class="absolute left-0 top-full mt-1 z-50 w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-1 shadow-xl max-h-48 overflow-y-auto"
          >
            <button
              v-for="item in searchResults"
              :key="item.symbol"
              type="button"
              class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              @click="selectSymbol(item)"
            >
              <div>
                <strong class="font-bold text-neutral-900 dark:text-white">{{ item.symbol }}</strong>
                <span class="text-neutral-500 text-[11px] block">{{ item.companyName || item.company_name }}</span>
              </div>
              <span class="font-mono font-bold text-neutral-900 dark:text-white">₹{{ (item.price ?? item.current_price)?.toFixed(2) }}</span>
            </button>
          </div>
        </div>

        <!-- Date & Quantity -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Trade Date</label>
            <input
              v-model="tradeDate"
              type="date"
              class="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs text-neutral-900 dark:text-white focus:outline-hidden focus:border-primary"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Quantity (Shares)</label>
            <input
              v-model.number="quantity"
              type="number"
              step="any"
              min="1"
              placeholder="e.g. 50"
              class="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs text-neutral-900 dark:text-white focus:outline-hidden focus:border-primary"
            />
          </div>
        </div>

        <!-- Execution Price -->
        <div>
          <label class="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            Price per Share (₹)
          </label>
          <input
            v-model.number="pricePerShare"
            type="number"
            step="any"
            min="0"
            placeholder="e.g. 1315.20"
            class="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-mono font-bold text-neutral-900 dark:text-white focus:outline-hidden focus:border-primary"
          />
        </div>

        <!-- Regulatory Charges Preview Card -->
        <div class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/50 p-3 text-xs space-y-1.5 font-mono">
          <div class="flex justify-between text-neutral-500">
            <span>Turnover</span>
            <span class="font-bold text-neutral-900 dark:text-white">₹{{ ((quantity || 0) * (pricePerShare || 0)).toFixed(2) }}</span>
          </div>
          <div class="flex justify-between text-neutral-500 text-[11px]">
            <span>STT (0.1%)</span>
            <span>₹{{ charges.stt.toFixed(2) }}</span>
          </div>
          <div class="flex justify-between text-neutral-500 text-[11px]">
            <span>Exchange Charges + GST + SEBI</span>
            <span>₹{{ (charges.exchange + charges.gst + charges.sebi + charges.stampDuty).toFixed(2) }}</span>
          </div>
          <div class="pt-1.5 border-t border-neutral-200 dark:border-neutral-800 flex justify-between font-bold text-sm">
            <span>{{ tradeType === 'BUY' ? 'Net Payable' : 'Net Receivable' }}</span>
            <span :class="tradeType === 'BUY' ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'">
              ₹{{ charges.totalCost.toFixed(2) }}
            </span>
          </div>
        </div>

        <!-- Notes -->
        <div>
          <label class="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Trade Notes (Optional)</label>
          <input
            v-model="notes"
            type="text"
            placeholder="e.g. Q3 earnings breakout, SIP installment..."
            class="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs text-neutral-900 dark:text-white focus:outline-hidden focus:border-primary"
          />
        </div>

        <p v-if="errorMessage" class="text-xs text-rose-500 font-medium">
          {{ errorMessage }}
        </p>

        <!-- Actions -->
        <div class="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <button
            type="button"
            class="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            @click="isOpen = false"
          >
            Cancel
          </button>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-xs"
            :class="tradeType === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'"
          >
            <UIcon v-if="isSubmitting" name="i-lucide-loader-2" class="h-3.5 w-3.5 animate-spin" />
            <span>{{ tradeToEdit ? 'Save Trade Changes' : `Confirm ${tradeType} Order` }}</span>
          </button>
        </div>
      </form>
    </div>
  </template>
</UModal>
</template>
