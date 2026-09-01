<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  signals: {
    rsi: { value: number, bias: string }
    macd: { line: number, signal: number, hist: number, bias: string }
    supertrend: { trend: string, value: number }
    volatility: { bbUpper: number, bbMiddle: number, bbLower: number, atr: number }
    momentum: {
      adx: number
      plusDi: number
      minusDi: number
      stochK: number
      stochD: number
      mfi: number
      williamsR: number
      cci: number
      roc: number
    }
    volume: { obv: number, vwap: number }
    movingAverages: {
      sma10: number
      sma20: number
      sma30: number
      sma50: number
      sma100: number
      sma200: number
      ema10: number
      ema20: number
      ema30: number
      ema50: number
      ema100: number
      ema200: number
    }
  }
  currentPrice: number
}>()

const rsiColor = computed(() => {
  const r = props.signals?.rsi?.value ?? 50
  if (r >= 70) return 'error'
  if (r <= 30) return 'warning'
  return 'primary'
})

const adxStrength = computed(() => {
  const adx = props.signals?.momentum?.adx ?? 0
  if (adx >= 40) return { label: 'Very Strong Trend', color: 'success' }
  if (adx >= 25) return { label: 'Strong Trend', color: 'primary' }
  return { label: 'Weak / Ranging', color: 'neutral' }
})

const maList = computed(() => {
  if (!props.signals?.movingAverages || !props.currentPrice) return []
  const ma = props.signals.movingAverages
  const p = props.currentPrice

  return [
    { name: 'EMA 10', val: ma.ema10 },
    { name: 'EMA 20', val: ma.ema20 },
    { name: 'EMA 50', val: ma.ema50 },
    { name: 'EMA 100', val: ma.ema100 },
    { name: 'EMA 200', val: ma.ema200 },
    { name: 'SMA 20', val: ma.sma20 },
    { name: 'SMA 50', val: ma.sma50 },
    { name: 'SMA 200', val: ma.sma200 }
  ].map((item) => {
    const diff = ((p - item.val) / item.val) * 100
    return {
      ...item,
      diff: Number(diff.toFixed(2)),
      isAbove: p >= item.val
    }
  })
})

