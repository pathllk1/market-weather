<script setup lang="ts">
defineProps<{
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

const categories = [
  { label: 'All Pairs', value: 'all', icon: 'i-lucide-coins' },
  { label: 'Watchlist ⭐', value: 'watchlist', icon: 'i-lucide-star' },
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
  <div class="bg-white rounded-xl border border-slate-200/90 shadow-xs p-3.5 mb-4 space-y-3">
    <!-- Top Row: Search Bar + Primary Action Buttons -->
    <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
      <!-- Search Box -->
      <div class="relative flex-1 max-w-md">
        <UIcon
          name="i-lucide-search"
          class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
        />
        <input
          :value="searchQuery"
          type="text"
          placeholder="Search 700+ cryptos (e.g. BTC, Solana, PEPE)..."
          class="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
        >
        <button
          v-if="searchQuery"
          class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          @click="emit('update:searchQuery', '')"
        >
          <UIcon
            name="i-lucide-x"
            class="w-3.5 h-3.5"
          />
        </button>
      </div>

      <!-- Action Cluster -->
      <div class="flex flex-wrap items-center gap-2">
        <!-- TDS Calculator Trigger Button -->
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-xs hover:from-amber-600 hover:to-orange-600 cursor-pointer transition-all"
          @click="emit('openCalculator')"
        >
          <UIcon
            name="i-lucide-calculator"
            class="w-3.5 h-3.5"
          />
          <span>1% TDS & Tax Tool</span>
        </button>

        <!-- Stream Pause / Resume Button -->
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer"
          :class="isPaused ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'"
          @click="emit('togglePause')"
        >
          <UIcon
            :name="isPaused ? 'i-lucide-play' : 'i-lucide-pause'"
            class="w-3.5 h-3.5"
          />
          <span>{{ isPaused ? 'Resume Stream' : 'Pause Stream' }}</span>
        </button>

        <!-- View Mode: Table vs Grid -->
        <div class="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
          <button
            class="p-1.5 rounded-md cursor-pointer transition-all"
            :class="displayMode === 'table' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'"
            title="Table View"
            @click="emit('update:displayMode', 'table')"
          >
            <UIcon
              name="i-lucide-table"
              class="w-4 h-4"
            />
          </button>
          <button
            class="p-1.5 rounded-md cursor-pointer transition-all"
            :class="displayMode === 'grid' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'"
            title="Card Grid View"
            @click="emit('update:displayMode', 'grid')"
          >
            <UIcon
              name="i-lucide-layout-grid"
              class="w-4 h-4"
            />
          </button>
        </div>
      </div>
    </div>

    <!-- Category Tabs Bar -->
    <div class="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 border-t border-slate-100 scrollbar-thin">
      <button
        v-for="cat in categories"
        :key="cat.value"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer"
        :class="activeCategory === cat.value ? 'bg-blue-600 text-white font-semibold shadow-xs' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/60'"
        @click="emit('update:activeCategory', cat.value)"
      >
        <UIcon
          :name="cat.icon"
          class="w-3.5 h-3.5"
        />
        <span>{{ cat.label }}</span>
      </button>
    </div>
  </div>
</template>
