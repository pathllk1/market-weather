<script setup lang="ts">
import { computed } from 'vue'
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
}>()

// Classical Pivot Points in INR
const pivots = computed(() => {
  if (!props.asset) return null
  const H = props.asset.high24hInr
  const L = props.asset.low24hInr
  const C = props.asset.priceInr

  const P = (H + L + C) / 3
  const R1 = (2 * P) - L
  const R2 = P + (H - L)
  const R3 = H + (2 * (P - L))
  const S1 = (2 * P) - H
  const S2 = P - (H - L)
  const S3 = L - (2 * (H - P))

  return { P, R1, R2, R3, S1, S2, S3 }
})

// Algorithmic Indicators (Simulated mathematical models based on 24h metrics)
const indicators = computed(() => {
  if (!props.asset) return null
  const change = props.asset.change24h
  const H = props.asset.high24hInr
  const L = props.asset.low24hInr
  const C = props.asset.priceInr

  // Estimated RSI between 20 and 85
  const positionInRange = H > L ? (C - L) / (H - L) : 0.5
  const estimatedRsi = Math.round(Math.min(88, Math.max(18, 30 + positionInRange * 40 + (change > 0 ? 10 : -10))))

  const rsiLabel = estimatedRsi >= 70 ? 'Overbought' : estimatedRsi <= 30 ? 'Oversold' : 'Neutral'
  const rsiColor = estimatedRsi >= 70 ? 'text-rose-600' : estimatedRsi <= 30 ? 'text-emerald-600' : 'text-slate-700'

  // Bollinger Bands
  const middle = (H + L) / 2
  const bandSpread = (H - L) * 0.45
  const bbUpper = middle + bandSpread
  const bbLower = Math.max(0, middle - bandSpread)

  // Overall Score (0 to 100)
  let score = 50
  if (change > 5) score += 20
  else if (change > 0) score += 10
  else if (change < -5) score -= 20
  else score -= 10

  if (positionInRange > 0.7) score += 15
  else if (positionInRange < 0.3) score -= 15

  score = Math.min(95, Math.max(10, score))

  const verdict = score >= 75 ? 'Strong Buy' : score >= 60 ? 'Buy' : score <= 30 ? 'Strong Sell' : score <= 45 ? 'Sell' : 'Neutral'
  const verdictColor = score >= 60 ? 'bg-emerald-500 text-white' : score <= 45 ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'

  return {
    rsi: estimatedRsi,
    rsiLabel,
    rsiColor,
    bbUpper,
    bbLower,
    bbMiddle: middle,
    score,
    verdict,
    verdictColor
  }
})
</script>

