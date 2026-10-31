<script setup lang="ts">
import { ref, computed } from 'vue'
import type { CryptoAsset } from '../../composables/useCrypto'

const props = defineProps<{
  isOpen: boolean
  asset: CryptoAsset | null
  activeRate: number
  paperWallet: {
    cashInr: number
    positions: Record<string, { symbol: string, baseAsset: string, qty: number, avgPriceInr: number, totalCostInr: number }>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    history: any[]
  }
  formatInr: (val: number, options?: { compact?: boolean, decimals?: number }) => string
  formatUsd: (val: number, decimals?: number) => string
}>()

const emit = defineEmits<{
  (e: 'close' | 'resetWallet'): void
  (e: 'executeTrade', payload: { symbol: string, baseAsset: string, side: 'BUY' | 'SELL', qty: number, priceInr: number }): void
}>()

const tradeSide = ref<'BUY' | 'SELL'>('BUY')
const tradeMode = ref<'inr' | 'qty'>('inr')
const amountInr = ref<number>(50000)
const amountQty = ref<number>(0)
const feedbackMsg = ref<{ type: 'success' | 'error', text: string } | null>(null)

// Current asset holding in paper portfolio
const currentHolding = computed(() => {
  if (!props.asset) return null
  return props.paperWallet.positions[props.asset.symbol] ?? null
})

const currentPriceInr = computed(() => props.asset?.priceInr || 0)

// Computed quantities & values
const computedQty = computed(() => {
  if (tradeMode.value === 'qty') return amountQty.value || 0
  if (currentPriceInr.value <= 0) return 0
  return (amountInr.value || 0) / currentPriceInr.value
})

const computedGrossValue = computed(() => {
  return computedQty.value * currentPriceInr.value
})

// 1% TDS on sell orders
const estimatedTds = computed(() => {
  return tradeSide.value === 'SELL' ? computedGrossValue.value * 0.01 : 0
})

const computedNetTotal = computed(() => {
  return tradeSide.value === 'BUY'
    ? computedGrossValue.value
    : Math.max(0, computedGrossValue.value - estimatedTds.value)
})

// Current holding P&L
const holdingPnl = computed(() => {
  if (!currentHolding.value || currentPriceInr.value <= 0) return null
  const currentVal = currentHolding.value.qty * currentPriceInr.value
  const cost = currentHolding.value.totalCostInr
  const profitInr = currentVal - cost
  const profitPct = cost > 0 ? (profitInr / cost) * 100 : 0
  return {
    currentVal,
    cost,
    profitInr,
    profitPct: Number(profitPct.toFixed(2))
  }
})

function submitOrder() {
  if (!props.asset) return
  feedbackMsg.value = null

  if (computedQty.value <= 0) {
    feedbackMsg.value = { type: 'error', text: 'Please enter a valid amount or quantity.' }
    return
  }

  if (tradeSide.value === 'BUY' && computedGrossValue.value > props.paperWallet.cashInr) {
    feedbackMsg.value = { type: 'error', text: 'Insufficient virtual cash balance for this buy order.' }
    return
  }

  if (tradeSide.value === 'SELL') {
    const existing = currentHolding.value?.qty || 0
    if (computedQty.value > existing) {
      feedbackMsg.value = { type: 'error', text: `You only hold ${existing.toFixed(4)} ${props.asset.baseAsset}.` }
      return
    }
  }

  emit('executeTrade', {
    symbol: props.asset.symbol,
    baseAsset: props.asset.baseAsset,
    side: tradeSide.value,
    qty: computedQty.value,
    priceInr: currentPriceInr.value
  })

  feedbackMsg.value = {
    type: 'success',
    text: `Simulated ${tradeSide.value} order filled for ${computedQty.value.toFixed(4)} ${props.asset.baseAsset}!`
  }

  setTimeout(() => {
    feedbackMsg.value = null
  }, 3500)
}

