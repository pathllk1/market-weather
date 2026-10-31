<script setup lang="ts">
import { ref, computed } from 'vue'
import type { CryptoAsset } from '../../composables/useCrypto'

const props = defineProps<{
  tickers: CryptoAsset[]
  selectedAsset: CryptoAsset | null
  tickFlashes: Record<string, 'up' | 'down' | undefined>
  watchlist?: string[]
  sortBy: 'volume' | 'price' | 'change' | 'name'
  sortDirection: 'asc' | 'desc'
  formatInr: (val: number, options?: { compact?: boolean, decimals?: number }) => string
  formatUsd: (val: number, decimals?: number) => string
}>()

const emit = defineEmits<{
  (e: 'selectAsset' | 'openDetail' | 'openHistory' | 'openTrade' | 'openSignals' | 'openArbitrage' | 'openAlert', asset: CryptoAsset): void
  (e: 'openCalculator' | 'toggleWatchlist', symbol: string): void
  (e: 'changeSort', key: 'volume' | 'price' | 'change' | 'name'): void
}>()

const pageSize = ref(50)
const currentPage = ref(1)

const totalPages = computed(() => {
  return Math.ceil(props.tickers.length / pageSize.value) || 1
})

const paginatedTickers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return props.tickers.slice(start, start + pageSize.value)
})

function getCategoryColor(cat: CryptoAsset['category']) {
  switch (cat) {
    case 'l1-l2':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200'
    case 'defi':
      return 'bg-cyan-50 text-cyan-700 border-cyan-200'
    case 'ai-data':
      return 'bg-purple-50 text-purple-700 border-purple-200'
    case 'meme':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'infrastructure':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200'
  }
}

function calculateRangePercent(low: number, high: number, current: number) {
  if (high <= low) return 50
  const pct = ((current - low) / (high - low)) * 100
  return Math.min(Math.max(pct, 0), 100)
}
</script>

