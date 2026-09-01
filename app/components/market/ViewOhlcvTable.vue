<script setup lang="ts">
import type { ViewEquityOhlcv } from '~/types/market'

defineProps<{
  equities: ViewEquityOhlcv[]
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'inspect' | 'remove', symbol: string): void
}>()

function formatPrice(val: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(val)
}

function formatVolume(val: number): string {
  if (val >= 10_000_000) return (val / 10_000_000).toFixed(2) + ' Cr'
  if (val >= 100_000) return (val / 100_000).toFixed(2) + ' L'
  if (val >= 1_000) return (val / 1_000).toFixed(1) + ' K'
  return val ? val.toString() : '—'
}

function getRangePercentage(equity: ViewEquityOhlcv): number {
  if (equity.high <= equity.low) return 50
  const pct = ((equity.price - equity.low) / (equity.high - equity.low)) * 100
  return Math.max(0, Math.min(100, pct))
}

function cleanSymbol(sym: string): string {
  return sym.replace(/\.NS$/, '')
}

function getRsiColor(rsi?: number) {
  if (rsi === undefined || rsi === null) return 'neutral'
  if (rsi >= 70) return 'error'
  if (rsi <= 35) return 'warning'
  return 'neutral'
}

function getScoreColor(score?: number) {
  if (score === undefined || score === null) return 'neutral'
  if (score >= 75) return 'success'
  if (score >= 50) return 'primary'
  if (score >= 35) return 'warning'
  return 'error'
}
</script>

