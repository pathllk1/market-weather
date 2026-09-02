<script setup lang="ts">
import { computed } from 'vue'
import type { PortfolioSummaryResponse, HoldingPosition } from '../../types/portfolio'
import type { MFHoldingsResponse, MFHolding } from '../../types/mutualFunds'

const props = defineProps<{
  summary: PortfolioSummaryResponse | null
  mfData: MFHoldingsResponse | null
}>()

const emit = defineEmits<{
  (e: 'selectTab', tabKey: string): void
}>()

// 1. Consolidated Calculations
const totalEquityValue = computed(() => props.summary?.portfolio.totalValue || 0)
const totalEquityInvested = computed(() => props.summary?.portfolio.totalInvested || 0)
const totalEquityPnL = computed(() => props.summary?.portfolio.unrealizedPnL || 0)

const totalMFValue = computed(() => props.mfData?.totalMFCurrentValue || 0)
const totalMFInvested = computed(() => props.mfData?.totalMFInvested || 0)
const totalMFPnL = computed(() => props.mfData?.totalMFPnL || 0)

const combinedNetWorth = computed(() => totalEquityValue.value + totalMFValue.value)
const combinedInvested = computed(() => totalEquityInvested.value + totalMFInvested.value)
const combinedNetGain = computed(() => combinedNetWorth.value - combinedInvested.value)
const combinedReturnPct = computed(() => {
  return combinedInvested.value > 0 ? (combinedNetGain.value / combinedInvested.value) * 100 : 0
})

// Asset Allocation Percentages
const equityPct = computed(() => {
  if (combinedNetWorth.value <= 0) return 100
  return Number(((totalEquityValue.value / combinedNetWorth.value) * 100).toFixed(1))
})

const mfPct = computed(() => {
  if (combinedNetWorth.value <= 0) return 0
  return Number(((totalMFValue.value / combinedNetWorth.value) * 100).toFixed(1))
})

// Top 5 Stock Positions
const topStocks = computed<HoldingPosition[]>(() => {
  if (!props.summary?.holdings) return []
  return [...props.summary.holdings].slice(0, 5)
})

// Top 5 Mutual Fund Positions
const topFunds = computed<MFHolding[]>(() => {
  if (!props.mfData?.holdings) return []
  return [...props.mfData.holdings].sort((a, b) => b.currentValue - a.currentValue).slice(0, 5)
})

