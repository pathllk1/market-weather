<script setup lang="ts">
import type { BacktestMetrics } from '~/types/backtest'

const props = defineProps<{
  metrics: BacktestMetrics
  currency?: string
}>()

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: props.currency || 'INR',
    maximumFractionDigits: 2
  }).format(val)
}
</script>

<template>
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
    <!-- 1. Total Portfolio Equity -->
    <div class="relative overflow-hidden rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white/80 dark:bg-neutral-900/80 p-4 shadow-sm backdrop-blur-md">
      <div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        <span>Portfolio Equity</span>
        <UIcon
          name="i-lucide-wallet"
          class="h-4 w-4 text-primary"
        />
      </div>
      <div class="mt-2 text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
        {{ formatCurrency(metrics.totalEquity) }}
      </div>
      <div
        class="mt-1 flex items-center gap-1.5 text-xs font-medium"
        :class="metrics.netPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
      >
        <UIcon
          :name="metrics.netPnL >= 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'"
          class="h-3.5 w-3.5"
        />
        <span>{{ metrics.netPnL >= 0 ? '+' : '' }}{{ formatCurrency(metrics.netPnL) }} ({{ metrics.netReturnPercent >= 0 ? '+' : '' }}{{ metrics.netReturnPercent }}%)</span>
      </div>
    </div>

    <!-- 2. Cash Balance / Available Buying Power -->
    <div class="relative overflow-hidden rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white/80 dark:bg-neutral-900/80 p-4 shadow-sm backdrop-blur-md">
      <div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        <span>Available Cash</span>
        <UIcon
          name="i-lucide-banknote"
          class="h-4 w-4 text-emerald-500"
        />
      </div>
      <div class="mt-2 text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
        {{ formatCurrency(metrics.cashBalance) }}
      </div>
      <div class="mt-1 flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
        <span>Allocated: {{ formatCurrency(metrics.totalInvested) }}</span>
      </div>
    </div>

    <!-- 3. Unrealized P&L -->
    <div class="relative overflow-hidden rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white/80 dark:bg-neutral-900/80 p-4 shadow-sm backdrop-blur-md">
      <div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        <span>Unrealized P&L</span>
        <UIcon
          name="i-lucide-activity"
          class="h-4 w-4 text-blue-500"
        />
      </div>
      <div
        class="mt-2 text-xl font-bold tracking-tight"
        :class="metrics.totalUnrealizedPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
      >
        {{ metrics.totalUnrealizedPnL >= 0 ? '+' : '' }}{{ formatCurrency(metrics.totalUnrealizedPnL) }}
      </div>
      <div class="mt-1 flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
        <span>Open Positions Gain/Loss</span>
      </div>
    </div>

    <!-- 4. Realized P&L -->
    <div class="relative overflow-hidden rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white/80 dark:bg-neutral-900/80 p-4 shadow-sm backdrop-blur-md">
      <div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        <span>Realized P&L</span>
        <UIcon
          name="i-lucide-check-circle-2"
          class="h-4 w-4 text-indigo-500"
        />
      </div>
      <div
        class="mt-2 text-xl font-bold tracking-tight"
        :class="metrics.totalRealizedPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
      >
        {{ metrics.totalRealizedPnL >= 0 ? '+' : '' }}{{ formatCurrency(metrics.totalRealizedPnL) }}
      </div>
      <div class="mt-1 flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
        <span>Booked Closed Trades</span>
      </div>
    </div>

    <!-- 5. Win Rate & Profit Factor -->
    <div class="relative overflow-hidden rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white/80 dark:bg-neutral-900/80 p-4 shadow-sm backdrop-blur-md col-span-2 md:col-span-1">
      <div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        <span>Win Rate / Factor</span>
        <UIcon
          name="i-lucide-target"
          class="h-4 w-4 text-amber-500"
        />
      </div>
      <div class="mt-2 flex items-baseline gap-2">
        <span class="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
          {{ metrics.winRatePercent }}%
        </span>
        <span class="text-xs font-semibold px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
          PF: {{ metrics.profitFactor > 50 ? '∞' : metrics.profitFactor }}
        </span>
      </div>
      <div class="mt-1 flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
        <span>{{ metrics.winningTradesCount }}W / {{ metrics.losingTradesCount }}L ({{ metrics.totalTradesCount }} Closed)</span>
      </div>
    </div>
  </div>
</template>
