<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import {
  createChart,
  ColorType,
  CandlestickSeries,
  AreaSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi
} from 'lightweight-charts'
import type { CryptoAsset } from '../../composables/useCrypto'

const props = defineProps<{
  asset: CryptoAsset | null
  activeRate: number
  rateMode: 'domestic' | 'forex'
  formatInr: (val: number, options?: { compact?: boolean, decimals?: number }) => string
  formatUsd: (val: number, decimals?: number) => string
}>()

const chartContainer = ref<HTMLDivElement | null>(null)
let chart: IChartApi | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mainSeries: ISeriesApi<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let volumeSeries: ISeriesApi<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sma20Series: ISeriesApi<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sma50Series: ISeriesApi<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let bbUpperSeries: ISeriesApi<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let bbLowerSeries: ISeriesApi<any> | null = null

let resizeObserver: ResizeObserver | null = null
let fetchSeq = 0

// Dynamic Controls: Range Presets & Granular Intervals
const selectedRange = ref<'24H' | '7D' | '1M' | '3M' | '1Y'>('24H')
const selectedInterval = ref<'15m' | '1h' | '4h' | '1d'>('15m')
const chartType = ref<'candlestick' | 'area'>('area')
const currencyDisplay = ref<'INR' | 'USDT'>('INR')
const isLoading = ref(false)
const isFullscreen = ref(false)

// Indicators toggles
const showSma20 = ref(false)
const showSma50 = ref(false)
const showBollinger = ref(false)

// Hovered Candle Data for Live Floating Legend
interface HoveredBar {
  time?: number
  open?: number
  high?: number
  low?: number
  close?: number
  value?: number
  volume?: number
}
const hoveredBar = ref<HoveredBar | null>(null)

// Current live tracking candle bar
let currentBar: {
  time: number
  open: number
  high: number
  low: number
  close: number
} | null = null

const ranges = [
  { label: '24H', value: '24H' },
  { label: '7D', value: '7D' },
  { label: '1M (30D)', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '1Y', value: '1Y' }
]

const intervals = [
  { label: '15m', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' }
]

function formatPriceOnAxis(price: number): string {
  if (isNaN(price) || price === null || price === undefined) return ''
  const isINR = currencyDisplay.value === 'INR'

  if (isINR) {
    if (price >= 10000000) return `₹ ${(price / 10000000).toFixed(2)} Cr`
    if (price >= 100000) return `₹ ${(price / 100000).toFixed(2)} L`
    if (price >= 1000) return `₹ ${Math.round(price).toLocaleString('en-IN')}`
    if (price >= 1) return `₹ ${price.toFixed(2)}`
    return `₹ ${price.toFixed(4)}`
  } else {
    if (price >= 1000) return `$ ${Math.round(price).toLocaleString('en-US')}`
    if (price >= 1) return `$ ${price.toFixed(2)}`
    return `$ ${price.toFixed(4)}`
  }
}

// Map Range to interval + candle limit
function resolveRangeConfig(range: '24H' | '7D' | '1M' | '3M' | '1Y') {
  switch (range) {
    case '24H':
      return { interval: '15m', limit: 96 } // 96 * 15m = 24h exact
    case '7D':
      return { interval: '1h', limit: 168 } // 168 * 1h = 7 days exact
    case '1M':
      return { interval: '4h', limit: 180 } // 180 * 4h = 30 days
    case '3M':
      return { interval: '1d', limit: 90 } // 90 * 1d = 90 days
    case '1Y':
      return { interval: '1d', limit: 365 } // 365 * 1d = 1 year
    default:
      return { interval: '1h', limit: 100 }
  }
}

function handleRangeChange(range: '24H' | '7D' | '1M' | '3M' | '1Y') {
  selectedRange.value = range
  const config = resolveRangeConfig(range)
  selectedInterval.value = config.interval as '15m' | '1h' | '4h' | '1d'
  loadAndRenderChart()
}

function handleIntervalChange(interval: '15m' | '1h' | '4h' | '1d') {
  selectedInterval.value = interval
  loadAndRenderChart()
}

// Indicator Calculation Helpers
function calculateSma(data: Array<{ time: number, close: number }>, period: number) {
  const result: Array<{ time: number, value: number }> = []
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0
    for (let j = 0; j < period; j++) {
      sum += data[i - j]!.close
    }
    result.push({
      time: data[i]!.time,
      value: Number((sum / period).toFixed(4))
    })
  }
  return result
}

