<script setup lang="ts">
import { ref } from 'vue'
import type { CryptoAsset } from '../../composables/useCrypto'

defineProps<{
  asset: CryptoAsset | null
  tickFlashes: Record<string, 'up' | 'down' | undefined>
  isStarred: boolean
  formatInr: (val: number, options?: { compact?: boolean, decimals?: number }) => string
  formatUsd: (val: number, decimals?: number) => string
}>()

const emit = defineEmits<{
  (e: 'openHistory' | 'openTrade' | 'openSignals' | 'openArbitrage' | 'openAlert' | 'openDetail', asset: CryptoAsset): void
  (e: 'openCalculator' | 'toggleWatchlist', symbol: string): void
  (e: 'scrollToChart'): void
}>()

const isMinimized = ref(false)
</script>

<template>
  <div>
    <!-- Collapsed Minimized Pill Trigger -->
    <div
      v-if="asset && isMinimized"
      class="fixed bottom-4 right-4 sm:right-6 z-40 bg-slate-950/95 backdrop-blur-xl border border-slate-700/80 rounded-full shadow-2xl px-3.5 py-2 flex items-center gap-2.5 cursor-pointer hover:border-blue-500/60 hover:bg-slate-900 transition-all text-white group"
      @click="isMinimized = false"
    >
      <div class="w-6 h-6 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center font-bold text-blue-400 text-[10px]">
        {{ asset.baseAsset.slice(0, 3) }}
      </div>
      <div class="flex items-center gap-1.5">
        <span class="font-bold text-xs">{{ asset.name }}</span>
        <span class="font-mono tabular-nums text-xs font-bold text-slate-200">{{ formatInr(asset.priceInr) }}</span>
      </div>
      <span
        class="text-[10px] font-mono tabular-nums font-bold px-1.5 py-0.2 rounded"
        :class="asset.change24h >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'"
      >
        {{ asset.change24h >= 0 ? '+' : '' }}{{ asset.change24h }}%
      </span>
      <button
        class="p-0.5 rounded-full text-slate-400 group-hover:text-white transition-colors"
        title="Expand Trading Dock"
      >
        <UIcon
          name="i-lucide-chevron-up"
          class="w-4 h-4 text-blue-400"
        />
      </button>
    </div>

    <!-- Expanded Full Dock -->
    <Transition
      enter-active-class="transform transition ease-out duration-300"
      enter-from-class="translate-y-full opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transform transition ease-in duration-200"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-full opacity-0"
    >
      <div
        v-if="asset && !isMinimized"
        class="fixed bottom-3 left-3 right-3 sm:left-6 sm:right-6 z-40 bg-slate-950/95 backdrop-blur-xl text-white border border-slate-700/80 rounded-2xl shadow-2xl p-2.5 sm:p-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <!-- Left: Selected Asset & Live Price -->
          <div class="flex items-center gap-3">
            <!-- Star Watchlist Toggle -->
            <button
              class="p-1.5 rounded-lg transition-colors cursor-pointer"
              :class="isStarred ? 'text-amber-400 bg-amber-400/10' : 'text-slate-400 hover:text-white hover:bg-slate-800'"
              :title="isStarred ? 'Remove from Watchlist' : 'Add to Watchlist'"
              @click="emit('toggleWatchlist', asset.symbol)"
            >
              <UIcon
                :name="isStarred ? 'i-lucide-star' : 'i-lucide-star'"
                class="w-4 h-4"
                :class="{ 'fill-amber-400': isStarred }"
              />
            </button>

            <!-- Avatar / Token Tag -->
            <div class="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-500/40 flex items-center justify-center font-bold text-blue-400 text-xs shrink-0">
              {{ asset.baseAsset.slice(0, 3) }}
            </div>

            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-sm text-white">{{ asset.name }}</span>
                <span class="text-[10px] font-mono text-slate-400 bg-slate-800 px-1 rounded">{{ asset.symbol }}</span>
              </div>
              <div class="flex items-center gap-2 mt-0.5">
                <span
                  class="font-black text-sm tracking-tight font-mono tabular-nums transition-all duration-300 rounded px-1"
                  :class="{
                    'bg-emerald-500/30 text-emerald-300': tickFlashes[asset.symbol] === 'up',
                    'bg-rose-500/30 text-rose-300': tickFlashes[asset.symbol] === 'down'
                  }"
                >
                  {{ formatInr(asset.priceInr) }}
                </span>
                <span
                  class="text-[10px] font-mono tabular-nums font-bold px-1.5 py-0.2 rounded"
                  :class="asset.change24h >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'"
                >
                  {{ asset.change24h >= 0 ? '+' : '' }}{{ asset.change24h }}%
                </span>
              </div>
            </div>
          </div>

          <!-- Right: Action Modals Launcher Cluster -->
          <div class="flex items-center gap-1.5 flex-wrap">
            <!-- 1. 1-Month History Modal Button -->
            <button
              class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40 transition-all cursor-pointer"
              title="30-Day Historical OHLCV & Return"
              @click="emit('openHistory', asset)"
            >
              <UIcon
                name="i-lucide-calendar"
                class="w-3.5 h-3.5"
              />
              <span>30D History</span>
            </button>

            <!-- 2. Paper Trade Simulation Modal Button -->
            <button
              class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/30 hover:bg-emerald-600 text-emerald-200 hover:text-white border border-emerald-500/40 transition-all cursor-pointer"
              title="Simulated Virtual Execution in INR"
              @click="emit('openTrade', asset)"
            >
              <UIcon
                name="i-lucide-briefcase"
                class="w-3.5 h-3.5"
              />
              <span>Paper Trade</span>
            </button>

            <!-- 3. Technical Signals Modal Button -->
            <button
              class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white border border-purple-500/40 transition-all cursor-pointer"
              title="RSI, MACD & Pivot Points"
              @click="emit('openSignals', asset)"
            >
              <UIcon
                name="i-lucide-activity"
                class="w-3.5 h-3.5"
              />
              <span>Signals</span>
            </button>

            <!-- 4. Arbitrage Modal Button -->
            <button
              class="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600/30 hover:bg-blue-600 text-blue-200 hover:text-white border border-blue-500/40 transition-all cursor-pointer"
              title="Binance Global vs CoinDCX Spread"
              @click="emit('openArbitrage', asset)"
            >
              <UIcon
                name="i-lucide-arrow-left-right"
                class="w-3.5 h-3.5"
              />
              <span>Arbitrage</span>
            </button>

            <!-- 5. Alert Trigger Modal Button -->
            <button
              class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600/30 hover:bg-amber-600 text-amber-200 hover:text-white border border-amber-500/40 transition-all cursor-pointer"
              title="Price & Volatility Alert"
              @click="emit('openAlert', asset)"
            >
              <UIcon
                name="i-lucide-bell"
                class="w-3.5 h-3.5"
              />
              <span>Alert</span>
            </button>

            <!-- 6. 1% TDS Calculator Button -->
            <button
              class="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-orange-600/30 hover:bg-orange-600 text-orange-200 hover:text-white border border-orange-500/40 transition-all cursor-pointer"
              title="Indian Tax & 1% TDS Calculator"
              @click="emit('openCalculator', asset.symbol)"
            >
              <UIcon
                name="i-lucide-calculator"
                class="w-3.5 h-3.5"
              />
              <span>TDS</span>
            </button>

            <!-- 7. Order Depth Button -->
            <button
              class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Order Book Depth"
              @click="emit('openDetail', asset)"
            >
              <UIcon
                name="i-lucide-layers"
                class="w-4 h-4"
              />
            </button>

            <!-- Scroll Up to Chart -->
            <button
              class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Scroll to Chart"
              @click="emit('scrollToChart')"
            >
              <UIcon
                name="i-lucide-arrow-up"
                class="w-4 h-4"
              />
            </button>

            <!-- Minimize Dock Button -->
            <button
              class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer border-l border-slate-700 ml-1"
              title="Minimize Dock"
              @click="isMinimized = true"
            >
              <UIcon
                name="i-lucide-chevron-down"
                class="w-4 h-4"
              />
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
