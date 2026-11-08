<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  tickers?: Array<{ symbol: string; baseAsset?: string; quoteAsset?: string; name?: string; category?: string; change24h?: number }>
  searchQuery: string
  activeCategory: string
  sortBy: 'volume' | 'price' | 'change' | 'name'
  sortDirection: 'asc' | 'desc'
  displayMode: 'table' | 'grid'
  isPaused: boolean
  totalAssetsCount: number
  watchlistCount?: number
}>()

const emit = defineEmits<{
  (e: 'update:searchQuery' | 'update:activeCategory', val: string): void
  (e: 'update:sortBy', val: 'volume' | 'price' | 'change' | 'name'): void
  (e: 'update:displayMode', val: 'table' | 'grid'): void
  (e: 'toggleSortDirection' | 'togglePause' | 'openCalculator'): void
}>()

const searchInputRef = ref<HTMLInputElement | null>(null)

function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.key === '/' && document.activeElement !== searchInputRef.value) {
    const targetTag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase()
    if (targetTag !== 'input' && targetTag !== 'textarea') {
      e.preventDefault()
      searchInputRef.value?.focus()
    }
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleGlobalKeydown)
  }
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleGlobalKeydown)
  }
})

// Dynamic asset counts for each category
const categoryCounts = computed<Record<string, number>>(() => {
  const list = props.tickers || []
  const counts: Record<string, number> = {
    all: list.length || props.totalAssetsCount,
    watchlist: props.watchlistCount ?? 0,
    top50: Math.min(50, list.length),
    'l1-l2': 0,
    defi: 0,
    'ai-data': 0,
    meme: 0,
    gainers: 0,
    losers: 0
  }

  for (const t of list) {
    if (t.category === 'l1-l2') counts['l1-l2'] = (counts['l1-l2'] || 0) + 1
    else if (t.category === 'defi') counts.defi = (counts.defi || 0) + 1
    else if (t.category === 'ai-data') counts['ai-data'] = (counts['ai-data'] || 0) + 1
    else if (t.category === 'meme') counts.meme = (counts.meme || 0) + 1

    if ((t.change24h || 0) > 0) counts.gainers = (counts.gainers || 0) + 1
    else if ((t.change24h || 0) < 0) counts.losers = (counts.losers || 0) + 1
  }

  return counts
})

const categories = [
  { label: 'All Pairs', value: 'all', icon: 'i-lucide-coins' },
  { label: 'Watchlist', value: 'watchlist', icon: 'i-lucide-star' },
  { label: 'Top 50 Volume', value: 'top50', icon: 'i-lucide-flame' },
  { label: 'Layer 1 / 2', value: 'l1-l2', icon: 'i-lucide-layers' },
  { label: 'DeFi', value: 'defi', icon: 'i-lucide-landmark' },
  { label: 'AI & Data', value: 'ai-data', icon: 'i-lucide-brain' },
  { label: 'Meme Coins', value: 'meme', icon: 'i-lucide-smile' },
  { label: 'Gainers 🚀', value: 'gainers', icon: 'i-lucide-trending-up' },
  { label: 'Dips 🔻', value: 'losers', icon: 'i-lucide-trending-down' }
]
</script>

<template>
  <div class="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3 mb-4 space-y-2.5">
    <!-- Top Row: Search Bar + Live Controls -->
    <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
      <!-- Search Box with Keyboard Shortcut -->
      <div class="relative flex-1 max-w-md">
        <UIcon
          name="i-lucide-search"
          class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
        />
        <input
          ref="searchInputRef"
          :value="searchQuery"
          type="text"
          placeholder="Search 700+ cryptos (e.g. BTC, Solana, PEPE)..."
          class="w-full pl-9 pr-14 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
          @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
        >
        <div class="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <button
            v-if="searchQuery"
            class="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
            title="Clear search"
            @click="emit('update:searchQuery', '')"
          >
            <UIcon
              name="i-lucide-x"
              class="w-3.5 h-3.5"
            />
          </button>
          <kbd
            v-else
            class="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-100 border border-slate-200 rounded select-none shadow-2xs"
            title="Press / to focus search"
          >
            /
          </kbd>
        </div>
      </div>

      <!-- Live Stream Controls & View Switcher -->
      <div class="flex items-center justify-between md:justify-end gap-2">
        <!-- Stream Pause / Resume Button -->
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer"
          :class="isPaused ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-2xs' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'"
          title="Toggle real-time WebSocket stream updates"
          @click="emit('togglePause')"
        >
          <UIcon
            :name="isPaused ? 'i-lucide-play' : 'i-lucide-pause'"
            class="w-3.5 h-3.5"
            :class="isPaused ? 'text-amber-600' : 'text-slate-500'"
          />
          <span>{{ isPaused ? 'Resume Stream' : 'Live Streaming' }}</span>
        </button>

        <!-- View Mode: Table vs Grid -->
        <div class="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
          <button
            class="px-2.5 py-1 rounded-md cursor-pointer transition-all flex items-center gap-1 text-xs font-semibold"
            :class="displayMode === 'table' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'"
            title="Table View (Institutional Grid)"
            @click="emit('update:displayMode', 'table')"
          >
            <UIcon
              name="i-lucide-table"
              class="w-3.5 h-3.5"
            />
            <span class="hidden sm:inline">Table</span>
          </button>
          <button
            class="px-2.5 py-1 rounded-md cursor-pointer transition-all flex items-center gap-1 text-xs font-semibold"
            :class="displayMode === 'grid' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'"
            title="Card Grid View (Visual Cards)"
            @click="emit('update:displayMode', 'grid')"
          >
            <UIcon
              name="i-lucide-layout-grid"
              class="w-3.5 h-3.5"
            />
            <span class="hidden sm:inline">Cards</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Category Tabs Bar with Count Badges -->
    <div class="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 border-t border-slate-100/90 scrollbar-thin">
      <button
        v-for="cat in categories"
        :key="cat.value"
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer"
        :class="activeCategory === cat.value
          ? 'bg-blue-600 text-white font-semibold shadow-2xs'
          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/60'"
        @click="emit('update:activeCategory', cat.value)"
      >
        <UIcon
          :name="cat.icon"
          class="w-3.5 h-3.5"
          :class="activeCategory === cat.value ? 'text-white' : 'text-slate-400'"
        />
        <span>{{ cat.label }}</span>
        <span
          class="text-[10px] font-mono px-1 py-0.2 rounded-md transition-colors"
          :class="activeCategory === cat.value
            ? 'bg-white/20 text-white'
            : 'bg-slate-200/70 text-slate-600'"
        >
          {{ categoryCounts[cat.value] ?? 0 }}
        </span>
      </button>
    </div>
  </div>
</template>