function setQuickPercent(pct: number) {
  if (tradeSide.value === 'BUY') {
    tradeMode.value = 'inr'
    amountInr.value = Math.round(props.paperWallet.cashInr * (pct / 100))
  } else if (currentHolding.value) {
    tradeMode.value = 'qty'
    amountQty.value = Number((currentHolding.value.qty * (pct / 100)).toFixed(4))
  }
}
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
        <div class="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
          <UIcon
            name="i-lucide-briefcase"
            class="w-6 h-6"
          />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-black text-slate-900">
              Paper Trading Simulator
            </h3>
            <span class="text-xs font-mono font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
              {{ asset.symbol }}
            </span>
            <span class="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
              Virtual Zero-Risk INR
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-0.5">
            Simulate real spot market order executions with automatic 1% TDS Indian tax deduction.
          </p>
        </div>
      </div>

      <!-- Account Balance Strip -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
          <div>
            <span class="text-[10px] text-slate-400 uppercase font-bold block mb-0.5">Virtual Cash Available</span>
            <span class="text-lg font-black text-slate-900 font-mono">{{ formatInr(paperWallet.cashInr) }}</span>
          </div>
          <button
            class="text-[11px] text-slate-400 hover:text-rose-600 underline cursor-pointer"
            title="Reset wallet to ₹ 10 Lakh"
            @click="emit('resetWallet')"
          >
            Reset Capital
          </button>
        </div>

        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
          <div>
            <span class="text-[10px] text-slate-400 uppercase font-bold block mb-0.5">{{ asset.baseAsset }} Current Holdings</span>
            <span class="text-lg font-black text-slate-900 font-mono">
              {{ currentHolding ? currentHolding.qty.toFixed(4) : '0.0000' }} {{ asset.baseAsset }}
            </span>
          </div>
          <div
            v-if="holdingPnl"
            class="text-right"
          >
            <span
              class="text-xs font-bold block"
              :class="holdingPnl.profitPct >= 0 ? 'text-emerald-600' : 'text-rose-600'"
            >
              {{ holdingPnl.profitPct >= 0 ? '+' : '' }}{{ holdingPnl.profitPct }}%
            </span>
            <span class="text-[10px] text-slate-400">
              {{ formatInr(holdingPnl.profitInr) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Side Switcher (BUY vs SELL) -->
      <div class="grid grid-cols-2 gap-2 mb-4 bg-slate-100 p-1 rounded-xl">
        <button
          class="py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          :class="tradeSide === 'BUY' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'"
          @click="tradeSide = 'BUY'"
        >
          <UIcon
            name="i-lucide-arrow-down-left"
            class="w-4 h-4"
          />
          Buy {{ asset.baseAsset }}
        </button>
        <button
          class="py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          :class="tradeSide === 'SELL' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'"
          @click="tradeSide = 'SELL'"
        >
          <UIcon
            name="i-lucide-arrow-up-right"
            class="w-4 h-4"
          />
          Sell {{ asset.baseAsset }}
        </button>
      </div>

      <!-- Inputs Container -->
      <div class="space-y-3 mb-5">
        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-slate-700">Execution Price (Live)</span>
          <span class="font-mono font-bold text-slate-900">{{ formatInr(currentPriceInr) }}</span>
        </div>

        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-slate-700">Order Input Mode</span>
          <div class="flex gap-1 text-[11px] font-semibold text-slate-500">
            <button
              class="px-2 py-0.5 rounded cursor-pointer"
              :class="tradeMode === 'inr' ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200'"
              @click="tradeMode = 'inr'"
            >
              Amount in ₹
            </button>
            <button
              class="px-2 py-0.5 rounded cursor-pointer"
              :class="tradeMode === 'qty' ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200'"
              @click="tradeMode = 'qty'"
            >
              Qty of Coins
            </button>
          </div>
        </div>

        <!-- Input Field -->
        <div v-if="tradeMode === 'inr'">
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
            <input
              v-model.number="amountInr"
              type="number"
              min="100"
              step="500"
              placeholder="Enter amount in ₹ (e.g. 50,000)"
              class="w-full pl-7 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
          </div>
        </div>
        <div v-else>
          <div class="relative">
            <input
              v-model.number="amountQty"
              type="number"
              min="0.0001"
              step="any"
              placeholder="Enter coin quantity (e.g. 0.25)"
              class="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
          </div>
        </div>

        <!-- Quick % Buttons -->
        <div class="flex items-center gap-2">
          <span class="text-[10px] text-slate-400 font-semibold uppercase">Quick Fill:</span>
          <button
            v-for="p in [25, 50, 75, 100]"
            :key="p"
            class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold cursor-pointer transition-colors"
            @click="setQuickPercent(p)"
          >
            {{ p }}%
          </button>
        </div>
      </div>

      <!-- Order Summary Card -->
      <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2 mb-5">
        <div class="flex justify-between text-slate-600">
          <span>Estimated Quantity:</span>
          <span class="font-mono font-bold text-slate-900">{{ computedQty.toFixed(4) }} {{ asset.baseAsset }}</span>
        </div>
        <div class="flex justify-between text-slate-600">
          <span>Gross Value:</span>
          <span class="font-mono">{{ formatInr(computedGrossValue) }}</span>
        </div>
        <div
          v-if="tradeSide === 'SELL'"
          class="flex justify-between text-amber-700"
        >
          <span>Sec 194S TDS (1% on sale):</span>
          <span class="font-mono font-bold">-{{ formatInr(estimatedTds) }}</span>
        </div>
        <div class="border-t border-slate-200 pt-2 flex justify-between font-extrabold text-slate-900">
          <span>{{ tradeSide === 'BUY' ? 'Total Cash Deducted:' : 'Net Cash Credited:' }}</span>
          <span
            class="font-mono text-sm"
            :class="tradeSide === 'BUY' ? 'text-emerald-700' : 'text-blue-700'"
          >
            {{ formatInr(computedNetTotal) }}
          </span>
        </div>
      </div>

      <!-- Feedback Alert -->
      <div
        v-if="feedbackMsg"
        class="p-2.5 rounded-lg text-xs font-semibold mb-4 transition-all"
        :class="feedbackMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'"
      >
        {{ feedbackMsg.text }}
      </div>

      <!-- Submit Order Button -->
      <div class="flex items-center justify-between gap-3">
        <button
          class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
          @click="emit('close')"
        >
          Close Drawer
        </button>

        <button
          class="flex-1 py-2.5 rounded-xl text-xs font-bold text-white shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
          :class="tradeSide === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'"
          @click="submitOrder"
        >
          <UIcon
            :name="tradeSide === 'BUY' ? 'i-lucide-check-circle' : 'i-lucide-arrow-up-right'"
            class="w-4 h-4"
          />
          Confirm Simulated {{ tradeSide }} of {{ asset.baseAsset }}
        </button>
      </div>
    </div>
  </div>
</template>
