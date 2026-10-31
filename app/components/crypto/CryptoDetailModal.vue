<script setup lang="ts">
import { ref, watch } from 'vue'
import type { CryptoAsset } from '../../composables/useCrypto'

const props = defineProps<{
  isOpen: boolean
  asset: CryptoAsset | null
  activeRate: number
  formatInr: (val: number, options?: { compact?: boolean, decimals?: number }) => string
  formatUsd: (val: number, decimals?: number) => string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'openCalculator', symbol: string): void
}>()

interface DepthLevel {
  priceUsdt: number
  priceInr: number
  qty: number
  totalInr: number
}

const bids = ref<DepthLevel[]>([])
const asks = ref<DepthLevel[]>([])
const isLoadingDepth = ref(false)

async function loadDepth() {
  if (!props.asset) return
  isLoadingDepth.value = true

  try {
    const res = await $fetch<{
      success: boolean
      bids: DepthLevel[]
      asks: DepthLevel[]
    }>(`/api/crypto/depth?symbol=${props.asset.symbol}&limit=6`)

    if (res?.success) {
      bids.value = res.bids || []
      asks.value = res.asks || []
    }
  } catch (err) {
    console.error('Failed to load depth:', err)
  } finally {
    isLoadingDepth.value = false
  }
}

watch(
  () => [props.isOpen, props.asset?.symbol],
  ([open]) => {
    if (open) {
      loadDepth()
    }
  }
)
</script>

<template>
  <div
    v-if="isOpen && asset"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
  >
    <div
      class="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 relative overflow-hidden animate-in fade-in zoom-in-95 duration-150"
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
      <div class="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center font-bold text-blue-700 text-sm">
            {{ asset.baseAsset.slice(0, 3) }}
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-lg font-bold text-slate-900">
                {{ asset.name }}
              </h3>
              <span class="text-xs font-mono font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                {{ asset.symbol }}
              </span>
            </div>
            <div class="flex items-baseline gap-2 mt-0.5">
              <span class="text-xl font-extrabold text-slate-900">
                {{ formatInr(asset.priceInr) }}
              </span>
              <span
                class="text-xs font-bold px-2 py-0.5 rounded-full"
                :class="asset.change24h >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'"
              >
                {{ asset.change24h >= 0 ? '+' : '' }}{{ asset.change24h }}%
              </span>
            </div>
          </div>
        </div>

        <button
          class="mr-8 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
          @click="emit('openCalculator', asset.symbol)"
        >
          <UIcon
            name="i-lucide-calculator"
            class="w-3.5 h-3.5"
          />
          <span>TDS Calculator</span>
        </button>
      </div>

      <!-- Key 24h Metric Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 text-xs">
        <div class="p-3 rounded-lg bg-slate-50 border border-slate-100">
          <span class="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">24h High (₹)</span>
          <span class="font-bold text-slate-900">{{ formatInr(asset.high24hInr) }}</span>
        </div>
        <div class="p-3 rounded-lg bg-slate-50 border border-slate-100">
          <span class="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">24h Low (₹)</span>
          <span class="font-bold text-slate-900">{{ formatInr(asset.low24hInr) }}</span>
        </div>
        <div class="p-3 rounded-lg bg-slate-50 border border-slate-100">
          <span class="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">24h Volume (₹)</span>
          <span class="font-bold text-slate-900">{{ formatInr(asset.quoteVolumeInr, { compact: true }) }}</span>
        </div>
        <div class="p-3 rounded-lg bg-slate-50 border border-slate-100">
          <span class="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">Global USDT Price</span>
          <span class="font-bold text-slate-900 font-mono">{{ formatUsd(asset.priceUsdt) }}</span>
        </div>
      </div>

      <!-- Real-Time Micro Order Book Depth (INR) -->
      <div class="mb-5">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <UIcon
              name="i-lucide-layers"
              class="w-3.5 h-3.5 text-blue-600"
            />
            Live Order Book Depth (₹ INR)
          </h4>
          <span class="text-[10px] text-slate-400">Direct Binance Book</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- Bids (Buy Orders) -->
          <div class="bg-emerald-50/40 border border-emerald-100 rounded-xl p-3">
            <div class="flex justify-between text-[10px] font-bold text-emerald-800 uppercase border-b border-emerald-100 pb-1 mb-2">
              <span>Bid Price (₹)</span>
              <span>Quantity</span>
              <span>Total (₹)</span>
            </div>
            <div
              v-if="isLoadingDepth"
              class="py-4 text-center text-xs text-slate-400"
            >
              Loading bids...
            </div>
            <div
              v-else
              class="space-y-1.5 text-xs font-mono"
            >
              <div
                v-for="(bid, i) in bids"
                :key="i"
                class="flex justify-between text-[11px]"
              >
                <span class="text-emerald-700 font-bold">{{ formatInr(bid.priceInr) }}</span>
                <span class="text-slate-600">{{ bid.qty.toFixed(3) }}</span>
                <span class="text-slate-400">{{ formatInr(bid.totalInr, { compact: true }) }}</span>
              </div>
            </div>
          </div>

          <!-- Asks (Sell Orders) -->
          <div class="bg-rose-50/40 border border-rose-100 rounded-xl p-3">
            <div class="flex justify-between text-[10px] font-bold text-rose-800 uppercase border-b border-rose-100 pb-1 mb-2">
              <span>Ask Price (₹)</span>
              <span>Quantity</span>
              <span>Total (₹)</span>
            </div>
            <div
              v-if="isLoadingDepth"
              class="py-4 text-center text-xs text-slate-400"
            >
              Loading asks...
            </div>
            <div
              v-else
              class="space-y-1.5 text-xs font-mono"
            >
              <div
                v-for="(ask, i) in asks"
                :key="i"
                class="flex justify-between text-[11px]"
              >
                <span class="text-rose-700 font-bold">{{ formatInr(ask.priceInr) }}</span>
                <span class="text-slate-600">{{ ask.qty.toFixed(3) }}</span>
                <span class="text-slate-400">{{ formatInr(ask.totalInr, { compact: true }) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="flex justify-end pt-2 border-t border-slate-100">
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
