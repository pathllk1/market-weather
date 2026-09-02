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

let drawdownChart: IChartApi | null = null
let drawdownAreaSeries: ISeriesApi<'Area'> | null = null

// Crosshair Tooltip state
const crosshairData = ref<{
  date: string
  portfolioValue: number
  invested: number
  benchmarkValue?: number
} | null>(null)

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
    portfolioTopColor: 'rgba(16, 185, 129, 0.4)',
    portfolioBottomColor: 'rgba(16, 185, 129, 0.02)',
    portfolioLineColor: '#10b981',
    benchmarkLineColor: '#6366f1',
    drawdownTopColor: 'rgba(244, 63, 94, 0.02)',
    drawdownBottomColor: 'rgba(244, 63, 94, 0.4)',
    drawdownLineColor: '#f43f5e'
  }
}

// Chart Data Builder
const chartPoints = computed(() => {
  if (!props.summary?.historicalValueCurve || props.summary.historicalValueCurve.length === 0) {
    return []
  }

  const invested = props.summary.portfolio.totalInvested || 0
  const raw = props.summary.historicalValueCurve.map(pt => ({
    time: pt.date,
    value: Number(pt.portfolioValue.toFixed(2)),
    invested: Number(invested.toFixed(2)),
    benchmark: pt.benchmarkValue ? Number(pt.benchmarkValue.toFixed(2)) : undefined
  }))

  // Filter based on active timeframe
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

// Historical Drawdown Points
const drawdownPoints = computed(() => {
  const pts = chartPoints.value
  if (pts.length === 0) return []

  let peak = pts[0]?.value || 0
  return pts.map(pt => {
    if (pt.value > peak) peak = pt.value
    const dd = peak > 0 ? ((pt.value - peak) / peak) * 100 : 0
    return {
      time: pt.time,
      value: Number(dd.toFixed(2))
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
    height: 340,
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
        labelBackgroundColor: theme.background
      },
      horzLine: {
        color: theme.crosshairColor,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: theme.background
      }
    },
    rightPriceScale: {
      borderColor: theme.borderColor,
      scaleMargins: { top: 0.1, bottom: 0.15 },
      autoScale: true
    },
    timeScale: {
      borderColor: theme.borderColor,
      rightOffset: 6,
      barSpacing: 12,
      minBarSpacing: 4,
      fixLeftEdge: true
    },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
    handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true }
  })

  // Portfolio Area Series (v5 addSeries API)
  portfolioAreaSeries = mainChart.addSeries(AreaSeries, {
    topColor: theme.portfolioTopColor,
    bottomColor: theme.portfolioBottomColor,
    lineColor: theme.portfolioLineColor,
    lineWidth: 2,
    priceFormat: {
      type: 'custom',
      formatter: (p: number) => '₹' + p.toLocaleString('en-IN', { maximumFractionDigits: 0 })
    }
  })

  // Benchmark Overlay Line Series
  benchmarkLineSeries = mainChart.addSeries(LineSeries, {
    color: theme.benchmarkLineColor,
    lineWidth: 1,
    lineStyle: LineStyle.Dotted,
    priceFormat: {
      type: 'custom',
      formatter: (p: number) => '₹' + p.toLocaleString('en-IN', { maximumFractionDigits: 0 })
    }
  })

  // Set Data
  updateMainChartData()

  // Crosshair Handler
  mainChart.subscribeCrosshairMove((param) => {
    if (!param.time || !param.seriesData) {
      crosshairData.value = null
      return
    }

    const portData = portfolioAreaSeries ? (param.seriesData.get(portfolioAreaSeries) as any) : null
    const benchData = benchmarkLineSeries ? (param.seriesData.get(benchmarkLineSeries) as any) : null

    if (portData) {
      const match = chartPoints.value.find(p => p.time === param.time)
      crosshairData.value = {
        date: String(param.time),
        portfolioValue: portData.value,
        invested: match?.invested || 0,
        benchmarkValue: benchData?.value
      }
    } else {
      crosshairData.value = null
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
        rightOffset: 6,
        barSpacing: 12,
        minBarSpacing: 4,
        fixLeftEdge: true
      }
    })

    drawdownAreaSeries = drawdownChart.addSeries(AreaSeries, {
      topColor: theme.drawdownTopColor,
      bottomColor: theme.drawdownBottomColor,
      lineColor: theme.drawdownLineColor,
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (p: number) => p.toFixed(2) + '%'
      }
    })

    updateDrawdownChartData()
  }
}

