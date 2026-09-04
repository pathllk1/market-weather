<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { LiveIndexData, LiveMoverItem, LiveIndicesApiResponse } from '~~/server/api/market/live-indices.get'

const emit = defineEmits<{
  (e: 'inspect', symbol: string): void
  (e: 'openScreener'): void
}>()

// Active chart symbol (strictly benchmark indices)
const activeSymbol = ref('^NSEI')
const activeTitle = ref('NIFTY 50')

// Indices data & movers from live Yahoo Finance feed (0 database involvement)
const indices = ref<LiveIndexData[]>([])
const topGainers = ref<LiveMoverItem[]>([])
const topLosers = ref<LiveMoverItem[]>([])
const isLoading = ref(true)

// Determine if market is currently open (Mon-Fri 09:15 to 15:30 IST)
const marketStatus = computed(() => {
  const now = new Date()
  // Convert to IST (UTC+5:30)
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const istTime = new Date(utc + 3600000 * 5.5)
  const day = istTime.getDay()
  const hours = istTime.getHours()
  const minutes = istTime.getMinutes()
  const totalMin = hours * 60 + minutes

  const isWeekday = day >= 1 && day <= 5
  const isOpen = isWeekday && totalMin >= 9 * 60 + 15 && totalMin <= 15 * 60 + 30

  return {
    isOpen,
    label: isOpen ? 'Market Live' : 'Market Closed',
    subLabel: isOpen ? 'Live Feed' : 'Last Close',
    istFormatted: istTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST'
  }
})

async function fetchLiveData() {
  try {
    const res = await $fetch<LiveIndicesApiResponse>('/api/market/live-indices')
    indices.value = res.indices || []
    if (res.movers) {
      topGainers.value = res.movers.gainers || []
      topLosers.value = res.movers.losers || []
    }
  } catch (err) {
    console.error('[LiveMarketPulseTab] Failed to load live data:', err)
  } finally {
    isLoading.value = false
  }
}

function selectIndex(sym: string, title: string) {
  activeSymbol.value = sym
  activeTitle.value = title
}

