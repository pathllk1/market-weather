<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { CryptoAsset } from '../../composables/useCrypto'

const props = defineProps<{
  isOpen: boolean
  tickers: CryptoAsset[]
  presetSymbol: string
  activeRate: number
  formatInr: (val: number, options?: { compact?: boolean, decimals?: number }) => string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const selectedSymbol = ref(props.presetSymbol || 'BTCUSDT')
const cryptoAmount = ref<number>(1)
const purchasePriceInr = ref<number | null>(null)

watch(
  () => props.presetSymbol,
  (sym) => {
    if (sym) selectedSymbol.value = sym
  }
)

const activeCoin = computed<CryptoAsset | undefined>(() => {
  return props.tickers.find(t => t.symbol === selectedSymbol.value) ?? props.tickers[0]
})

// Initialize purchase price to current price - 10% as reasonable default
watch(
  activeCoin,
  (coin) => {
    if (coin && (purchasePriceInr.value === null || purchasePriceInr.value === 0)) {
      purchasePriceInr.value = Math.round(coin.priceInr * 0.85)
    }
  },
  { immediate: true }
)

const currentPriceInr = computed(() => activeCoin.value?.priceInr || 0)
const totalGrossValueInr = computed(() => (cryptoAmount.value || 0) * currentPriceInr.value)

// Cost basis
const totalCostBasisInr = computed(() => (cryptoAmount.value || 0) * (purchasePriceInr.value || 0))
const capitalGainInr = computed(() => Math.max(0, totalGrossValueInr.value - totalCostBasisInr.value))

// Indian Tax Computations
const tdsDeductionInr = computed(() => totalGrossValueInr.value * 0.01) // 1% Section 194S TDS
const vdaTaxInr = computed(() => capitalGainInr.value * 0.312) // 30% Flat Tax + 4% Health & Education Cess = 31.2%
const netInHandInr = computed(() => Math.max(0, totalGrossValueInr.value - tdsDeductionInr.value - vdaTaxInr.value))
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
  >
    <div
      class="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 relative overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      <!-- Close button -->
      <button
        class="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        @click="emit('close')"
      >
        <UIcon
          name="i-lucide-x"
          class="w-5 h-5"
        />
      </button>

      <!-- Modal Header -->
      <div class="flex items-center gap-3 mb-5">
        <div class="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
          <UIcon
            name="i-lucide-calculator"
            class="w-6 h-6"
          />
        </div>
        <div>
          <h3 class="text-lg font-bold text-slate-900">
            Indian Crypto & TDS Tax Calculator
          </h3>
          <p class="text-xs text-slate-500">
            Real-time valuation with Sec 194S (1% TDS) and Sec 115BBH (31.2% Flat VDA Tax)
          </p>
        </div>
      </div>

      <!-- Select Coin & Inputs -->
      <div class="space-y-4 mb-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Select Cryptocurrency</label>
            <select
              v-model="selectedSymbol"
              class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option
                v-for="t in tickers.slice(0, 80)"
                :key="t.symbol"
                :value="t.symbol"
              >
                {{ t.name }} ({{ t.baseAsset }})
              </option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Crypto Quantity</label>
            <input
              v-model.number="cryptoAmount"
              type="number"
              min="0.0001"
              step="any"
              class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="e.g. 0.5"
            >
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Live Current Price (₹)</label>
            <div class="bg-slate-100 border border-slate-200/80 rounded-lg px-3 py-2 text-xs font-bold text-slate-900">
              {{ formatInr(currentPriceInr) }}
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Your Buy/Cost Price in ₹ (per coin)</label>
            <input
              v-model.number="purchasePriceInr"
              type="number"
              min="0"
              step="any"
              class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="Your purchase price"
            >
          </div>
        </div>
      </div>

      <!-- Indian Taxation Calculation Breakdown Card -->
      <div class="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2.5 text-xs mb-5">
        <div class="flex justify-between items-center text-slate-700">
          <span>Gross Sale Value:</span>
          <span class="font-bold text-slate-900">{{ formatInr(totalGrossValueInr) }}</span>
        </div>

        <div class="flex justify-between items-center text-slate-600">
          <span>Total Purchase Cost Basis:</span>
          <span>{{ formatInr(totalCostBasisInr) }}</span>
        </div>

        <div class="flex justify-between items-center text-emerald-700 font-medium">
          <span>Realized Capital Gain / Profit:</span>
          <span>+{{ formatInr(capitalGainInr) }}</span>
        </div>

        <div class="border-t border-slate-200 pt-2 flex justify-between items-center text-amber-700">
          <span class="flex items-center gap-1">
            <UIcon
              name="i-lucide-shield-alert"
              class="w-3.5 h-3.5"
            />
            Section 194S TDS (1% on sale):
          </span>
          <span class="font-bold">-{{ formatInr(tdsDeductionInr) }}</span>
        </div>

        <div class="flex justify-between items-center text-rose-700">
          <span class="flex items-center gap-1">
            <UIcon
              name="i-lucide-percent"
              class="w-3.5 h-3.5"
            />
            Section 115BBH VDA Tax (30% + 4% cess):
          </span>
          <span class="font-bold">-{{ formatInr(vdaTaxInr) }}</span>
        </div>

        <div class="border-t border-slate-300 pt-2.5 flex justify-between items-center text-sm font-extrabold text-slate-900">
          <span>Estimated Net In-Hand:</span>
          <span class="text-base text-blue-700">{{ formatInr(netInHandInr) }}</span>
        </div>
      </div>

      <!-- Info Footer -->
      <p class="text-[11px] text-slate-400 leading-relaxed mb-4">
        * Note: As per Indian Income Tax regulations, Virtual Digital Assets (VDAs) attract a flat 30% tax (plus 4% cess) on net profits without benefit of deduction of any expenditure (other than cost of acquisition) or set-off of losses. 1% TDS is credited against your PAN.
      </p>

      <div class="flex justify-end">
        <button
          class="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
          @click="emit('close')"
        >
          Close Calculator
        </button>
      </div>
    </div>
  </div>
</template>
