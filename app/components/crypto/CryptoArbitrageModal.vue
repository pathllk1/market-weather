<script setup lang="ts">
import { ref, computed } from 'vue'
import type { CryptoAsset, InrRateData } from '../../composables/useCrypto'

const props = defineProps<{
  isOpen: boolean
  asset: CryptoAsset | null
  inrRates: InrRateData
  formatInr: (val: number, options?: { compact?: boolean, decimals?: number }) => string
  formatUsd: (val: number, decimals?: number) => string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'openCalculator', symbol: string): void
}>()

const tradeCapitalInr = ref<number>(100000) // ₹ 1 Lakh default

// Price on Global Binance converted at formal Forex rate
const globalPriceInr = computed(() => {
  if (!props.asset) return 0
  return props.asset.priceUsdt * props.inrRates.forexRate
})

// Price on Domestic Indian Exchange (USDT domestic rate)
const domesticPriceInr = computed(() => {
  if (!props.asset) return 0
  return props.asset.priceUsdt * props.inrRates.domesticRate
})

// Absolute spread per coin
const spreadPerCoinInr = computed(() => {
  return domesticPriceInr.value - globalPriceInr.value
})

const spreadPercent = computed(() => {
  return props.inrRates.spreadPercent || 7.0
})

// Arbitrage Profit Computation on Capital
const coinsBoughtGlobally = computed(() => {
  if (globalPriceInr.value <= 0) return 0
  return (tradeCapitalInr.value || 0) / globalPriceInr.value
})

const grossSaleDomesticInr = computed(() => {
  return coinsBoughtGlobally.value * domesticPriceInr.value
})

const grossProfitInr = computed(() => {
  return Math.max(0, grossSaleDomesticInr.value - (tradeCapitalInr.value || 0))
})

// Regulatory deductions:
// 1. 1% TDS on domestic sale (Sec 194S)
const tdsInr = computed(() => grossSaleDomesticInr.value * 0.01)

// 2. Exchange fee: ~0.2% on buy + 0.2% on sell + 18% GST on fees
const feesInr = computed(() => (tradeCapitalInr.value + grossSaleDomesticInr.value) * 0.002 * 1.18)

// 3. Net Arbitrage Profit
const netProfitInr = computed(() => {
  return grossProfitInr.value - tdsInr.value - feesInr.value
})

const netYieldPercent = computed(() => {
  if (!tradeCapitalInr.value || tradeCapitalInr.value <= 0) return 0
  return Number(((netProfitInr.value / tradeCapitalInr.value) * 100).toFixed(2))
})
</script>