function calculateBollinger(data: Array<{ time: number, close: number }>, period = 20, multiplier = 2) {
  const upper: Array<{ time: number, value: number }> = []
  const lower: Array<{ time: number, value: number }> = []

  for (let i = period - 1; i < data.length; i++) {
    let sum = 0
    for (let j = 0; j < period; j++) {
      sum += data[i - j]!.close
    }
    const mean = sum / period

    let varianceSum = 0
    for (let j = 0; j < period; j++) {
      varianceSum += Math.pow(data[i - j]!.close - mean, 2)
    }
    const stdDev = Math.sqrt(varianceSum / period)

    upper.push({
      time: data[i]!.time,
      value: Number((mean + multiplier * stdDev).toFixed(4))
    })
    lower.push({
      time: data[i]!.time,
      value: Number((mean - multiplier * stdDev).toFixed(4))
    })
  }
  return { upper, lower }
}

async function loadAndRenderChart() {
  if (!chartContainer.value || !props.asset) return
  isLoading.value = true
  const thisSeq = ++fetchSeq

  const config = resolveRangeConfig(selectedRange.value)
  const reqInterval = selectedInterval.value || config.interval
  const reqLimit = config.limit

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
    }>(`/api/crypto/klines?symbol=${props.asset.symbol}&interval=${reqInterval}&limit=${reqLimit}`)

    if (thisSeq !== fetchSeq) return
    if (!res?.success || !res.data?.length) return

    initOrUpdateChart(res.data)
  } catch (err) {
    console.error('Failed to load klines:', err)
  } finally {
    if (thisSeq === fetchSeq) {
      isLoading.value = false
    }
  }
}

