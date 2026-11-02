<script setup lang="ts">
import { ref, computed, watch } from 'vue'
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
  (e: 'openTrade', asset: CryptoAsset): void
  (e: 'openCalculator', symbol: string): void
}>()

interface DailyCandle {
  timestamp: number
  dateStr: string
  openInr: number
  highInr: number
  lowInr: number
  closeInr: number
  openUsdt: number
  highUsdt: number
  lowUsdt: number
  closeUsdt: number
  volume: number
  volumeInr: number
  changePercent: number
  isGreen: boolean
}

const isLoading = ref(false)
const historyDays = ref<DailyCandle[]>([])
const selectedTimeframe = ref<'30d' | '14d' | '7d'>('30d')

async function fetchHistoricalData() {
  if (!props.asset) return
  isLoading.value = true

  try {
    const res = await $fetch<{
      success: boolean
      data: Array<{
        time: number
        openUsdt: number
        highUsdt: number
        lowUsdt: number
        closeUsdt: number
        openInr: number
        highInr: number
        lowInr: number
        closeInr: number
        volume: number
      }>
    }>(`/api/crypto/klines?symbol=${props.asset.symbol}&interval=1d&limit=30`)

    if (res?.success && Array.isArray(res.data)) {
      const processed: DailyCandle[] = res.data.map((item) => {
        const change = item.openInr > 0 ? ((item.closeInr - item.openInr) / item.openInr) * 100 : 0
        const date = new Date(item.time * 1000)
        return {
          timestamp: item.time,
          dateStr: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
          openInr: item.openInr,
          highInr: item.highInr,
          lowInr: item.lowInr,
          closeInr: item.closeInr,
          openUsdt: item.openUsdt,
          highUsdt: item.highUsdt,
          lowUsdt: item.lowUsdt,
          closeUsdt: item.closeUsdt,
          volume: item.volume,
          volumeInr: item.volume * item.closeInr,
          changePercent: Number(change.toFixed(2)),
          isGreen: item.closeInr >= item.openInr
        }
      })

      // Sort newest date first for table display
      historyDays.value = processed.reverse()
    }
  } catch (err) {
    console.error('Failed to load daily history:', err)
  } finally {
    isLoading.value = false
  }
}

watch(
  () => [props.isOpen, props.asset?.symbol],
  ([open]) => {
    if (open) {
      fetchHistoricalData()
    }
  }
)

const activeList = computed(() => {
  if (selectedTimeframe.value === '7d') return historyDays.value.slice(0, 7)
  if (selectedTimeframe.value === '14d') return historyDays.value.slice(0, 14)
  return historyDays.value
})

// Metrics Computations
const stats = computed(() => {
  if (!activeList.value.length) {
    return {
      returnPercent: 0,
      returnInr: 0,
      highInr: 0,
      lowInr: 0,
      totalTurnoverInr: 0,
      greenDays: 0,
      redDays: 0,
      winRate: 0,
      bestDay: null as DailyCandle | null,
      worstDay: null as DailyCandle | null
    }
  }

  const list = activeList.value
  const newest = list[0]
  const oldest = list[list.length - 1]

  const returnPercent = newest && oldest && oldest.openInr > 0
    ? Number((((newest.closeInr - oldest.openInr) / oldest.openInr) * 100).toFixed(2))
    : 0
  const returnInr = newest && oldest ? newest.closeInr - oldest.openInr : 0

  let highInr = -Infinity
  let lowInr = Infinity
  let totalTurnoverInr = 0
  let greenDays = 0
  let redDays = 0
  let bestDay = list[0]
  let worstDay = list[0]

  for (const d of list) {
    if (d.highInr > highInr) highInr = d.highInr
    if (d.lowInr < lowInr) lowInr = d.lowInr
    totalTurnoverInr += d.volumeInr
    if (d.isGreen) greenDays++
    else redDays++

    if (!bestDay || d.changePercent > bestDay.changePercent) bestDay = d
    if (!worstDay || d.changePercent < worstDay.changePercent) worstDay = d
  }

  const winRate = Number(((greenDays / list.length) * 100).toFixed(1))

  return {
    returnPercent,
    returnInr,
    highInr: highInr === -Infinity ? 0 : highInr,
    lowInr: lowInr === Infinity ? 0 : lowInr,
    totalTurnoverInr,
    greenDays,
    redDays,
    winRate,
    bestDay,
    worstDay
  }
})