function formatLargeNumber(n?: number) {
  if (n === undefined || n === null) return 'N/A'
  if (Math.abs(n) >= 10000000) return (n / 10000000).toFixed(2) + ' Cr'
  if (Math.abs(n) >= 100000) return (n / 100000).toFixed(2) + ' L'
  return n.toLocaleString()
}
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 w-full text-xs">
    <!-- 1. Momentum Panel -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-gauge"
              class="text-primary text-base"
            />
            <h4 class="font-semibold text-sm">
              Momentum Indicators
            </h4>
          </div>
          <UBadge
            :color="signals.rsi.bias === 'Overbought' ? 'error' : signals.rsi.bias === 'Oversold' ? 'warning' : 'neutral'"
            variant="subtle"
            size="xs"
          >
            RSI: {{ signals.rsi.bias }}
          </UBadge>
        </div>
      </template>

      <div class="space-y-4">
        <!-- RSI Meter -->
        <div class="space-y-1.5">
          <div class="flex justify-between items-center text-xs">
            <span class="text-muted">Relative Strength Index (RSI 14)</span>
            <span class="font-mono font-bold">{{ signals.rsi.value?.toFixed(1) }}</span>
          </div>
          <UProgress
            :model-value="signals.rsi.value"
            :max="100"
            :color="rsiColor"
            size="sm"
          />
          <div class="flex justify-between text-[10px] text-muted">
            <span>Oversold (&lt;30)</span>
            <span>Neutral (50)</span>
            <span>Overbought (&gt;70)</span>
          </div>
        </div>

        <!-- Key Momentum Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-default">
          <div class="p-2 rounded bg-muted/20 border border-default space-y-0.5">
            <span class="text-[10px] text-muted block">Stoch %K / %D</span>
            <span class="font-mono font-semibold">{{ signals.momentum.stochK?.toFixed(1) }} / {{ signals.momentum.stochD?.toFixed(1) }}</span>
          </div>

          <div class="p-2 rounded bg-muted/20 border border-default space-y-0.5">
            <span class="text-[10px] text-muted block">Money Flow (MFI)</span>
            <span class="font-mono font-semibold">{{ signals.momentum.mfi?.toFixed(1) }}</span>
          </div>

          <div class="p-2 rounded bg-muted/20 border border-default space-y-0.5">
            <span class="text-[10px] text-muted block">Williams %R</span>
            <span class="font-mono font-semibold">{{ signals.momentum.williamsR?.toFixed(1) }}</span>
          </div>

          <div class="p-2 rounded bg-muted/20 border border-default space-y-0.5">
            <span class="text-[10px] text-muted block">Commodity Channel (CCI)</span>
            <span class="font-mono font-semibold">{{ signals.momentum.cci?.toFixed(1) }}</span>
          </div>

          <div class="p-2 rounded bg-muted/20 border border-default space-y-0.5">
            <span class="text-[10px] text-muted block">Rate of Change (ROC)</span>
            <span
              class="font-mono font-semibold"
              :class="signals.momentum.roc >= 0 ? 'text-success' : 'text-error'"
            >
              {{ signals.momentum.roc >= 0 ? '+' : '' }}{{ signals.momentum.roc?.toFixed(2) }}%
            </span>
          </div>

          <div class="p-2 rounded bg-muted/20 border border-default space-y-0.5">
            <span class="text-[10px] text-muted block">ADX Trend Strength</span>
            <span class="font-mono font-semibold">{{ signals.momentum.adx?.toFixed(1) }}</span>
          </div>
        </div>
      </div>
    </UCard>

    <!-- 2. Trend & Directional Panel -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-trending-up"
              class="text-primary text-base"
            />
            <h4 class="font-semibold text-sm">
              Trend & Directional Bias
            </h4>
          </div>
          <UBadge
            :color="signals.supertrend.trend === 'Bullish' ? 'success' : 'error'"
            variant="subtle"
            size="xs"
          >
            Supertrend: {{ signals.supertrend.trend }}
          </UBadge>
        </div>
      </template>

      <div class="space-y-4">
        <!-- Supertrend & ADX Summary -->
        <div class="grid grid-cols-2 gap-3">
          <div class="p-2.5 rounded-lg border border-default bg-muted/20 space-y-1">
            <span class="text-[10px] text-muted block">Supertrend Level</span>
            <div class="font-mono text-sm font-bold">
              ₹{{ signals.supertrend.value?.toFixed(2) }}
            </div>
            <span class="text-[10px] text-muted">Trailing Stop Price</span>
          </div>

          <div class="p-2.5 rounded-lg border border-default bg-muted/20 space-y-1">
            <span class="text-[10px] text-muted block">ADX Trend Rating</span>
            <div class="font-semibold text-sm">
              <UBadge
                :color="adxStrength.color as any"
                variant="subtle"
                size="xs"
              >
                {{ adxStrength.label }}
              </UBadge>
            </div>
            <span class="text-[10px] text-muted font-mono">+DI: {{ signals.momentum.plusDi?.toFixed(1) }} • -DI: {{ signals.momentum.minusDi?.toFixed(1) }}</span>
          </div>
        </div>

        <!-- MACD Analysis Card -->
        <div class="p-3 border border-default rounded-lg space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-xs">MACD (12, 26, 9)</span>
            <UBadge
              :color="signals.macd.bias === 'Bullish' ? 'success' : 'error'"
              variant="subtle"
              size="xs"
            >
              {{ signals.macd.bias }} Crossover
            </UBadge>
          </div>

          <div class="grid grid-cols-3 gap-2 font-mono text-xs">
            <div>
              <span class="text-muted text-[10px] block">MACD Line</span>
              <span>{{ signals.macd.line?.toFixed(2) }}</span>
            </div>
            <div>
              <span class="text-muted text-[10px] block">Signal Line</span>
              <span>{{ signals.macd.signal?.toFixed(2) }}</span>
            </div>
            <div>
              <span class="text-muted text-[10px] block">Histogram</span>
              <span
                :class="signals.macd.hist >= 0 ? 'text-success' : 'text-error'"
                class="font-bold"
              >
                {{ signals.macd.hist >= 0 ? '+' : '' }}{{ signals.macd.hist?.toFixed(2) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- 3. Volatility & Volume Profile -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-activity"
            class="text-primary text-base"
          />
          <h4 class="font-semibold text-sm">
            Volatility & Volume Profile
          </h4>
        </div>
      </template>

      <div class="space-y-3">
        <!-- Bollinger Bands Spread -->
        <div class="p-2.5 border border-default rounded-lg space-y-2">
          <span class="text-xs font-semibold block">Bollinger Bands (20, 2)</span>
          <div class="grid grid-cols-3 gap-2 font-mono text-xs">
            <div>
              <span class="text-muted text-[10px] block">Upper Band</span>
              <span class="text-primary font-medium">₹{{ signals.volatility.bbUpper?.toFixed(2) }}</span>
            </div>
            <div>
              <span class="text-muted text-[10px] block">Middle (SMA20)</span>
              <span>₹{{ signals.volatility.bbMiddle?.toFixed(2) }}</span>
            </div>
            <div>
              <span class="text-muted text-[10px] block">Lower Band</span>
              <span class="text-primary font-medium">₹{{ signals.volatility.bbLower?.toFixed(2) }}</span>
            </div>
          </div>
        </div>

        <!-- ATR, VWAP, OBV -->
        <div class="grid grid-cols-3 gap-2">
          <div class="p-2 border border-default rounded bg-muted/20 space-y-0.5">
            <span class="text-[10px] text-muted block">ATR (14-Day)</span>
            <div class="font-mono font-semibold">
              ₹{{ signals.volatility.atr?.toFixed(2) }}
            </div>
          </div>

          <div class="p-2 border border-default rounded bg-muted/20 space-y-0.5">
            <span class="text-[10px] text-muted block">VWAP</span>
            <div class="font-mono font-semibold">
              ₹{{ signals.volume.vwap?.toFixed(2) }}
            </div>
          </div>

          <div class="p-2 border border-default rounded bg-muted/20 space-y-0.5">
            <span class="text-[10px] text-muted block">On-Balance Vol</span>
            <div class="font-mono font-semibold">
              {{ formatLargeNumber(signals.volume.obv) }}
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- 4. Moving Average Stack -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-layers"
            class="text-primary text-base"
          />
          <h4 class="font-semibold text-sm">
            Moving Average Alignment
          </h4>
        </div>
      </template>

      <div class="space-y-1.5 divide-y divide-default max-h-56 overflow-y-auto pr-1">
        <div
          v-for="item in maList"
          :key="item.name"
          class="pt-1.5 first:pt-0 flex items-center justify-between"
        >
          <span class="font-medium text-muted">{{ item.name }}</span>
          <div class="flex items-center gap-2 font-mono">
            <span>₹{{ item.val?.toFixed(2) }}</span>
            <UBadge
              :color="item.isAbove ? 'success' : 'error'"
              variant="subtle"
              size="xs"
              class="w-16 justify-center"
            >
              {{ item.isAbove ? '+' : '' }}{{ item.diff }}%
            </UBadge>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