function initOrUpdateChart(
  rawData: Array<{
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
) {
  if (!chartContainer.value) return

  // Dispose previous chart instance
  if (chart) {
    chart.remove()
    chart = null
    mainSeries = null
    volumeSeries = null
    sma20Series = null
    sma50Series = null
    bbUpperSeries = null
    bbLowerSeries = null
  }

  // Deduplicate and ensure strict ascending order by timestamp
  const sorted = [...rawData].sort((a, b) => a.time - b.time)
  const uniqueData: typeof rawData = []
  const seenTimes = new Set<number>()

  for (const item of sorted) {
    if (!seenTimes.has(item.time)) {
      seenTimes.add(item.time)
      uniqueData.push(item)
    }
  }

  const width = chartContainer.value.clientWidth || 800
  const height = isFullscreen.value ? 580 : 380

  chart = createChart(chartContainer.value, {
    width,
    height,
    layout: {
      background: { type: ColorType.Solid, color: '#ffffff' },
      textColor: '#475569',
      fontSize: 11
    },
    grid: {
      vertLines: { color: '#f1f5f9' },
      horzLines: { color: '#f1f5f9' }
    },
    rightPriceScale: {
      borderColor: '#e2e8f0',
      scaleMargins: {
        top: 0.1,
        bottom: 0.2
      },
      autoScale: true
    },
    // FIX: Lock left & right edges to eliminate empty whitespace gaps
    timeScale: {
      borderColor: '#e2e8f0',
      timeVisible: true,
      secondsVisible: false,
      fixLeftEdge: true,
      fixRightEdge: true,
      rightOffset: 6,
      barSpacing: 10,
      minBarSpacing: 3,
      lockVisibleTimeRangeOnResize: true,
      tickMarkFormatter: (time: number) => {
        const d = new Date(time * 1000)
        if (selectedRange.value === '1M' || selectedRange.value === '3M' || selectedRange.value === '1Y') {
          return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
        }
        return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
      }
    },
    localization: {
      timeFormatter: (time: number) => {
        const d = new Date(time * 1000)
        return d.toLocaleString('en-IN', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      }
    },
    crosshair: {
      vertLine: {
        color: '#94a3b8',
        width: 1,
        style: 3
      },
      horzLine: {
        color: '#94a3b8',
        width: 1,
        style: 3
      }
    },
    handleScroll: {
      mouseWheel: false,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false
    },
    handleScale: {
      mouseWheel: false,
      pinch: true,
      axisPressedMouseMove: {
        time: true,
        price: true
      },
      axisDoubleClickReset: {
        time: true,
        price: true
      }
    }
  })

  const isINR = currencyDisplay.value === 'INR'

  // 1. Main Price Series (Candles or Area)
  if (chartType.value === 'candlestick') {
    mainSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
      priceFormat: {
        type: 'custom',
        minMove: 0.0001,
        formatter: formatPriceOnAxis
      }
    })

    const formattedData = uniqueData.map(d => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      time: d.time as any,
      open: isINR ? d.openInr : d.openUsdt,
      high: isINR ? d.highInr : d.highUsdt,
      low: isINR ? d.lowInr : d.lowUsdt,
      close: isINR ? d.closeInr : d.closeUsdt
    }))

    mainSeries.setData(formattedData)

    const last = formattedData[formattedData.length - 1]
    if (last) {
      currentBar = {
        time: last.time,
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close
      }
    }
  } else {
    mainSeries = chart.addSeries(AreaSeries, {
      topColor: 'rgba(59, 130, 246, 0.35)',
      bottomColor: 'rgba(59, 130, 246, 0.02)',
      lineColor: '#2563eb',
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        minMove: 0.0001,
        formatter: formatPriceOnAxis
      }
    })

    const formattedData = uniqueData.map(d => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      time: d.time as any,
      value: isINR ? d.closeInr : d.closeUsdt
    }))

    mainSeries.setData(formattedData)

    const last = formattedData[formattedData.length - 1]
    if (last) {
      currentBar = {
        time: last.time,
        open: last.value,
        high: last.value,
        low: last.value,
        close: last.value
      }
    }
  }

  // 2. Volume Histogram Series Overlay
  volumeSeries = chart.addSeries(HistogramSeries, {
    color: '#cbd5e1',
    priceFormat: {
      type: 'volume'
    },
    priceScaleId: 'volume',
    priceLineVisible: false,
    lastValueVisible: false
  })

  chart.priceScale('volume').applyOptions({
    scaleMargins: {
      top: 0.82,
      bottom: 0
    }
  })

  const volumeData = uniqueData.map(d => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    time: d.time as any,
    value: d.volume,
    color: d.closeUsdt >= d.openUsdt ? 'rgba(16, 185, 129, 0.35)' : 'rgba(244, 63, 94, 0.35)'
  }))

  volumeSeries.setData(volumeData)

  // 3. Technical Indicator Overlays
  const closePoints = uniqueData.map(d => ({
    time: d.time,
    close: isINR ? d.closeInr : d.closeUsdt
  }))

  if (showSma20.value && closePoints.length >= 20) {
    sma20Series = chart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sma20Series.setData(calculateSma(closePoints, 20) as any)
  }

  if (showSma50.value && closePoints.length >= 50) {
    sma50Series = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sma50Series.setData(calculateSma(closePoints, 50) as any)
  }

  if (showBollinger.value && closePoints.length >= 20) {
    const bb = calculateBollinger(closePoints, 20, 2)
    bbUpperSeries = chart.addSeries(LineSeries, {
      color: '#8b5cf6',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false
    })
    bbLowerSeries = chart.addSeries(LineSeries, {
      color: '#8b5cf6',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bbUpperSeries.setData(bb.upper as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bbLowerSeries.setData(bb.lower as any)
  }

  // 4. Floating Crosshair Legend Tracking
  chart.subscribeCrosshairMove((param) => {
    if (
      !param.point
      || !param.time
      || param.point.x < 0
      || param.point.x > (chartContainer.value?.clientWidth || 800)
      || param.point.y < 0
      || param.point.y > (isFullscreen.value ? 580 : 380)
    ) {
      hoveredBar.value = null
    } else if (mainSeries) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = param.seriesData.get(mainSeries) as any
      if (data) {
        hoveredBar.value = {
          time: param.time as number,
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          value: data.value
        }
      }
    }
  })

  // Fit edge-to-edge
  chart.timeScale().fitContent()
}

// Real-Time Tick Update: Moves the current candle on live WebSocket tick
watch(
  () => [props.asset?.priceUsdt, props.asset?.priceInr],
  () => {
    if (!mainSeries || !currentBar || !props.asset) return
    const isINR = currencyDisplay.value === 'INR'
    const newPrice = isINR ? props.asset.priceInr : props.asset.priceUsdt

    if (newPrice > 0) {
      currentBar.close = newPrice
      if (newPrice > currentBar.high) currentBar.high = newPrice
      if (newPrice < currentBar.low) currentBar.low = newPrice

      if (chartType.value === 'candlestick') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mainSeries.update(currentBar as any)
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mainSeries.update({ time: currentBar.time as any, value: currentBar.close })
      }
    }
  }
)

watch(
  () => [props.asset?.symbol, chartType.value, currencyDisplay.value, showSma20.value, showSma50.value, showBollinger.value, isFullscreen.value],
  () => {
    nextTick(() => loadAndRenderChart())
  }
)

