<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  AreaSeries,
  LineSeries,
  ColorType,
  LineStyle,
  CrosshairMode
} from 'lightweight-charts'
import type { Portfolio, PortfolioSummaryResponse } from '~/types/portfolio'

const props = defineProps<{
  summary: PortfolioSummaryResponse | null
  activePortfolio: Portfolio | null
}>()

const emit = defineEmits<{
  (e: 'open-trade'): void
  (e: 'open-stock', symbol: string): void
}>()

const colorMode = useColorMode()

// DOM Refs for Canvas Charts
const mainChartContainer = ref<HTMLDivElement | null>(null)
const drawdownChartContainer = ref<HTMLDivElement | null>(null)

// Chart Instances
let mainChart: IChartApi | null = null
let portfolioAreaSeries: ISeriesApi<'Area'> | null = null
let benchmarkLineSeries: ISeriesApi<'Line'> | null = null
let investedLineSeries: ISeriesApi<'Line'> | null = null

let drawdownChart: IChartApi | null = null
let drawdownAreaSeries: ISeriesApi<'Area'> | null = null

// Interactive Display Mode: '% Alpha vs Benchmark' | '₹ Net Worth' | 'Dual Axis'
const chartDisplayMode = ref<'percent' | 'rupee' | 'dual'>('percent')

// Active timeframe
const activeTimeframe = ref<'1M' | '3M' | '6M' | '1Y' | 'ALL'>('ALL')
const timeframes = ['1M', '3M', '6M', '1Y', 'ALL'] as const

// Theme colors
function getThemeColors() {
  const isDark = colorMode.value === 'dark'
  return {
    isDark,
    background: isDark ? '#171717' : '#ffffff',
    textColor: isDark ? '#a3a3a3' : '#737373',
    gridColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.05)',
    borderColor: isDark ? '#262626' : '#e5e5e5',
    crosshairColor: isDark ? '#525252' : '#a3a3a3',
    portfolioTopColor: 'rgba(16, 185, 129, 0.35)',
    portfolioBottomColor: 'rgba(16, 185, 129, 0.01)',
    portfolioLineColor: '#10b981',
    investedLineColor: isDark ? '#94a3b8' : '#64748b',
    benchmarkLineColor: '#6366f1',
    drawdownTopColor: 'rgba(244, 63, 94, 0.02)',
    drawdownBottomColor: 'rgba(244, 63, 94, 0.35)',
    drawdownLineColor: '#f43f5e'
  }
}

// Chart Data Builder
const chartPoints = computed(() => {
  if (!props.summary?.historicalValueCurve || props.summary.historicalValueCurve.length === 0) {
    return []
  }

  const raw = props.summary.historicalValueCurve.map(pt => ({
    time: pt.date,
    value: Number(pt.portfolioValue.toFixed(2)),
    invested: Number((pt.investedValue || props.summary?.portfolio.totalInvested || 0).toFixed(2)),
    benchmark: pt.benchmarkValue ? Number(pt.benchmarkValue.toFixed(2)) : undefined
  }))

  if (activeTimeframe.value === 'ALL' || raw.length <= 1) return raw

  const now = new Date()
  const cutoff = new Date()
  if (activeTimeframe.value === '1M') cutoff.setMonth(now.getMonth() - 1)
  else if (activeTimeframe.value === '3M') cutoff.setMonth(now.getMonth() - 3)
  else if (activeTimeframe.value === '6M') cutoff.setMonth(now.getMonth() - 6)
  else if (activeTimeframe.value === '1Y') cutoff.setFullYear(now.getFullYear() - 1)

  const cutoffStr = cutoff.toISOString().split('T')[0]!
  const filtered = raw.filter(pt => pt.time >= cutoffStr)
  return filtered.length > 0 ? filtered : raw
})

// High-Watermark Peak Value
const highWatermark = computed(() => {
  const pts = chartPoints.value
  if (pts.length === 0) return props.summary?.portfolio.totalValue || 0
  return Math.max(...pts.map(p => p.value))
})

// Current Drawdown from Peak
const currentDrawdown = computed(() => {
  const cur = props.summary?.portfolio.totalValue || 0
  const peak = highWatermark.value
  if (peak <= 0) return 0
  return Math.min(0, ((cur - peak) / peak) * 100)
})

// Crosshair Live Hover state
const hoveredPoint = ref<{
  date: string
  portfolioValue: number
  invested: number
  benchmarkValue?: number
} | null>(null)

