<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  AreaSeries,
  LineSeries,
  BaselineSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type HistogramData,
  type Time,
  type LineWidth
} from 'lightweight-charts'

export interface Candle {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type ChartType = 'candles' | 'hollow' | 'area' | 'line' | 'baseline' | 'heikin_ashi'

const props = defineProps<{
  symbol: string
  initialRange?: string
}>()

// State: Timeframe & Chart Style
const activeRange = ref(props.initialRange || '6M')
const activeChartType = ref<ChartType>('candles')
const ranges = ['1D', '5D', '1M', '3M', '6M', '1Y', '5Y', 'ALL']

// State: Technical Indicators Toggles
const showSma20 = ref(true)
const showSma50 = ref(true)
const showSma200 = ref(false)
const showEma9 = ref(false)
const showEma21 = ref(false)
const showBollingerBands = ref(false)
const showVolumeMa = ref(true)
const showRsi = ref(false)
const showMacd = ref(false)
// Secondary display option for right price axis labels (default false to prevent collision with LTP)
const showIndicatorAxisLabels = ref(false)

// State: UI Controls
const isFullscreen = ref(false)
const isIndicatorsMenuOpen = ref(false)
const isChartTypeMenuOpen = ref(false)
const isLoading = ref(false)

// Data & Stats
const candles = ref<Candle[]>([])
const lookbackCandles = ref<Candle[]>([])
const stats = ref({
  periodHigh: 0,
  periodLow: 0,
  avgVolume: 0,
  periodReturn: 0
})

// Dynamic HUD State (Cursor or latest candle)
const hudData = ref<{
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  change: number
  changePct: number
  sma20?: number | null
  sma50?: number | null
  sma200?: number | null
  ema9?: number | null
  ema21?: number | null
  bbUpper?: number | null
  bbLower?: number | null
  rsi?: number | null
  macd?: number | null
} | null>(null)

// DOM Refs
const mainChartContainer = ref<HTMLElement | null>(null)
const oscChartContainer = ref<HTMLElement | null>(null)
const chartWrapperRef = ref<HTMLElement | null>(null)

// Chart Instances & Series Refs
let mainChart: IChartApi | null = null
let oscChart: IChartApi | null = null

let mainPriceSeries: ISeriesApi<'Candlestick' | 'Area' | 'Line' | 'Baseline'> | null = null
let volumeSeries: ISeriesApi<'Histogram'> | null = null
let volumeMaSeries: ISeriesApi<'Line'> | null = null

let sma20Series: ISeriesApi<'Line'> | null = null
let sma50Series: ISeriesApi<'Line'> | null = null
let sma200Series: ISeriesApi<'Line'> | null = null
let ema9Series: ISeriesApi<'Line'> | null = null
let ema21Series: ISeriesApi<'Line'> | null = null

let bbUpperSeries: ISeriesApi<'Line'> | null = null
let bbLowerSeries: ISeriesApi<'Line'> | null = null
let bbBasisSeries: ISeriesApi<'Line'> | null = null

let rsiSeries: ISeriesApi<'Line'> | null = null
let macdLineSeries: ISeriesApi<'Line'> | null = null
let macdSignalSeries: ISeriesApi<'Line'> | null = null
let macdHistSeries: ISeriesApi<'Histogram'> | null = null

let resizeObserver: ResizeObserver | null = null

// Color Palette Constants
const COLORS = {
  bullish: '#10b981', // Emerald 500
  bearish: '#ef4444', // Rose 500
  sma20: '#3b82f6',   // Blue 500
  sma50: '#f59e0b',   // Amber 500
  sma200: '#a855f7',  // Purple 500
  ema9: '#06b6d4',    // Cyan 500
  ema21: '#ec4899',   // Pink 500
  bb: '#6366f1',      // Indigo 500
  rsi: '#8b5cf6',     // Violet 500
  macdLine: '#3b82f6',
  macdSignal: '#f97316'
}

// Dark Mode Detection
function isDarkMode(): boolean {
  if (typeof document === 'undefined') return true
  return document.documentElement.classList.contains('dark')
}

function getChartThemeOptions() {
  const dark = isDarkMode()
  return {
    background: dark ? '#0a0a0c' : '#ffffff',
    textColor: dark ? '#a1a1aa' : '#52525b',
    gridColor: dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
    borderColor: dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    crosshairColor: dark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'
  }
}

// ==========================================
// TECHNICAL INDICATOR MATH ALGORITHMS
// ==========================================

function calculateSma(data: Candle[], period: number) {
  const result: Array<{ time: Time; value: number }> = []
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0
    for (let j = 0; j < period; j++) {
      sum += data[i - j]!.close
    }
    result.push({
      time: data[i]!.date as Time,
      value: Number((sum / period).toFixed(2))
    })
  }
  return result
}

function calculateEma(data: Candle[], period: number) {
  if (data.length === 0) return []
  const k = 2 / (period + 1)
  const result: Array<{ time: Time; value: number }> = []
  let ema = data[0]!.close

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push({ time: data[i]!.date as Time, value: Number(ema.toFixed(2)) })
    } else {
      ema = data[i]!.close * k + ema * (1 - k)
      result.push({ time: data[i]!.date as Time, value: Number(ema.toFixed(2)) })
    }
  }
  return result
}

function calculateBollingerBands(data: Candle[], period = 20, multiplier = 2) {
  const upper: Array<{ time: Time; value: number }> = []
  const lower: Array<{ time: Time; value: number }> = []
  const basis: Array<{ time: Time; value: number }> = []

  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1)
    const avg = slice.reduce((sum, c) => sum + c.close, 0) / period
    const variance = slice.reduce((sum, c) => sum + Math.pow(c.close - avg, 2), 0) / period
    const stdDev = Math.sqrt(variance)

    const t = data[i]!.date as Time
    basis.push({ time: t, value: Number(avg.toFixed(2)) })
    upper.push({ time: t, value: Number((avg + multiplier * stdDev).toFixed(2)) })
    lower.push({ time: t, value: Number((avg - multiplier * stdDev).toFixed(2)) })
  }

  return { upper, lower, basis }
}