<template>
  <div
    v-if="isOpen && asset"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
  >
    <div
      class="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-5 sm:p-6 relative my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      <!-- Close button -->
      <button
        class="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
        @click="emit('close')"
      >
        <UIcon
          name="i-lucide-x"
          class="w-5 h-5"
        />
      </button>

      <!-- Modal Header -->
      <div class="flex items-center gap-3 pb-4 border-b border-slate-100 mb-5">
        <div class="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
          <UIcon
            name="i-lucide-arrow-left-right"
            class="w-6 h-6"
          />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-black text-slate-900">
              Domestic vs Global Arbitrage Matrix
            </h3>
            <span class="text-xs font-mono font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
              {{ asset.symbol }}
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-0.5">
            Compare Indian Domestic USDT premium vs Global Binance Forex rates.
          </p>
        </div>
      </div>

      <!-- Comparison Price Strip -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5 text-xs">
        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <span class="text-slate-400 text-[10px] uppercase font-bold block mb-1">Global Binance (Forex @ ₹{{ inrRates.forexRate.toFixed(2) }})</span>
          <span class="text-lg font-black text-slate-900 font-mono">{{ formatInr(globalPriceInr) }}</span>
          <span class="text-[10px] text-slate-400 block mt-0.5">{{ formatUsd(asset.priceUsdt) }}</span>
        </div>

        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <span class="text-slate-400 text-[10px] uppercase font-bold block mb-1">Indian Domestic (CoinDCX @ ₹{{ inrRates.domesticRate.toFixed(2) }})</span>
          <span class="text-lg font-black text-blue-700 font-mono">{{ formatInr(domesticPriceInr) }}</span>
          <span class="text-[10px] text-slate-400 block mt-0.5">P2P / OTC Market</span>
        </div>

        <div class="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200">
          <span class="text-amber-800 text-[10px] uppercase font-bold block mb-1">Domestic Premium Spread</span>
          <span class="text-lg font-black text-amber-900 font-mono">+{{ spreadPercent }}%</span>
          <span class="text-[10px] text-amber-700 block mt-0.5 font-bold">+{{ formatInr(spreadPerCoinInr) }} / coin</span>
        </div>
      </div>

      <!-- Arbitrage Yield Simulation -->
      <div class="space-y-3 mb-5">
        <label class="block text-xs font-bold text-slate-700">Test Arbitrage Capital (INR)</label>
        <div class="relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
          <input
            v-model.number="tradeCapitalInr"
            type="number"
            min="10000"
            step="10000"
            class="w-full pl-7 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
        </div>

        <!-- Quick chips -->
        <div class="flex items-center gap-1.5 text-xs">
          <span class="text-[10px] text-slate-400 font-semibold uppercase">Presets:</span>
          <button
            v-for="amt in [50000, 100000, 500000, 1000000]"
            :key="amt"
            class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold cursor-pointer"
            @click="tradeCapitalInr = amt"
          >
            {{ formatInr(amt, { compact: true }) }}
          </button>
        </div>
      </div>

      <!-- Arbitrage Breakdown Ledger -->
      <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2 mb-5">
        <div class="flex justify-between text-slate-600">
          <span>Global Acquisition:</span>
          <span class="font-mono">{{ coinsBoughtGlobally.toFixed(4) }} {{ asset.baseAsset }}</span>
        </div>
        <div class="flex justify-between text-slate-600">
          <span>Domestic Gross Sale Value:</span>
          <span class="font-mono font-bold text-slate-900">{{ formatInr(grossSaleDomesticInr) }}</span>
        </div>
        <div class="flex justify-between text-emerald-700">
          <span>Gross Spread Profit:</span>
          <span class="font-mono font-bold">+{{ formatInr(grossProfitInr) }}</span>
        </div>
        <div class="flex justify-between text-rose-600 text-[11px]">
          <span>Sec 194S TDS (1% on sale):</span>
          <span class="font-mono">-{{ formatInr(tdsInr) }}</span>
        </div>
        <div class="flex justify-between text-slate-500 text-[11px]">
          <span>Exchange Fees (0.2% + 18% GST):</span>
          <span class="font-mono">-{{ formatInr(feesInr) }}</span>
        </div>

        <div class="border-t border-slate-300 pt-2 flex justify-between font-black text-slate-900 text-sm">
          <span>Net Realized Arbitrage Yield:</span>
          <div class="text-right">
            <span
              class="font-mono"
              :class="netProfitInr > 0 ? 'text-emerald-700' : 'text-rose-700'"
            >
              {{ netProfitInr >= 0 ? '+' : '' }}{{ formatInr(netProfitInr) }}
            </span>
            <span class="text-xs text-slate-500 ml-1.5 font-bold">({{ netYieldPercent }}%)</span>
          </div>
        </div>
      </div>

      <!-- Regulatory Notice -->
      <div class="p-3 bg-amber-50/60 rounded-xl border border-amber-200/80 text-[11px] text-amber-900 mb-5 leading-relaxed">
        <strong>Indian Regulatory Note:</strong> While cross-border crypto price spreads exist due to domestic INR demand, FEMA and RBI regulations strictly govern outward remittances (LRS). Arbitrage across fiat borders requires authorized dealer banks and PAN-linked 1% TDS filing.
      </div>

      <div class="flex items-center justify-between">
        <button
          class="text-xs font-semibold text-blue-600 hover:text-blue-800 underline cursor-pointer"
          @click="emit('openCalculator', asset.symbol); emit('close')"
        >
          View Full 31.2% VDA Tax Breakdown
        </button>

        <button
          class="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
          @click="emit('close')"
        >
          Close Drawer
        </button>
      </div>
    </div>
  </div>
</template>