// Active HUD readout (defaults to current live values if not hovering)
const activeHud = computed(() => {
  const pts = chartPoints.value
  const latest = pts[pts.length - 1]
  const first = pts[0]

  const pVal = hoveredPoint.value ? hoveredPoint.value.portfolioValue : (latest?.value ?? props.summary?.portfolio.totalValue ?? 0)
  const inv = hoveredPoint.value ? hoveredPoint.value.invested : (latest?.invested ?? props.summary?.portfolio.totalInvested ?? 0)
  const dt = hoveredPoint.value ? hoveredPoint.value.date : (latest?.time ?? 'Live Marks')
  const bVal = hoveredPoint.value?.benchmarkValue ?? latest?.benchmark

  const netGain = pVal - inv
  const returnPct = inv > 0 ? (netGain / inv) * 100 : 0

  // Time-Weighted normalized return vs start of selected timeframe
  const firstRet = (first && first.invested > 0) ? ((first.value - first.invested) / first.invested) * 100 : 0
  const portReturnFromStart = activeTimeframe.value === 'ALL' ? returnPct : (returnPct - firstRet)
  
  const startBench = first?.benchmark || 1
  const benchReturnFromStart = bVal ? ((bVal - startBench) / startBench) * 100 : 0
  const rawAlpha = portReturnFromStart - benchReturnFromStart
  const alpha = Math.abs(rawAlpha) < 0.005 ? 0 : rawAlpha

  return {
    date: dt,
    portfolioValue: pVal,
    invested: inv,
    netGain,
    returnPct,
    benchmarkValue: bVal,
    benchmarkReturn: benchReturnFromStart,
    alpha
  }
})

// Historical Drawdown Points (Calculated on Return Trajectory from Running Peak)
const drawdownPoints = computed(() => {
  const pts = chartPoints.value
  if (pts.length === 0) return []

  const returns = pts.map(p => {
    const ret = p.invested > 0 ? ((p.value - p.invested) / p.invested) * 100 : 0
    return { time: p.time, ret }
  })

  let runningPeak = returns[0]?.ret || 0
  return returns.map(r => {
    if (r.ret > runningPeak) {
      runningPeak = r.ret
    }
    const dd = runningPeak > 0 ? ((r.ret - runningPeak) / (runningPeak + 100)) * 100 : Math.min(0, r.ret - runningPeak)
    return {
      time: r.time,
      value: Number(Math.min(0, dd).toFixed(2))
    }
  })
})

// Top Performers and Laggards
const topPerformers = computed(() => {
  if (!props.summary?.holdings) return []
  return [...props.summary.holdings]
    .sort((a, b) => b.unrealizedPnLPct - a.unrealizedPnLPct)
    .slice(0, 4)
})

const laggards = computed(() => {
  if (!props.summary?.holdings) return []
  return [...props.summary.holdings]
    .filter(h => h.unrealizedPnLPct < 0)
    .sort((a, b) => a.unrealizedPnLPct - b.unrealizedPnLPct)
    .slice(0, 4)
})