function calculateHeikinAshi(data: Candle[]): Candle[] {
  const ha: Candle[] = []
  for (let i = 0; i < data.length; i++) {
    const c = data[i]!
    const haClose = (c.open + c.high + c.low + c.close) / 4
    let haOpen = c.open
    if (i > 0) {
      haOpen = (ha[i - 1]!.open + ha[i - 1]!.close) / 2
    }
    const haHigh = Math.max(c.high, haOpen, haClose)
    const haLow = Math.min(c.low, haOpen, haClose)

    ha.push({
      date: c.date,
      open: Number(haOpen.toFixed(2)),
      high: Number(haHigh.toFixed(2)),
      low: Number(haLow.toFixed(2)),
      close: Number(haClose.toFixed(2)),
      volume: c.volume
    })
  }
  return ha
}

function calculateVolumeMa(data: Candle[], period = 20) {
  const result: Array<{ time: Time; value: number }> = []
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0
    for (let j = 0; j < period; j++) {
      sum += data[i - j]!.volume
    }
    result.push({
      time: data[i]!.date as Time,
      value: Math.round(sum / period)
    })
  }
  return result
}

function calculateRsi(data: Candle[], period = 14) {
  if (data.length <= period) return []
  const res: Array<{ time: Time; value: number }> = []

  let gains = 0
  let losses = 0
  for (let i = 1; i <= period; i++) {
    const diff = data[i]!.close - data[i - 1]!.close
    if (diff >= 0) gains += diff
    else losses += Math.abs(diff)
  }

  let avgGain = gains / period
  let avgLoss = losses / period
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss
  let rsi = 100 - 100 / (1 + rs)
  res.push({ time: data[period]!.date as Time, value: Number(rsi.toFixed(2)) })

  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i]!.close - data[i - 1]!.close
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? Math.abs(diff) : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    rsi = 100 - 100 / (1 + rs)
    res.push({ time: data[i]!.date as Time, value: Number(rsi.toFixed(2)) })
  }

  return res
}

function calculateMacd(data: Candle[], fast = 12, slow = 26, signal = 9) {
  if (data.length <= slow) return { macd: [], signal: [], hist: [] }

  const emaFast = calculateEma(data, fast)
  const emaSlow = calculateEma(data, slow)

  const fastMap = new Map(emaFast.map(p => [p.time as string, p.value]))
  const slowMap = new Map(emaSlow.map(p => [p.time as string, p.value]))

  const macdRaw: Array<{ date: string; close: number }> = []
  const macdLine: Array<{ time: Time; value: number }> = []

  for (const c of data) {
    const f = fastMap.get(c.date)
    const s = slowMap.get(c.date)
    if (f !== undefined && s !== undefined) {
      const val = Number((f - s).toFixed(2))
      macdLine.push({ time: c.date as Time, value: val })
      macdRaw.push({ date: c.date, close: val })
    }
  }

  const k = 2 / (signal + 1)
  const signalLine: Array<{ time: Time; value: number }> = []
  const histogram: Array<{ time: Time; value: number; color: string }> = []

  let sigEma = macdRaw[0]?.close || 0
  for (let i = 0; i < macdRaw.length; i++) {
    const val = macdRaw[i]!.close
    if (i === 0) {
      sigEma = val
    } else {
      sigEma = val * k + sigEma * (1 - k)
    }

    if (i >= signal - 1) {
      const sigVal = Number(sigEma.toFixed(2))
      const histVal = Number((val - sigVal).toFixed(2))
      const t = macdRaw[i]!.date as Time

      signalLine.push({ time: t, value: sigVal })
      histogram.push({
        time: t,
        value: histVal,
        color: histVal >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)'
      })
    }
  }

  return { macd: macdLine, signal: signalLine, hist: histogram }
}

// Indicator lookup caches for instantaneous crosshair HUD updates (computed with lookback warmup history)
const fullDataset = computed(() => (lookbackCandles.value.length > 0 ? lookbackCandles.value : candles.value))

const sma20Map = computed(() => new Map(calculateSma(fullDataset.value, 20).map(p => [p.time as string, p.value])))
const sma50Map = computed(() => new Map(calculateSma(fullDataset.value, 50).map(p => [p.time as string, p.value])))
const sma200Map = computed(() => new Map(calculateSma(fullDataset.value, 200).map(p => [p.time as string, p.value])))
const ema9Map = computed(() => new Map(calculateEma(fullDataset.value, 9).map(p => [p.time as string, p.value])))
const ema21Map = computed(() => new Map(calculateEma(fullDataset.value, 21).map(p => [p.time as string, p.value])))
const rsiMap = computed(() => new Map(calculateRsi(fullDataset.value, 14).map(p => [p.time as string, p.value])))

// ==========================================
// CHART INITIALIZATION & RENDERING ENGINE
// ==========================================

