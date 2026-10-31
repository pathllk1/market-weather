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

defineEmits<{
  (e: 'selectAsset', asset: CryptoAsset): void
  (e: 'setRateMode', mode: 'domestic' | 'forex'): void
}>()
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 mb-6">
    <!-- Card 1: USDT / INR Live Rate -->
    <div class="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden group">
      <div class="absolute -right-3 -top-3 w-16 h-16 bg-blue-500/5 rounded-full pointer-events-none group-hover:scale-125 transition-transform" />
      <div>
        <div class="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
          <span class="flex items-center gap-1.5">
            <UIcon
              name="i-lucide-arrow-left-right"
              class="w-3.5 h-3.5 text-blue-600"
            />
            USDT / INR Live Rate
          </span>
          <span
            class="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
            :class="rateMode === 'domestic' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'"
          >
            {{ inrRates.spreadPercent > 0 ? `+${inrRates.spreadPercent}% Prem` : 'Par' }}
          </span>
        </div>
        <div class="text-xl font-bold tracking-tight text-slate-900 mt-1">
          ₹ {{ activeRate.toFixed(2) }}
        </div>
      </div>
      <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
        <span class="text-slate-500">Forex: ₹ {{ inrRates.forexRate.toFixed(2) }}</span>
        <button
          class="text-blue-600 hover:text-blue-800 font-medium hover:underline cursor-pointer"
          @click="$emit('setRateMode', rateMode === 'domestic' ? 'forex' : 'domestic')"
        >
          {{ rateMode === 'domestic' ? 'Switch to Forex' : 'Switch to Domestic' }}
        </button>
      </div>
    </div>

    <!-- Card 2: 24h Turnover in INR -->
    <div class="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden group">
      <div class="absolute -right-3 -top-3 w-16 h-16 bg-emerald-500/5 rounded-full pointer-events-none group-hover:scale-125 transition-transform" />
      <div>
        <div class="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
          <span class="flex items-center gap-1.5">
            <UIcon
              name="i-lucide-activity"
              class="w-3.5 h-3.5 text-emerald-600"
            />
            Indian 24h Volume
          </span>
          <span class="text-[10px] bg-emerald-50 text-emerald-700 font-semibold px-1.5 py-0.5 rounded-md">
            Live INR
          </span>
        </div>
        <div class="text-xl font-bold tracking-tight text-slate-900 mt-1">
          {{ formatInr(totalTurnoverInr, { compact: true }) }}
        </div>
      </div>
      <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span>Across 700+ liquid pairs</span>
        <span class="text-emerald-600 font-medium flex items-center gap-0.5">
          <UIcon
            name="i-lucide-zap"
            class="w-3 h-3"
          /> Binance Flow
        </span>
      </div>
    </div>

    <!-- Card 3: Market Sentiment & Breadth -->
    <div class="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden group">
      <div class="absolute -right-3 -top-3 w-16 h-16 bg-purple-500/5 rounded-full pointer-events-none group-hover:scale-125 transition-transform" />
      <div>
        <div class="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
          <span class="flex items-center gap-1.5">
            <UIcon
              name="i-lucide-gauge"
              class="w-3.5 h-3.5 text-purple-600"
            />
            Market Sentiment
          </span>
          <span
            class="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
            :class="marketSentiment.ratio >= 50 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'"
          >
            {{ marketSentiment.label }}
          </span>
        </div>
        <div class="text-xl font-bold tracking-tight text-slate-900 mt-1 flex items-baseline gap-1">
          <span>{{ marketSentiment.ratio }}%</span>
          <span class="text-xs font-normal text-slate-500">Bullish</span>
        </div>
      </div>
      <!-- Mini Breadth Bar -->
      <div class="mt-2.5 pt-2 border-t border-slate-100">
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
        <div class="flex justify-between text-[10px] text-slate-400 mt-1">
          <span class="text-emerald-600 font-medium">{{ marketSentiment.gainers }} Green</span>
          <span class="text-rose-600 font-medium">{{ marketSentiment.losers }} Red</span>
        </div>
      </div>
    </div>

    <!-- Card 4: Top 24h Gainer -->
    <div
      v-if="topGainer"
      class="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden group cursor-pointer"
      @click="$emit('selectAsset', topGainer)"
    >
      <div class="absolute -right-3 -top-3 w-16 h-16 bg-emerald-500/10 rounded-full pointer-events-none group-hover:scale-125 transition-transform" />
      <div>
        <div class="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
          <span class="flex items-center gap-1.5">
            <UIcon
              name="i-lucide-trending-up"
              class="w-3.5 h-3.5 text-emerald-600"
            />
            Top 24h Gainer
          </span>
          <span class="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-md">
            +{{ topGainer.change24h }}%
          </span>
        </div>
        <div class="text-lg font-bold tracking-tight text-slate-900 mt-1 truncate">
          {{ topGainer.name }}
        </div>
      </div>
      <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
        <span class="font-semibold text-emerald-600">{{ formatInr(topGainer.priceInr) }}</span>
        <span class="text-slate-400 font-mono text-[10px]">{{ topGainer.symbol }}</span>
      </div>
    </div>
    <div
      v-else
      class="p-3.5 rounded-xl bg-white border border-slate-200/90 animate-pulse"
    />

    <!-- Card 5: Top 24h Dip / Loser -->
    <div
      v-if="topLoser"
      class="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden group cursor-pointer"
      @click="$emit('selectAsset', topLoser)"
    >
      <div class="absolute -right-3 -top-3 w-16 h-16 bg-rose-500/10 rounded-full pointer-events-none group-hover:scale-125 transition-transform" />
      <div>
        <div class="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
          <span class="flex items-center gap-1.5">
            <UIcon
              name="i-lucide-trending-down"
              class="w-3.5 h-3.5 text-rose-600"
            />
            Top 24h Dip
          </span>
          <span class="text-[10px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 rounded-md">
            {{ topLoser.change24h }}%
          </span>
        </div>
        <div class="text-lg font-bold tracking-tight text-slate-900 mt-1 truncate">
          {{ topLoser.name }}
        </div>
      </div>
      <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
        <span class="font-semibold text-rose-600">{{ formatInr(topLoser.priceInr) }}</span>
        <span class="text-slate-400 font-mono text-[10px]">{{ topLoser.symbol }}</span>
      </div>
    </div>
    <div
      v-else
      class="p-3.5 rounded-xl bg-white border border-slate-200/90 animate-pulse"
    />

    <!-- Card 6: Stream & Engine Health -->
    <div class="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden group">
      <div class="absolute -right-3 -top-3 w-16 h-16 bg-blue-500/5 rounded-full pointer-events-none group-hover:scale-125 transition-transform" />
      <div>
        <div class="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
          <span class="flex items-center gap-1.5">
            <UIcon
              name="i-lucide-radio"
              class="w-3.5 h-3.5 text-blue-600"
            />
            Stream Engine
          </span>
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
        <div class="text-sm font-semibold tracking-tight text-slate-800 mt-2">
          Live Market Stream
        </div>
      </div>
      <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
        <span>Sub-Second Ticks</span>
        <ClientOnly>
          <span class="font-mono">{{ lastTickTime.toLocaleTimeString('en-IN', { hour12: false }) }}</span>
          <template #fallback>
            <span class="font-mono text-slate-300">--:--:--</span>
          </template>
        </ClientOnly>
      </div>
    </div>
  </div>
</template>