// Initialize Charts
function initCharts() {
  if (!mainChartContainer.value) return

  const theme = getThemeColors()

  // 1. MAIN PORTFOLIO PERFORMANCE CANVAS CHART
  if (mainChart) {
    mainChart.remove()
    mainChart = null
  }

  mainChart = createChart(mainChartContainer.value, {
    width: mainChartContainer.value.clientWidth,
    height: 380,
    layout: {
      background: { type: ColorType.Solid, color: theme.background },
      textColor: theme.textColor,
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
    },
    grid: {
      vertLines: { color: theme.gridColor },
      horzLines: { color: theme.gridColor }
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: theme.crosshairColor,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: theme.isDark ? '#262626' : '#f1f5f9'
      },
      horzLine: {
        color: theme.crosshairColor,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: theme.isDark ? '#262626' : '#f1f5f9'
      }
    },
    rightPriceScale: {
      borderColor: theme.borderColor,
      scaleMargins: { top: 0.12, bottom: 0.12 },
      autoScale: true
    },
    leftPriceScale: {
      borderColor: theme.borderColor,
      scaleMargins: { top: 0.12, bottom: 0.12 },
      autoScale: true,
      visible: false
    },
    timeScale: {
      borderColor: theme.borderColor,
      rightOffset: 0,
      fixLeftEdge: true,
      fixRightEdge: true
    },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
    handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true }
  })

  // Portfolio Area Series
  portfolioAreaSeries = mainChart.addSeries(AreaSeries, {
    topColor: theme.portfolioTopColor,
    bottomColor: theme.portfolioBottomColor,
    lineColor: theme.portfolioLineColor,
    lineWidth: 2.5 as any,
    priceFormat: {
      type: 'custom',
      formatter: (p: number) => (p >= 0 ? '+' : '') + p.toFixed(2) + '%'
    }
  })

  // Invested Capital Baseline Series
  investedLineSeries = mainChart.addSeries(LineSeries, {
    color: theme.investedLineColor,
    lineWidth: 1,
    lineStyle: LineStyle.Dashed,
    priceFormat: {
      type: 'custom',
      formatter: (p: number) => '₹' + p.toLocaleString('en-IN', { maximumFractionDigits: 0 })
    }
  })

  // Benchmark Overlay Line Series
  benchmarkLineSeries = mainChart.addSeries(LineSeries, {
    color: theme.benchmarkLineColor,
    lineWidth: 2,
    lineStyle: LineStyle.Solid,
    priceLineVisible: false,
    lastValueVisible: true,
    priceFormat: {
      type: 'custom',
      formatter: (p: number) => (p >= 0 ? '+' : '') + p.toFixed(2) + '%'
    }
  })

  // Set Data based on current mode
  updateMainChartData()

  // Crosshair Handler
  mainChart.subscribeCrosshairMove((param) => {
    if (!param.time || !param.seriesData) {
      hoveredPoint.value = null
      return
    }

    const match = chartPoints.value.find(p => p.time === param.time)
    if (match) {
      hoveredPoint.value = {
        date: String(param.time),
        portfolioValue: match.value,
        invested: match.invested,
        benchmarkValue: match.benchmark
      }
    } else {
      hoveredPoint.value = null
    }
  })

  // 2. DRAWDOWN UNDERWATER CANVAS CHART
  if (drawdownChartContainer.value) {
    if (drawdownChart) {
      drawdownChart.remove()
      drawdownChart = null
    }

    drawdownChart = createChart(drawdownChartContainer.value, {
      width: drawdownChartContainer.value.clientWidth,
      height: 160,
      layout: {
        background: { type: ColorType.Solid, color: theme.background },
        textColor: theme.textColor,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
      },
      grid: {
        vertLines: { color: theme.gridColor },
        horzLines: { color: theme.gridColor }
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: theme.crosshairColor, width: 1, style: LineStyle.Dashed },
        horzLine: { color: theme.crosshairColor, width: 1, style: LineStyle.Dashed }
      },
      rightPriceScale: {
        borderColor: theme.borderColor,
        scaleMargins: { top: 0.05, bottom: 0.1 },
        autoScale: true
      },
      timeScale: {
        borderColor: theme.borderColor,
        rightOffset: 0,
        fixLeftEdge: true,
        fixRightEdge: true
      }
    })

    drawdownAreaSeries = drawdownChart.addSeries(AreaSeries, {
      topColor: theme.drawdownTopColor,
      bottomColor: theme.drawdownBottomColor,
      lineColor: theme.drawdownLineColor,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: {
        type: 'custom',
        formatter: (p: number) => p.toFixed(2) + '%'
      }
    })

    updateDrawdownChartData()
  }
}