function initMainChart() {
  if (!mainChartContainer.value) return
  if (mainChart) {
    mainChart.remove()
    mainChart = null
  }

  const theme = getChartThemeOptions()
  const container = mainChartContainer.value

  mainChart = createChart(container, {
    width: container.clientWidth,
    height: container.clientHeight,
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
      scaleMargins: {
        top: 0.1,
        bottom: 0.22
      },
      autoScale: true
    },
    timeScale: {
      borderColor: theme.borderColor,
      rightOffset: 6,
      barSpacing: 8,
      minBarSpacing: 3,
      fixLeftEdge: true,
      timeVisible: false
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false
    },
    handleScale: {
      axisPressedMouseMove: true,
      mouseWheel: true,
      pinch: true
    }
  })

  // Create Volume Series (Bottom 20%) - hidden priceLine and axis tags to prevent clutter
  volumeSeries = mainChart.addSeries(HistogramSeries, {
    color: '#26a69a',
    priceFormat: {
      type: 'volume'
    },
    priceScaleId: 'volume',
    priceLineVisible: false,
    lastValueVisible: false
  })

  mainChart.priceScale('volume').applyOptions({
    scaleMargins: {
      top: 0.78,
      bottom: 0
    }
  })

  // Crosshair move subscription for live HUD readout
  mainChart.subscribeCrosshairMove((param) => {
    if (!param.time || !param.seriesData) {
      updateHudWithLatest()
      return
    }

    const t = String(param.time)
    const candle = candles.value.find(c => c.date === t)
    if (!candle) return

    const prevIndex = candles.value.findIndex(c => c.date === t) - 1
    const prevClose = prevIndex >= 0 ? candles.value[prevIndex]?.close ?? candle.open : candle.open
    const change = candle.close - prevClose
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0

    hudData.value = {
      date: candle.date,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      change: Number(change.toFixed(2)),
      changePct: Number(changePct.toFixed(2)),
      sma20: showSma20.value ? sma20Map.value.get(t) ?? null : null,
      sma50: showSma50.value ? sma50Map.value.get(t) ?? null : null,
      sma200: showSma200.value ? sma200Map.value.get(t) ?? null : null,
      ema9: showEma9.value ? ema9Map.value.get(t) ?? null : null,
      ema21: showEma21.value ? ema21Map.value.get(t) ?? null : null,
      rsi: showRsi.value ? rsiMap.value.get(t) ?? null : null
    }
  })
}

function initOscChart() {
  if (!oscChartContainer.value || (!showRsi.value && !showMacd.value)) {
    if (oscChart) {
      oscChart.remove()
      oscChart = null
    }
    return
  }

  if (oscChart) {
    oscChart.remove()
    oscChart = null
  }

  const theme = getChartThemeOptions()
  const container = oscChartContainer.value

  oscChart = createChart(container, {
    width: container.clientWidth,
    height: container.clientHeight,
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
      scaleMargins: { top: 0.1, bottom: 0.1 }
    },
    timeScale: {
      borderColor: theme.borderColor,
      rightOffset: 6,
      barSpacing: 8,
      visible: true
    }
  })

  // Synchronize time scales between Main Chart and Oscillator Chart
  if (mainChart && oscChart) {
    mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range && oscChart) {
        oscChart.timeScale().setVisibleLogicalRange(range)
      }
    })
    oscChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range && mainChart) {
        mainChart.timeScale().setVisibleLogicalRange(range)
      }
    })
  }
}

function renderAllData() {
  if (!mainChart || candles.value.length === 0) return

  const rawData = candles.value
  const displayData = activeChartType.value === 'heikin_ashi'
    ? calculateHeikinAshi(rawData)
    : rawData

  const lastCandle = displayData[displayData.length - 1]
  const isUp = lastCandle ? lastCandle.close >= lastCandle.open : true
  const ltpColor = isUp ? COLORS.bullish : COLORS.bearish

  // 1. Recreate main price series with strong authoritative LTP priority
  if (mainPriceSeries) {
    mainChart.removeSeries(mainPriceSeries)
    mainPriceSeries = null
  }

  if (activeChartType.value === 'candles' || activeChartType.value === 'heikin_ashi') {
    mainPriceSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: COLORS.bullish,
      downColor: COLORS.bearish,
      borderVisible: false,
      wickUpColor: COLORS.bullish,
      wickDownColor: COLORS.bearish,
      title: 'LTP',
      priceLineVisible: true,
      priceLineWidth: 2,
      priceLineColor: ltpColor,
      priceLineStyle: LineStyle.Dashed,
      lastValueVisible: true
    })
    const candleData: CandlestickData<Time>[] = displayData.map(c => ({
      time: c.date as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    }))
    mainPriceSeries.setData(candleData)
  } else if (activeChartType.value === 'hollow') {
    mainPriceSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: 'transparent',
      downColor: COLORS.bearish,
      borderUpColor: COLORS.bullish,
      borderDownColor: COLORS.bearish,
      borderVisible: true,
      wickUpColor: COLORS.bullish,
      wickDownColor: COLORS.bearish,
      title: 'LTP',
      priceLineVisible: true,
      priceLineWidth: 2,
      priceLineColor: ltpColor,
      priceLineStyle: LineStyle.Dashed,
      lastValueVisible: true
    })
    const candleData: CandlestickData<Time>[] = displayData.map(c => ({
      time: c.date as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    }))
    mainPriceSeries.setData(candleData)
  } else if (activeChartType.value === 'area') {
    mainPriceSeries = mainChart.addSeries(AreaSeries, {
      topColor: 'rgba(16, 185, 129, 0.4)',
      bottomColor: 'rgba(16, 185, 129, 0.0)',
      lineColor: COLORS.bullish,
      lineWidth: 2,
      title: 'LTP',
      priceLineVisible: true,
      priceLineWidth: 2,
      priceLineColor: ltpColor,
      priceLineStyle: LineStyle.Dashed,
      lastValueVisible: true
    })
    const areaData: LineData<Time>[] = displayData.map(c => ({
      time: c.date as Time,
      value: c.close
    }))
    mainPriceSeries.setData(areaData)
  } else if (activeChartType.value === 'baseline') {
    const baseVal = displayData[0]?.close || 100
    mainPriceSeries = mainChart.addSeries(BaselineSeries, {
      baseValue: { type: 'price', price: baseVal },
      topLineColor: COLORS.bullish,
      topFillColor1: 'rgba(16, 185, 129, 0.3)',
      topFillColor2: 'rgba(16, 185, 129, 0.0)',
      bottomLineColor: COLORS.bearish,
      bottomFillColor1: 'rgba(239, 68, 68, 0.0)',
      bottomFillColor2: 'rgba(239, 68, 68, 0.3)',
      title: 'LTP',
      priceLineVisible: true,
      priceLineWidth: 2,
      priceLineColor: ltpColor,
      priceLineStyle: LineStyle.Dashed,
      lastValueVisible: true
    })
    const baseData: LineData<Time>[] = displayData.map(c => ({
      time: c.date as Time,
      value: c.close
    }))
    mainPriceSeries.setData(baseData)
  } else {
    mainPriceSeries = mainChart.addSeries(LineSeries, {
      color: COLORS.bullish,
      lineWidth: 2,
      title: 'LTP',
      priceLineVisible: true,
      priceLineWidth: 2,
      priceLineColor: ltpColor,
      priceLineStyle: LineStyle.Dashed,
      lastValueVisible: true
    })
    const lineData: LineData<Time>[] = displayData.map(c => ({
      time: c.date as Time,
      value: c.close
    }))
    mainPriceSeries.setData(lineData)
  }

  // 2. Render Volume Bars
  if (volumeSeries) {
    const volData: HistogramData<Time>[] = rawData.map(c => ({
      time: c.date as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'
    }))
    volumeSeries.setData(volData)
  }

  // 3. Technical Indicator Overlays
  renderOverlays(rawData)

  // 4. Render Oscillators (RSI / MACD)
  renderOscillators(rawData)

  // 5. Fit content
  mainChart.timeScale().fitContent()
  if (oscChart) {
    oscChart.timeScale().fitContent()
  }

  updateHudWithLatest()
}

