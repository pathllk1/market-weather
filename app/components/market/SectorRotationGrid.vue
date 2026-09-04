<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { SectorMoversItem, SectorMoversApiResponse, MarketBreadthData } from '~~/server/api/market/sector-movers.get'

const emit = defineEmits<{
  (e: 'inspect', symbol: string): void
}>()

const sectors = ref<SectorMoversItem[]>([])
const breadth = ref<MarketBreadthData | null>(null)
const isLoading = ref(true)
const sortBy = ref<'default' | 'gainers' | 'losers'>('default')

async function fetchSectorData() {
  try {
    const res = await $fetch<SectorMoversApiResponse>('/api/market/sector-movers')
    sectors.value = res.sectors || []
    breadth.value = res.breadth || null
  } catch (err) {
    console.error('[SectorRotationGrid] Failed to fetch sector data:', err)
  } finally {
    isLoading.value = false
  }
}

const sortedSectors = computed(() => {
  if (sortBy.value === 'gainers') {
    return [...sectors.value].sort((a, b) => b.indexChangePercent - a.indexChangePercent)
  }
  if (sortBy.value === 'losers') {
    return [...sectors.value].sort((a, b) => a.indexChangePercent - b.indexChangePercent)
  }
  return sectors.value
})

let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  fetchSectorData()
  timer = setInterval(fetchSectorData, 30_000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="space-y-3 pt-2">
    <!-- Header Section -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-2">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-pie-chart" class="h-4 w-4 text-primary" />
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-xs font-black uppercase tracking-wider text-neutral-900 dark:text-white">
              Sectoral Rotation & Top 5 Heavyweights
            </h3>
            <span class="text-[9px] font-mono font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              Live Feed
            </span>
          </div>
          <p class="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
            Real-time performance across the 8 key NSE sectors and their 5 leading equities
          </p>
        </div>
      </div>

      <!-- Quick Sorting Filter -->
      <div class="flex items-center gap-1 self-start sm:self-auto rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-0.5 text-[10px] font-mono">
        <button
          type="button"
          class="px-2 py-0.5 rounded transition-colors select-none"
          :class="sortBy === 'default' ? 'bg-primary text-white font-bold' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'"
          @click="sortBy = 'default'"
        >
          Default
        </button>
        <button
          type="button"
          class="px-2 py-0.5 rounded transition-colors select-none"
          :class="sortBy === 'gainers' ? 'bg-emerald-600 text-white font-bold' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'"
          @click="sortBy = 'gainers'"
        >
          Top Gainers
        </button>
        <button
          type="button"
          class="px-2 py-0.5 rounded transition-colors select-none"
          :class="sortBy === 'losers' ? 'bg-rose-600 text-white font-bold' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'"
          @click="sortBy = 'losers'"
        >
          Top Losers
        </button>
      </div>
    </div>

    <!-- Market Breadth Meter (Advances vs Declines) -->
    <div
      v-if="breadth"
      class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 shadow-2xs space-y-2"
    >
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <div class="flex items-center gap-2">
          <span class="font-black uppercase text-[11px] text-neutral-900 dark:text-white flex items-center gap-1.5">
            <UIcon name="i-lucide-gauge" class="h-3.5 w-3.5 text-primary" />
            <span>Market Breadth (40 Key Heavyweights)</span>
          </span>
          <span
            class="text-[9px] font-bold font-mono px-2 py-0.5 rounded-full"
            :class="breadth.sentiment === 'bullish' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : breadth.sentiment === 'bearish' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700'"
          >
            {{ breadth.sentimentLabel }}
          </span>
        </div>

        <div class="flex items-center gap-3 text-[11px]">
          <span class="text-emerald-600 dark:text-emerald-400 font-black">
            ▲ {{ breadth.advances }} Advances ({{ breadth.advancePercent }}%)
          </span>
          <span v-if="breadth.unchanged > 0" class="text-neutral-400 font-semibold">
            ■ {{ breadth.unchanged }} Unch
          </span>
          <span class="text-rose-600 dark:text-rose-400 font-black">
            ▼ {{ breadth.declines }} Declines ({{ breadth.declinePercent }}%)
          </span>
          <span class="text-[10px] font-mono font-black px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
            A/D: {{ breadth.ratio }}
          </span>
        </div>
      </div>

      <!-- Visual Two-Tone Progress Bar -->
      <div class="h-2 w-full rounded-full overflow-hidden flex bg-neutral-200 dark:bg-neutral-800 shadow-inner">
        <div
          class="h-full bg-emerald-500 transition-all duration-500"
          :style="{ width: `${breadth.advancePercent}%` }"
          :title="`${breadth.advances} Advancing (${breadth.advancePercent}%)`"
        />
        <div
          v-if="breadth.unchanged > 0"
          class="h-full bg-neutral-400/50 transition-all duration-500"
          :style="{ width: `${(breadth.unchanged / breadth.total) * 100}%` }"
          :title="`${breadth.unchanged} Unchanged`"
        />
        <div
          class="h-full bg-rose-500 transition-all duration-500"
          :style="{ width: `${breadth.declinePercent}%` }"
          :title="`${breadth.declines} Declining (${breadth.declinePercent}%)`"
        />
      </div>
    </div>

    <!-- 8 Sector Cards Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
      <!-- Skeleton Loading State -->
      <template v-if="isLoading && sectors.length === 0">
        <div
          v-for="i in 8"
          :key="i"
          class="h-48 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100/60 dark:bg-neutral-800/40 animate-pulse p-3 space-y-2"
        >
          <div class="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-1/2" />
          <div class="space-y-1.5 pt-2">
            <div v-for="j in 5" :key="j" class="h-5 bg-neutral-200/60 dark:bg-neutral-700/60 rounded" />
          </div>
        </div>
      </template>

      <!-- Dynamic Sector Cards -->
      <template v-else>
        <div
          v-for="sec in sortedSectors"
          :key="sec.id"
          class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-2.5 space-y-2 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between"
        >
          <!-- Card Header: Sector Name, Icon, Index Price & Change -->
          <div class="border-b border-neutral-100 dark:border-neutral-800 pb-2">
            <div class="flex items-center justify-between gap-1.5">
              <div class="flex items-center gap-1.5 min-w-0">
                <div
                  class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px]"
                  :class="sec.indexChangePercent >= 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'"
                >
                  <UIcon :name="sec.icon" class="h-3.5 w-3.5" />
                </div>
                <span class="text-xs font-black text-neutral-900 dark:text-white truncate">
                  {{ sec.shortName }}
                </span>
              </div>

              <!-- Index Change Badge -->
              <span
                class="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-mono font-black shrink-0"
                :class="sec.indexChangePercent >= 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'"
              >
                {{ sec.indexChangePercent >= 0 ? '+' : '' }}{{ sec.indexChangePercent }}%
              </span>
            </div>

            <!-- Mini subline with index points -->
            <div class="flex items-center justify-between text-[9px] font-mono text-neutral-400 mt-1">
              <span>{{ sec.indexSymbol }}</span>
              <span>₹{{ sec.indexPrice.toLocaleString('en-IN') }}</span>
            </div>
          </div>

          <!-- Top 5 Equities List (Clickable to Inspect) -->
          <div class="space-y-1">
            <div
              v-for="(stk, sIdx) in sec.stocks"
              :key="stk.symbol"
              class="group/stk cursor-pointer flex items-center justify-between px-1.5 py-1 rounded-md transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800/80 hover:scale-[1.01] select-none text-[11px]"
              :title="`Click to inspect ${stk.name} fundamentals & charts`"
              @click="emit('inspect', stk.symbol)"
            >
              <!-- Stock Info -->
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="text-[9px] font-mono font-bold text-neutral-400 w-3 shrink-0">
                  {{ sIdx + 1 }}
                </span>
                <div class="min-w-0">
                  <div class="font-black text-neutral-800 dark:text-neutral-200 truncate leading-tight group-hover/stk:text-primary transition-colors flex items-center gap-1">
                    <span>{{ stk.symbol }}</span>
                    <UIcon name="i-lucide-external-link" class="h-2.5 w-2.5 opacity-0 group-hover/stk:opacity-100 text-primary transition-opacity" />
                  </div>
                  <div class="text-[9px] text-neutral-400 truncate max-w-[85px] leading-tight">
                    {{ stk.name }}
                  </div>
                </div>
              </div>

              <!-- Price & % Change -->
              <div class="text-right font-mono shrink-0 pl-2">
                <div class="font-bold text-neutral-900 dark:text-white leading-tight">
                  ₹{{ stk.price.toLocaleString('en-IN') }}
                </div>
                <div
                  class="text-[9px] font-extrabold leading-tight"
                  :class="stk.changePercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
                >
                  {{ stk.changePercent >= 0 ? '+' : '' }}{{ stk.changePercent }}%
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