function exportCsv() {
  if (!historyDays.value.length || !props.asset) return
  const headers = ['Date', 'Open INR', 'High INR', 'Low INR', 'Close INR', 'Change %', 'Volume Tokens', 'Estimated Turnover INR']
  const rows = historyDays.value.map(d => [
    `"${d.dateStr}"`,
    d.openInr.toFixed(2),
    d.highInr.toFixed(2),
    d.lowInr.toFixed(2),
    d.closeInr.toFixed(2),
    d.changePercent,
    d.volume.toFixed(2),
    d.volumeInr.toFixed(2)
  ])

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
  const encodedUri = encodeURI(csvContent)
  const link = document.createElement('a')
  link.setAttribute('href', encodedUri)
  link.setAttribute('download', `${props.asset.symbol}_30Day_History_INR.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
</script>

<template>
  <div
    v-if="isOpen && asset"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
  >
    <div
      class="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full p-5 sm:p-6 relative my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
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
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 font-black text-sm">
            {{ asset.baseAsset.slice(0, 3) }}
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-lg font-black text-slate-900">
                {{ asset.name }}
              </h3>
              <span class="text-xs font-mono font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                {{ asset.symbol }}
              </span>
              <span class="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                30-Day Historical Intelligence
              </span>
            </div>
            <div class="text-xs text-slate-400 mt-0.5">
              Live INR Conversion @ ₹{{ activeRate.toFixed(2) }} · Binance Daily Verified Klines
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <!-- Timeframe selector -->
          <div class="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
            <button
              class="px-2.5 py-1 rounded-md transition-all cursor-pointer"
              :class="selectedTimeframe === '7d' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'"
              @click="selectedTimeframe = '7d'"
            >
              7D
            </button>
            <button
              class="px-2.5 py-1 rounded-md transition-all cursor-pointer"
              :class="selectedTimeframe === '14d' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'"
              @click="selectedTimeframe = '14d'"
            >
              14D
            </button>
            <button
              class="px-2.5 py-1 rounded-md transition-all cursor-pointer"
              :class="selectedTimeframe === '30d' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'"
              @click="selectedTimeframe = '30d'"
            >
              30D (1 Month)
            </button>
          </div>

          <!-- CSV Export Button -->
          <button
            class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
            title="Export CSV"
            @click="exportCsv"
          >
            <UIcon
              name="i-lucide-download"
              class="w-3.5 h-3.5 text-slate-600"
            />
            <span class="hidden sm:inline">CSV</span>
          </button>
        </div>
      </div>

      <!-- 30-Day Executive Metric Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
        <!-- Return % -->
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-100">
          <span class="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">
            {{ selectedTimeframe.toUpperCase() }} Net Trajectory
          </span>
          <div
            class="text-lg font-black"
            :class="stats.returnPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'"
          >
            {{ stats.returnPercent >= 0 ? '+' : '' }}{{ stats.returnPercent }}%
          </div>
          <div class="text-[11px] text-slate-500 font-mono mt-0.5">
            {{ stats.returnInr >= 0 ? '+' : '' }}{{ formatInr(stats.returnInr) }}
          </div>
        </div>

        <!-- 30D High -->
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-100">
          <span class="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">
            {{ selectedTimeframe.toUpperCase() }} Resistance Peak
          </span>
          <div class="text-lg font-black text-slate-900">
            {{ formatInr(stats.highInr) }}
          </div>
          <div class="text-[11px] text-slate-400 mt-0.5">
            Top Selling Zone
          </div>
        </div>

        <!-- 30D Low -->
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-100">
          <span class="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">
            {{ selectedTimeframe.toUpperCase() }} Support Floor
          </span>
          <div class="text-lg font-black text-slate-900">
            {{ formatInr(stats.lowInr) }}
          </div>
          <div class="text-[11px] text-slate-400 mt-0.5">
            Accumulation Base
          </div>
        </div>

        <!-- Win Rate -->
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-100">
          <span class="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">
            Bullish Day Win Rate
          </span>
          <div class="text-lg font-black text-slate-900">
            {{ stats.winRate }}%
          </div>
          <div class="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
            <span class="text-emerald-600 font-semibold">{{ stats.greenDays }} Green</span>
            <span>·</span>
            <span class="text-rose-600 font-semibold">{{ stats.redDays }} Red</span>
          </div>
        </div>
      </div>

      <!-- Daily Return Histogram Strip -->
      <div class="p-3.5 rounded-xl bg-slate-50/80 border border-slate-100 mb-4">
        <div class="flex items-center justify-between text-xs text-slate-600 mb-2">
          <span class="font-bold flex items-center gap-1.5">
            <UIcon
              name="i-lucide-bar-chart-2"
              class="w-3.5 h-3.5 text-blue-600"
            />
            Day-by-Day Returns Spectrum (Oldest to Newest)
          </span>
          <span class="text-[11px] text-slate-400">
            Best: <strong class="text-emerald-600">+{{ stats.bestDay?.changePercent }}%</strong> |
            Worst: <strong class="text-rose-600">{{ stats.worstDay?.changePercent }}%</strong>
          </span>
        </div>

        <!-- Mini Bars Container -->
        <div class="h-14 flex items-end gap-1.5 pt-2">
          <div
            v-for="(day, idx) in [...activeList].reverse()"
            :key="idx"
            class="flex-1 rounded-xs transition-all relative group cursor-pointer flex flex-col justify-end"
            :class="day.isGreen ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'"
            :style="{ height: `${Math.max(14, Math.min(100, Math.abs(day.changePercent) * 7))}%` }"
          >
            <!-- Hover Tooltip -->
            <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-20 bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow-md whitespace-nowrap font-mono pointer-events-none">
              <div>{{ day.dateStr }}</div>
              <div :class="day.isGreen ? 'text-emerald-400' : 'text-rose-400'">
                {{ day.changePercent >= 0 ? '+' : '' }}{{ day.changePercent }}%
              </div>
              <div class="text-slate-300">
                Close: {{ formatInr(day.closeInr) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Historical Ledger Table -->
      <div class="border border-slate-200 rounded-xl overflow-hidden mb-4">
        <div class="max-h-64 overflow-y-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-slate-100/80 sticky top-0 z-10 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              <tr>
                <th class="py-2.5 px-3">
                  Date
                </th>
                <th class="py-2.5 px-3 text-right">
                  Open (₹)
                </th>
                <th class="py-2.5 px-3 text-right">
                  High (₹)
                </th>
                <th class="py-2.5 px-3 text-right">
                  Low (₹)
                </th>
                <th class="py-2.5 px-3 text-right">
                  Close (₹)
                </th>
                <th class="py-2.5 px-3 text-right">
                  Change %
                </th>
                <th class="py-2.5 px-3 text-right hidden sm:table-cell">
                  Est Turnover (₹)
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 font-mono text-[11px]">
              <tr
                v-if="isLoading"
                class="text-center py-6"
              >
                <td
                  colspan="7"
                  class="py-8 text-slate-400 font-sans"
                >
                  <UIcon
                    name="i-lucide-loader-2"
                    class="w-5 h-5 animate-spin text-blue-600 inline mr-2"
                  />
                  Loading verified daily klines...
                </td>
              </tr>
              <tr
                v-for="(day, i) in activeList"
                :key="i"
                class="hover:bg-slate-50 transition-colors"
              >
                <td class="py-2 px-3 font-sans font-semibold text-slate-700">
                  {{ day.dateStr }}
                </td>
                <td class="py-2 px-3 text-right text-slate-600">
                  {{ formatInr(day.openInr) }}
                </td>
                <td class="py-2 px-3 text-right text-emerald-700">
                  {{ formatInr(day.highInr) }}
                </td>
                <td class="py-2 px-3 text-right text-rose-700">
                  {{ formatInr(day.lowInr) }}
                </td>
                <td class="py-2 px-3 text-right font-bold text-slate-900">
                  {{ formatInr(day.closeInr) }}
                </td>
                <td class="py-2 px-3 text-right font-bold">
                  <span
                    class="px-1.5 py-0.5 rounded text-[10px]"
                    :class="day.isGreen ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'"
                  >
                    {{ day.changePercent >= 0 ? '+' : '' }}{{ day.changePercent }}%
                  </span>
                </td>
                <td class="py-2 px-3 text-right text-slate-500 hidden sm:table-cell font-sans">
                  {{ formatInr(day.volumeInr, { compact: true }) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="flex items-center justify-between pt-3 border-t border-slate-100">
        <div class="flex items-center gap-2">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer"
            @click="emit('openTrade', asset); emit('close')"
          >
            <UIcon
              name="i-lucide-briefcase"
              class="w-3.5 h-3.5"
            />
            <span>Paper Trade {{ asset.baseAsset }}</span>
          </button>

          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
            @click="emit('openCalculator', asset.symbol); emit('close')"
          >
            <UIcon
              name="i-lucide-calculator"
              class="w-3.5 h-3.5"
            />
            <span>1% TDS Calculator</span>
          </button>
        </div>

        <button
          class="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
          @click="emit('close')"
        >
          Close History
        </button>
      </div>
    </div>
  </div>
</template>
