<script setup lang="ts">
import type { BacktestMetrics } from '~/types/backtest'

defineProps<{
  metrics: BacktestMetrics
  strategyBreakdown: {
    tag: string
    tradesCount: number
    winRatePercent: number
    netPnL: number
  }[]
}>()

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(val)
}
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <!-- 1. Risk / Reward & Trade Metrics -->
    <div class="rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white dark:bg-neutral-900 p-5 shadow-xs space-y-4">
      <div class="flex items-center justify-between border-b border-neutral-200/60 dark:border-neutral-800/60 pb-3">
        <h4 class="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
          <UIcon
            name="i-lucide-bar-chart-2"
            class="h-4 w-4 text-primary"
          />
          Execution & Risk Metrics
        </h4>
        <span class="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
          {{ metrics.totalTradesCount }} Closed Positions
        </span>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
        <!-- Profit Factor -->
        <div class="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
          <div class="text-[11px] text-neutral-500 dark:text-neutral-400">
            Profit Factor
          </div>
          <div class="mt-1 text-base font-bold text-neutral-900 dark:text-white font-mono">
            {{ metrics.profitFactor > 50 ? '∞' : metrics.profitFactor }}
          </div>
        </div>

        <!-- Win Rate -->
        <div class="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
          <div class="text-[11px] text-neutral-500 dark:text-neutral-400">
            Win Rate
          </div>
          <div class="mt-1 text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
            {{ metrics.winRatePercent }}%
          </div>
        </div>

        <!-- Max Drawdown -->
        <div class="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
          <div class="text-[11px] text-neutral-500 dark:text-neutral-400">
            Max Drawdown
          </div>
          <div class="mt-1 text-base font-bold text-rose-600 dark:text-rose-400 font-mono">
            -{{ metrics.maxDrawdownPercent }}%
          </div>
        </div>

        <!-- Avg Win -->
        <div class="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
          <div class="text-[11px] text-neutral-500 dark:text-neutral-400">
            Average Win
          </div>
          <div class="mt-1 text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
            +{{ formatCurrency(metrics.avgWinAmount) }}
          </div>
        </div>

        <!-- Avg Loss -->
        <div class="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
          <div class="text-[11px] text-neutral-500 dark:text-neutral-400">
            Average Loss
          </div>
          <div class="mt-1 text-sm font-bold text-rose-600 dark:text-rose-400 font-mono">
            -{{ formatCurrency(metrics.avgLossAmount) }}
          </div>
        </div>

        <!-- Largest Win -->
        <div class="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
          <div class="text-[11px] text-neutral-500 dark:text-neutral-400">
            Largest Win
          </div>
          <div class="mt-1 text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
            +{{ formatCurrency(metrics.largestWin) }}
          </div>
        </div>
      </div>
    </div>

    <!-- 2. Strategy Performance Breakdown -->
    <div class="rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white dark:bg-neutral-900 p-5 shadow-xs space-y-4">
      <div class="flex items-center justify-between border-b border-neutral-200/60 dark:border-neutral-800/60 pb-3">
        <h4 class="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
          <UIcon
            name="i-lucide-pie-chart"
            class="h-4 w-4 text-indigo-500"
          />
          Strategy Setups Breakdown
        </h4>
        <span class="text-xs text-neutral-500 dark:text-neutral-400">
          By Realized P&L
        </span>
      </div>

      <div
        v-if="strategyBreakdown.length === 0"
        class="py-8 text-center text-xs text-neutral-400"
      >
        No strategy breakdown available yet. Tag your trades during execution to view setup performance.
      </div>

      <div
        v-else
        class="space-y-3"
      >
        <div
          v-for="s in strategyBreakdown"
          :key="s.tag"
          class="space-y-1.5"
        >
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold text-neutral-900 dark:text-white">{{ s.tag }}</span>
            <div class="flex items-center gap-2 font-mono">
              <span class="text-neutral-500 text-[11px]">{{ s.tradesCount }} trades ({{ s.winRatePercent }}% win)</span>
              <span :class="s.netPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-rose-600 dark:text-rose-400 font-bold'">
                {{ s.netPnL >= 0 ? '+' : '' }}{{ formatCurrency(s.netPnL) }}
              </span>
            </div>
          </div>

          <!-- Mini Progress Bar -->
          <div class="h-1.5 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
            <div
              class="h-full rounded-full transition-all"
              :class="s.netPnL >= 0 ? 'bg-emerald-500' : 'bg-rose-500'"
              :style="{ width: `${Math.min(100, Math.max(10, s.winRatePercent))}%` }"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