function renderOverlays(rawData: Candle[]) {
  if (!mainChart) return

  // Use full lookback dataset so indicators have enough preceding candles to start at the exact first candle of the requested range
  const fullData = fullDataset.value
  const firstDisplayDate = rawData[0]?.date

  // Helper to sync line series and filter to the visible display period
  const updateLineSeries = (
    existing: ISeriesApi<'Line'> | null,
    show: boolean,
    color: string,
    lineWidth: LineWidth,
    title: string,
    calculatedData: Array<{ time: Time; value: number }>
  ): ISeriesApi<'Line'> | null => {
    if (!show) {
      if (existing) mainChart!.removeSeries(existing)
      return null
    }
    const series = existing || mainChart!.addSeries(LineSeries, {
      color,
      lineWidth,
      title,
      priceLineVisible: false, // Prevents horizontal line cutting across candles
      lastValueVisible: showIndicatorAxisLabels.value // Avoids price axis label collision with LTP
    })
    series.applyOptions({
      lastValueVisible: showIndicatorAxisLabels.value
    })
    // Filter to visible display period so both SMA20 and SMA50 start on candle 0
    const displayData = firstDisplayDate
      ? calculatedData.filter(p => (p.time as string) >= firstDisplayDate)
      : calculatedData

    series.setData(displayData as LineData<Time>[])
    return series
  }

  sma20Series = updateLineSeries(sma20Series, showSma20.value, COLORS.sma20, 2, 'SMA 20', calculateSma(fullData, 20))
  sma50Series = updateLineSeries(sma50Series, showSma50.value, COLORS.sma50, 2, 'SMA 50', calculateSma(fullData, 50))
  sma200Series = updateLineSeries(sma200Series, showSma200.value, COLORS.sma200, 2, 'SMA 200', calculateSma(fullData, 200))
  ema9Series = updateLineSeries(ema9Series, showEma9.value, COLORS.ema9, 2, 'EMA 9', calculateEma(fullData, 9))
  ema21Series = updateLineSeries(ema21Series, showEma21.value, COLORS.ema21, 2, 'EMA 21', calculateEma(fullData, 21))

  // Bollinger Bands
  if (showBollingerBands.value) {
    const bb = calculateBollingerBands(fullData, 20, 2)
    bbUpperSeries = bbUpperSeries || mainChart.addSeries(LineSeries, {
      color: COLORS.bb,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: 'BB Up',
      priceLineVisible: false,
      lastValueVisible: showIndicatorAxisLabels.value
    })
    bbLowerSeries = bbLowerSeries || mainChart.addSeries(LineSeries, {
      color: COLORS.bb,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: 'BB Low',
      priceLineVisible: false,
      lastValueVisible: showIndicatorAxisLabels.value
    })
    bbBasisSeries = bbBasisSeries || mainChart.addSeries(LineSeries, {
      color: COLORS.bb,
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      title: 'BB Mid',
      priceLineVisible: false,
      lastValueVisible: showIndicatorAxisLabels.value
    })

    bbUpperSeries.applyOptions({ lastValueVisible: showIndicatorAxisLabels.value })
    bbLowerSeries.applyOptions({ lastValueVisible: showIndicatorAxisLabels.value })
    bbBasisSeries.applyOptions({ lastValueVisible: showIndicatorAxisLabels.value })

    const filterDisplay = (arr: Array<{ time: Time; value: number }>) =>
      firstDisplayDate ? arr.filter(p => (p.time as string) >= firstDisplayDate) : arr

    bbUpperSeries.setData(filterDisplay(bb.upper) as LineData<Time>[])
    bbLowerSeries.setData(filterDisplay(bb.lower) as LineData<Time>[])
    bbBasisSeries.setData(filterDisplay(bb.basis) as LineData<Time>[])
  } else {
    if (bbUpperSeries) { mainChart.removeSeries(bbUpperSeries); bbUpperSeries = null }
    if (bbLowerSeries) { mainChart.removeSeries(bbLowerSeries); bbLowerSeries = null }
    if (bbBasisSeries) { mainChart.removeSeries(bbBasisSeries); bbBasisSeries = null }
  }

  // Volume Moving Average (hidden from price axis)
  if (showVolumeMa.value) {
    volumeMaSeries = volumeMaSeries || mainChart.addSeries(LineSeries, {
      color: 'rgba(245, 158, 11, 0.7)',
      lineWidth: 1,
      priceScaleId: 'volume',
      priceLineVisible: false,
      lastValueVisible: false
    })
    const volMa = calculateVolumeMa(fullData, 20)
    const filteredVolMa = firstDisplayDate ? volMa.filter(p => (p.time as string) >= firstDisplayDate) : volMa
    volumeMaSeries.setData(filteredVolMa as LineData<Time>[])
  } else {
    if (volumeMaSeries) {
      mainChart.removeSeries(volumeMaSeries)
      volumeMaSeries = null
    }
  }
}

