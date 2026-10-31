<script setup lang="ts">
import type { CryptoAsset } from '../../composables/useCrypto'

defineProps<{
  tickers: CryptoAsset[]
  selectedAsset: CryptoAsset | null
  tickFlashes: Record<string, 'up' | 'down' | undefined>
  watchlist?: string[]
  formatInr: (val: number, options?: { compact?: boolean, decimals?: number }) => string
  formatUsd: (val: number, decimals?: number) => string
}>()

const emit = defineEmits<{
  (e: 'selectAsset' | 'openDetail' | 'openHistory' | 'openTrade' | 'openSignals' | 'openAlert', asset: CryptoAsset): void
  (e: 'openCalculator' | 'toggleWatchlist', symbol: string): void
}>()
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 mb-6">
    <div
      v-for="asset in tickers.slice(0, 60)"
      :key="asset.symbol"
      class="bg-white rounded-xl border border-slate-200/90 shadow-xs hover:shadow-md p-4 transition-all cursor-pointer flex flex-col justify-between group"
      :class="{
        'ring-2 ring-blue-500/80 border-blue-400': selectedAsset?.symbol === asset.symbol
      }"
      @click="emit('selectAsset', asset)"
    >
      <div>
        <!-- Card Header: Icon, Name & 24h Change -->
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="flex items-center gap-2">
            <!-- Star Toggle -->
            <button
              class="text-slate-300 hover:text-amber-400 p-0.5 cursor-pointer transition-colors"
              :class="{ 'text-amber-400': watchlist?.includes(asset.symbol) }"
              title="Toggle Watchlist"
              @click.stop="emit('toggleWatchlist', asset.symbol)"
            >
              <UIcon
                name="i-lucide-star"
                class="w-3.5 h-3.5"
                :class="{ 'fill-amber-400': watchlist?.includes(asset.symbol) }"
              />
            </button>
            <div class="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-800 text-xs shrink-0 group-hover:bg-blue-50 group-hover:text-blue-700 transition-colors">
              {{ asset.baseAsset.slice(0, 3) }}
            </div>
            <div>
              <div class="font-bold text-slate-900 text-sm leading-tight truncate max-w-[120px]">
                {{ asset.name }}
              </div>
              <div class="text-[10px] text-slate-400 font-mono">
                {{ asset.symbol }}
              </div>
            </div>
          </div>

          <span
            class="text-xs font-bold px-2 py-0.5 rounded-full"
            :class="asset.change24h >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'"
          >
            {{ asset.change24h >= 0 ? '+' : '' }}{{ asset.change24h }}%
          </span>
        </div>

        <!-- Live Price with Flash Animation -->
        <div class="my-2">
          <span
            class="text-lg font-black text-slate-900 tracking-tight transition-all duration-300 inline-block px-1 py-0.5 rounded"
            :class="{
              'bg-emerald-100 text-emerald-800': tickFlashes[asset.symbol] === 'up',
              'bg-rose-100 text-rose-800': tickFlashes[asset.symbol] === 'down'
            }"
          >
            {{ formatInr(asset.priceInr) }}
          </span>
          <div class="text-xs text-slate-400 font-mono mt-0.5">
            {{ formatUsd(asset.priceUsdt) }}
          </div>
        </div>
      </div>

      <!-- Card Footer Stats & Actions -->
      <div class="pt-3 border-t border-slate-100 text-xs mt-2">
        <div class="flex justify-between text-slate-500 mb-2 text-[11px]">
          <span>24h Vol:</span>
          <span class="font-semibold text-slate-700">{{ formatInr(asset.quoteVolumeInr, { compact: true }) }}</span>
        </div>

        <div class="flex items-center justify-between pt-1">
          <div class="flex items-center gap-1">
            <!-- 30D History -->
            <button
              class="p-1 rounded bg-slate-50 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-colors"
              title="30-Day Historical Data"
              @click.stop="emit('openHistory', asset)"
            >
              <UIcon
                name="i-lucide-calendar"
                class="w-3.5 h-3.5 text-indigo-500"
              />
            </button>

            <!-- Paper Trade -->
            <button
              class="p-1 rounded bg-slate-50 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 transition-colors"
              title="Simulated Paper Trade"
              @click.stop="emit('openTrade', asset)"
            >
              <UIcon
                name="i-lucide-briefcase"
                class="w-3.5 h-3.5 text-emerald-600"
              />
            </button>

            <!-- Signals -->
            <button
              class="p-1 rounded bg-slate-50 hover:bg-purple-50 text-slate-500 hover:text-purple-600 transition-colors"
              title="Technical Signals"
              @click.stop="emit('openSignals', asset)"
            >
              <UIcon
                name="i-lucide-activity"
                class="w-3.5 h-3.5 text-purple-500"
              />
            </button>
          </div>

          <div class="flex items-center gap-1">
            <!-- TDS Calculator -->
            <button
              class="p-1 rounded bg-slate-50 text-slate-500 hover:text-amber-700 hover:bg-amber-50 transition-colors"
              title="1% TDS Calculator"
              @click.stop="emit('openCalculator', asset.symbol)"
            >
              <UIcon
                name="i-lucide-calculator"
                class="w-3.5 h-3.5 text-amber-500"
              />
            </button>

            <!-- Depth -->
            <button
              class="p-1 rounded bg-slate-50 text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
              title="Order Depth"
              @click.stop="emit('openDetail', asset)"
            >
              <UIcon
                name="i-lucide-layers"
                class="w-3.5 h-3.5 text-blue-500"
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