<template>
  <div class="w-full overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm">
    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-left text-xs">
        <thead>
          <tr class="select-none border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/80 font-bold uppercase tracking-wider text-[11px] text-neutral-600 dark:text-neutral-300">
            <th class="px-4 py-3.5">
              Symbol & Company
            </th>
            <th class="px-4 py-3.5 text-right font-mono">
              LTP (Price)
            </th>
            <th class="px-4 py-3.5 text-right font-mono">
              Day Change
            </th>
            <th class="px-4 py-3.5 text-right font-mono">
              Open
            </th>
            <th class="px-4 py-3.5 text-right font-mono text-emerald-600 dark:text-emerald-400">
              High
            </th>
            <th class="px-4 py-3.5 text-right font-mono text-rose-600 dark:text-rose-400">
              Low
            </th>
            <th class="px-4 py-3.5 text-right font-mono">
              Prev Close
            </th>
            <th class="px-4 py-3.5 text-center min-w-[140px]">
              Day's Range
            </th>
            <th class="px-4 py-3.5 text-right font-mono">
              Volume
            </th>
            <th class="px-4 py-3.5 text-center">
              RSI (14)
            </th>
            <th class="px-4 py-3.5 text-center">
              Supertrend
            </th>
            <th class="px-4 py-3.5 text-center">
              Quant Score
            </th>
            <th class="px-4 py-3.5 text-right">
              Actions
            </th>
          </tr>
        </thead>

        <tbody class="divide-y divide-neutral-100 dark:divide-neutral-800/80">
          <tr
            v-for="equity in equities"
            :key="equity.symbol"
            class="group cursor-pointer transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
            @click="emit('inspect', equity.symbol)"
          >
            <!-- Symbol & Company Name -->
            <td class="px-4 py-3.5">
              <div class="flex items-center gap-2">
                <div>
                  <div class="flex items-center gap-1.5 font-extrabold text-sm text-neutral-900 dark:text-white">
                    <span>{{ cleanSymbol(equity.symbol) }}</span>
                    <span class="rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-neutral-600 dark:text-neutral-400">NSE</span>
                    <span
                      v-if="equity.isLive"
                      class="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400"
                      title="Real-time quote via Yahoo Finance"
                    >
                      <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                      Live
                    </span>
                  </div>
                  <div class="max-w-[200px] truncate text-xs font-normal text-neutral-500 dark:text-neutral-400">
                    {{ equity.companyName }}
                  </div>
                </div>
              </div>
            </td>

            <!-- Price -->
            <td class="px-4 py-3.5 text-right font-mono text-sm font-black text-neutral-900 dark:text-white">
              {{ formatPrice(equity.price) }}
            </td>

            <!-- Day Change -->
            <td class="px-4 py-3.5 text-right font-mono">
              <div
                class="font-bold inline-flex items-center gap-0.5 text-xs"
                :class="equity.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
              >
                <UIcon
                  :name="equity.change >= 0 ? 'i-lucide-arrow-up-right' : 'i-lucide-arrow-down-right'"
                  class="h-3.5 w-3.5 stroke-[2.5]"
                />
                <span>{{ equity.change >= 0 ? '+' : '' }}{{ equity.changePercent.toFixed(2) }}%</span>
              </div>
              <div class="text-[10px] text-neutral-500 dark:text-neutral-400">
                {{ equity.change >= 0 ? '+' : '' }}{{ equity.change.toFixed(2) }}
              </div>
            </td>

            <!-- Open -->
            <td class="px-4 py-3.5 text-right font-mono text-neutral-800 dark:text-neutral-200 font-semibold text-xs">
              {{ formatPrice(equity.open) }}
            </td>

            <!-- High -->
            <td class="px-4 py-3.5 text-right font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
              {{ formatPrice(equity.high) }}
            </td>

            <!-- Low -->
            <td class="px-4 py-3.5 text-right font-mono font-bold text-xs text-rose-600 dark:text-rose-400">
              {{ formatPrice(equity.low) }}
            </td>

            <!-- Close / Prev -->
            <td class="px-4 py-3.5 text-right font-mono text-neutral-600 dark:text-neutral-400 font-medium text-xs">
              {{ formatPrice(equity.close) }}
            </td>

            <!-- Day's Range Visual Progress Bar -->
            <td class="px-4 py-3.5">
              <div class="flex flex-col gap-1 text-[10px] font-mono text-neutral-500 dark:text-neutral-400">
                <div class="flex items-center justify-between font-medium">
                  <span>{{ formatPrice(equity.low) }}</span>
                  <span>{{ formatPrice(equity.high) }}</span>
                </div>
                <div class="relative h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                  <div
                    class="h-full rounded-full"
                    :class="equity.change >= 0 ? 'bg-emerald-500' : 'bg-rose-500'"
                    :style="{ width: `${getRangePercentage(equity)}%` }"
                  />
                </div>
              </div>
            </td>

            <!-- Volume -->
            <td class="px-4 py-3.5 text-right font-mono text-neutral-800 dark:text-neutral-200 font-semibold text-xs">
              {{ formatVolume(equity.volume) }}
            </td>

            <!-- RSI (14) -->
            <td class="p-3 text-center font-mono">
              <UBadge
                v-if="equity.rsi !== undefined"
                :color="getRsiColor(equity.rsi) as any"
                variant="subtle"
                size="xs"
              >
                {{ equity.rsi.toFixed(1) }}
              </UBadge>
              <span
                v-else
                class="text-muted-foreground"
              >—</span>
            </td>

            <!-- Supertrend -->
            <td class="p-3 text-center">
              <UBadge
                v-if="equity.supertrendTrend"
                :color="equity.supertrendTrend.toLowerCase() === 'bullish' ? 'success' : 'error'"
                variant="subtle"
                size="xs"
              >
                {{ equity.supertrendTrend }}
              </UBadge>
              <span
                v-else
                class="text-muted-foreground"
              >—</span>
            </td>

            <!-- Quant Score -->
            <td class="p-3 text-center">
              <UBadge
                :color="getScoreColor(equity.overallScore) as any"
                variant="solid"
                size="xs"
                class="font-mono font-bold px-2 py-0.5"
              >
                {{ equity.overallScore }}
              </UBadge>
            </td>

            <!-- Actions -->
            <td
              class="p-3 text-right"
              @click.stop
            >
              <div class="flex items-center justify-end gap-1">
                <UButton
                  size="xs"
                  color="primary"
                  variant="soft"
                  icon="i-lucide-candlestick-chart"
                  title="Inspect Technical Chart"
                  @click="emit('inspect', equity.symbol)"
                >
                  Analyze
                </UButton>

                <button
                  type="button"
                  class="rounded p-1 text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-500"
                  title="Remove from this view"
                  @click="emit('remove', equity.symbol)"
                >
                  <UIcon
                    name="i-lucide-x"
                    class="h-3.5 w-3.5"
                  />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