function renderOscillators(rawData: Candle[]) {
  if (!oscChart || (!showRsi.value && !showMacd.value)) return
  const fullData = fullDataset.value
  const firstDisplayDate = rawData[0]?.date

  if (rsiSeries) { oscChart.removeSeries(rsiSeries); rsiSeries = null }
  if (macdLineSeries) { oscChart.removeSeries(macdLineSeries); macdLineSeries = null }
  if (macdSignalSeries) { oscChart.removeSeries(macdSignalSeries); macdSignalSeries = null }
  if (macdHistSeries) { oscChart.removeSeries(macdHistSeries); macdHistSeries = null }

  const filterDisplay = <T extends { time: Time }>(arr: T[]) =>
    firstDisplayDate ? arr.filter(p => (p.time as string) >= firstDisplayDate) : arr

  if (showRsi.value) {
    rsiSeries = oscChart.addSeries(LineSeries, {
      color: COLORS.rsi,
      lineWidth: 2,
      title: 'RSI'
    })
    rsiSeries.setData(filterDisplay(calculateRsi(fullData, 14)) as LineData<Time>[])

    rsiSeries.createPriceLine({ price: 70, color: '#ef4444', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'OB 70' })
    rsiSeries.createPriceLine({ price: 30, color: '#10b981', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'OS 30' })
    rsiSeries.createPriceLine({ price: 50, color: '#71717a', lineWidth: 1, lineStyle: LineStyle.Dotted, title: '50' })
  } else if (showMacd.value) {
    const macdData = calculateMacd(fullData, 12, 26, 9)
    macdHistSeries = oscChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'price' }
    })
    macdHistSeries.setData(filterDisplay(macdData.hist) as HistogramData<Time>[])

    macdLineSeries = oscChart.addSeries(LineSeries, {
      color: COLORS.macdLine,
      lineWidth: 2,
      title: 'MACD'
    })
    macdLineSeries.setData(filterDisplay(macdData.macd) as LineData<Time>[])

    macdSignalSeries = oscChart.addSeries(LineSeries, {
      color: COLORS.macdSignal,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      title: 'Signal'
    })
    macdSignalSeries.setData(filterDisplay(macdData.signal) as LineData<Time>[])
  }
}

function updateHudWithLatest() {
  if (candles.value.length === 0) {
    hudData.value = null
    return
  }
  const last = candles.value[candles.value.length - 1]!
  const prev = candles.value.length > 1 ? candles.value[candles.value.length - 2]! : last
  const change = last.close - prev.close
  const changePct = prev.close > 0 ? (change / prev.close) * 100 : 0
  const t = last.date

  hudData.value = {
    date: last.date,
    open: last.open,
    high: last.high,
    low: last.low,
    close: last.close,
    volume: last.volume,
    change: Number(change.toFixed(2)),
    changePct: Number(changePct.toFixed(2)),
    sma20: showSma20.value ? sma20Map.value.get(t) ?? null : null,
    sma50: showSma50.value ? sma50Map.value.get(t) ?? null : null,
    sma200: showSma200.value ? sma200Map.value.get(t) ?? null : null,
    ema9: showEma9.value ? ema9Map.value.get(t) ?? null : null,
    ema21: showEma21.value ? ema21Map.value.get(t) ?? null : null,
    rsi: showRsi.value ? rsiMap.value.get(t) ?? null : null
  }
}

// ==========================================
// API FETCH & REACTIVE WATCHERS
// ==========================================

async function fetchCandles() {
  if (!props.symbol) return
  try {
    isLoading.value = true
    const res = await $fetch<{
      candles: Candle[]
      lookbackCandles?: Candle[]
      stats: { periodHigh: number; periodLow: number; avgVolume: number; periodReturn: number }
    }>('/api/market/candles', {
      query: {
        symbol: props.symbol,
        range: activeRange.value
      }
    })
    candles.value = res.candles || []
    lookbackCandles.value = res.lookbackCandles || res.candles || []
    stats.value = res.stats || { periodHigh: 0, periodLow: 0, avgVolume: 0, periodReturn: 0 }

    nextTick(() => {
      renderAllData()
    })
  } catch (err) {
    console.error('Failed to fetch candles:', err)
  } finally {
    isLoading.value = false
  }
}

watch([() => props.symbol, activeRange], () => {
  fetchCandles()
})

watch(activeChartType, () => {
  renderAllData()
})

watch([showSma20, showSma50, showSma200, showEma9, showEma21, showBollingerBands, showVolumeMa, showIndicatorAxisLabels], () => {
  renderOverlays(candles.value)
})

watch([showRsi, showMacd], () => {
  nextTick(() => {
    initOscChart()
    renderOscillators(candles.value)
  })
})