function fmtCur(val: number) {
  return '₹' + (val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
</script>

<template>
  <div class="space-y-6">
    <!-- 1. CONSOLIDATED MASTER WEALTH STRIP -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Grand Total Wealth -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-1.5 shadow-xs relative overflow-hidden">
        <div class="flex items-center justify-between text-neutral-400">
          <span class="text-xs font-semibold uppercase tracking-wider">Consolidated Net Worth</span>
          <UIcon name="i-lucide-globe" class="h-4 w-4 text-primary" />
        </div>
        <div class="text-2xl sm:text-3xl font-black font-mono text-neutral-900 dark:text-white">
          {{ fmtCur(combinedNetWorth) }}
        </div>
        <div class="text-xs font-mono" :class="combinedNetGain >= 0 ? 'text-emerald-500 font-semibold' : 'text-rose-500 font-semibold'">
          {{ combinedNetGain >= 0 ? '+' : '' }}{{ fmtCur(combinedNetGain) }}
          ({{ combinedReturnPct >= 0 ? '+' : '' }}{{ combinedReturnPct.toFixed(2) }}%)
        </div>
      </div>

      <!-- Total Capital Invested -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-1.5 shadow-xs">
        <div class="flex items-center justify-between text-neutral-400">
          <span class="text-xs font-semibold uppercase tracking-wider">Total Capital Invested</span>
          <UIcon name="i-lucide-landmark" class="h-4 w-4 text-emerald-500" />
        </div>
        <div class="text-2xl sm:text-3xl font-black font-mono text-neutral-900 dark:text-white">
          {{ fmtCur(combinedInvested) }}
        </div>
        <div class="text-xs text-neutral-400">
          Equities + Mutual Fund Inflows
        </div>
      </div>

      <!-- Equities Breakdown Card -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-1.5 shadow-xs">
        <div class="flex items-center justify-between text-neutral-400">
          <span class="text-xs font-semibold uppercase tracking-wider">Direct Equities (Stocks)</span>
          <UIcon name="i-lucide-trending-up" class="h-4 w-4 text-emerald-500" />
        </div>
        <div class="text-2xl font-black font-mono text-neutral-900 dark:text-white">
          {{ fmtCur(totalEquityValue) }}
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-neutral-400 font-mono">Invested: {{ fmtCur(totalEquityInvested) }}</span>
          <span class="font-mono font-bold" :class="totalEquityPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'">
            {{ totalEquityPnL >= 0 ? '+' : '' }}{{ fmtCur(totalEquityPnL) }}
          </span>
        </div>
      </div>

      <!-- Mutual Funds Breakdown Card -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-1.5 shadow-xs">
        <div class="flex items-center justify-between text-neutral-400">
          <span class="text-xs font-semibold uppercase tracking-wider">Mutual Funds & SIPs</span>
          <UIcon name="i-lucide-pie-chart" class="h-4 w-4 text-indigo-500" />
        </div>
        <div class="text-2xl font-black font-mono text-neutral-900 dark:text-white">
          {{ fmtCur(totalMFValue) }}
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-neutral-400 font-mono">Invested: {{ fmtCur(totalMFInvested) }}</span>
          <span class="font-mono font-bold" :class="totalMFPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'">
            {{ totalMFPnL >= 0 ? '+' : '' }}{{ fmtCur(totalMFPnL) }}
          </span>
        </div>
      </div>
    </div>

    <!-- 2. ASSET ALLOCATION RADAR STRIP -->
    <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-3 shadow-xs">
      <div class="flex items-center justify-between">
        <div>
          <h4 class="font-bold text-sm text-neutral-900 dark:text-white flex items-center gap-2">
            <UIcon name="i-lucide-pie-chart" class="h-4 w-4 text-primary" />
            <span>Master Asset Allocation Breakdown</span>
          </h4>
          <p class="text-xs text-neutral-400 mt-0.5">
            Macro distribution between Direct Equities and Pooled Mutual Funds
          </p>
        </div>
        <div class="flex items-center gap-4 text-xs font-mono">
          <div class="flex items-center gap-1.5">
            <span class="h-3 w-3 rounded-full bg-emerald-500" />
            <span class="font-semibold text-neutral-900 dark:text-white">Direct Equities: {{ equityPct }}%</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="h-3 w-3 rounded-full bg-indigo-500" />
            <span class="font-semibold text-neutral-900 dark:text-white">Mutual Funds: {{ mfPct }}%</span>
          </div>
        </div>
      </div>

      <!-- Allocation Split Bar -->
      <div class="w-full h-3.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden flex">
        <div
          class="h-full bg-emerald-500 transition-all duration-500"
          :style="{ width: `${equityPct}%` }"
          title="Direct Equities Allocation"
        />
        <div
          class="h-full bg-indigo-500 transition-all duration-500"
          :style="{ width: `${mfPct}%` }"
          title="Mutual Funds Allocation"
        />
      </div>
    </div>

    <!-- 3. CURRENT POSITION SUMMARY: TOP EQUITIES VS TOP MUTUAL FUNDS -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <!-- Top 5 Stock Positions -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4 shadow-xs">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <UIcon name="i-lucide-trending-up" class="h-4 w-4" />
            </div>
            <div>
              <h4 class="font-bold text-sm text-neutral-900 dark:text-white">Top Direct Equity Holdings</h4>
              <p class="text-[11px] text-neutral-400">Largest capital allocations in individual stocks</p>
            </div>
          </div>
          <UButton
            variant="ghost"
            color="primary"
            size="xs"
            trailing-icon="i-lucide-arrow-right"
            @click="$emit('selectTab', 'operations')"
          >
            All Stocks
          </UButton>
        </div>

        <div v-if="topStocks.length === 0" class="py-8 text-center text-xs text-neutral-400">
          No stock positions currently logged.
        </div>

        <div v-else class="space-y-2 divide-y divide-neutral-100 dark:divide-neutral-800/60">
          <div
            v-for="s in topStocks"
            :key="s.symbol"
            class="pt-2 flex items-center justify-between text-xs"
          >
            <div>
              <div class="font-bold text-neutral-900 dark:text-white">{{ s.symbol }}</div>
              <div class="text-[11px] text-neutral-400">{{ s.companyName }} • {{ s.quantity }} shares</div>
            </div>
            <div class="text-right font-mono">
              <div class="font-bold text-neutral-900 dark:text-white">{{ fmtCur(s.currentValue) }}</div>
              <div :class="s.unrealizedPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'" class="text-[11px] font-semibold">
                {{ s.unrealizedPnL >= 0 ? '+' : '' }}{{ s.unrealizedPnLPct.toFixed(2) }}%
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Top 5 Mutual Fund Positions -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4 shadow-xs">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="h-7 w-7 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <UIcon name="i-lucide-pie-chart" class="h-4 w-4" />
            </div>
            <div>
              <h4 class="font-bold text-sm text-neutral-900 dark:text-white">Top Mutual Fund Holdings</h4>
              <p class="text-[11px] text-neutral-400">Largest pooled investments & active SIPs</p>
            </div>
          </div>
          <UButton
            variant="ghost"
            color="primary"
            size="xs"
            trailing-icon="i-lucide-arrow-right"
            @click="$emit('selectTab', 'mutual_funds')"
          >
            All Funds
          </UButton>
        </div>

        <div v-if="topFunds.length === 0" class="py-8 text-center text-xs text-neutral-400">
          No mutual fund holdings currently logged.
        </div>

        <div v-else class="space-y-2 divide-y divide-neutral-100 dark:divide-neutral-800/60">
          <div
            v-for="f in topFunds"
            :key="f.schemeCode"
            class="pt-2 flex items-center justify-between text-xs"
          >
            <div class="max-w-[65%]">
              <div class="font-bold text-neutral-900 dark:text-white line-clamp-1">{{ f.schemeName }}</div>
              <div class="text-[11px] text-neutral-400">{{ f.category }} • {{ f.totalUnits.toFixed(2) }} units</div>
            </div>
            <div class="text-right font-mono">
              <div class="font-bold text-neutral-900 dark:text-white">{{ fmtCur(f.currentValue) }}</div>
              <div :class="f.unrealizedPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'" class="text-[11px] font-semibold">
                {{ f.unrealizedPnL >= 0 ? '+' : '' }}{{ f.unrealizedPnLPct.toFixed(2) }}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
