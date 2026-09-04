<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  AreaSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type HistogramData,
  type Time
} from 'lightweight-charts'
import type { LiveChartResponse, LiveChartCandle } from '~~/server/api/market/live-chart.get'

const props = withDefaults(
  defineProps<{
    symbol: string
    title?: string
    initialRange?: '1d' | '5d' | '1mo' | '6mo' | '1y'
  }>(),
  {
    title: '',
    initialRange: '1d'
  }
)

const emit = defineEmits<{
  (e: 'symbolChange', symbol: string): void
}>()

// Range and Interval controls
const selectedRange = ref<'1d' | '5d' | '1mo' | '6mo' | '1y'>(props.initialRange)
const selectedInterval = ref<'1m' | '5m' | '15m' | '1h' | '1d'>('5m')
const chartType = ref<'line' | 'area' | 'candles'>('line')
const showSma20 = ref(false)
const showSma50 = ref(false)
const showEma9 = ref(false)
const showVolume = ref(false) // Disabled by default for clean index view
const isFullscreen = ref(false)
const isAutoRefresh = ref(true)
const autoRefreshSec = 15
const countdown = ref(autoRefreshSec)

const chartContainer = ref<HTMLElement | null>(null)
const chartWrapper = ref<HTMLElement | null>(null)
const isLoading = ref(false)
const chartData = ref<LiveChartResponse | null>(null)

// Timeframe ranges
const TIME_RANGES = [
  { id: '1d', label: '1D', title: 'Today (Intraday)' },
  { id: '5d', label: '5D', title: '5 Days' },
  { id: '1mo', label: '1M', title: '1 Month' },
  { id: '6mo', label: '6M', title: '6 Months' },
  { id: '1y', label: '1Y', title: '1 Year' }
] as const

// Intervals available based on active range
const availableIntervals = computed(() => {
  if (selectedRange.value === '1d') {
    return [
      { id: '1m', label: '1m' },
      { id: '5m', label: '5m' },
      { id: '15m', label: '15m' }
    ]
  }
  if (selectedRange.value === '5d') {
    return [
      { id: '5m', label: '5m' },
      { id: '15m', label: '15m' },
      { id: '1h', label: '1h' }
    ]
  }
  if (selectedRange.value === '1mo') {
    return [
      { id: '1h', label: '1h' },
      { id: '1d', label: '1D' }
    ]
  }
  return [{ id: '1d', label: '1D' }]
})

// Whether current symbol has non-zero traded volume (e.g. true for equities, false for benchmark indices)
const hasVolumeData = computed(() => {
  return (chartData.value?.candles || []).some(c => (c.volume || 0) > 0)
})

// HUD state for hovered candle
interface HudState {
  timeStr: string
  open: number
  high: number
  low: number
  close: number
  change: number
  changePercent: number
  volume: number
  sma20?: number | null
  sma50?: number | null
  ema9?: number | null
  isTotalDay?: boolean
}
const hud = ref<HudState | null>(null)

// Chart Instances
let chart: IChartApi | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mainSeries: ISeriesApi<any> | null = null
let volumeSeries: ISeriesApi<'Histogram'> | null = null
let sma20Series: ISeriesApi<'Line'> | null = null
let sma50Series: ISeriesApi<'Line'> | null = null
let ema9Series: ISeriesApi<'Line'> | null = null
let resizeObserver: ResizeObserver | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

function isDarkMode(): boolean {
  if (typeof document === 'undefined') return true
  return document.documentElement.classList.contains('dark')
}

function getThemeColors() {
  const dark = isDarkMode()
  return {
    bg: dark ? '#0a0a0c' : '#ffffff',
    text: dark ? '#a1a1aa' : '#52525b',
    grid: dark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
    border: dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
    crosshair: dark ? '#71717a' : '#a1a1aa',
    bullish: '#10b981',
    bearish: '#ef4444',
    sma20: '#3b82f6',
    sma50: '#f59e0b',
    ema9: '#06b6d4'
  }
}