onMounted(() => {
  if (chartContainer.value) {
    resizeObserver = new ResizeObserver((entries) => {
      if (!entries[0] || !chart) return
      chart.applyOptions({ width: entries[0].contentRect.width })
    })
    resizeObserver.observe(chartContainer.value)
  }
  loadAndRenderChart()
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (chart) {
    chart.remove()
    chart = null
    mainSeries = null
    volumeSeries = null
    sma20Series = null
    sma50Series = null
    bbUpperSeries = null
    bbLowerSeries = null
  }
})
</script>

<template>
  <div
    class="bg-white rounded-xl border border-slate-200/90 shadow-xs p-4 mb-6 transition-all"
    :class="{ 'fixed inset-4 z-50 overflow-hidden shadow-2xl p-6': isFullscreen }"
  >
    <!-- Chart Header Toolbar -->
    <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
      <div
        v-if="asset"
        class="flex items-center gap-3"
      >
        <div class="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center font-bold text-blue-700 text-sm">
          {{ asset.baseAsset.slice(0, 3) }}
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-base font-bold text-slate-900">
              {{ asset.name }}
            </h2>
            <span class="text-xs font-mono font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
              {{ asset.symbol }}
            </span>
            <span
              class="text-xs font-bold px-2 py-0.5 rounded-full"
              :class="asset.change24h >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'"
            >
              {{ asset.change24h >= 0 ? '+' : '' }}{{ asset.change24h }}%
            </span>
          </div>

          <!-- Price & Hovered OHLC Legend -->
          <div class="flex items-baseline gap-3 mt-0.5 flex-wrap">
            <div class="flex items-baseline gap-1.5">
              <span class="text-xl font-extrabold text-slate-900 tracking-tight">
                {{ formatInr(asset.priceInr) }}
              </span>
              <span class="text-xs text-slate-400 font-medium">
                ({{ formatUsd(asset.priceUsdt) }})
              </span>
            </div>

            <!-- Dynamic Floating Crosshair OHLC Legend -->
            <div
              v-if="hoveredBar"
              class="hidden lg:flex items-center gap-2 text-xs font-mono bg-slate-50 px-2.5 py-0.5 rounded border border-slate-200/80"
            >
              <template v-if="hoveredBar.time">
                <span class="text-slate-500 font-semibold">
                  {{ new Date(hoveredBar.time * 1000).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) }}
                </span>
                <span class="text-slate-300">|</span>
              </template>
              <template v-if="hoveredBar.open !== undefined">
                <span class="text-slate-400">O: <strong class="text-slate-800">{{ formatPriceOnAxis(hoveredBar.open) }}</strong></span>
                <span class="text-slate-400">H: <strong class="text-slate-800">{{ formatPriceOnAxis(hoveredBar.high || 0) }}</strong></span>
                <span class="text-slate-400">L: <strong class="text-slate-800">{{ formatPriceOnAxis(hoveredBar.low || 0) }}</strong></span>
                <span class="text-slate-400">C: <strong class="text-slate-800">{{ formatPriceOnAxis(hoveredBar.close || 0) }}</strong></span>
              </template>
              <template v-else-if="hoveredBar.value !== undefined">
                <span class="text-slate-400">Price: <strong class="text-slate-800">{{ formatPriceOnAxis(hoveredBar.value) }}</strong></span>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- Controls: Time Ranges, Intervals, Chart Type, Overlays & Scale -->
      <div class="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
        <!-- 1. Range Presets (24H, 7D, 1M, 3M, 1Y) -->
        <div class="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-semibold text-slate-600">
          <button
            v-for="r in ranges"
            :key="r.value"
            class="px-2.5 py-1 rounded-md transition-all cursor-pointer"
            :class="selectedRange === r.value ? 'bg-white text-blue-700 font-bold shadow-xs' : 'hover:text-slate-900'"
            @click="handleRangeChange(r.value as any)"
          >
            {{ r.label }}
          </button>
        </div>

        <!-- 2. Granular Interval Pills (15m, 1h, 4h, 1d) -->
        <div class="flex items-center bg-slate-100 p-0.5 rounded-lg text-[11px] font-medium text-slate-500">
          <button
            v-for="int in intervals"
            :key="int.value"
            class="px-2 py-1 rounded-md transition-all cursor-pointer"
            :class="selectedInterval === int.value ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'hover:text-slate-900'"
            @click="handleIntervalChange(int.value as any)"
          >
            {{ int.label }}
          </button>
        </div>

        <!-- 3. Indicators Dropdown / Toggles -->
        <div class="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold text-slate-600">
          <button
            class="px-2 py-1 rounded transition-colors cursor-pointer"
            :class="showSma20 ? 'bg-blue-600 text-white' : 'hover:bg-slate-200'"
            title="Simple Moving Average 20"
            @click="showSma20 = !showSma20"
          >
            SMA20
          </button>
          <button
            class="px-2 py-1 rounded transition-colors cursor-pointer"
            :class="showSma50 ? 'bg-amber-600 text-white' : 'hover:bg-slate-200'"
            title="Simple Moving Average 50"
            @click="showSma50 = !showSma50"
          >
            SMA50
          </button>
          <button
            class="px-2 py-1 rounded transition-colors cursor-pointer"
            :class="showBollinger ? 'bg-purple-600 text-white' : 'hover:bg-slate-200'"
            title="Bollinger Bands (20, 2)"
            @click="showBollinger = !showBollinger"
          >
            BB
          </button>
        </div>

        <!-- 4. Chart Type Switcher -->
        <div class="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-medium text-slate-600">
          <button
            class="px-2 py-1 rounded-md transition-all flex items-center gap-1 cursor-pointer"
            :class="chartType === 'candlestick' ? 'bg-white text-slate-900 font-semibold shadow-xs' : 'hover:text-slate-900'"
            @click="chartType = 'candlestick'"
          >
            <UIcon
              name="i-lucide-candlestick-chart"
              class="w-3.5 h-3.5"
            />
            Candles
          </button>
          <button
            class="px-2 py-1 rounded-md transition-all flex items-center gap-1 cursor-pointer"
            :class="chartType === 'area' ? 'bg-white text-slate-900 font-semibold shadow-xs' : 'hover:text-slate-900'"
            @click="chartType = 'area'"
          >
            <UIcon
              name="i-lucide-line-chart"
              class="w-3.5 h-3.5"
            />
            Line
          </button>
        </div>

        <!-- 5. Currency Scale Toggle -->
        <div class="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-semibold text-slate-600">
          <button
            class="px-2.5 py-1 rounded-md transition-all cursor-pointer"
            :class="currencyDisplay === 'INR' ? 'bg-blue-600 text-white shadow-xs' : 'hover:text-slate-900'"
            @click="currencyDisplay = 'INR'"
          >
            ₹ INR
          </button>
          <button
            class="px-2.5 py-1 rounded-md transition-all cursor-pointer"
            :class="currencyDisplay === 'USDT' ? 'bg-blue-600 text-white shadow-xs' : 'hover:text-slate-900'"
            @click="currencyDisplay = 'USDT'"
          >
            $ USDT
          </button>
        </div>

        <!-- Fullscreen Expand Button -->
        <button
          class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
          :title="isFullscreen ? 'Exit Fullscreen' : 'Expand Fullscreen'"
          @click="isFullscreen = !isFullscreen"
        >
          <UIcon
            :name="isFullscreen ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
            class="w-4 h-4"
          />
        </button>
      </div>
    </div>

    <!-- 24h Stats Mini Bar -->
    <div
      v-if="asset"
      class="grid grid-cols-2 sm:grid-cols-4 gap-4 py-2.5 px-3 my-2 bg-slate-50/80 rounded-lg text-xs border border-slate-100"
    >
      <div>
        <span class="text-slate-400 block text-[10px] uppercase font-semibold">24h High (₹)</span>
        <span class="font-bold text-slate-800">{{ formatInr(asset.high24hInr) }}</span>
      </div>
      <div>
        <span class="text-slate-400 block text-[10px] uppercase font-semibold">24h Low (₹)</span>
        <span class="font-bold text-slate-800">{{ formatInr(asset.low24hInr) }}</span>
      </div>
      <div>
        <span class="text-slate-400 block text-[10px] uppercase font-semibold">24h Turnover (₹ Cr)</span>
        <span class="font-bold text-slate-800">{{ formatInr(asset.quoteVolumeInr, { compact: true }) }}</span>
      </div>
      <div>
        <span class="text-slate-400 block text-[10px] uppercase font-semibold">Trading Base Vol</span>
        <span class="font-bold text-slate-800">{{ asset.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 }) }} {{ asset.baseAsset }}</span>
      </div>
    </div>

    <!-- Chart Canvas Container -->
    <div
      class="relative w-full mt-2"
      :class="isFullscreen ? 'h-[580px]' : 'h-[380px]'"
    >
      <div
        v-if="isLoading"
        class="absolute inset-0 z-10 bg-white/70 backdrop-blur-xs flex items-center justify-center"
      >
        <div class="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <UIcon
            name="i-lucide-loader-2"
            class="w-4 h-4 animate-spin text-blue-600"
          />
          Loading Dynamic Candlesticks...
        </div>
      </div>
      <div
        ref="chartContainer"
        class="w-full h-full"
      />
    </div>
  </div>
</template>