// Background sync loop (every 15s)
let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  fetchLiveData()
  pollTimer = setInterval(fetchLiveData, 15_000)
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <div class="space-y-3 w-full">
    <!-- 1. COMPACT ULTRA LOW-PROFILE BENCHMARK TILES -->
    <div class="space-y-1.5">
      <!-- Title & Status Header -->
      <div class="flex items-center justify-between px-0.5">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-activity" class="h-3.5 w-3.5 text-primary" />
          <h2 class="text-[11px] font-black uppercase tracking-wider text-neutral-900 dark:text-white">
            Indian Benchmark Indices
          </h2>
          <span class="text-[10px] text-neutral-400 font-mono hidden sm:inline-block">
            • {{ marketStatus.subLabel }} ({{ marketStatus.istFormatted }})
          </span>
        </div>

        <div class="flex items-center gap-1.5">
          <span
            class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold font-mono"
            :class="marketStatus.isOpen ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-neutral-200/60 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'"
          >
            <span
              class="h-1.5 w-1.5 rounded-full"
              :class="marketStatus.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'"
            />
            {{ marketStatus.label }}
          </span>
        </div>
      </div>

      <!-- 5 Slim Horizontal Tiles (Minimal Vertical Height) -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <!-- Skeleton while loading -->
        <template v-if="isLoading && indices.length === 0">
          <div
            v-for="i in 5"
            :key="i"
            class="h-14 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100/50 dark:bg-neutral-800/40 animate-pulse"
          />
        </template>

        <!-- Dynamic Compact Tiles -->
        <template v-else>
          <div
            v-for="idx in indices"
            :key="idx.symbol"
            class="relative cursor-pointer rounded-xl border px-3 py-1.5 transition-all select-none hover:shadow-xs"
            :class="[
              activeSymbol === idx.symbol
                ? 'border-primary bg-primary/5 dark:bg-primary/10 shadow-2xs ring-1 ring-primary'
                : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700'
            ]"
            @click="selectIndex(idx.symbol, idx.name)"
          >
            <!-- Line 1: Name + Active Marker -->
            <div class="flex items-center justify-between gap-1">
              <span class="text-[11px] font-black text-neutral-900 dark:text-white truncate">
                {{ idx.shortName || idx.name }}
              </span>
              <span
                v-if="activeSymbol === idx.symbol"
                class="rounded bg-primary text-white text-[8px] font-extrabold px-1 py-0.2 uppercase tracking-tight"
              >
                ACTIVE
              </span>
            </div>

            <!-- Line 2: Price & Day Change -->
            <div class="flex items-baseline justify-between gap-2 mt-0.5 font-mono">
              <span class="text-xs sm:text-sm font-black text-neutral-900 dark:text-white truncate">
                {{ idx.price.toLocaleString('en-IN', { minimumFractionDigits: 2 }) }}
              </span>
              <span
                class="text-[10px] font-bold shrink-0"
                :class="idx.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
              >
                {{ idx.change >= 0 ? '+' : '' }}{{ idx.change }} ({{ idx.change >= 0 ? '+' : '' }}{{ idx.changePercent }}%)
              </span>
            </div>

            <!-- Line 3: Day Range Mini Subtext OR VIX Regime -->
            <div
              v-if="idx.symbol === '^INDIAVIX'"
              class="text-[9px] font-mono flex items-center justify-between mt-0.5 pt-0.5 border-t border-neutral-100 dark:border-neutral-800/60 font-bold"
            >
              <span
                :class="idx.price < 13 ? 'text-emerald-600 dark:text-emerald-400' : idx.price <= 18 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'"
              >
                {{ idx.price < 13 ? '● Low Risk / Stable' : idx.price <= 18 ? '● Normal Vol' : '● Risk-Off' }}
              </span>
              <span class="text-neutral-400 font-normal">L: {{ idx.dayLow }} H: {{ idx.dayHigh }}</span>
            </div>
            <div
              v-else
              class="text-[9px] font-mono text-neutral-400 flex items-center justify-between mt-0.5 pt-0.5 border-t border-neutral-100 dark:border-neutral-800/60"
            >
              <span>L: {{ idx.dayLow.toLocaleString('en-IN') }}</span>
              <span>H: {{ idx.dayHigh.toLocaleString('en-IN') }}</span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- 2. EXPANDED LIVE INTRADAY LINE CHART (MAXIMUM VERTICAL SPACE) -->
    <MarketLiveIntradayChart
      :symbol="activeSymbol"
      :title="activeTitle"
      initial-range="1d"
    />

    <!-- 3. TOP GAINERS & LOSERS (100% LIVE YAHOO FEED • 0 DATABASE INVOLVEMENT) -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
      <!-- Top Gainers -->
      <div class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 space-y-2 shadow-xs">
        <div class="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-1.5">
          <h3 class="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <UIcon name="i-lucide-trending-up" class="h-3.5 w-3.5" />
            <span>Top Movers • Gainers (Live)</span>
          </h3>
          <span class="text-[10px] text-neutral-400 font-mono">
            NSE Live Feed
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-5 gap-1.5">
          <div
            v-for="stk in topGainers"
            :key="stk.symbol"
            class="group cursor-pointer flex sm:flex-col items-center sm:items-start justify-between p-2 rounded-lg bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/15 hover:border-emerald-500/40 hover:bg-emerald-500/15 transition-all select-none"
            :title="`Click to inspect ${stk.name} details & radar`"
            @click="emit('inspect', stk.symbol)"
          >
            <div class="min-w-0">
              <div class="font-black text-xs text-neutral-900 dark:text-white truncate group-hover:text-primary transition-colors flex items-center gap-1">
                <span>{{ stk.symbol }}</span>
                <UIcon name="i-lucide-external-link" class="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
              </div>
              <div class="text-[9px] text-neutral-400 truncate max-w-[100px] hidden sm:block">
                {{ stk.name }}
              </div>
            </div>

            <div class="text-right sm:text-left font-mono sm:mt-1">
              <div class="text-xs font-bold text-neutral-900 dark:text-white">
                ₹{{ stk.price.toLocaleString('en-IN') }}
              </div>
              <div class="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400">
                +{{ stk.changePercent }}%
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Top Losers -->
      <div class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 space-y-2 shadow-xs">
        <div class="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-1.5">
          <h3 class="text-xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
            <UIcon name="i-lucide-trending-down" class="h-3.5 w-3.5" />
            <span>Top Movers • Losers (Live)</span>
          </h3>
          <span class="text-[10px] text-neutral-400 font-mono">
            NSE Live Feed
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-5 gap-1.5">
          <div
            v-for="stk in topLosers"
            :key="stk.symbol"
            class="group cursor-pointer flex sm:flex-col items-center sm:items-start justify-between p-2 rounded-lg bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/15 hover:border-rose-500/40 hover:bg-rose-500/15 transition-all select-none"
            :title="`Click to inspect ${stk.name} details & radar`"
            @click="emit('inspect', stk.symbol)"
          >
            <div class="min-w-0">
              <div class="font-black text-xs text-neutral-900 dark:text-white truncate group-hover:text-primary transition-colors flex items-center gap-1">
                <span>{{ stk.symbol }}</span>
                <UIcon name="i-lucide-external-link" class="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
              </div>
              <div class="text-[9px] text-neutral-400 truncate max-w-[100px] hidden sm:block">
                {{ stk.name }}
              </div>
            </div>

            <div class="text-right sm:text-left font-mono sm:mt-1">
              <div class="text-xs font-bold text-neutral-900 dark:text-white">
                ₹{{ stk.price.toLocaleString('en-IN') }}
              </div>
              <div class="text-[10px] font-extrabold text-rose-600 dark:text-rose-400">
                {{ stk.changePercent }}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 4. SECTOR ROTATION & TOP 5 EQUITIES (8 KEY NSE SECTORS • 0 DATABASE INVOLVEMENT) -->
    <MarketSectorRotationGrid @inspect="(sym) => emit('inspect', sym)" />
  </div>
</template>