function formatCandleTime(unixSec: number): string {
  const d = new Date(unixSec * 1000)
  const isIntraday = selectedRange.value === '1d' || selectedRange.value === '5d'
  if (isIntraday) {
    const hours = d.getUTCHours()
    const minutes = d.getUTCMinutes()
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const h12 = hours % 12 || 12
    const minStr = String(minutes).padStart(2, '0')
    if (selectedRange.value === '5d') {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      return `${monthNames[d.getUTCMonth()]} ${d.getUTCDate()}, ${h12}:${minStr} ${ampm}`
    }
    return `${h12}:${minStr} ${ampm}`
  }
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${monthNames[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

async function fetchChartData(silent = false) {
  if (!silent) isLoading.value = true
  try {
    const res = await $fetch<LiveChartResponse>('/api/market/live-chart', {
      query: {
        symbol: props.symbol,
        range: selectedRange.value,
        interval: selectedInterval.value
      }
    })
    chartData.value = res
    renderChart()
  } catch (err) {
    console.error('[LiveIntradayChart] Fetch failed:', err)
  } finally {
    if (!silent) isLoading.value = false
  }
}

function initChart() {
  if (!chartContainer.value) return
  if (chart) {
    chart.remove()
    chart = null
  }

  const theme = getThemeColors()
  const width = chartContainer.value.clientWidth || 800
  const height = isFullscreen.value ? window.innerHeight - 100 : 540
  const isIntraday = selectedRange.value === '1d' || selectedRange.value === '5d'

  chart = createChart(chartContainer.value, {
    width,
    height,
    layout: {
      background: { type: ColorType.Solid, color: theme.bg },
      textColor: theme.text,
      fontSize: 11
    },
    grid: {
      vertLines: { color: theme.grid },
      horzLines: { color: theme.grid }
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: theme.crosshair,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: '#27272a'
      },
      horzLine: {
        color: theme.crosshair,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: '#27272a'
      }
    },
    rightPriceScale: {
      borderColor: theme.border,
      scaleMargins: {
        top: 0.1,
        bottom: 0.15
      }
    },
    timeScale: {
      borderColor: theme.border,
      timeVisible: isIntraday,
      secondsVisible: false
    },
    handleScroll: {
      mouseWheel: false,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: true
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

  // Crosshair move HUD listener
  chart.subscribeCrosshairMove((param) => {
    if (!param || !param.time || !chartData.value?.candles.length) {
      updateHudWithLatest()
      return
    }

    const t = typeof param.time === 'number' ? param.time : Math.floor(new Date(String(param.time)).getTime() / 1000)
    const candle = chartData.value.candles.find(c => c.time === t)
    if (candle) {
      // Show candle's own change: close - open
      const diff = candle.close - candle.open
      const pct = candle.open ? (diff / candle.open) * 100 : 0
      hud.value = {
        timeStr: formatCandleTime(candle.time),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        change: Number(diff.toFixed(2)),
        changePercent: Number(pct.toFixed(2)),
        volume: candle.volume,
        sma20: candle.sma20,
        sma50: candle.sma50,
        ema9: candle.ema9,
        isTotalDay: false
      }
    }
  })

  if (typeof ResizeObserver !== 'undefined' && chartContainer.value) {
    resizeObserver = new ResizeObserver((entries) => {
      if (!entries.length || !entries[0] || !chart) return
      const { width: w } = entries[0].contentRect
      chart.applyOptions({
        width: w,
        height: isFullscreen.value ? window.innerHeight - 100 : 540
      })
    })
    resizeObserver.observe(chartContainer.value)
  }
}

function updateHudWithLatest() {
  if (!chartData.value?.candles.length) {
    hud.value = null
    return
  }
  const last = chartData.value.candles[chartData.value.candles.length - 1]!
  const meta = chartData.value.meta

  hud.value = {
    timeStr: formatCandleTime(last.time),
    open: last.open,
    high: last.high,
    low: last.low,
    close: meta.currentPrice || last.close,
    change: meta.change,
    changePercent: meta.changePercent,
    volume: last.volume,
    sma20: last.sma20,
    sma50: last.sma50,
    ema9: last.ema9,
    isTotalDay: true
  }
}

function renderChart() {
  if (!chartContainer.value) return
  if (!chart) initChart()
  if (!chart || !chartData.value || !chartData.value.candles.length) return

  const theme = getThemeColors()
  const candles = chartData.value.candles
  const isGain = (chartData.value.meta.change ?? 0) >= 0
  const seriesColor = isGain ? theme.bullish : theme.bearish

  // Update timeScale visibility for active range
  const isIntraday = selectedRange.value === '1d' || selectedRange.value === '5d'
  chart.timeScale().applyOptions({
    timeVisible: isIntraday,
    secondsVisible: false
  })

  // Clear existing series
  if (mainSeries) {
    chart.removeSeries(mainSeries)
    mainSeries = null
  }
  if (volumeSeries) {
    chart.removeSeries(volumeSeries)
    volumeSeries = null
  }
  if (sma20Series) {
    chart.removeSeries(sma20Series)
    sma20Series = null
  }
  if (sma50Series) {
    chart.removeSeries(sma50Series)
    sma50Series = null
  }
  if (ema9Series) {
    chart.removeSeries(ema9Series)
    ema9Series = null
  }

  // 1. Main Series
  if (chartType.value === 'line') {
    mainSeries = chart.addSeries(LineSeries, {
      color: seriesColor,
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: '#ffffff',
      crosshairMarkerBackgroundColor: seriesColor,
      priceLineVisible: true,
      lastValueVisible: true
    })
    const lineData: LineData[] = candles.map(c => ({
      time: c.time as Time,
      value: c.close
    }))
    mainSeries.setData(lineData)
  } else if (chartType.value === 'area') {
    mainSeries = chart.addSeries(AreaSeries, {
      topColor: isGain ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)',
      bottomColor: isGain ? 'rgba(16, 185, 129, 0.02)' : 'rgba(239, 68, 68, 0.02)',
      lineColor: seriesColor,
      lineWidth: 2,
      crosshairMarkerVisible: true,
      priceLineVisible: true,
      lastValueVisible: true
    })
    const areaData = candles.map(c => ({
      time: c.time as Time,
      value: c.close
    }))
    mainSeries.setData(areaData)
  } else if (chartType.value === 'candles') {
    mainSeries = chart.addSeries(CandlestickSeries, {
      upColor: theme.bullish,
      downColor: theme.bearish,
      borderVisible: true,
      borderUpColor: theme.bullish,
      borderDownColor: theme.bearish,
      wickUpColor: theme.bullish,
      wickDownColor: theme.bearish,
      priceLineVisible: true,
      lastValueVisible: true
    })
    const candleData: CandlestickData[] = candles.map(c => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    }))
    mainSeries.setData(candleData)
  }

  // 2. Volume Histogram (Only add if symbol has actual non-zero volume data!)
  if (showVolume.value && hasVolumeData.value) {
    volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      color: 'rgba(161, 161, 170, 0.3)',
      priceLineVisible: false,
      lastValueVisible: false
    })
    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0
      }
    })
    const volData: HistogramData[] = candles.map(c => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'
    }))
    volumeSeries.setData(volData)
  }

  // 3. Technical Overlays (Pre-calculated using warm-up data so they start at the EXACT first candle!)
  if (showSma20.value) {
    const sma20Data: LineData[] = []
    for (const c of candles) {
      if (c.sma20 !== null && c.sma20 !== undefined) {
        sma20Data.push({ time: c.time as Time, value: c.sma20 })
      }
    }
    if (sma20Data.length > 0) {
      sma20Series = chart.addSeries(LineSeries, {
        color: theme.sma20,
        lineWidth: 1,
        title: 'SMA 20',
        priceLineVisible: false,
        lastValueVisible: false
      })
      sma20Series.setData(sma20Data)
    }
  }

  if (showSma50.value) {
    const sma50Data: LineData[] = []
    for (const c of candles) {
      if (c.sma50 !== null && c.sma50 !== undefined) {
        sma50Data.push({ time: c.time as Time, value: c.sma50 })
      }
    }
    if (sma50Data.length > 0) {
      sma50Series = chart.addSeries(LineSeries, {
        color: theme.sma50,
        lineWidth: 1,
        title: 'SMA 50',
        priceLineVisible: false,
        lastValueVisible: false
      })
      sma50Series.setData(sma50Data)
    }
  }

  if (showEma9.value) {
    const ema9Data: LineData[] = []
    for (const c of candles) {
      if (c.ema9 !== null && c.ema9 !== undefined) {
        ema9Data.push({ time: c.time as Time, value: c.ema9 })
      }
    }
    if (ema9Data.length > 0) {
      ema9Series = chart.addSeries(LineSeries, {
        color: theme.ema9,
        lineWidth: 1,
        title: 'EMA 9',
        priceLineVisible: false,
        lastValueVisible: false
      })
      ema9Series.setData(ema9Data)
    }
  }

  // Fit view to visible data
  chart.timeScale().fitContent()
  updateHudWithLatest()
}