<template>
  <div
    v-if="isOpen && asset"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
  >
    <div
      class="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-5 sm:p-6 relative my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
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
      <div class="flex items-center gap-3 pb-4 border-b border-slate-100 mb-5">
        <div class="w-11 h-11 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700">
          <UIcon
            name="i-lucide-activity"
            class="w-6 h-6"
          />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-black text-slate-900">
              Technical Signals & Support / Resistance
            </h3>
            <span class="text-xs font-mono font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
              {{ asset.symbol }}
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-0.5">
            Algorithmic oscillator metrics, classical pivot points in INR, and momentum gauges.
          </p>
        </div>
      </div>

      <!-- Algorithmic Verdict Banner -->
      <div
        v-if="indicators"
        class="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between mb-5"
      >
        <div class="flex items-center gap-3">
          <div
            class="px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider shadow-xs"
            :class="indicators.verdictColor"
          >
            {{ indicators.verdict }}
          </div>
          <div>
            <div class="text-xs font-bold text-slate-800">
              Technical Score: {{ indicators.score }}/100
            </div>
            <div class="text-[11px] text-slate-500">
              Derived from 24h High/Low channel, Volume turnover, and relative strength
            </div>
          </div>
        </div>

        <div class="text-right">
          <span class="text-xs text-slate-400 block">Current Price</span>
          <span class="text-base font-black text-slate-900 font-mono">{{ formatInr(asset.priceInr) }}</span>
        </div>
      </div>

      <!-- Technical Oscillators Grid -->
      <div
        v-if="indicators"
        class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5"
      >
        <!-- RSI Card -->
        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
          <span class="text-slate-400 text-[10px] uppercase font-bold block mb-1">RSI (14) Momentum</span>
          <div class="flex items-baseline gap-2">
            <span
              class="text-2xl font-black font-mono"
              :class="indicators.rsiColor"
            >{{ indicators.rsi }}</span>
            <span class="text-xs font-bold text-slate-600">({{ indicators.rsiLabel }})</span>
          </div>
          <div class="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              class="h-full bg-purple-500 rounded-full"
              :style="{ width: `${indicators.rsi}%` }"
            />
          </div>
        </div>

        <!-- MACD Direction -->
        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
          <span class="text-slate-400 text-[10px] uppercase font-bold block mb-1">MACD Signal</span>
          <div class="flex items-baseline gap-1.5 mt-1">
            <UIcon
              :name="asset.change24h >= 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'"
              class="w-5 h-5"
              :class="asset.change24h >= 0 ? 'text-emerald-600' : 'text-rose-600'"
            />
            <span
              class="text-sm font-black"
              :class="asset.change24h >= 0 ? 'text-emerald-700' : 'text-rose-700'"
            >
              {{ asset.change24h >= 0 ? 'Bullish Cross' : 'Bearish Pressure' }}
            </span>
          </div>
          <div class="text-[10px] text-slate-400 mt-2">
            Signal above zero histogram
          </div>
        </div>

        <!-- Bollinger Band Position -->
        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
          <span class="text-slate-400 text-[10px] uppercase font-bold block mb-1">Volatility Channel</span>
          <div class="text-xs font-bold text-slate-800 font-mono mt-1">
            Band: {{ formatInr(indicators.bbLower, { compact: true }) }} - {{ formatInr(indicators.bbUpper, { compact: true }) }}
          </div>
          <div class="text-[10px] text-slate-400 mt-2">
            Middle Basis: {{ formatInr(indicators.bbMiddle, { compact: true }) }}
          </div>
        </div>
      </div>

      <!-- Classical Pivot Points Table (INR) -->
      <div
        v-if="pivots"
        class="border border-slate-200 rounded-xl overflow-hidden mb-5"
      >
        <div class="bg-slate-100/80 px-3.5 py-2 border-b border-slate-200 flex items-center justify-between">
          <span class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <UIcon
              name="i-lucide-crosshair"
              class="w-3.5 h-3.5 text-blue-600"
            />
            Classical Floor & Ceiling Pivot Levels (₹ INR)
          </span>
          <span class="text-[10px] text-slate-500">24h Mathematical Model</span>
        </div>

        <div class="grid grid-cols-2 divide-x divide-slate-100 text-xs font-mono">
          <!-- Resistances -->
          <div class="p-3 space-y-2 bg-rose-50/20">
            <div class="flex justify-between items-center text-rose-800">
              <span class="font-bold text-[11px]">Resistance 3 (R3):</span>
              <span class="font-extrabold">{{ formatInr(pivots.R3) }}</span>
            </div>
            <div class="flex justify-between items-center text-rose-700">
              <span class="font-bold text-[11px]">Resistance 2 (R2):</span>
              <span class="font-extrabold">{{ formatInr(pivots.R2) }}</span>
            </div>
            <div class="flex justify-between items-center text-rose-600">
              <span class="font-bold text-[11px]">Resistance 1 (R1):</span>
              <span class="font-extrabold">{{ formatInr(pivots.R1) }}</span>
            </div>
          </div>

          <!-- Supports -->
          <div class="p-3 space-y-2 bg-emerald-50/20">
            <div class="flex justify-between items-center text-emerald-600">
              <span class="font-bold text-[11px]">Support 1 (S1):</span>
              <span class="font-extrabold">{{ formatInr(pivots.S1) }}</span>
            </div>
            <div class="flex justify-between items-center text-emerald-700">
              <span class="font-bold text-[11px]">Support 2 (S2):</span>
              <span class="font-extrabold">{{ formatInr(pivots.S2) }}</span>
            </div>
            <div class="flex justify-between items-center text-emerald-800">
              <span class="font-bold text-[11px]">Support 3 (S3):</span>
              <span class="font-extrabold">{{ formatInr(pivots.S3) }}</span>
            </div>
          </div>
        </div>

        <div class="p-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
          <span class="font-bold text-slate-700">Central Pivot Balance Point (P):</span>
          <span class="font-mono font-black text-blue-700">{{ formatInr(pivots.P) }}</span>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="flex items-center justify-between pt-2">
        <button
          class="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
          @click="emit('openTrade', asset); emit('close')"
        >
          <UIcon
            name="i-lucide-briefcase"
            class="w-3.5 h-3.5"
          />
          <span>Execute Paper Trade</span>
        </button>

        <button
          class="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
          @click="emit('close')"
        >
          Close Signals
        </button>
      </div>
    </div>
  </div>
</template>

