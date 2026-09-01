<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

export interface Candle {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const props = defineProps<{
  symbol: string
  initialRange?: string
}>()

const activeRange = ref(props.initialRange || '6M')
const showSma20 = ref(true)
const showSma50 = ref(true)

const isLoading = ref(false)
const candles = ref<Candle[]>([])
const stats = ref({
  periodHigh: 0,
  periodLow: 0,
  avgVolume: 0,
  periodReturn: 0
})

const hoveredIndex = ref<number | null>(null)
const mouseX = ref(0)
const mouseY = ref(0)

const ranges = ['1M', '3M', '6M', '1Y', 'ALL']

async function fetchCandles() {
  if (!props.symbol) return
  try {
    isLoading.value = true
    const res = await $fetch<{
      candles: Candle[]
      stats: { periodHigh: number, periodLow: number, avgVolume: number, periodReturn: number }
    }>('/api/market/candles', {
      query: {
        symbol: props.symbol,
        range: activeRange.value
      }
    })
    candles.value = res.candles || []
    stats.value = res.stats || { periodHigh: 0, periodLow: 0, avgVolume: 0, periodReturn: 0 }
    hoveredIndex.value = null
  } catch (err) {
    console.error('Failed to fetch candles:', err)
  } finally {
    isLoading.value = false
  }
}

watch([() => props.symbol, activeRange], () => {
  fetchCandles()
})

onMounted(() => {
  fetchCandles()
})

// Chart dimensions
const chartWidth = 900
const chartHeight = 420
const padding = { top: 20, right: 65, bottom: 45, left: 10 }
const priceAreaHeight = chartHeight - padding.bottom - padding.top - 70
const volumeAreaTop = chartHeight - padding.bottom - 60
const volumeAreaHeight = 55

// Moving averages calculation
function calculateSma(data: Candle[], period: number) {
  const result: (number | null)[] = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else {
      let sum = 0
      for (let j = 0; j < period; j++) {
        sum += data[i - j]!.close
      }
      result.push(sum / period)
    }
  }
  return result
}

const sma20Series = computed(() => calculateSma(candles.value, 20))
const sma50Series = computed(() => calculateSma(candles.value, 50))

// Scaling calculations
const priceBounds = computed(() => {
  if (candles.value.length === 0) return { min: 0, max: 100 }
  let min = Infinity
  let max = -Infinity
  for (const c of candles.value) {
    if (c.low < min) min = c.low
    if (c.high > max) max = c.high
  }
  const buffer = (max - min) * 0.05 || 1
  return { min: min - buffer, max: max + buffer }
})

const maxVolume = computed(() => {
  if (candles.value.length === 0) return 1
  return Math.max(...candles.value.map(c => c.volume), 1)
})

function getY(price: number) {
  const { min, max } = priceBounds.value
  if (max === min) return padding.top + priceAreaHeight / 2
  return padding.top + priceAreaHeight - ((price - min) / (max - min)) * priceAreaHeight
}

function getVolumeY(vol: number) {
  return volumeAreaTop + volumeAreaHeight - (vol / maxVolume.value) * volumeAreaHeight
}

const candleWidth = computed(() => {
  const count = candles.value.length
  if (count === 0) return 4
  const availableWidth = chartWidth - padding.left - padding.right
  return Math.max(2, Math.min(18, (availableWidth / count) * 0.7))
})

function getX(index: number) {
  const count = candles.value.length
  if (count <= 1) return padding.left + (chartWidth - padding.left - padding.right) / 2
  const availableWidth = chartWidth - padding.left - padding.right
  return padding.left + (index / (count - 1)) * availableWidth
}

// Generate path for moving averages
function generateLinePath(series: (number | null)[]) {
  let path = ''
  let started = false
  for (let i = 0; i < series.length; i++) {
    const val = series[i]
    if (val !== null && val !== undefined) {
      const x = getX(i)
      const y = getY(val)
      if (!started) {
        path += `M ${x.toFixed(1)} ${y.toFixed(1)}`
        started = true
      } else {
        path += ` L ${x.toFixed(1)} ${y.toFixed(1)}`
      }
    }
  }
  return path
}

const sma20Path = computed(() => generateLinePath(sma20Series.value))
const sma50Path = computed(() => generateLinePath(sma50Series.value))

// Price grid lines
const priceGridLines = computed(() => {
  const { min, max } = priceBounds.value
  const steps = 5
  const stepVal = (max - min) / steps
  const lines = []
  for (let i = 0; i <= steps; i++) {
    const p = min + stepVal * i
    lines.push({
      price: p.toFixed(2),
      y: getY(p)
    })
  }
  return lines
})

// Time grid labels (show 5-6 sample dates along bottom)
const timeLabels = computed(() => {
  const count = candles.value.length
  if (count === 0) return []
  const step = Math.max(1, Math.floor(count / 5))
  const labels = []
  for (let i = 0; i < count; i += step) {
    labels.push({
      date: candles.value[i]!.date,
      x: getX(i)
    })
  }
  return labels
})