function handleRangeChange(r: '1d' | '5d' | '1mo' | '6mo' | '1y') {
  selectedRange.value = r
  // Auto-set sensible interval
  if (r === '1d') selectedInterval.value = '5m'
  else if (r === '5d') selectedInterval.value = '15m'
  else if (r === '1mo') selectedInterval.value = '1h'
  else selectedInterval.value = '1d'

  fetchChartData()
}

function handleIntervalChange(inv: '1m' | '5m' | '15m' | '1h' | '1d') {
  selectedInterval.value = inv
  fetchChartData()
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
  nextTick(() => {
    if (chart && chartContainer.value) {
      chart.applyOptions({
        width: chartContainer.value.clientWidth,
        height: isFullscreen.value ? window.innerHeight - 100 : 540
      })
      chart.timeScale().fitContent()
    }
  })
}

function startAutoRefreshLoop() {
  if (pollTimer) clearInterval(pollTimer)
  countdown.value = autoRefreshSec

  pollTimer = setInterval(() => {
    if (!isAutoRefresh.value || document.hidden) return
    if (countdown.value > 1) {
      countdown.value--
    } else {
      countdown.value = autoRefreshSec
      // Only auto-refresh in intraday 1d mode
      if (selectedRange.value === '1d') {
        fetchChartData(true)
      }
    }
  }, 1000)
}