function updateMainChartData() {
  if (!mainChart || !portfolioAreaSeries || !benchmarkLineSeries || !investedLineSeries) return

  const data = chartPoints.value
  if (data.length === 0) return

  const mode = chartDisplayMode.value
  const startPort = data[0]?.value || 1
  const startBench = data[0]?.benchmark || 1

  if (mode === 'percent') {
    // 1. RELATIVE % ALPHA COMPARISON (Institutional Standard)
    mainChart.priceScale('left').applyOptions({ visible: false })
    mainChart.priceScale('right').applyOptions({
      visible: true,
      autoScale: true,
      scaleMargins: { top: 0.15, bottom: 0.15 }
    })

    portfolioAreaSeries.applyOptions({
      priceScaleId: 'right',
      priceFormat: {
        type: 'custom',
        formatter: (p: number) => (p >= 0 ? '+' : '') + p.toFixed(2) + '%'
      }
    })
    benchmarkLineSeries.applyOptions({
      visible: true,
      priceLineVisible: false,
      lastValueVisible: true,
      priceScaleId: 'right',
      priceFormat: {
        type: 'custom',
        formatter: (p: number) => (p >= 0 ? '+' : '') + p.toFixed(2) + '%'
      }
    })
    investedLineSeries.applyOptions({ visible: false })

    const firstRet = (data[0] && data[0].invested > 0)
      ? ((data[0].value - data[0].invested) / data[0].invested) * 100
      : 0

    // Set normalized performance (% return on invested capital)
    portfolioAreaSeries.setData(data.map(d => {
      const curRet = d.invested > 0 ? ((d.value - d.invested) / d.invested) * 100 : 0
      const normVal = activeTimeframe.value === 'ALL' ? curRet : (curRet - firstRet)
      return {
        time: d.time as any,
        value: Number(normVal.toFixed(2))
      }
    }))

    benchmarkLineSeries.setData(data.map(d => ({
      time: d.time as any,
      value: d.benchmark !== undefined
        ? Number((((d.benchmark - startBench) / startBench) * 100).toFixed(2))
        : 0
    })))
  } else if (mode === 'rupee') {
    // 2. NET WORTH (₹) VS INVESTED CAPITAL BASELINE
    mainChart.priceScale('left').applyOptions({ visible: false })
    mainChart.priceScale('right').applyOptions({
      visible: true,
      autoScale: true,
      scaleMargins: { top: 0.12, bottom: 0.12 }
    })

    portfolioAreaSeries.applyOptions({
      priceScaleId: 'right',
      priceFormat: {
        type: 'custom',
        formatter: (p: number) => '₹' + p.toLocaleString('en-IN', { maximumFractionDigits: 0 })
      }
    })
    investedLineSeries.applyOptions({
      visible: true,
      priceScaleId: 'right',
      priceFormat: {
        type: 'custom',
        formatter: (p: number) => '₹' + p.toLocaleString('en-IN', { maximumFractionDigits: 0 })
      }
    })
    benchmarkLineSeries.applyOptions({ visible: false })

    portfolioAreaSeries.setData(data.map(d => ({ time: d.time as any, value: d.value })))
    investedLineSeries.setData(data.map(d => ({ time: d.time as any, value: d.invested })))
  } else if (mode === 'dual') {
    // 3. DUAL AXIS: Portfolio (₹ on Right) & Nifty Index (Points on Left)
    mainChart.priceScale('left').applyOptions({
      visible: true,
      autoScale: true,
      scaleMargins: { top: 0.12, bottom: 0.12 }
    })
    mainChart.priceScale('right').applyOptions({
      visible: true,
      autoScale: true,
      scaleMargins: { top: 0.12, bottom: 0.12 }
    })

    portfolioAreaSeries.applyOptions({
      priceScaleId: 'right',
      priceFormat: {
        type: 'custom',
        formatter: (p: number) => '₹' + p.toLocaleString('en-IN', { maximumFractionDigits: 0 })
      }
    })
    investedLineSeries.applyOptions({
      visible: true,
      priceScaleId: 'right',
      priceFormat: {
        type: 'custom',
        formatter: (p: number) => '₹' + p.toLocaleString('en-IN', { maximumFractionDigits: 0 })
      }
    })
    benchmarkLineSeries.applyOptions({
      visible: true,
      priceLineVisible: false,
      lastValueVisible: true,
      priceScaleId: 'left',
      priceFormat: {
        type: 'custom',
        formatter: (p: number) => p.toLocaleString('en-IN', { maximumFractionDigits: 0 }) + ' pts'
      }
    })

    portfolioAreaSeries.setData(data.map(d => ({ time: d.time as any, value: d.value })))
    investedLineSeries.setData(data.map(d => ({ time: d.time as any, value: d.invested })))
    const benchData = data
      .filter(d => d.benchmark !== undefined)
      .map(d => ({ time: d.time as any, value: d.benchmark! }))
    benchmarkLineSeries.setData(benchData)
  }

  mainChart.timeScale().fitContent()
}

function updateDrawdownChartData() {
  if (!drawdownAreaSeries) return
  const data = drawdownPoints.value
  if (data.length === 0) return

  drawdownAreaSeries.setData(data.map(d => ({ time: d.time as any, value: d.value })))
  drawdownChart?.timeScale().fitContent()
}

// Window Resize Observer
let resizeObserver: ResizeObserver | null = null
function setupResizeObserver() {
  if (typeof ResizeObserver === 'undefined') return

  resizeObserver = new ResizeObserver(() => {
    if (mainChartContainer.value && mainChart) {
      mainChart.applyOptions({ width: mainChartContainer.value.clientWidth })
      mainChart.timeScale().fitContent()
    }
    if (drawdownChartContainer.value && drawdownChart) {
      drawdownChart.applyOptions({ width: drawdownChartContainer.value.clientWidth })
      drawdownChart.timeScale().fitContent()
    }
  })

  if (mainChartContainer.value) resizeObserver.observe(mainChartContainer.value)
  if (drawdownChartContainer.value) resizeObserver.observe(drawdownChartContainer.value)
}

// Watchers
watch(
  () => [props.summary, activeTimeframe.value, chartDisplayMode.value],
  () => {
    nextTick(() => {
      updateMainChartData()
      updateDrawdownChartData()
    })
  },
  { deep: true }
)

watch(
  () => colorMode.value,
  () => {
    nextTick(() => {
      initCharts()
    })
  }
)

onMounted(() => {
  nextTick(() => {
    initCharts()
    setupResizeObserver()
  })
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (mainChart) {
    mainChart.remove()
    mainChart = null
  }
  if (drawdownChart) {
    drawdownChart.remove()
    drawdownChart = null
  }
})