// ==========================================
// UTILITY TOOLS
// ==========================================

function handleResetView() {
  if (mainChart) {
    mainChart.timeScale().fitContent()
  }
  if (oscChart) {
    oscChart.timeScale().fitContent()
  }
}

function handleExportSnapshot() {
  if (!mainChart) return
  const canvas = mainChart.takeScreenshot()
  const link = document.createElement('a')
  link.download = `${props.symbol}_${activeRange.value}_chart.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
  nextTick(() => {
    setTimeout(() => {
      if (mainChartContainer.value && mainChart) {
        mainChart.applyOptions({
          width: mainChartContainer.value.clientWidth,
          height: mainChartContainer.value.clientHeight
        })
        mainChart.timeScale().fitContent()
      }
      if (oscChartContainer.value && oscChart) {
        oscChart.applyOptions({
          width: oscChartContainer.value.clientWidth,
          height: oscChartContainer.value.clientHeight
        })
        oscChart.timeScale().fitContent()
      }
    }, 150)
  })
}

function formatVolumeDisplay(val: number) {
  if (val >= 10000000) return (val / 10000000).toFixed(2) + ' Cr'
  if (val >= 100000) return (val / 100000).toFixed(2) + ' L'
  if (val >= 1000) return (val / 1000).toFixed(1) + ' K'
  return val.toLocaleString()
}

// Lifecycle Hooks
onMounted(() => {
  initMainChart()
  initOscChart()
  fetchCandles()

  if (mainChartContainer.value) {
    resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return
      const entry = entries[0]
      if (entry && mainChart) {
        mainChart.applyOptions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        })
      }
      if (oscChartContainer.value && oscChart) {
        oscChart.applyOptions({
          width: oscChartContainer.value.clientWidth,
          height: oscChartContainer.value.clientHeight
        })
      }
    })
    resizeObserver.observe(mainChartContainer.value)
  }
})

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (mainChart) {
    mainChart.remove()
    mainChart = null
  }
  if (oscChart) {
    oscChart.remove()
    oscChart = null
  }
})
</script>

<template>
  <div
    ref="chartWrapperRef"
    class="w-full flex flex-col space-y-2.5 transition-all duration-300"
    :class="{
      'fixed inset-0 z-50 bg-white dark:bg-neutral-950 p-6 overflow-y-auto': isFullscreen,
      'relative': !isFullscreen
    }"
  >
    <!-- TOP TOOLBAR & UTILITIES STRIP -->
    <div class="flex flex-wrap items-center justify-between gap-2.5 border-b border-neutral-200 dark:border-neutral-800 pb-2.5 text-xs">
      <!-- Left: Ranges & Chart Style -->
      <div class="flex items-center gap-1.5 flex-wrap">
        <!-- Range Selector Pills -->
        <div class="flex items-center p-0.5 rounded-xl bg-neutral-100 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60">
          <button
            v-for="r in ranges"
            :key="r"
            type="button"
            class="px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all select-none"
            :class="activeRange === r ? 'bg-primary text-white shadow-xs' : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
            @click="activeRange = r"
          >
            {{ r }}
          </button>
        </div>

        <!-- Chart Style Dropdown -->
        <div class="relative">
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/70 font-semibold text-neutral-800 dark:text-neutral-200 hover:border-primary transition-all select-none"
            @click="isChartTypeMenuOpen = !isChartTypeMenuOpen"
          >
            <UIcon
              :name="
                activeChartType === 'candles' ? 'i-lucide-candlestick-chart' :
                activeChartType === 'hollow' ? 'i-lucide-candlestick-chart' :
                activeChartType === 'area' ? 'i-lucide-mountain' :
                activeChartType === 'line' ? 'i-lucide-trending-up' :
                activeChartType === 'baseline' ? 'i-lucide-scale' : 'i-lucide-bar-chart-2'
              "
              class="h-3.5 w-3.5 text-primary"
            />
            <span class="capitalize">{{ activeChartType.replace('_', ' ') }}</span>
            <UIcon name="i-lucide-chevron-down" class="h-3 w-3 text-neutral-400" />
          </button>

          <!-- Dropdown Menu -->
          <div
            v-if="isChartTypeMenuOpen"
            class="absolute left-0 top-full mt-1.5 z-50 w-44 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-1.5 shadow-xl ring-1 ring-black/10"
          >
            <button
              v-for="t in ([
                { id: 'candles', label: 'Candlestick', icon: 'i-lucide-candlestick-chart' },
                { id: 'hollow', label: 'Hollow Candles', icon: 'i-lucide-candlestick-chart' },
                { id: 'area', label: 'Area (Mountain)', icon: 'i-lucide-mountain' },
                { id: 'line', label: 'Line Trajectory', icon: 'i-lucide-trending-up' },
                { id: 'baseline', label: 'Baseline', icon: 'i-lucide-scale' },
                { id: 'heikin_ashi', label: 'Heikin-Ashi', icon: 'i-lucide-bar-chart-2' }
              ] as const)"
              :key="t.id"
              type="button"
              class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors"
              :class="activeChartType === t.id ? 'bg-primary/10 text-primary font-bold' : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'"
              @click="activeChartType = t.id; isChartTypeMenuOpen = false"
            >
              <UIcon :name="t.icon" class="h-3.5 w-3.5" />
              <span>{{ t.label }}</span>
            </button>
          </div>
        </div>

        <!-- Technical Indicators Popover Button -->
        <div class="relative">
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/70 font-semibold text-neutral-800 dark:text-neutral-200 hover:border-primary transition-all select-none"
            @click="isIndicatorsMenuOpen = !isIndicatorsMenuOpen"
          >
            <UIcon name="i-lucide-sliders" class="h-3.5 w-3.5 text-primary" />
            <span>Indicators</span>
            <UBadge
              color="primary"
              variant="subtle"
              size="xs"
              class="text-[9px] px-1 py-0"
            >
              {{ [showSma20, showSma50, showSma200, showEma9, showEma21, showBollingerBands, showRsi, showMacd].filter(Boolean).length }}
            </UBadge>
          </button>

          <!-- Indicators Dropdown -->
          <div
            v-if="isIndicatorsMenuOpen"
            class="absolute left-0 top-full mt-1.5 z-50 w-72 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 shadow-2xl ring-1 ring-black/10 space-y-3"
          >
            <div>
              <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1.5">Trend Overlays (Pre-Warmed)</span>
              <div class="space-y-1.5 text-xs">
                <label class="flex items-center justify-between cursor-pointer">
                  <span class="flex items-center gap-1.5">
                    <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: COLORS.sma20 }" />
                    <span>SMA 20 (Fast Trend)</span>
                  </span>
                  <input v-model="showSma20" type="checkbox" class="rounded text-primary h-3.5 w-3.5" />
                </label>
                <label class="flex items-center justify-between cursor-pointer">
                  <span class="flex items-center gap-1.5">
                    <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: COLORS.sma50 }" />
                    <span>SMA 50 (Medium Trend)</span>
                  </span>
                  <input v-model="showSma50" type="checkbox" class="rounded text-primary h-3.5 w-3.5" />
                </label>
                <label class="flex items-center justify-between cursor-pointer">
                  <span class="flex items-center gap-1.5">
                    <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: COLORS.sma200 }" />
                    <span>SMA 200 (Benchmark)</span>
                  </span>
                  <input v-model="showSma200" type="checkbox" class="rounded text-primary h-3.5 w-3.5" />
                </label>
                <label class="flex items-center justify-between cursor-pointer">
                  <span class="flex items-center gap-1.5">
                    <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: COLORS.ema9 }" />
                    <span>EMA 9 (Momentum)</span>
                  </span>
                  <input v-model="showEma9" type="checkbox" class="rounded text-primary h-3.5 w-3.5" />
                </label>
                <label class="flex items-center justify-between cursor-pointer">
                  <span class="flex items-center gap-1.5">
                    <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: COLORS.ema21 }" />
                    <span>EMA 21 (Swing Momentum)</span>
                  </span>
                  <input v-model="showEma21" type="checkbox" class="rounded text-primary h-3.5 w-3.5" />
                </label>
                <label class="flex items-center justify-between cursor-pointer">
                  <span class="flex items-center gap-1.5">
                    <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: COLORS.bb }" />
                    <span>Bollinger Bands (20, 2)</span>
                  </span>
                  <input v-model="showBollingerBands" type="checkbox" class="rounded text-primary h-3.5 w-3.5" />
                </label>
              </div>
            </div>

            <!-- Price Scale Display Options -->
            <div class="pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1.5">Price Scale Badges</span>
              <label class="flex items-center justify-between cursor-pointer text-xs">
                <span class="text-neutral-700 dark:text-neutral-300">Show Indicator Tags on Right Axis</span>
                <input v-model="showIndicatorAxisLabels" type="checkbox" class="rounded text-primary h-3.5 w-3.5" />
              </label>
              <p class="text-[10px] text-neutral-400 mt-1 leading-tight">
                Keep unchecked to reserve the price axis exclusively for the Current Market Price (LTP).
              </p>
            </div>

            <div class="pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1.5">Oscillator Sub-Panels</span>
              <div class="space-y-1.5 text-xs">
                <label class="flex items-center justify-between cursor-pointer">
                  <span class="flex items-center gap-1.5">
                    <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: COLORS.rsi }" />
                    <span>RSI (14) Momentum</span>
                  </span>
                  <input
                    type="checkbox"
                    :checked="showRsi"
                    class="rounded text-primary h-3.5 w-3.5"
                    @change="showRsi = !showRsi; if (showRsi) showMacd = false"
                  />
                </label>
                <label class="flex items-center justify-between cursor-pointer">
                  <span class="flex items-center gap-1.5">
                    <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: COLORS.macdLine }" />
                    <span>MACD (12, 26, 9)</span>
                  </span>
                  <input
                    type="checkbox"
                    :checked="showMacd"
                    class="rounded text-primary h-3.5 w-3.5"
                    @change="showMacd = !showMacd; if (showMacd) showRsi = false"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Utility Actions (Auto-fit, Camera, Fullscreen) -->
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/70 font-semibold text-neutral-700 dark:text-neutral-300 hover:text-primary transition-colors select-none"
          title="Auto-Fit / Reset View"
          @click="handleResetView"
        >
          <UIcon name="i-lucide-rotate-ccw" class="h-3.5 w-3.5" />
          <span>Reset</span>
        </button>

        <button
          type="button"
          class="p-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/70 text-neutral-700 dark:text-neutral-300 hover:text-primary transition-colors"
          title="Export PNG Snapshot"
          @click="handleExportSnapshot"
        >
          <UIcon name="i-lucide-camera" class="h-4 w-4" />
        </button>

        <button
          type="button"
          class="p-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/70 text-neutral-700 dark:text-neutral-300 hover:text-primary transition-colors"
          :title="isFullscreen ? 'Exit Fullscreen' : 'Fullscreen View'"
          @click="toggleFullscreen"
        >
          <UIcon :name="isFullscreen ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'" class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- DYNAMIC LIVE TELEMETRY HUD (Active Crosshair Readout) -->
    <div
      v-if="hudData"
      class="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-neutral-50/90 dark:bg-neutral-900/90 border border-neutral-200/80 dark:border-neutral-800 text-xs font-mono select-none"
    >
      <div class="flex items-center gap-3 flex-wrap">
        <span class="font-sans font-bold text-neutral-700 dark:text-neutral-300">{{ hudData.date }}</span>

        <!-- Distinct High-Priority LTP Badge -->
        <div
          class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg font-mono font-bold text-xs"
          :class="hudData.change >= 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'"
        >
          <span class="font-sans font-black text-[9px] uppercase tracking-wider">LTP</span>
          <span class="text-sm font-black">₹{{ hudData.close.toFixed(2) }}</span>
        </div>

        <span class="text-neutral-500">O: <strong class="text-neutral-900 dark:text-white">₹{{ hudData.open.toFixed(2) }}</strong></span>
        <span class="text-neutral-500">H: <strong class="text-emerald-500">₹{{ hudData.high.toFixed(2) }}</strong></span>
        <span class="text-neutral-500">L: <strong class="text-rose-500">₹{{ hudData.low.toFixed(2) }}</strong></span>
        <span
          class="font-semibold"
          :class="hudData.change >= 0 ? 'text-emerald-500' : 'text-rose-500'"
        >
          {{ hudData.change >= 0 ? '+' : '' }}{{ hudData.change.toFixed(2) }} ({{ hudData.changePct >= 0 ? '+' : '' }}{{ hudData.changePct.toFixed(2) }}%)
        </span>
        <span class="text-neutral-500">Vol: <strong class="text-neutral-700 dark:text-neutral-300">{{ formatVolumeDisplay(hudData.volume) }}</strong></span>
      </div>

      <!-- Clear Indicator Values Directly Displayed in HUD -->
      <div class="flex items-center gap-3 text-xs flex-wrap">
        <span v-if="showSma20 && hudData.sma20" class="flex items-center gap-1 font-bold text-blue-500">
          <span class="h-1.5 w-1.5 rounded-full bg-blue-500" />
          <span>SMA20: ₹{{ hudData.sma20.toFixed(2) }}</span>
        </span>
        <span v-if="showSma50 && hudData.sma50" class="flex items-center gap-1 font-bold text-amber-500">
          <span class="h-1.5 w-1.5 rounded-full bg-amber-500" />
          <span>SMA50: ₹{{ hudData.sma50.toFixed(2) }}</span>
        </span>
        <span v-if="showSma200 && hudData.sma200" class="flex items-center gap-1 font-bold text-purple-500">
          <span class="h-1.5 w-1.5 rounded-full bg-purple-500" />
          <span>SMA200: ₹{{ hudData.sma200.toFixed(2) }}</span>
        </span>
        <span v-if="showEma9 && hudData.ema9" class="flex items-center gap-1 font-bold text-cyan-500">
          <span class="h-1.5 w-1.5 rounded-full bg-cyan-500" />
          <span>EMA9: ₹{{ hudData.ema9.toFixed(2) }}</span>
        </span>
        <span v-if="showEma21 && hudData.ema21" class="flex items-center gap-1 font-bold text-pink-500">
          <span class="h-1.5 w-1.5 rounded-full bg-pink-500" />
          <span>EMA21: ₹{{ hudData.ema21.toFixed(2) }}</span>
        </span>
        <span v-if="showRsi && hudData.rsi" class="flex items-center gap-1 font-bold text-violet-500">
          <span class="h-1.5 w-1.5 rounded-full bg-violet-500" />
          <span>RSI: {{ hudData.rsi.toFixed(1) }}</span>
        </span>
      </div>
    </div>

    <!-- MAIN CHART VIEWPORT -->
    <div class="relative w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-hidden shadow-xs">
      <!-- Loading Overlay -->
      <div
        v-if="isLoading"
        class="absolute inset-0 z-20 flex items-center justify-center bg-white/70 dark:bg-neutral-950/70 backdrop-blur-xs"
      >
        <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-primary" />
      </div>

      <!-- Primary Price & Volume Canvas -->
      <div
        ref="mainChartContainer"
        class="w-full"
        :class="isFullscreen ? 'h-[75vh]' : (showRsi || showMacd ? 'h-[360px] sm:h-[400px]' : 'h-[440px] sm:h-[480px]')"
      />

      <!-- Oscillator Sub-Chart Pane (RSI or MACD) -->
      <div
        v-show="showRsi || showMacd"
        class="border-t border-neutral-200 dark:border-neutral-800 relative bg-neutral-50/40 dark:bg-neutral-900/30"
      >
        <div class="absolute left-3 top-2 z-10 text-[10px] font-black uppercase tracking-wider font-mono text-neutral-400">
          <span v-if="showRsi" class="text-purple-500">RSI (14) Relative Strength</span>
          <span v-else-if="showMacd" class="text-blue-500">MACD (12, 26, 9)</span>
        </div>
        <div
          ref="oscChartContainer"
          class="w-full h-[130px]"
        />
      </div>
    </div>

    <!-- STATS SUMMARY FOOTER -->
    <div class="flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-500 dark:text-neutral-400 px-1">
      <div class="flex items-center gap-3 font-mono">
        <span>Period High: <strong class="text-emerald-600 dark:text-emerald-400">₹{{ stats.periodHigh?.toFixed(2) }}</strong></span>
        <span>Period Low: <strong class="text-rose-600 dark:text-rose-400">₹{{ stats.periodLow?.toFixed(2) }}</strong></span>
        <span>Avg Volume: <strong>{{ formatVolumeDisplay(stats.avgVolume) }}</strong></span>
      </div>

      <div class="flex items-center gap-1.5 font-mono">
        <span>Period Return:</span>
        <span
          class="font-bold font-mono px-1.5 py-0.5 rounded"
          :class="stats.periodReturn >= 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'"
        >
          {{ stats.periodReturn >= 0 ? '+' : '' }}{{ stats.periodReturn }}%
        </span>
      </div>
    </div>
  </div>
</template>