function toggleAutoRefresh() {
  isAutoRefresh.value = !isAutoRefresh.value
  if (isAutoRefresh.value) {
    countdown.value = autoRefreshSec
  }
}

watch(
  () => props.symbol,
  () => {
    fetchChartData()
  }
)

watch(chartType, () => {
  renderChart()
})

watch([showSma20, showSma50, showEma9, showVolume], () => {
  renderChart()
})

onMounted(() => {
  nextTick(() => {
    initChart()
    fetchChartData()
    startAutoRefreshLoop()
  })
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
  if (resizeObserver) resizeObserver.disconnect()
  if (chart) {
    chart.remove()
    chart = null
  }
})
</script>

<template>
  <div
    ref="chartWrapper"
    class="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs transition-all"
    :class="isFullscreen ? 'fixed inset-0 z-50 rounded-none p-4' : 'relative'"
  >
    <!-- Top Controls Header -->
    <div class="px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 bg-neutral-50/50 dark:bg-neutral-800/40">
      <!-- Title & Instrument Identity -->
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-activity"
            class="h-4 w-4 text-primary"
          />
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-black text-sm text-neutral-900 dark:text-white tracking-tight">
                {{ chartData?.name || title || symbol }}
              </span>
              <UBadge
                color="primary"
                variant="subtle"
                size="xs"
                class="font-mono text-[9px] uppercase"
              >
                {{ symbol }}
              </UBadge>
              <span
                v-if="chartData?.meta"
                class="inline-flex items-center gap-1 text-xs font-mono font-bold"
                :class="chartData.meta.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
              >
                ₹{{ chartData.meta.currentPrice?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) }}
                ({{ chartData.meta.change >= 0 ? '+' : '' }}{{ chartData.meta.change }} • {{ chartData.meta.change >= 0 ? '+' : '' }}{{ chartData.meta.changePercent }}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Controls & Granularity Selectors -->
      <div class="flex items-center gap-2 flex-wrap">
        <!-- Range Selector Buttons (1D, 5D, 1M, 6M, 1Y) -->
        <div class="flex items-center rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-0.5 text-xs font-semibold shadow-2xs">
          <button
            v-for="r in TIME_RANGES"
            :key="r.id"
            type="button"
            class="px-2.5 py-0.5 rounded-md uppercase transition-all select-none font-mono text-[11px]"
            :class="selectedRange === r.id ? 'bg-primary text-white font-bold shadow-xs' : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
            :title="r.title"
            @click="handleRangeChange(r.id)"
          >
            {{ r.label }}
          </button>
        </div>

        <!-- Granularity Selector (when multiple intervals available for active range) -->
        <div
          v-if="availableIntervals.length > 1"
          class="hidden sm:flex items-center rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800/80 p-0.5 text-[10px] font-mono"
        >
          <button
            v-for="inv in availableIntervals"
            :key="inv.id"
            type="button"
            class="px-1.5 py-0.5 rounded select-none transition-colors"
            :class="selectedInterval === inv.id ? 'bg-white dark:bg-neutral-700 font-bold text-neutral-900 dark:text-white shadow-2xs' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'"
            @click="handleIntervalChange(inv.id as any)"
          >
            {{ inv.label }}
          </button>
        </div>

        <!-- Chart Type Switcher -->
        <div class="flex items-center rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-0.5 text-xs shadow-2xs">
          <button
            type="button"
            class="flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors font-semibold text-[11px]"
            :class="chartType === 'line' ? 'bg-primary text-white shadow-xs' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'"
            title="Line Chart"
            @click="chartType = 'line'"
          >
            <UIcon name="i-lucide-trending-up" class="h-3.5 w-3.5" />
            <span>Line</span>
          </button>
          <button
            type="button"
            class="flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors font-semibold text-[11px]"
            :class="chartType === 'area' ? 'bg-primary text-white shadow-xs' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'"
            title="Area / Mountain"
            @click="chartType = 'area'"
          >
            <UIcon name="i-lucide-area-chart" class="h-3.5 w-3.5" />
            <span>Area</span>
          </button>
          <button
            type="button"
            class="flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors font-semibold text-[11px]"
            :class="chartType === 'candles' ? 'bg-primary text-white shadow-xs' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'"
            title="Candlesticks"
            @click="chartType = 'candles'"
          >
            <UIcon name="i-lucide-candlestick-chart" class="h-3.5 w-3.5" />
            <span>Candles</span>
          </button>
        </div>

        <!-- Indicators Quick Toggles -->
        <div class="hidden lg:flex items-center gap-1">
          <button
            type="button"
            class="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border transition-colors select-none"
            :class="showSma20 ? 'border-blue-500 bg-blue-500/15 text-blue-600 dark:text-blue-400' : 'border-neutral-200 dark:border-neutral-700 text-neutral-400'"
            @click="showSma20 = !showSma20"
          >
            SMA20
          </button>
          <button
            type="button"
            class="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border transition-colors select-none"
            :class="showSma50 ? 'border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'border-neutral-200 dark:border-neutral-700 text-neutral-400'"
            @click="showSma50 = !showSma50"
          >
            SMA50
          </button>
          <button
            type="button"
            class="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border transition-colors select-none"
            :class="showEma9 ? 'border-cyan-500 bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' : 'border-neutral-200 dark:border-neutral-700 text-neutral-400'"
            @click="showEma9 = !showEma9"
          >
            EMA9
          </button>
          <button
            v-if="hasVolumeData"
            type="button"
            class="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border transition-colors select-none"
            :class="showVolume ? 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'border-neutral-200 dark:border-neutral-700 text-neutral-400'"
            @click="showVolume = !showVolume"
          >
            VOL
          </button>
        </div>

        <!-- Auto-Refresh Toggle -->
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 px-2 py-1 text-[11px] font-mono select-none"
          :class="isAutoRefresh ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-400'"
          :title="isAutoRefresh ? 'Live refresh active. Click to pause.' : 'Paused. Click to resume.'"
          @click="toggleAutoRefresh"
        >
          <span class="relative flex h-1.5 w-1.5">
            <span
              v-if="isAutoRefresh"
              class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
            />
            <span
              class="relative inline-flex rounded-full h-1.5 w-1.5"
              :class="isAutoRefresh ? 'bg-emerald-500' : 'bg-neutral-400'"
            />
          </span>
          <span>{{ isAutoRefresh ? `${countdown}s` : 'Paused' }}</span>
        </button>

        <!-- Fullscreen Toggle -->
        <button
          type="button"
          class="p-1 rounded-md text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
          :title="isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Chart'"
          @click="toggleFullscreen"
        >
          <UIcon :name="isFullscreen ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'" class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- Live Candle HUD Strip -->
    <div
      v-if="hud"
      class="px-4 py-1 border-b border-neutral-100 dark:border-neutral-800/80 bg-neutral-50/30 dark:bg-neutral-900/50 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono"
    >
      <span class="text-neutral-500 dark:text-neutral-400 text-[11px] font-semibold">{{ hud.timeStr }}</span>
      <div class="flex items-center gap-1">
        <span class="text-neutral-400 text-[10px]">O:</span>
        <span class="font-bold text-neutral-800 dark:text-neutral-200">{{ hud.open }}</span>
      </div>
      <div class="flex items-center gap-1">
        <span class="text-neutral-400 text-[10px]">H:</span>
        <span class="font-bold text-emerald-600 dark:text-emerald-400">{{ hud.high }}</span>
      </div>
      <div class="flex items-center gap-1">
        <span class="text-neutral-400 text-[10px]">L:</span>
        <span class="font-bold text-rose-600 dark:text-rose-400">{{ hud.low }}</span>
      </div>
      <div class="flex items-center gap-1">
        <span class="text-neutral-400 text-[10px]">C:</span>
        <span
          class="font-bold"
          :class="hud.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
        >
          {{ hud.close }}
        </span>
      </div>
      <div class="flex items-center gap-1">
        <span class="text-neutral-400 text-[10px]">{{ hud.isTotalDay ? 'Day Chg:' : 'Chg:' }}</span>
        <span
          class="font-bold"
          :class="hud.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
        >
          {{ hud.change >= 0 ? '+' : '' }}{{ hud.change }} ({{ hud.change >= 0 ? '+' : '' }}{{ hud.changePercent }}%)
        </span>
      </div>
      <div
        v-if="hud.volume > 0"
        class="flex items-center gap-1"
      >
        <span class="text-neutral-400 text-[10px]">Vol:</span>
        <span class="text-neutral-600 dark:text-neutral-300 font-semibold">{{ hud.volume.toLocaleString() }}</span>
      </div>
      <div
        v-if="showSma20 && hud.sma20"
        class="flex items-center gap-1 text-blue-600 dark:text-blue-400"
      >
        <span class="text-[10px] opacity-75">SMA20:</span>
        <span class="font-bold">{{ hud.sma20 }}</span>
      </div>
      <div
        v-if="showSma50 && hud.sma50"
        class="flex items-center gap-1 text-amber-600 dark:text-amber-400"
      >
        <span class="text-[10px] opacity-75">SMA50:</span>
        <span class="font-bold">{{ hud.sma50 }}</span>
      </div>
      <div
        v-if="showEma9 && hud.ema9"
        class="flex items-center gap-1 text-cyan-600 dark:text-cyan-400"
      >
        <span class="text-[10px] opacity-75">EMA9:</span>
        <span class="font-bold">{{ hud.ema9 }}</span>
      </div>
    </div>

    <!-- Chart Canvas Container -->
    <div class="relative w-full">
      <div
        ref="chartContainer"
        class="w-full"
        :class="isFullscreen ? 'h-[calc(100vh-120px)]' : 'h-[540px]'"
      />

      <!-- Loading Overlay -->
      <div
        v-if="isLoading"
        class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-neutral-900/50 backdrop-blur-2xs z-20"
      >
        <div class="flex items-center gap-2 rounded-xl bg-white dark:bg-neutral-800 px-4 py-2 shadow-lg border border-neutral-200 dark:border-neutral-700">
          <UIcon name="i-lucide-loader-2" class="h-4 w-4 animate-spin text-primary" />
          <span class="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            Syncing live candles...
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