<template>
  <div class="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
    <!-- Table Container with Horizontal Scroll -->
    <div class="overflow-x-auto w-full">
      <table class="w-full text-left text-xs border-collapse">
        <!-- Table Header -->
        <thead class="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider sticky top-0 z-10 backdrop-blur-xs">
          <tr>
            <th class="py-3 px-3.5 w-12 text-center">
              #
            </th>
            <th
              class="py-3 px-3.5 cursor-pointer hover:text-slate-900 transition-colors"
              @click="emit('changeSort', 'name')"
            >
              <div class="flex items-center gap-1">
                <span>Asset</span>
                <UIcon
                  v-if="sortBy === 'name'"
                  :name="sortDirection === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'"
                  class="w-3 h-3 text-blue-600"
                />
              </div>
            </th>
            <th
              class="py-3 px-3.5 text-right cursor-pointer hover:text-slate-900 transition-colors"
              @click="emit('changeSort', 'price')"
            >
              <div class="flex items-center justify-end gap-1">
                <span>Live Price (₹ INR)</span>
                <UIcon
                  v-if="sortBy === 'price'"
                  :name="sortDirection === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'"
                  class="w-3 h-3 text-blue-600"
                />
              </div>
            </th>
            <th class="py-3 px-3.5 text-right hidden sm:table-cell">
              USDT Price ($)
            </th>
            <th
              class="py-3 px-3.5 text-right cursor-pointer hover:text-slate-900 transition-colors"
              @click="emit('changeSort', 'change')"
            >
              <div class="flex items-center justify-end gap-1">
                <span>24h Change</span>
                <UIcon
                  v-if="sortBy === 'change'"
                  :name="sortDirection === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'"
                  class="w-3 h-3 text-blue-600"
                />
              </div>
            </th>
            <th class="py-3 px-3.5 text-center hidden md:table-cell w-44">
              24h High / Low (₹)
            </th>
            <th
              class="py-3 px-3.5 text-right cursor-pointer hover:text-slate-900 transition-colors"
              @click="emit('changeSort', 'volume')"
            >
              <div class="flex items-center justify-end gap-1">
                <span>24h Turnover (₹)</span>
                <UIcon
                  v-if="sortBy === 'volume'"
                  :name="sortDirection === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'"
                  class="w-3 h-3 text-blue-600"
                />
              </div>
            </th>
            <th class="py-3 px-3.5 text-center w-28">
              Quick Actions
            </th>
          </tr>
        </thead>

        <!-- Table Body -->
        <tbody class="divide-y divide-slate-100 font-medium">
          <tr
            v-for="(asset, index) in paginatedTickers"
            :key="asset.symbol"
            class="hover:bg-slate-50/80 transition-colors cursor-pointer group"
            :class="{
              'bg-blue-50/40': selectedAsset?.symbol === asset.symbol
            }"
            @click="emit('selectAsset', asset)"
          >
            <!-- Rank & Star -->
            <td
              class="py-3 px-2 text-center text-slate-400 font-mono text-[11px]"
              @click.stop
            >
              <div class="flex items-center justify-center gap-1">
                <button
                  class="text-slate-300 hover:text-amber-400 p-0.5 cursor-pointer transition-colors"
                  :class="{ 'text-amber-400': watchlist?.includes(asset.symbol) }"
                  title="Toggle Watchlist"
                  @click="emit('toggleWatchlist', asset.symbol)"
                >
                  <UIcon
                    name="i-lucide-star"
                    class="w-3.5 h-3.5"
                    :class="{ 'fill-amber-400': watchlist?.includes(asset.symbol) }"
                  />
                </button>
                <span>{{ (currentPage - 1) * pageSize + index + 1 }}</span>
              </div>
            </td>

            <!-- Asset Info -->
            <td class="py-3 px-3.5">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200/80 flex items-center justify-center font-bold text-slate-700 text-xs shrink-0 group-hover:border-blue-300 transition-colors">
                  {{ asset.baseAsset.slice(0, 3) }}
                </div>
                <div class="truncate max-w-[160px] sm:max-w-xs">
                  <div class="font-bold text-slate-900 flex items-center gap-1.5 truncate">
                    <span>{{ asset.name }}</span>
                    <span class="text-[10px] text-slate-400 font-mono font-normal">{{ asset.baseAsset }}</span>
                  </div>
                  <div class="flex items-center gap-1 mt-0.5">
                    <span
                      class="text-[9px] font-semibold px-1.5 py-0.2 rounded border uppercase tracking-wider"
                      :class="getCategoryColor(asset.category)"
                    >
                      {{ asset.category }}
                    </span>
                  </div>
                </div>
              </div>
            </td>

            <!-- Live INR Price (With real-time pulse flash) -->
            <td class="py-3 px-3.5 text-right">
              <span
                class="inline-block px-1.5 py-0.5 rounded font-extrabold text-slate-900 tracking-tight transition-all duration-300"
                :class="{
                  'bg-emerald-100 text-emerald-800 scale-105': tickFlashes[asset.symbol] === 'up',
                  'bg-rose-100 text-rose-800 scale-105': tickFlashes[asset.symbol] === 'down'
                }"
              >
                {{ formatInr(asset.priceInr) }}
              </span>
            </td>

            <!-- USDT Global Price -->
            <td class="py-3 px-3.5 text-right text-slate-500 font-mono text-xs hidden sm:table-cell">
              {{ formatUsd(asset.priceUsdt) }}
            </td>

            <!-- 24h Change -->
            <td class="py-3 px-3.5 text-right">
              <span
                class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold"
                :class="asset.change24h >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'"
              >
                <UIcon
                  :name="asset.change24h >= 0 ? 'i-lucide-arrow-up-right' : 'i-lucide-arrow-down-right'"
                  class="w-3.5 h-3.5"
                />
                {{ asset.change24h >= 0 ? '+' : '' }}{{ asset.change24h }}%
              </span>
            </td>

            <!-- 24h High / Low Visual Range Bar -->
            <td class="py-3 px-3.5 hidden md:table-cell">
              <div class="w-full">
                <div class="flex justify-between text-[10px] text-slate-400 font-mono mb-1">
                  <span>{{ formatInr(asset.low24hInr, { compact: true }) }}</span>
                  <span>{{ formatInr(asset.high24hInr, { compact: true }) }}</span>
                </div>
                <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden relative">
                  <div
                    class="bg-blue-500 h-full rounded-full transition-all duration-300"
                    :style="{ width: `${calculateRangePercent(asset.low24hInr, asset.high24hInr, asset.priceInr)}%` }"
                  />
                </div>
              </div>
            </td>

            <!-- 24h Turnover in INR -->
            <td class="py-3 px-3.5 text-right font-semibold text-slate-800">
              <div>{{ formatInr(asset.quoteVolumeInr, { compact: true }) }}</div>
              <div class="text-[10px] text-slate-400 font-normal">
                {{ asset.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 }) }} {{ asset.baseAsset }}
              </div>
            </td>

            <!-- Quick Action Icons -->
            <td
              class="py-3 px-3 text-center"
              @click.stop
            >
              <div class="flex items-center justify-center gap-1">
                <!-- 30D History Modal Button -->
                <button
                  class="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                  title="30-Day Historical Data & Return"
                  @click="emit('openHistory', asset)"
                >
                  <UIcon
                    name="i-lucide-calendar"
                    class="w-4 h-4 text-indigo-500"
                  />
                </button>

                <!-- Paper Trade Button -->
                <button
                  class="p-1 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                  title="Paper Trade Simulation"
                  @click="emit('openTrade', asset)"
                >
                  <UIcon
                    name="i-lucide-briefcase"
                    class="w-4 h-4 text-emerald-600"
                  />
                </button>

                <!-- Technical Signals Button -->
                <button
                  class="p-1 rounded-md text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors cursor-pointer"
                  title="Technical Signals & Pivot Points"
                  @click="emit('openSignals', asset)"
                >
                  <UIcon
                    name="i-lucide-activity"
                    class="w-4 h-4 text-purple-500"
                  />
                </button>

                <!-- TDS Calculator -->
                <button
                  class="p-1 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                  title="Crypto & 1% TDS Calculator"
                  @click="emit('openCalculator', asset.symbol)"
                >
                  <UIcon
                    name="i-lucide-calculator"
                    class="w-4 h-4 text-amber-500"
                  />
                </button>

                <!-- Deep Dive Inspection (Depth) -->
                <button
                  class="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                  title="Order Book Depth"
                  @click="emit('openDetail', asset)"
                >
                  <UIcon
                    name="i-lucide-layers"
                    class="w-4 h-4 text-blue-500"
                  />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Table Pagination & Footer -->
    <div class="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 font-medium">
      <div class="flex items-center gap-2">
        <span>Showing {{ Math.min(tickers.length, (currentPage - 1) * pageSize + 1) }} - {{ Math.min(tickers.length, currentPage * pageSize) }} of {{ tickers.length }} active crypto pairs</span>
      </div>

      <div class="flex items-center gap-2">
        <label class="text-[11px] text-slate-500">Per page:</label>
        <select
          v-model="pageSize"
          class="bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 focus:outline-none"
        >
          <option :value="25">
            25
          </option>
          <option :value="50">
            50
          </option>
          <option :value="100">
            100
          </option>
          <option :value="500">
            500
          </option>
        </select>

        <div class="flex items-center gap-1 ml-2">
          <button
            :disabled="currentPage === 1"
            class="px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
            @click="currentPage--"
          >
            Previous
          </button>
          <span class="px-2 text-slate-700 font-semibold">{{ currentPage }} / {{ totalPages }}</span>
          <button
            :disabled="currentPage >= totalPages"
            class="px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
            @click="currentPage++"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