function updateMainChartData() {
  if (!portfolioAreaSeries || !benchmarkLineSeries) return

  const data = chartPoints.value
  if (data.length === 0) return

  portfolioAreaSeries.setData(data.map(d => ({ time: d.time as any, value: d.value })))

  const benchData = data
    .filter(d => d.benchmark !== undefined)
    .map(d => ({ time: d.time as any, value: d.benchmark! }))

  if (benchData.length > 0) {
    benchmarkLineSeries.setData(benchData)
  }

  mainChart?.timeScale().fitContent()
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
    }
    if (drawdownChartContainer.value && drawdownChart) {
      drawdownChart.applyOptions({ width: drawdownChartContainer.value.clientWidth })
    }
  })

  if (mainChartContainer.value) resizeObserver.observe(mainChartContainer.value)
  if (drawdownChartContainer.value) resizeObserver.observe(drawdownChartContainer.value)
}

// Watchers
watch(
  () => [props.summary, activeTimeframe.value],
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

    <!-- 2. MAIN TRADINGVIEW CANVAS CHART: PORTFOLIO NET WORTH VS BENCHMARK -->
    <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4 shadow-xs">
      <!-- Chart Controls Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 dark:border-neutral-800/80 pb-3">
        <div class="space-y-0.5">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-line-chart" class="h-5 w-5 text-emerald-500" />
            <h3 class="font-bold text-base text-neutral-900 dark:text-white">
              Institutional Performance Trajectory
            </h3>
            <UBadge color="neutral" variant="subtle" size="xs">Canvas 60fps</UBadge>
          </div>
          <p class="text-xs text-neutral-500">
            Real-time equity curve mark-to-market with benchmark index correlation
          </p>
        </div>

        <!-- Timeframe Slicers -->
        <div class="flex items-center gap-1 p-1 rounded-xl bg-neutral-100 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60">
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

      <!-- Live Hover Crosshair HUD Tooltip -->
      <div
        v-if="crosshairData"
        class="flex items-center gap-4 py-2 px-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 text-xs font-mono border border-neutral-200 dark:border-neutral-700"
      >
        <div class="text-neutral-500">
          <span>Date: </span>
          <strong class="text-neutral-900 dark:text-white">{{ crosshairData.date }}</strong>
        </div>
        <div>
          <span class="text-neutral-500">Portfolio: </span>
          <strong class="text-emerald-500">{{ fmtCur(crosshairData.portfolioValue) }}</strong>
        </div>
        <div>
          <span class="text-neutral-500">Invested: </span>
          <strong class="text-neutral-700 dark:text-neutral-300">{{ fmtCur(crosshairData.invested) }}</strong>
        </div>
        <div v-if="crosshairData.benchmarkValue">
          <span class="text-neutral-500">Benchmark: </span>
          <strong class="text-indigo-500">{{ fmtCur(crosshairData.benchmarkValue) }}</strong>
        </div>
      </div>

      <!-- Canvas Mount Container -->
      <div ref="mainChartContainer" class="w-full h-[340px] relative">
        <div
          v-if="chartPoints.length === 0"
          class="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-neutral-400"
        >
          <UIcon name="i-lucide-activity" class="h-8 w-8 mb-2 opacity-50" />
          <p class="text-xs font-medium">Log trades to generate the interactive institutional performance curve.</p>
        </div>
      </div>

      <!-- Chart Legend -->
      <div class="flex items-center gap-5 pt-2 border-t border-neutral-100 dark:border-neutral-800/80 text-xs font-medium text-neutral-600 dark:text-neutral-400">
        <div class="flex items-center gap-1.5">
          <span class="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span>Portfolio Net Worth (Mark-to-Market)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="h-2.5 w-2.5 rounded-full bg-indigo-500" />
          <span>Nifty 50 Benchmark Correlation</span>
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
            Peak DD: -{{ summary?.riskMetrics.maxDrawdownPct || 0 }}%
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
              -{{ summary?.riskMetrics.maxDrawdownPct || 0 }}%
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