// Formatters
function fmtCur(val: number) {
  return '₹' + (val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
</script>

<template>
  <div class="space-y-6">
    <!-- 1. EXECUTIVE KPI MATRIX (5 Institutional Stat Cards) -->
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
      <!-- Total Net Worth -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-xs">
        <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
          Total Net Worth
        </span>
        <div class="text-xl sm:text-2xl font-black font-mono text-neutral-900 dark:text-white">
          {{ fmtCur(summary?.portfolio.totalValue || 0) }}
        </div>
        <div class="text-[11px] font-mono mt-1 font-bold text-neutral-500">
          <span>Available Cash: </span>
          <span class="text-neutral-700 dark:text-neutral-300 font-semibold">{{ fmtCur(summary?.portfolio.cashBalance || 0) }}</span>
        </div>
      </div>

      <!-- Total Invested -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-xs">
        <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
          Total Invested
        </span>
        <div class="text-xl sm:text-2xl font-black font-mono text-neutral-900 dark:text-white">
          {{ fmtCur(summary?.portfolio.totalInvested || 0) }}
        </div>
        <div class="text-[11px] font-mono mt-1 font-bold">
          <span>Unrealized: </span>
          <span :class="(summary?.portfolio.unrealizedPnL || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'">
            {{ (summary?.portfolio.unrealizedPnL || 0) >= 0 ? '+' : '' }}{{ fmtCur(summary?.portfolio.unrealizedPnL || 0) }}
            ({{ (summary?.portfolio.unrealizedPnLPct || 0) >= 0 ? '+' : '' }}{{ summary?.portfolio.unrealizedPnLPct }}%)
          </span>
        </div>
      </div>

      <!-- Today's P&L (1D) -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-xs">
        <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
          Today's P&L (1D)
        </span>
        <div
          class="text-xl sm:text-2xl font-black font-mono"
          :class="(summary?.portfolio.dayPnL || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'"
        >
          {{ (summary?.portfolio.dayPnL || 0) >= 0 ? '+' : '' }}{{ fmtCur(summary?.portfolio.dayPnL || 0) }}
        </div>
        <div class="text-[11px] font-mono mt-1 font-bold" :class="(summary?.portfolio.dayPnL || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'">
          {{ (summary?.portfolio.dayPnLPct || 0) >= 0 ? '+' : '' }}{{ summary?.portfolio.dayPnLPct }}% vs Yesterday
        </div>
      </div>

      <!-- Realized Gains -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-xs">
        <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
          Realized Gains
        </span>
        <div
          class="text-xl sm:text-2xl font-black font-mono"
          :class="(summary?.portfolio.realizedPnL || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'"
        >
          {{ (summary?.portfolio.realizedPnL || 0) >= 0 ? '+' : '' }}{{ fmtCur(summary?.portfolio.realizedPnL || 0) }}
        </div>
        <div class="text-[11px] text-neutral-500 font-mono mt-1">
          <span>{{ summary?.portfolio.tradesCount || 0 }} total executed trades</span>
        </div>
      </div>

      <!-- Beta & Sharpe Ratio -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-xs">
        <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
          Portfolio Beta & Risk
        </span>
        <div class="text-xl sm:text-2xl font-black font-mono text-neutral-900 dark:text-white flex items-center gap-2">
          <span>β {{ summary?.riskMetrics.beta || 1.0 }}</span>
          <span class="text-xs font-normal text-neutral-400">Sharpe: {{ summary?.riskMetrics.sharpeRatio || 0 }}</span>
        </div>
        <div class="text-[11px] font-mono mt-1 text-neutral-500">
          <span>Max Drawdown: <strong class="text-rose-500">{{ summary?.riskMetrics.maxDrawdownPct }}%</strong></span>
        </div>
      </div>
    </div>

    <!-- 2. MAIN TRADINGVIEW CANVAS CHART: INSTITUTIONAL PERFORMANCE ENGINE -->
    <div class="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-5 shadow-xs">
      <!-- Chart Controls Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-100 dark:border-neutral-800/80 pb-4">
        <div class="space-y-1">
          <div class="flex items-center gap-2 flex-wrap">
            <UIcon name="i-lucide-trending-up" class="h-5 w-5 text-emerald-500" />
            <h3 class="font-black text-base sm:text-lg text-neutral-900 dark:text-white tracking-tight">
              Institutional Performance Trajectory
            </h3>
            <UBadge color="success" variant="subtle" size="xs">TradingView 60fps</UBadge>
            <UBadge color="neutral" variant="subtle" size="xs">
              {{ chartDisplayMode === 'percent' ? 'Normalized Relative Alpha (%)' : chartDisplayMode === 'rupee' ? 'Mark-To-Market (₹)' : 'Dual Axis (₹ + Points)' }}
            </UBadge>
          </div>
          <p class="text-xs text-neutral-500">
            Real-time equity curve benchmarking capital efficiency against NIFTY 50
          </p>
        </div>

        <!-- Controls: Display Mode Switcher & Timeframe Slicers -->
        <div class="flex items-center gap-3 flex-wrap">
          <!-- Mode Switcher -->
          <div class="flex items-center gap-1 p-1 rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/60 text-xs">
            <button
              type="button"
              class="px-3 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5"
              :class="chartDisplayMode === 'percent'
                ? 'bg-white dark:bg-neutral-900 text-primary shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'"
              title="Normalized % comparison against NIFTY 50"
              @click="chartDisplayMode = 'percent'"
            >
              <UIcon name="i-lucide-percent" class="h-3.5 w-3.5" />
              <span>% Alpha</span>
            </button>
            <button
              type="button"
              class="px-3 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5"
              :class="chartDisplayMode === 'rupee'
                ? 'bg-white dark:bg-neutral-900 text-primary shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'"
              title="Net Worth vs Invested Capital Baseline"
              @click="chartDisplayMode = 'rupee'"
            >
              <UIcon name="i-lucide-indian-rupee" class="h-3.5 w-3.5" />
              <span>₹ Net Worth</span>
            </button>
            <button
              type="button"
              class="px-3 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5"
              :class="chartDisplayMode === 'dual'
                ? 'bg-white dark:bg-neutral-900 text-primary shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'"
              title="Independent scales for Portfolio (Right) and NIFTY 50 (Left)"
              @click="chartDisplayMode = 'dual'"
            >
              <UIcon name="i-lucide-split" class="h-3.5 w-3.5" />
              <span>Dual Axis</span>
            </button>
          </div>

          <!-- Timeframe Slicers -->
          <div class="flex items-center gap-1 p-1 rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/60">
            <button
              v-for="tf in timeframes"
              :key="tf"
              type="button"
              class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer"
              :class="activeTimeframe === tf
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-2xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
              @click="activeTimeframe = tf"
            >
              {{ tf }}
            </button>
          </div>
        </div>
      </div>

      <!-- INTERACTIVE BLOOMBERG-GRADE HEADS-UP DISPLAY (HUD) -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 rounded-2xl bg-neutral-50/80 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-800 backdrop-blur-sm">
        <!-- 1. Mark-To-Market -->
        <div class="space-y-0.5">
          <div class="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Mark-To-Market</div>
          <div class="text-lg sm:text-xl font-black font-mono text-neutral-900 dark:text-white">
            {{ fmtCur(activeHud.portfolioValue) }}
          </div>
          <div class="text-[11px] font-mono flex items-center gap-1 font-bold" :class="activeHud.netGain >= 0 ? 'text-emerald-500' : 'text-rose-500'">
            <span>{{ activeHud.netGain >= 0 ? '+' : '' }}{{ fmtCur(activeHud.netGain) }}</span>
            <span>({{ activeHud.returnPct >= 0 ? '+' : '' }}{{ activeHud.returnPct.toFixed(2) }}%)</span>
          </div>
        </div>

        <!-- 2. Invested Capital -->
        <div class="space-y-0.5">
          <div class="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Invested Capital</div>
          <div class="text-lg sm:text-xl font-black font-mono text-neutral-800 dark:text-neutral-200">
            {{ fmtCur(activeHud.invested) }}
          </div>
          <div class="text-[11px] text-neutral-500 font-mono">
            Date: <strong class="text-neutral-700 dark:text-neutral-300">{{ activeHud.date }}</strong>
          </div>
        </div>

        <!-- 3. NIFTY 50 Benchmark -->
        <div class="space-y-0.5">
          <div class="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Nifty 50 Benchmark</div>
          <div class="text-lg sm:text-xl font-black font-mono text-indigo-500">
            {{ activeHud.benchmarkReturn >= 0 ? '+' : '' }}{{ activeHud.benchmarkReturn.toFixed(2) }}%
          </div>
          <div class="text-[11px] text-neutral-500 font-mono">
            Index: {{ activeHud.benchmarkValue?.toLocaleString('en-IN') || '24,745' }} pts
          </div>
        </div>

        <!-- 4. Generated Alpha -->
        <div class="space-y-0.5">
          <div class="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Alpha Outperformance</div>
          <div class="text-lg sm:text-xl font-black font-mono" :class="activeHud.alpha >= 0 ? 'text-emerald-500' : 'text-rose-500'">
            {{ activeHud.alpha >= 0 ? '+' : '' }}{{ activeHud.alpha.toFixed(2) }}%
          </div>
          <div>
            <UBadge :color="activeHud.alpha >= 0 ? 'success' : 'error'" variant="subtle" size="xs">
              {{ activeHud.alpha >= 0 ? '⚡ Outperforming Index' : '⚠️ Underperforming' }}
            </UBadge>
          </div>
        </div>

        <!-- 5. High Watermark Peak -->
        <div class="space-y-0.5 col-span-2 md:col-span-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Peak Watermark</div>
          <div class="text-lg sm:text-xl font-black font-mono text-neutral-800 dark:text-neutral-200">
            {{ fmtCur(highWatermark) }}
          </div>
          <div class="text-[11px] font-mono" :class="currentDrawdown < 0 ? 'text-rose-500' : 'text-emerald-500'">
            Current Drawdown: <strong>{{ currentDrawdown.toFixed(2) }}%</strong>
          </div>
        </div>
      </div>

      <!-- Canvas Mount Container -->
      <div ref="mainChartContainer" class="w-full h-[380px] relative">
        <div
          v-if="chartPoints.length === 0"
          class="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-neutral-400"
        >
          <UIcon name="i-lucide-activity" class="h-8 w-8 mb-2 opacity-50" />
          <p class="text-xs font-medium">Log trades to generate the interactive institutional performance curve.</p>
        </div>
      </div>

      <!-- Chart Legend & Indicator Status -->
      <div class="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-neutral-100 dark:border-neutral-800/80 text-xs font-medium text-neutral-600 dark:text-neutral-400">
        <div class="flex items-center gap-5 flex-wrap">
          <div class="flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-xs" />
            <span class="font-bold text-neutral-900 dark:text-white">
              {{ chartDisplayMode === 'percent' ? 'Portfolio Cumulative Return (%)' : 'Portfolio Net Worth (Mark-To-Market)' }}
            </span>
          </div>
          <div v-if="chartDisplayMode === 'rupee' || chartDisplayMode === 'dual'" class="flex items-center gap-1.5">
            <span class="h-1.5 w-3 border-b-2 border-dashed border-slate-400" />
            <span>Invested Capital Baseline</span>
          </div>
          <div v-if="chartDisplayMode === 'percent' || chartDisplayMode === 'dual'" class="flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-full bg-indigo-500" />
            <span>Nifty 50 Benchmark Correlation</span>
          </div>
        </div>

        <div class="text-[11px] font-mono text-neutral-400">
          Hover over chart to inspect granular mark-to-market valuations
        </div>
      </div>
    </div>

    <!-- 3. DRAWDOWN UNDERWATER CANVAS CHART & RISK RADAR -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <!-- Historical Drawdown & Underwater Analysis -->
      <div class="lg:col-span-2 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-3 shadow-xs">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="font-bold text-sm text-neutral-900 dark:text-white flex items-center gap-2">
              <UIcon name="i-lucide-trending-down" class="h-4 w-4 text-rose-500" />
              <span>Historical Drawdown & Underwater Analysis</span>
            </h4>
            <p class="text-[11px] text-neutral-500 mt-0.5">
              Quantifies capital drawdowns from portfolio peak valuation
            </p>
          </div>
          <UBadge color="error" variant="subtle" size="xs">
            Peak DD: -{{ Math.abs(summary?.riskMetrics.maxDrawdownPct || 0) }}%
          </UBadge>
        </div>

        <div ref="drawdownChartContainer" class="w-full h-[160px] relative">
          <div
            v-if="drawdownPoints.length === 0"
            class="absolute inset-0 flex flex-col items-center justify-center text-center p-4 text-neutral-400"
          >
            <p class="text-xs">Drawdown history will render automatically as portfolio marks fluctuate.</p>
          </div>
        </div>
      </div>

      <!-- Institutional Risk Metrics Radar -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4 shadow-xs">
        <h4 class="font-bold text-sm text-neutral-900 dark:text-white flex items-center gap-2">
          <UIcon name="i-lucide-shield-alert" class="h-4 w-4 text-primary" />
          <span>Institutional Risk Parameters</span>
        </h4>

        <div class="space-y-3 font-mono text-xs">
          <!-- Portfolio Beta -->
          <div class="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800">
            <span class="text-neutral-500 font-sans">Market Beta (β)</span>
            <span class="font-bold text-neutral-900 dark:text-white">
              {{ summary?.riskMetrics.beta || 1.0 }}
              <span class="text-[10px] text-neutral-400 font-normal">
                ({{ (summary?.riskMetrics.beta || 1) < 1 ? 'Low Volatility' : 'High Volatility' }})
              </span>
            </span>
          </div>

          <!-- Sharpe Ratio -->
          <div class="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800">
            <span class="text-neutral-500 font-sans">Annualized Sharpe Ratio</span>
            <span
              class="font-bold"
              :class="(summary?.riskMetrics.sharpeRatio || 0) >= 1 ? 'text-emerald-500' : 'text-neutral-700 dark:text-neutral-300'"
            >
              {{ summary?.riskMetrics.sharpeRatio || 0 }}
            </span>
          </div>

          <!-- 1-Day VaR 95% -->
          <div class="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800">
            <span class="text-neutral-500 font-sans">1-Day VaR (95% Confidence)</span>
            <span class="font-bold text-rose-500">
              -{{ fmtCur(summary?.riskMetrics.var95Pct || 0) }}
            </span>
          </div>

          <!-- Max Drawdown -->
          <div class="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800">
            <span class="text-neutral-500 font-sans">Max Historic Drawdown</span>
            <span class="font-bold text-rose-500">
              -{{ Math.abs(summary?.riskMetrics.maxDrawdownPct || 0) }}%
            </span>
          </div>

          <!-- Concentration Index -->
          <div class="flex items-center justify-between">
            <span class="text-neutral-500 font-sans">Top 3 Stocks Exposure</span>
            <span class="font-bold text-neutral-900 dark:text-white">
              {{ summary?.riskMetrics.concentrationTop3Pct || 0 }}%
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 4. ALPHA CONTRIBUTORS & LAGGARDS -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
      <!-- Top Performers -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-3 shadow-xs">
        <h4 class="font-bold text-sm text-neutral-900 dark:text-white flex items-center gap-2">
          <UIcon name="i-lucide-arrow-up-right" class="h-4 w-4 text-emerald-500" />
          <span>Top Alpha Contributors</span>
        </h4>

        <div v-if="topPerformers.length > 0" class="space-y-2.5 font-mono text-xs">
          <div
            v-for="h in topPerformers"
            :key="h.symbol"
            class="flex items-center justify-between p-2.5 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40 hover:border-emerald-500/40 transition-colors cursor-pointer"
            @click="emit('open-stock', h.symbol)"
          >
            <div>
              <div class="font-bold text-neutral-900 dark:text-white font-sans flex items-center gap-2">
                <span>{{ h.symbol }}</span>
                <UBadge color="neutral" variant="subtle" size="xs" class="text-[9px]">{{ h.sector }}</UBadge>
              </div>
              <span class="text-[11px] text-neutral-500">Qty: {{ h.quantity }} • Avg: ₹{{ h.averageCost.toFixed(2) }}</span>
            </div>
            <div class="text-right">
              <div class="font-bold text-emerald-500">
                +{{ fmtCur(h.unrealizedPnL) }}
              </div>
              <span class="text-[10px] font-bold text-emerald-500">
                +{{ h.unrealizedPnLPct }}%
              </span>
            </div>
          </div>
        </div>
        <div v-else class="p-6 text-center text-neutral-400 text-xs">
          No active positions found.
        </div>
      </div>

      <!-- Laggards / Underperformers -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-3 shadow-xs">
        <h4 class="font-bold text-sm text-neutral-900 dark:text-white flex items-center gap-2">
          <UIcon name="i-lucide-arrow-down-right" class="h-4 w-4 text-rose-500" />
          <span>Positions In Drawdown (Tax-Loss Harvest Candidates)</span>
        </h4>

        <div v-if="laggards.length > 0" class="space-y-2.5 font-mono text-xs">
          <div
            v-for="h in laggards"
            :key="h.symbol"
            class="flex items-center justify-between p-2.5 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40 hover:border-rose-500/40 transition-colors cursor-pointer"
            @click="emit('open-stock', h.symbol)"
          >
            <div>
              <div class="font-bold text-neutral-900 dark:text-white font-sans flex items-center gap-2">
                <span>{{ h.symbol }}</span>
                <UBadge color="neutral" variant="subtle" size="xs" class="text-[9px]">{{ h.sector }}</UBadge>
              </div>
              <span class="text-[11px] text-neutral-500">Qty: {{ h.quantity }} • Avg: ₹{{ h.averageCost.toFixed(2) }}</span>
            </div>
            <div class="text-right">
              <div class="font-bold text-rose-500">
                {{ fmtCur(h.unrealizedPnL) }}
              </div>
              <span class="text-[10px] font-bold text-rose-500">
                {{ h.unrealizedPnLPct }}%
              </span>
            </div>
          </div>
        </div>
        <div v-else class="p-6 text-center text-neutral-400 text-xs">
          Zero holdings currently in drawdown. All active positions are profitable!
        </div>
      </div>
    </div>
  </div>
</template>
