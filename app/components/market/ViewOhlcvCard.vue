<script setup lang="ts">
import type { ViewEquityOhlcv } from '~/types/market'

const props = defineProps<{
  equity: ViewEquityOhlcv
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
  return val.toString()
}

// Calculate where the current price sits between dayLow and dayHigh (0 to 100%)
const dayRangePercentage = computed(() => {
  const low = props.equity.low
  const high = props.equity.high
  const price = props.equity.price
  if (high <= low) return 50
  const pct = ((price - low) / (high - low)) * 100
  return Math.max(0, Math.min(100, pct))
})

const cleanSymbol = computed(() => props.equity.symbol.replace(/\.NS$/, ''))
</script>

<template>
  <div class="group relative rounded-xl border border-default/70 bg-surface/80 p-4 shadow-sm backdrop-blur-md transition-all hover:border-primary/40 hover:shadow-md">
    <!-- Header -->
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-base font-bold tracking-tight text-highlight">{{ cleanSymbol }}</span>
          <span class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">NSE</span>
          <span
            v-if="equity.isLive"
            class="flex items-center gap-1 text-[10px] font-medium text-emerald-500"
            title="Real-time quote via Yahoo Finance"
          >
            <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live
          </span>
          <span
            v-else
            class="text-[10px] font-medium text-muted-foreground"
            title="Last recorded closing snapshot"
          >
            Snapshot
          </span>
        </div>
        <p class="truncate text-xs text-muted-foreground">
          {{ equity.companyName }}
        </p>
      </div>

      <!-- Overall Quant Score Pill -->
      <div class="flex items-center gap-1.5">
        <div
          class="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
          :class="equity.overallScore >= 70 ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : equity.overallScore <= 40 ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'"
        >
          <span class="text-[10px] text-muted-foreground">Score</span>
          <span>{{ equity.overallScore }}</span>
        </div>

        <!-- Remove from view button -->
        <button
          type="button"
          class="rounded p-1 text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-500"
          title="Remove equity from view"
          @click="emit('remove', equity.symbol)"
        >
          <UIcon
            name="i-lucide-x"
            class="h-3.5 w-3.5"
          />
        </button>
      </div>
    </div>

    <!-- Current Price & Change Header -->
    <div class="mt-3 flex items-baseline justify-between">
      <div class="text-xl font-extrabold tracking-tight text-highlight">
        {{ formatPrice(equity.price) }}
      </div>
      <div
        class="inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-xs font-bold"
        :class="equity.change >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'"
      >
        <UIcon
          :name="equity.change >= 0 ? 'i-lucide-arrow-up-right' : 'i-lucide-arrow-down-right'"
          class="h-3.5 w-3.5"
        />
        <span>{{ equity.change >= 0 ? '+' : '' }}{{ equity.change.toFixed(2) }} ({{ equity.changePercent.toFixed(2) }}%)</span>
      </div>
    </div>

    <!-- OHLCV Matrix -->
    <div class="mt-3 grid grid-cols-5 gap-1.5 rounded-lg border border-default/50 bg-muted/20 p-2 text-center text-xs">
      <div>
        <span class="block text-[10px] font-medium text-muted-foreground">OPEN</span>
        <span class="font-semibold text-highlight">{{ formatPrice(equity.open) }}</span>
      </div>
      <div>
        <span class="block text-[10px] font-medium text-muted-foreground">HIGH</span>
        <span class="font-semibold text-emerald-500">{{ formatPrice(equity.high) }}</span>
      </div>
      <div>
        <span class="block text-[10px] font-medium text-muted-foreground">LOW</span>
        <span class="font-semibold text-rose-500">{{ formatPrice(equity.low) }}</span>
      </div>
      <div>
        <span class="block text-[10px] font-medium text-muted-foreground">PREV</span>
        <span class="font-semibold text-highlight">{{ formatPrice(equity.close) }}</span>
      </div>
      <div>
        <span class="block text-[10px] font-medium text-muted-foreground">VOL</span>
        <span class="font-semibold text-highlight">{{ formatVolume(equity.volume) }}</span>
      </div>
    </div>

    <!-- Day Range Visual Slider -->
    <div class="mt-3">
      <div class="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Low: {{ formatPrice(equity.low) }}</span>
        <span class="font-medium text-foreground">Day's Range</span>
        <span>High: {{ formatPrice(equity.high) }}</span>
      </div>
      <div class="relative h-2 w-full overflow-hidden rounded-full bg-default/40">
        <!-- Progress track from low to current price -->
        <div
          class="h-full rounded-full transition-all duration-300"
          :class="equity.change >= 0 ? 'bg-emerald-500/80' : 'bg-rose-500/80'"
          :style="{ width: `${dayRangePercentage}%` }"
        />
        <!-- Pinpoint Marker -->
        <div
          class="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-highlight shadow-sm"
          :style="{ left: `${dayRangePercentage}%` }"
        />
      </div>
    </div>

    <!-- Technical Indicators Pills & Inspect Chart Button -->
    <div class="mt-3 flex items-center justify-between border-t border-default/40 pt-2.5">
      <div class="flex items-center gap-1.5 text-[11px]">
        <span
          v-if="equity.rsi !== undefined"
          class="rounded px-1.5 py-0.5 font-medium"
          :class="equity.rsi <= 35 ? 'bg-emerald-500/10 text-emerald-500' : equity.rsi >= 70 ? 'bg-rose-500/10 text-rose-500' : 'bg-muted text-muted-foreground'"
        >
          RSI {{ equity.rsi.toFixed(1) }}
        </span>

        <span
          v-if="equity.supertrendTrend"
          class="rounded px-1.5 py-0.5 font-medium"
          :class="equity.supertrendTrend.toLowerCase() === 'bullish' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'"
        >
          {{ equity.supertrendTrend }}
        </span>
      </div>

      <UButton
        size="xs"
        variant="ghost"
        color="primary"
        icon="i-lucide-candlestick-chart"
        @click="emit('inspect', equity.symbol)"
      >
        Analyze
      </UButton>
    </div>
  </div>
</template>