// Mouse Interaction
function handleMouseMove(e: MouseEvent) {
  const target = e.currentTarget as SVGElement
  const rect = target.getBoundingClientRect()
  const rawX = ((e.clientX - rect.left) / rect.width) * chartWidth
  const rawY = ((e.clientY - rect.top) / rect.height) * chartHeight

  mouseX.value = rawX
  mouseY.value = rawY

  const count = candles.value.length
  if (count === 0) return

  const availableWidth = chartWidth - padding.left - padding.right
  const normalizedX = (rawX - padding.left) / availableWidth
  let index = Math.round(normalizedX * (count - 1))
  index = Math.max(0, Math.min(count - 1, index))
  hoveredIndex.value = index
}

function handleMouseLeave() {
  hoveredIndex.value = null
}

const activeCandle = computed(() => {
  if (hoveredIndex.value !== null && candles.value[hoveredIndex.value]) {
    return candles.value[hoveredIndex.value]
  }
  if (candles.value.length > 0) {
    return candles.value[candles.value.length - 1]
  }
  return null
})

function formatVolume(val: number) {
  if (val >= 10000000) return (val / 10000000).toFixed(2) + ' Cr'
  if (val >= 100000) return (val / 100000).toFixed(2) + ' L'
  if (val >= 1000) return (val / 1000).toFixed(1) + ' K'
  return val.toLocaleString()
}
</script>

