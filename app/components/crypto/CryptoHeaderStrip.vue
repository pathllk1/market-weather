<script setup lang="ts">
import type { CryptoAsset, InrRateData } from '../../composables/useCrypto'

defineProps<{
  inrRates: InrRateData
  rateMode: 'domestic' | 'forex'
  activeRate: number
  totalTurnoverInr: number
  topGainer: CryptoAsset | null
  topLoser: CryptoAsset | null
  marketSentiment: { gainers: number, losers: number, ratio: number, label: string }
  connectionStatus: 'connected' | 'connecting' | 'polling' | 'offline'
  lastTickTime: Date
  formatInr: (val: number, options?: { compact?: boolean, decimals?: number }) => string
}>()

const emit = defineEmits<{
  (e: 'selectAsset', asset: CryptoAsset): void
  (e: 'setRateMode', mode: 'domestic' | 'forex'): void
}>()
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-4">
    <!-- TILE 1: Indian Rupee Currency Spread Engine -->
    <div class="p-4 rounded-xl bg-white border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between relative overflow-hidden group">
      <div class="absolute -right-4 -top-4 w-20 h-20 bg-blue-500/5 rounded-full pointer-events-none group-hover:scale-125 transition-transform" />
      <div>
        <div class="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
          <span class="flex items-center gap-1.5 font-semibold text-slate-700">
            <UIcon
              name="i-lucide-arrow-left-right"
              class="w-4 h-4 text-blue-600"
            />
            USDT / INR Live Rate
          </span>
          <span
            class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full"
            :class="rateMode === 'domestic' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-700'"
          >
            {{ inrRates.spreadPercent > 0 ? `+${inrRates.spreadPercent}% Domestic Prem` : 'Par Spot' }}
          </span>
        </div>

        <div class="flex items-baseline gap-2 mt-1">
          <span class="text-2xl font-black tracking-tight text-slate-900 font-mono tabular-nums">
            ₹ {{ activeRate.toFixed(2) }}
          </span>
          <span class="text-xs text-slate-400 font-medium">
            ({{ rateMode === 'domestic' ? 'Domestic P2P' : 'Forex Official' }})
          </span>
        </div>
      </div>

      <div class="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
        <div class="flex items-center gap-1.5 text-slate-500 font-mono text-[11px]">
          <span>Forex: ₹ {{ inrRates.forexRate.toFixed(2) }}</span>
          <span class="text-slate-300">·</span>
          <span class="text-amber-600 font-semibold">+₹ {{ (inrRates.domesticRate - inrRates.forexRate).toFixed(2) }} spread</span>
        </div>
        <button
          class="text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer flex items-center gap-1 text-[11px]"
          @click="emit('setRateMode', rateMode === 'domestic' ? 'forex' : 'domestic')"
        >
          <UIcon
            name="i-lucide-repeat"
            class="w-3 h-3"
          />
          <span>{{ rateMode === 'domestic' ? 'Switch to Forex' : 'Switch to Domestic' }}</span>
        </button>
      </div>
    </div>

    <!-- TILE 2: Market Turnover & Sentiment Breadth -->
    <div class="p-4 rounded-xl bg-white border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between relative overflow-hidden group">
      <div class="absolute -right-4 -top-4 w-20 h-20 bg-emerald-500/5 rounded-full pointer-events-none group-hover:scale-125 transition-transform" />
      <div>
        <div class="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
          <span class="flex items-center gap-1.5 font-semibold text-slate-700">
            <UIcon
              name="i-lucide-bar-chart-2"
              class="w-4 h-4 text-emerald-600"
            />
            Indian 24h Turnover
          </span>
          <span
            class="text-[10px] font-bold px-2 py-0.5 rounded-full"
            :class="marketSentiment.ratio >= 50 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'"
          >
            {{ marketSentiment.ratio }}% {{ marketSentiment.label }}
          </span>
        </div>

        <div class="flex items-baseline gap-2 mt-1">
          <span class="text-2xl font-black tracking-tight text-slate-900 font-mono tabular-nums">
            {{ formatInr(totalTurnoverInr, { compact: true }) }}
          </span>
          <span class="text-xs text-emerald-600 font-semibold flex items-center gap-0.5">
            <UIcon
              name="i-lucide-zap"
              class="w-3 h-3"
            /> Binance Live
          </span>
        </div>
      </div>

      <!-- Sentiment Breadth Track -->
      <div class="mt-3 pt-2.5 border-t border-slate-100">
        <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden flex">
          <div
            class="bg-emerald-500 h-full transition-all duration-500"
            :style="{ width: `${marketSentiment.ratio}%` }"
          />
          <div
            class="bg-rose-500 h-full transition-all duration-500"
            :style="{ width: `${100 - marketSentiment.ratio}%` }"
          />
        </div>
        <div class="flex justify-between text-[11px] font-mono tabular-nums mt-1 text-slate-400">
          <span class="text-emerald-600 font-semibold">{{ marketSentiment.gainers }} Advancing (Green)</span>
          <span class="text-rose-600 font-semibold">{{ marketSentiment.losers }} Declining (Red)</span>
        </div>
      </div>
    </div>

    <!-- TILE 3: Volatility Leaders & Real-Time Engine -->
    <div class="p-4 rounded-xl bg-white border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between relative overflow-hidden group">
      <div class="absolute -right-4 -top-4 w-20 h-20 bg-purple-500/5 rounded-full pointer-events-none group-hover:scale-125 transition-transform" />
      <div>
        <div class="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
          <span class="flex items-center gap-1.5 font-semibold text-slate-700">
            <UIcon
              name="i-lucide-flame"
              class="w-4 h-4 text-purple-600"
            />
            24h Volatility Extremes
          </span>

          <!-- Stream Health Indicator Badge -->
          <span
            class="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
            :class="{
              'bg-emerald-100 text-emerald-800': connectionStatus === 'connected',
              'bg-amber-100 text-amber-800': connectionStatus === 'polling',
              'bg-blue-100 text-blue-800': connectionStatus === 'connecting',
              'bg-rose-100 text-rose-800': connectionStatus === 'offline'
            }"
          >
            <span
              class="w-1.5 h-1.5 rounded-full"
              :class="{
                'bg-emerald-500 animate-pulse': connectionStatus === 'connected',
                'bg-amber-500': connectionStatus === 'polling',
                'bg-blue-500 animate-spin': connectionStatus === 'connecting',
                'bg-rose-500': connectionStatus === 'offline'
              }"
            />
            {{ connectionStatus === 'connected' ? 'WebSocket Live' : connectionStatus === 'polling' ? 'Smart Polling' : connectionStatus }}
          </span>
        </div>

        <!-- Split Cards: Top Gainer & Top Dip -->
        <div class="grid grid-cols-2 gap-2 mt-2">
          <!-- Gainer -->
          <div
            v-if="topGainer"
            class="p-2 rounded-lg bg-emerald-50/60 border border-emerald-100 hover:bg-emerald-100/60 transition-colors cursor-pointer group/gainer"
            title="Click to view chart"
            @click="emit('selectAsset', topGainer)"
          >
            <div class="flex items-center justify-between text-[11px]">
              <span class="font-bold text-slate-900 group-hover/gainer:text-emerald-700 truncate max-w-[70px]">{{ topGainer.baseAsset }}</span>
              <span class="font-mono tabular-nums text-emerald-700 font-bold text-[10px] bg-emerald-100/80 px-1 py-0.2 rounded">+{{ topGainer.change24h }}%</span>
            </div>
            <div class="text-[11px] font-mono tabular-nums font-bold text-emerald-800 mt-1">
              {{ formatInr(topGainer.priceInr) }}
            </div>
          </div>
          <div
            v-else
            class="p-2 rounded-lg bg-slate-50 animate-pulse h-12"
          />

          <!-- Dip -->
          <div
            v-if="topLoser"
            class="p-2 rounded-lg bg-rose-50/60 border border-rose-100 hover:bg-rose-100/60 transition-colors cursor-pointer group/dip"
            title="Click to view chart"
            @click="emit('selectAsset', topLoser)"
          >
            <div class="flex items-center justify-between text-[11px]">
              <span class="font-bold text-slate-900 group-hover/dip:text-rose-700 truncate max-w-[70px]">{{ topLoser.baseAsset }}</span>
              <span class="font-mono tabular-nums text-rose-700 font-bold text-[10px] bg-rose-100/80 px-1 py-0.2 rounded">{{ topLoser.change24h }}%</span>
            </div>
            <div class="text-[11px] font-mono tabular-nums font-bold text-rose-800 mt-1">
              {{ formatInr(topLoser.priceInr) }}
            </div>
          </div>
          <div
            v-else
            class="p-2 rounded-lg bg-slate-50 animate-pulse h-12"
          />
        </div>
      </div>

      <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-mono">
        <span>Binance Vision Feed</span>
        <ClientOnly>
          <span class="text-slate-500 font-semibold">{{ lastTickTime.toLocaleTimeString('en-IN', { hour12: false }) }}</span>
          <template #fallback>
            <span>--:--:--</span>
          </template>
        </ClientOnly>
      </div>
    </div>
  </div>
</template>