<template>
  <div class="space-y-3 w-full">
    <!-- Chart Header Controls & Stats -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-default pb-3">
      <!-- Timeframe Selector -->
      <div class="flex items-center gap-1">
        <span class="text-xs text-muted mr-1 font-medium">Period:</span>
        <UButton
          v-for="r in ranges"
          :key="r"
          :variant="activeRange === r ? 'solid' : 'ghost'"
          :color="activeRange === r ? 'primary' : 'neutral'"
          size="xs"
          @click="activeRange = r"
        >
          {{ r }}
        </UButton>
      </div>

      <!-- Moving Average Overlays -->
      <div class="flex items-center gap-3 text-xs">
        <label class="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            v-model="showSma20"
            type="checkbox"
            class="rounded border-default text-primary focus:ring-primary h-3.5 w-3.5"
          >
          <span class="inline-block w-2.5 h-0.5 bg-blue-500 rounded" />
          <span class="text-muted">SMA 20</span>
        </label>

        <label class="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            v-model="showSma50"
            type="checkbox"
            class="rounded border-default text-primary focus:ring-primary h-3.5 w-3.5"
          >
          <span class="inline-block w-2.5 h-0.5 bg-amber-500 rounded" />
          <span class="text-muted">SMA 50</span>
        </label>
      </div>
    </div>

    <!-- Active Candle HUD / Ticker Details -->
    <div
      v-if="activeCandle"
      class="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs py-1.5 px-3 bg-muted/20 rounded-md border border-default"
    >
      <div>
        <span class="text-muted text-[10px] block">Date</span>
        <span class="font-semibold">{{ activeCandle.date }}</span>
      </div>
      <div>
        <span class="text-muted text-[10px] block">Open</span>
        <span class="font-mono">₹{{ activeCandle.open.toFixed(2) }}</span>
      </div>
      <div>
        <span class="text-muted text-[10px] block">High</span>
        <span class="font-mono text-success">₹{{ activeCandle.high.toFixed(2) }}</span>
      </div>
      <div>
        <span class="text-muted text-[10px] block">Low</span>
        <span class="font-mono text-error">₹{{ activeCandle.low.toFixed(2) }}</span>
      </div>
      <div>
        <span class="text-muted text-[10px] block">Close</span>
        <span
          class="font-mono font-bold"
          :class="activeCandle.close >= activeCandle.open ? 'text-success' : 'text-error'"
        >
          ₹{{ activeCandle.close.toFixed(2) }}
        </span>
      </div>
      <div>
        <span class="text-muted text-[10px] block">Volume</span>
        <span class="font-mono">{{ formatVolume(activeCandle.volume) }}</span>
      </div>
    </div>

    <!-- Interactive SVG Chart Area -->
    <div class="relative w-full aspect-[2/1] sm:aspect-[2.2/1] bg-card border border-default rounded-lg overflow-hidden select-none">
      <div
        v-if="isLoading"
        class="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-xs z-20"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="animate-spin text-3xl text-primary"
        />
      </div>

      <svg
        class="w-full h-full cursor-crosshair block"
        :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
        preserveAspectRatio="none"
        @mousemove="handleMouseMove"
        @mouseleave="handleMouseLeave"
      >
        <!-- Horizontal Price Grid Lines -->
        <g
          stroke="currentColor"
          stroke-opacity="0.1"
          stroke-dasharray="3,3"
        >
          <line
            v-for="line in priceGridLines"
            :key="line.price"
            :x1="padding.left"
            :y1="line.y"
            :x2="chartWidth - padding.right"
            :y2="line.y"
          />
          <!-- Separator between price and volume area -->
          <line
            :x1="padding.left"
            :y1="volumeAreaTop - 5"
            :x2="chartWidth - padding.right"
            :y2="volumeAreaTop - 5"
            stroke-dasharray="none"
            stroke-opacity="0.2"
          />
        </g>

        <!-- Right Price Axis Labels -->
        <g
          fill="currentColor"
          fill-opacity="0.6"
          font-size="10"
          font-family="monospace"
          text-anchor="start"
        >
          <text
            v-for="line in priceGridLines"
            :key="'label-' + line.price"
            :x="chartWidth - padding.right + 6"
            :y="line.y + 3"
          >
            {{ line.price }}
          </text>
        </g>

        <!-- Bottom Date Axis Labels -->
        <g
          fill="currentColor"
          fill-opacity="0.5"
          font-size="10"
          font-family="sans-serif"
          text-anchor="middle"
        >
          <text
            v-for="lbl in timeLabels"
            :key="lbl.date"
            :x="lbl.x"
            :y="chartHeight - 10"
          >
            {{ lbl.date }}
          </text>
        </g>

        <!-- Volume Sub-chart Bars -->
        <g>
          <rect
            v-for="(c, i) in candles"
            :key="'vol-' + c.date"
            :x="getX(i) - candleWidth / 2"
            :y="getVolumeY(c.volume)"
            :width="candleWidth"
            :height="Math.max(1, volumeAreaTop + volumeAreaHeight - getVolumeY(c.volume))"
            :fill="c.close >= c.open ? '#00C16A' : '#EF4444'"
            fill-opacity="0.35"
          />
        </g>

        <!-- Candlesticks (Wicks & Bodies) -->
        <g>
          <g
            v-for="(c, i) in candles"
            :key="'candle-' + c.date"
          >
            <!-- Wick Line -->
            <line
              :x1="getX(i)"
              :y1="getY(c.high)"
              :x2="getX(i)"
              :y2="getY(c.low)"
              :stroke="c.close >= c.open ? '#00C16A' : '#EF4444'"
              stroke-width="1.2"
            />
            <!-- Candle Body -->
            <rect
              :x="getX(i) - candleWidth / 2"
              :y="getY(Math.max(c.open, c.close))"
              :width="candleWidth"
              :height="Math.max(1.5, Math.abs(getY(c.open) - getY(c.close)))"
              :fill="c.close >= c.open ? '#00C16A' : '#EF4444'"
              :stroke="c.close >= c.open ? '#00C16A' : '#EF4444'"
              stroke-width="0.5"
              rx="1"
            />
          </g>
        </g>

        <!-- Moving Average Overlay: SMA 20 -->
        <path
          v-if="showSma20 && sma20Path"
          :d="sma20Path"
          fill="none"
          stroke="#3B82F6"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- Moving Average Overlay: SMA 50 -->
        <path
          v-if="showSma50 && sma50Path"
          :d="sma50Path"
          fill="none"
          stroke="#F59E0B"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- Crosshair & Tracking Line on Hover -->
        <g v-if="hoveredIndex !== null && activeCandle">
          <!-- Vertical Tracking Line -->
          <line
            :x1="getX(hoveredIndex)"
            :y1="padding.top"
            :x2="getX(hoveredIndex)"
            :y2="chartHeight - padding.bottom"
            stroke="currentColor"
            stroke-opacity="0.4"
            stroke-width="1"
            stroke-dasharray="2,2"
          />
          <!-- Horizontal Price Tracking Line -->
          <line
            :x1="padding.left"
            :y1="mouseY"
            :x2="chartWidth - padding.right"
            :y2="mouseY"
            stroke="currentColor"
            stroke-opacity="0.4"
            stroke-width="1"
            stroke-dasharray="2,2"
          />
          <!-- Candle Highlight Circle -->
          <circle
            :cx="getX(hoveredIndex)"
            :cy="getY(activeCandle.close)"
            r="4"
            fill="#FFFFFF"
            :stroke="activeCandle.close >= activeCandle.open ? '#00C16A' : '#EF4444'"
            stroke-width="2"
          />
        </g>
      </svg>
    </div>

    <!-- Range Statistics Footer -->
    <div class="flex flex-wrap items-center justify-between text-xs text-muted px-1 gap-2">
      <div class="flex items-center gap-3">
        <span>Period High: <strong class="text-foreground">₹{{ stats.periodHigh.toFixed(2) }}</strong></span>
        <span>•</span>
        <span>Period Low: <strong class="text-foreground">₹{{ stats.periodLow.toFixed(2) }}</strong></span>
      </div>

      <div class="flex items-center gap-3">
        <span>Average Vol: <strong class="text-foreground">{{ formatVolume(stats.avgVolume) }}</strong></span>
        <span>•</span>
        <span>
          Period Return:
          <strong :class="stats.periodReturn >= 0 ? 'text-success' : 'text-error'">
            {{ stats.periodReturn >= 0 ? '+' : '' }}{{ stats.periodReturn }}%
          </strong>
        </span>
      </div>
    </div>
  </div>
</template>
