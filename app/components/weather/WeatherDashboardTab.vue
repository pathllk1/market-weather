<script setup lang="ts">
import { ref, computed } from 'vue'
import type {
  CityLatestWeather,
  NationalWeatherPulse,
  NationalHourlyTrendPoint
} from '~/types/weather'
import WeatherAqiBadge from './WeatherAqiBadge.vue'

const props = defineProps<{
  cities: CityLatestWeather[]
  pulse: NationalWeatherPulse | null
  nationalTrends: NationalHourlyTrendPoint[]
  isLoading?: boolean
  isTrendsLoading?: boolean
}>()

const emit = defineEmits<{
  (e: 'selectCity', city: CityLatestWeather): void
  (e: 'selectCityByName', cityName: string): void
  (e: 'refresh'): void
  (e: 'jumpToMatrix', filter?: { aqiFilter?: 'ALL' | 'GOOD' | 'MODERATE' | 'POOR' | 'SEVERE' | 'RAIN'; state?: string }): void
  (e: 'changeTrendsHours', hours: number): void
}>()

// -------------------------------------------------------------
// 1. REAL KPI DERIVATIONS (100% Live from Database Telemetry)
// -------------------------------------------------------------
const safeCitiesCount = computed(() => {
  return props.cities.filter(c => c.usAqi <= 100).length
})

const alertCitiesCount = computed(() => {
  return props.cities.filter(c => c.usAqi > 100).length
})

const severeCitiesCount = computed(() => {
  return props.cities.filter(c => c.usAqi > 200).length
})

const alertPercentage = computed(() => {
  if (props.cities.length === 0) return 0
  return Math.round((alertCitiesCount.value / props.cities.length) * 100)
})

const thermalSpread = computed(() => {
  if (!props.pulse?.hottestCity || !props.pulse?.coldestCity) return 0
  return Number((props.pulse.hottestCity.temperature - props.pulse.coldestCity.temperature).toFixed(1))
})

// -------------------------------------------------------------
// 2. ROUND CHART: REAL AQI CATEGORY DISTRIBUTION (SVG DONUT)
// -------------------------------------------------------------
interface DonutSegment {
  key: string
  label: string
  count: number
  percentage: number
  color: string
  dasharray: string
  dashoffset: number
  startAngle: number
  endAngle: number
}

const aqiDistribution = computed(() => {
  const total = props.cities.length
  if (total === 0) return []

  const counts = {
    good: 0,
    moderate: 0,
    sensitive: 0,
    unhealthy: 0,
    veryUnhealthy: 0,
    hazardous: 0
  }

  for (const c of props.cities) {
    if (c.usAqi <= 50) counts.good++
    else if (c.usAqi <= 100) counts.moderate++
    else if (c.usAqi <= 150) counts.sensitive++
    else if (c.usAqi <= 200) counts.unhealthy++
    else if (c.usAqi <= 300) counts.veryUnhealthy++
    else counts.hazardous++
  }

  const defs = [
    { key: 'good', label: 'Good (0-50)', count: counts.good, color: '#10b981', filterKey: 'GOOD' as const },
    { key: 'moderate', label: 'Moderate (51-100)', count: counts.moderate, color: '#f59e0b', filterKey: 'MODERATE' as const },
    { key: 'sensitive', label: 'Sensitive (101-150)', count: counts.sensitive, color: '#f97316', filterKey: 'POOR' as const },
    { key: 'unhealthy', label: 'Unhealthy (151-200)', count: counts.unhealthy, color: '#ef4444', filterKey: 'POOR' as const },
    { key: 'veryUnhealthy', label: 'Very Poor (201-300)', count: counts.veryUnhealthy, color: '#a855f7', filterKey: 'SEVERE' as const },
    { key: 'hazardous', label: 'Hazardous (301+)', count: counts.hazardous, color: '#be123c', filterKey: 'SEVERE' as const }
  ]

  return defs.map(d => ({
    ...d,
    percentage: Number(((d.count / total) * 100).toFixed(1))
  }))
})

const hoveredDonutIndex = ref<number | null>(null)

// Donut geometry: radius = 70, circumference = 2 * PI * 70 ≈ 439.82
const DONUT_RADIUS = 70
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS

const donutSegments = computed<DonutSegment[]>(() => {
  const total = props.cities.length
  if (total === 0) return []

  let cumulativeOffset = 0
  const segments: DonutSegment[] = []

  for (const item of aqiDistribution.value) {
    const fraction = item.count / total
    const strokeLength = fraction * DONUT_CIRCUMFERENCE
    // Slight gap between segments if multiple categories exist
    const renderLength = item.count > 0 ? Math.max(strokeLength - 1.5, 0.5) : 0
    const dasharray = `${renderLength} ${DONUT_CIRCUMFERENCE}`
    const dashoffset = -cumulativeOffset

    const startAngle = (cumulativeOffset / DONUT_CIRCUMFERENCE) * 360
    const endAngle = startAngle + fraction * 360

    segments.push({
      key: item.key,
      label: item.label,
      count: item.count,
      percentage: item.percentage,
      color: item.color,
      dasharray,
      dashoffset,
      startAngle,
      endAngle
    })

    cumulativeOffset += strokeLength
  }

  return segments
})

const activeDonutInfo = computed(() => {
  if (hoveredDonutIndex.value !== null && aqiDistribution.value[hoveredDonutIndex.value]) {
    return aqiDistribution.value[hoveredDonutIndex.value]
  }
  return null
})

// -------------------------------------------------------------
// 3. LINE CHART: REAL 24H NATIONAL TELEMETRY TRENDS (SVG SPLINE)
// -------------------------------------------------------------
const selectedMetric = ref<'aqi' | 'temp' | 'humidity'>('temp')
const selectedTrendHours = ref<12 | 24 | 48>(24)

function setTrendHours(hours: 12 | 24 | 48) {
  selectedTrendHours.value = hours
  emit('changeTrendsHours', hours)
}

const trendMetricConfig = computed(() => {
  if (selectedMetric.value === 'temp') {
    return {
      label: 'Avg Temperature',
      unit: '°C',
      color: '#f59e0b',
      fillStart: 'rgba(245, 158, 11, 0.35)',
      fillEnd: 'rgba(245, 158, 11, 0.01)',
      key: 'avgTemp' as const
    }
  }
  if (selectedMetric.value === 'humidity') {
    return {
      label: 'Avg Humidity',
      unit: '%',
      color: '#06b6d4',
      fillStart: 'rgba(6, 182, 212, 0.35)',
      fillEnd: 'rgba(6, 182, 212, 0.01)',
      key: 'avgHumidity' as const
    }
  }
  return {
    label: 'National Avg AQI',
    unit: 'AQI',
    color: '#8b5cf6',
    fillStart: 'rgba(139, 92, 246, 0.38)',
    fillEnd: 'rgba(139, 92, 246, 0.01)',
    key: 'avgAqi' as const
  }
})

// Compute coordinate points for SVG chart
const CHART_WIDTH = 760
const CHART_HEIGHT = 200
const CHART_PADDING = { top: 20, right: 30, bottom: 35, left: 45 }

const hoveredTrendPoint = ref<{
  x: number
  y: number
  point: NationalHourlyTrendPoint
  index: number
} | null>(null)

const lineChartData = computed(() => {
  const points = props.nationalTrends
  if (!points || points.length === 0) return null

  const key = trendMetricConfig.value.key
  const values = points.map(p => p[key])
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const delta = maxVal - minVal || 1
  const valRange = delta * 1.15 // padding
  const baseline = Math.max(0, minVal - delta * 0.08)

  const innerW = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right
  const innerH = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom

  const coords = points.map((p, idx) => {
    const x = CHART_PADDING.left + (idx / Math.max(points.length - 1, 1)) * innerW
    const norm = (p[key] - baseline) / valRange
    const y = CHART_PADDING.top + innerH - norm * innerH
    return { x, y, p }
  })

  // Build SVG path
  let pathD = ''
  if (coords.length > 0) {
    pathD = `M ${coords[0]!.x} ${coords[0]!.y}`
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1]!
      const curr = coords[i]!
      const cpX1 = prev.x + (curr.x - prev.x) / 2
      const cpY1 = prev.y
      const cpX2 = cpX1
      const cpY2 = curr.y
      pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${curr.x} ${curr.y}`
    }
  }

  // Area path (closing to bottom)
  const firstX = coords[0]?.x ?? CHART_PADDING.left
  const lastX = coords[coords.length - 1]?.x ?? CHART_WIDTH - CHART_PADDING.right
  const bottomY = CHART_PADDING.top + innerH
  const areaD = pathD ? `${pathD} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z` : ''

  // Y-axis grid lines (3 steps)
  const yTicks = [
    { label: (baseline + valRange).toFixed(0), y: CHART_PADDING.top },
    { label: (baseline + valRange * 0.5).toFixed(0), y: CHART_PADDING.top + innerH * 0.5 },
    { label: baseline.toFixed(0), y: bottomY }
  ]

  // X-axis label points (sample 4-5 timestamps)
  const xTicks: Array<{ x: number; label: string }> = []
  if (points.length > 0) {
    const step = Math.max(Math.floor(points.length / 4), 1)
    for (let i = 0; i < points.length; i += step) {
      const p = points[i]!
      const hourStr = p.hourSlot.slice(11, 16) || p.hourSlot
      xTicks.push({
        x: coords[i]!.x,
        label: hourStr
      })
    }
    // Always include latest point
    const lastIdx = points.length - 1
    if (xTicks[xTicks.length - 1]?.label !== points[lastIdx]?.hourSlot.slice(11, 16)) {
      xTicks.push({
        x: coords[lastIdx]!.x,
        label: points[lastIdx]!.hourSlot.slice(11, 16)
      })
    }
  }

  const currentVal = values[values.length - 1] ?? 0
  const firstVal = values[0] ?? 0
  const changeFromStart = Number((currentVal - firstVal).toFixed(1))

  return {
    coords,
    pathD,
    areaD,
    yTicks,
    xTicks,
    minVal,
    maxVal,
    currentVal,
    avgVal: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)),
    changeFromStart
  }
})

function handleChartMouseMove(e: MouseEvent) {
  if (!lineChartData.value) return
  const svg = (e.currentTarget as HTMLElement).closest('svg')
  if (!svg) return

  const rect = svg.getBoundingClientRect()
  const mouseX = ((e.clientX - rect.left) / rect.width) * CHART_WIDTH

  let nearestIdx = 0
  let minDist = Infinity
  lineChartData.value.coords.forEach((c, idx) => {
    const dist = Math.abs(c.x - mouseX)
    if (dist < minDist) {
      minDist = dist
      nearestIdx = idx
    }
  })

  const target = lineChartData.value.coords[nearestIdx]
  if (target) {
    hoveredTrendPoint.value = {
      x: target.x,
      y: target.y,
      point: target.p,
      index: nearestIdx
    }
  }
}

function handleChartMouseLeave() {
  hoveredTrendPoint.value = null
}

// -------------------------------------------------------------
// 4. COLUMN CHART: REAL RANKINGS & COMPARATIVE ANALYSIS
// -------------------------------------------------------------
const columnChartTab = ref<'aqi' | 'temp' | 'state'>('aqi')

const cleanestCities = computed(() => {
  return [...props.cities]
    .sort((a, b) => a.usAqi - b.usAqi)
    .slice(0, 5)
})

const mostPollutedCities = computed(() => {
  return [...props.cities]
    .sort((a, b) => b.usAqi - a.usAqi)
    .slice(0, 5)
})

const hottestCities = computed(() => {
  return [...props.cities]
    .sort((a, b) => b.temperature - a.temperature)
    .slice(0, 5)
})

const coldestCities = computed(() => {
  return [...props.cities]
    .sort((a, b) => a.temperature - b.temperature)
    .slice(0, 5)
})

const stateAverages = computed(() => {
  const map: Record<string, { totalAqi: number; totalTemp: number; count: number }> = {}
  for (const c of props.cities) {
    if (!map[c.state]) {
      map[c.state] = { totalAqi: 0, totalTemp: 0, count: 0 }
    }
    map[c.state]!.totalAqi += c.usAqi
    map[c.state]!.totalTemp += c.temperature
    map[c.state]!.count++
  }

  return Object.entries(map)
    .map(([state, data]) => ({
      state,
      avgAqi: Math.round(data.totalAqi / data.count),
      avgTemp: Number((data.totalTemp / data.count).toFixed(1)),
      count: data.count
    }))
    .sort((a, b) => b.avgAqi - a.avgAqi)
    .slice(0, 8)
})

const maxRankingAqi = computed(() => {
  const allAqi = [...cleanestCities.value, ...mostPollutedCities.value].map(c => c.usAqi)
  return Math.max(...allAqi, 100)
})

const maxRankingTemp = computed(() => {
  const allTemps = [...hottestCities.value, ...coldestCities.value].map(c => c.temperature)
  return Math.max(...allTemps, 40)
})

const maxStateAqi = computed(() => {
  const list = stateAverages.value.map(s => s.avgAqi)
  return Math.max(...list, 100)
})
</script>

<template>
  <div class="space-y-5">
    <!-- Top Telemetry Header Ribbon -->
    <div class="p-4 sm:p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-3.5">
        <div class="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
          <UIcon
            name="i-lucide-activity"
            class="h-6 w-6 animate-pulse"
          />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-base sm:text-lg font-extrabold tracking-tight text-neutral-900 dark:text-white">
              National Environmental Pulse & Analytics
            </h1>
            <UBadge
              color="primary"
              variant="subtle"
              size="xs"
              class="font-mono text-[10px]"
            >
              Live Telemetry
            </UBadge>
          </div>
          <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span>Synchronized with 51 official automated telemetry stations</span>
            <span class="opacity-40">•</span>
            <span v-if="props.pulse">Last synced: {{ props.pulse.lastUpdatedLocal }}</span>
          </p>
        </div>
      </div>

      <!-- Action Controls -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700/80 text-xs font-semibold text-neutral-700 dark:text-neutral-200 transition-colors"
          @click="emit('jumpToMatrix')"
        >
          <UIcon
            name="i-lucide-table"
            class="h-3.5 w-3.5 text-primary"
          />
          <span>Browse 51 Cities Matrix</span>
        </button>

        <UButton
          color="neutral"
          variant="outline"
          size="xs"
          icon="i-lucide-refresh-cw"
          :loading="props.isLoading"
          class="font-semibold"
          @click="emit('refresh')"
        >
          Refresh Live
        </UButton>
      </div>
    </div>

    <!-- 4 High-Density KPI Cards (100% Live Telemetry) -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
      <!-- 1. National Average AQI -->
      <div class="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col justify-between hover:border-primary/40 transition-colors">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 flex items-center gap-1.5">
            <UIcon
              name="i-lucide-wind"
              class="text-xs text-primary"
            />
            National Avg AQI
          </span>
          <WeatherAqiBadge
            v-if="props.pulse"
            :aqi="props.pulse.nationalAvgAqi"
            :category="props.pulse.nationalAqiCategory"
            size="xs"
          />
        </div>

        <div class="mt-2.5 flex items-baseline gap-2">
          <span class="text-3xl font-black font-mono tracking-tight text-neutral-900 dark:text-white">
            {{ props.pulse?.nationalAvgAqi ?? '—' }}
          </span>
          <span class="text-xs font-semibold text-neutral-400">US-EPA AQI</span>
        </div>

        <div class="mt-3 pt-2.5 border-t border-neutral-100 dark:border-neutral-800/80 flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
          <span>{{ safeCitiesCount }} Cities in Safe Zone (≤100)</span>
          <button
            type="button"
            class="text-primary hover:underline font-medium"
            @click="emit('jumpToMatrix', { aqiFilter: 'GOOD' })"
          >
            View Safe
          </button>
        </div>
      </div>

      <!-- 2. Thermal Envelope (Hottest & Coldest Live) -->
      <div class="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col justify-between hover:border-amber-500/40 transition-colors">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 flex items-center gap-1.5">
            <UIcon
              name="i-lucide-thermometer-sun"
              class="text-xs text-amber-500"
            />
            Thermal Envelope
          </span>
          <UBadge
            color="warning"
            variant="subtle"
            size="xs"
            class="text-[9px] font-mono"
          >
            {{ thermalSpread }}°C Delta
          </UBadge>
        </div>

        <div
          v-if="props.pulse"
          class="mt-2 grid grid-cols-2 gap-2 text-xs"
        >
          <!-- Hottest -->
          <div
            class="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 cursor-pointer hover:bg-amber-500/15 transition-colors"
            :title="`Open ${props.pulse.hottestCity.city}`"
            @click="emit('selectCityByName', props.pulse.hottestCity.city)"
          >
            <div class="text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase flex items-center gap-1">
              <UIcon
                name="i-lucide-flame"
                class="text-xs"
              />
              Hottest
            </div>
            <div class="mt-0.5 font-extrabold text-neutral-900 dark:text-white truncate">
              {{ props.pulse.hottestCity.city }}
            </div>
            <div class="font-mono text-sm font-black text-amber-600 dark:text-amber-400">
              {{ props.pulse.hottestCity.temperature }}°C
            </div>
          </div>

          <!-- Coldest -->
          <div
            class="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 cursor-pointer hover:bg-cyan-500/15 transition-colors"
            :title="`Open ${props.pulse.coldestCity.city}`"
            @click="emit('selectCityByName', props.pulse.coldestCity.city)"
          >
            <div class="text-[10px] text-cyan-600 dark:text-cyan-400 font-bold uppercase flex items-center gap-1">
              <UIcon
                name="i-lucide-snowflake"
                class="text-xs"
              />
              Coldest
            </div>
            <div class="mt-0.5 font-extrabold text-neutral-900 dark:text-white truncate">
              {{ props.pulse.coldestCity.city }}
            </div>
            <div class="font-mono text-sm font-black text-cyan-600 dark:text-cyan-400">
              {{ props.pulse.coldestCity.temperature }}°C
            </div>
          </div>
        </div>

        <div
          v-else
          class="h-12 flex items-center text-xs text-neutral-400"
        >
          Loading telemetry...
        </div>

        <div class="mt-2 text-[10px] text-neutral-400 text-right">
          Click city tile to inspect details
        </div>
      </div>

      <!-- 3. Severe Air Quality Alerts -->
      <div class="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col justify-between hover:border-red-500/40 transition-colors">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 flex items-center gap-1.5">
            <UIcon
              name="i-lucide-alert-triangle"
              class="text-xs text-red-500"
            />
            Air Quality Alerts
          </span>
          <UBadge
            :color="alertCitiesCount > 0 ? 'error' : 'success'"
            variant="subtle"
            size="xs"
            class="text-[9px] font-mono"
          >
            {{ alertPercentage }}% of Cities
          </UBadge>
        </div>

        <div class="mt-2.5 flex items-baseline gap-2">
          <span class="text-3xl font-black font-mono tracking-tight text-red-600 dark:text-red-400">
            {{ alertCitiesCount }}
          </span>
          <span class="text-xs font-semibold text-neutral-400">Cities &gt; 100 AQI</span>
        </div>

        <div class="mt-3 pt-2.5 border-t border-neutral-100 dark:border-neutral-800/80 flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
          <span class="text-rose-500 font-semibold">{{ severeCitiesCount }} Severe (&gt;200 AQI)</span>
          <button
            type="button"
            class="text-red-500 hover:underline font-medium"
            @click="emit('jumpToMatrix', { aqiFilter: 'SEVERE' })"
          >
            View Alerts
          </button>
        </div>
      </div>

      <!-- 4. Precipitation & Database Telemetry -->
      <div class="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col justify-between hover:border-blue-500/40 transition-colors">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 flex items-center gap-1.5">
            <UIcon
              name="i-lucide-cloud-rain"
              class="text-xs text-blue-500"
            />
            Rain & System Health
          </span>
          <UBadge
            color="neutral"
            variant="subtle"
            size="xs"
            class="text-[9px] font-mono"
          >
            51/51 Active
          </UBadge>
        </div>

        <div class="mt-2">
          <div class="flex items-baseline gap-2">
            <span class="text-2xl font-black font-mono text-neutral-900 dark:text-white">
              {{ props.pulse?.activeRainCount ?? 0 }}
            </span>
            <span class="text-xs font-semibold text-neutral-400">Rain Stations</span>
          </div>
          <div class="text-[11px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
            <span v-if="props.pulse?.highestRainCity">
              Max: <strong class="text-neutral-900 dark:text-white">{{ props.pulse.highestRainCity.city }}</strong> ({{ props.pulse.highestRainCity.precipitation }}mm)
            </span>
            <span v-else>No active rainfall reported</span>
          </div>
        </div>

        <div class="mt-3 pt-2.5 border-t border-neutral-100 dark:border-neutral-800/80 flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
          <span class="font-mono">{{ props.pulse?.totalReadings.toLocaleString() ?? '—' }} logs in DB</span>
          <button
            type="button"
            class="text-blue-500 hover:underline font-medium"
            @click="emit('jumpToMatrix', { aqiFilter: 'RAIN' })"
          >
            Rain Map
          </button>
        </div>
      </div>
    </div>

    <!-- MAIN TWO-COLUMN CHARTS SECTION -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <!-- 1. ROUND CHART: NATIONAL AQI CATEGORY DONUT (5 COLS) -->
      <div class="lg:col-span-5 p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col justify-between space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-extrabold text-neutral-900 dark:text-white flex items-center gap-2">
              <UIcon
                name="i-lucide-pie-chart"
                class="text-primary text-base"
              />
              <span>Atmospheric Health Distribution</span>
            </h3>
            <p class="text-xs text-neutral-400 mt-0.5">
              Live categorization of all 51 monitored cities
            </p>
          </div>
          <UBadge
            color="neutral"
            variant="subtle"
            size="xs"
            class="font-mono text-[10px]"
          >
            100% Real
          </UBadge>
        </div>

        <!-- SVG Donut Chart with Centered Dynamic Metric -->
        <div class="relative flex items-center justify-center py-2">
          <svg
            viewBox="0 0 200 200"
            class="w-48 h-48 sm:w-52 sm:h-52 transform -rotate-90 select-none"
          >
            <!-- Background Ring -->
            <circle
              cx="100"
              cy="100"
              r="70"
              fill="transparent"
              stroke="currentColor"
              stroke-width="22"
              class="text-neutral-100 dark:text-neutral-800/80"
            />

            <!-- Real Telemetry Slices -->
            <circle
              v-for="(seg, idx) in donutSegments"
              :key="seg.key"
              cx="100"
              cy="100"
              r="70"
              fill="transparent"
              :stroke="seg.color"
              stroke-width="22"
              :stroke-dasharray="seg.dasharray"
              :stroke-dashoffset="seg.dashoffset"
              stroke-linecap="round"
              class="transition-all duration-300 cursor-pointer"
              :class="hoveredDonutIndex === idx ? 'opacity-100 filter drop-shadow(0 0 6px currentColor)' : hoveredDonutIndex !== null ? 'opacity-40' : 'opacity-90 hover:opacity-100'"
              @mouseenter="hoveredDonutIndex = idx"
              @mouseleave="hoveredDonutIndex = null"
              @click="emit('jumpToMatrix', { aqiFilter: aqiDistribution[idx]?.filterKey })"
            />
          </svg>

          <!-- Donut Hole Content -->
          <div class="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none p-4">
            <template v-if="activeDonutInfo">
              <span class="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                {{ activeDonutInfo.label.split(' ')[0] }}
              </span>
              <span class="text-2xl font-black font-mono text-neutral-900 dark:text-white">
                {{ activeDonutInfo.count }}
              </span>
              <span class="text-[11px] font-semibold text-neutral-500">
                {{ activeDonutInfo.percentage }}% of cities
              </span>
            </template>
            <template v-else>
              <span class="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Total Monitored
              </span>
              <span class="text-2xl font-black font-mono text-neutral-900 dark:text-white">
                {{ props.cities.length }}
              </span>
              <span class="text-[11px] font-semibold text-neutral-500">
                National Cities
              </span>
            </template>
          </div>
        </div>

        <!-- Interactive Legend Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
          <div
            v-for="(item, idx) in aqiDistribution"
            :key="item.key"
            class="p-2 rounded-xl border border-neutral-200/60 dark:border-neutral-800 cursor-pointer transition-all hover:border-neutral-400 dark:hover:border-neutral-600"
            :class="hoveredDonutIndex === idx ? 'bg-neutral-100 dark:bg-neutral-800' : 'bg-neutral-50/50 dark:bg-neutral-950/40'"
            @mouseenter="hoveredDonutIndex = idx"
            @mouseleave="hoveredDonutIndex = null"
            @click="emit('jumpToMatrix', { aqiFilter: item.filterKey })"
          >
            <div class="flex items-center gap-1.5">
              <span
                class="w-2 h-2 rounded-full shrink-0"
                :style="{ backgroundColor: item.color }"
              />
              <span class="text-[11px] font-bold text-neutral-700 dark:text-neutral-300 truncate">
                {{ item.label.split(' ')[0] }}
              </span>
            </div>
            <div class="mt-1 flex items-baseline justify-between font-mono">
              <span class="text-xs font-black text-neutral-900 dark:text-white">
                {{ item.count }}
              </span>
              <span class="text-[10px] text-neutral-400">
                {{ item.percentage }}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. LINE CHART: 24-HOUR NATIONAL HOURLY TREND (7 COLS) -->
      <div class="lg:col-span-7 p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col justify-between space-y-4">
        <!-- Chart Header & Controls -->
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-extrabold text-neutral-900 dark:text-white flex items-center gap-2">
              <UIcon
                name="i-lucide-line-chart"
                class="text-primary text-base"
              />
              <span>National Atmospheric Time-Series Trend</span>
            </h3>
            <p class="text-xs text-neutral-400 mt-0.5">
              Aggregated hourly telemetry across all reporting stations
            </p>
          </div>

          <!-- Metric & Range Switchers -->
          <div class="flex items-center gap-2 flex-wrap">
            <!-- Metric Toggle Pills -->
            <div class="flex items-center p-1 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs font-semibold">
              <button
                type="button"
                class="px-2.5 py-1 rounded-lg transition-all"
                :class="selectedMetric === 'temp' ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'"
                @click="selectedMetric = 'temp'"
              >
                Temp (°C)
              </button>
              <button
                type="button"
                class="px-2.5 py-1 rounded-lg transition-all"
                :class="selectedMetric === 'aqi' ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'"
                @click="selectedMetric = 'aqi'"
              >
                AQI
              </button>
              <button
                type="button"
                class="px-2.5 py-1 rounded-lg transition-all"
                :class="selectedMetric === 'humidity' ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'"
                @click="selectedMetric = 'humidity'"
              >
                Humidity (%)
              </button>
            </div>

            <!-- Time Window Switcher -->
            <div class="flex items-center p-1 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs font-mono">
              <button
                type="button"
                class="px-2 py-1 rounded-lg transition-all text-[11px]"
                :class="selectedTrendHours === 12 ? 'bg-primary text-white shadow-xs font-bold' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'"
                @click="setTrendHours(12)"
              >
                12h
              </button>
              <button
                type="button"
                class="px-2 py-1 rounded-lg transition-all text-[11px]"
                :class="selectedTrendHours === 24 ? 'bg-primary text-white shadow-xs font-bold' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'"
                @click="setTrendHours(24)"
              >
                24h
              </button>
              <button
                type="button"
                class="px-2 py-1 rounded-lg transition-all text-[11px]"
                :class="selectedTrendHours === 48 ? 'bg-primary text-white shadow-xs font-bold' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'"
                @click="setTrendHours(48)"
              >
                48h
              </button>
            </div>
          </div>
        </div>

        <!-- SVG Line Chart Canvas -->
        <div class="relative w-full h-[210px] select-none">
          <div
            v-if="props.isTrendsLoading"
            class="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-neutral-900/60 z-10"
          >
            <UIcon
              name="i-lucide-loader-2"
              class="h-6 w-6 text-primary animate-spin"
            />
          </div>

          <svg
            v-if="lineChartData"
            viewBox="0 0 760 200"
            class="w-full h-full overflow-visible"
            @mousemove="handleChartMouseMove"
            @mouseleave="handleChartMouseLeave"
          >
            <defs>
              <linearGradient
                id="trendAreaGradient"
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
              >
                <stop
                  offset="0%"
                  :stop-color="trendMetricConfig.color"
                  stop-opacity="0.35"
                />
                <stop
                  offset="100%"
                  :stop-color="trendMetricConfig.color"
                  stop-opacity="0.0"
                />
              </linearGradient>
            </defs>

            <!-- Horizontal Y-Gridlines -->
            <g class="text-neutral-200 dark:text-neutral-800">
              <line
                v-for="(tick, i) in lineChartData.yTicks"
                :key="i"
                :x1="CHART_PADDING.left"
                :y1="tick.y"
                :x2="CHART_WIDTH - CHART_PADDING.right"
                :y2="tick.y"
                stroke="currentColor"
                stroke-dasharray="3 3"
                stroke-width="1"
              />
              <!-- Y-Axis Labels -->
              <text
                v-for="(tick, i) in lineChartData.yTicks"
                :key="'txt-' + i"
                :x="CHART_PADDING.left - 8"
                :y="tick.y + 4"
                text-anchor="end"
                class="text-[10px] font-mono fill-neutral-400"
              >
                {{ tick.label }}
              </text>
            </g>

            <!-- Area Path with Gradient -->
            <path
              :d="lineChartData.areaD"
              fill="url(#trendAreaGradient)"
            />

            <!-- Stroke Curve -->
            <path
              :d="lineChartData.pathD"
              fill="none"
              :stroke="trendMetricConfig.color"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />

            <!-- Interactive Crosshair Guideline & Dot -->
            <g v-if="hoveredTrendPoint">
              <line
                :x1="hoveredTrendPoint.x"
                :y1="CHART_PADDING.top"
                :x2="hoveredTrendPoint.x"
                :y2="CHART_HEIGHT - CHART_PADDING.bottom"
                stroke="currentColor"
                class="text-neutral-400 dark:text-neutral-500"
                stroke-dasharray="2 2"
                stroke-width="1.5"
              />
              <circle
                :cx="hoveredTrendPoint.x"
                :cy="hoveredTrendPoint.y"
                r="5"
                :fill="trendMetricConfig.color"
                stroke="#fff"
                stroke-width="2"
                class="drop-shadow-md"
              />
            </g>

            <!-- X-Axis Labels -->
            <g class="text-neutral-400 dark:text-neutral-500">
              <text
                v-for="(xtick, i) in lineChartData.xTicks"
                :key="'xtxt-' + i"
                :x="xtick.x"
                :y="CHART_HEIGHT - 10"
                text-anchor="middle"
                class="text-[10px] font-mono fill-neutral-400"
              >
                {{ xtick.label }}
              </text>
            </g>
          </svg>

          <!-- Hover Tooltip -->
          <div
            v-if="hoveredTrendPoint"
            class="absolute pointer-events-none p-2 rounded-xl bg-neutral-900/90 text-white border border-neutral-700/80 shadow-xl backdrop-blur-xs text-xs space-y-0.5 transform -translate-x-1/2 -translate-y-full mb-3 font-mono"
            :style="{
              left: `${(hoveredTrendPoint.x / CHART_WIDTH) * 100}%`,
              top: `${(hoveredTrendPoint.y / CHART_HEIGHT) * 100}%`
            }"
          >
            <div class="text-[10px] text-neutral-300 font-sans">
              {{ hoveredTrendPoint.point.hourSlot }}
            </div>
            <div class="text-sm font-extrabold flex items-center gap-1">
              <span>{{ hoveredTrendPoint.point[trendMetricConfig.key] }}</span>
              <span class="text-[10px] opacity-80">{{ trendMetricConfig.unit }}</span>
            </div>
            <div class="text-[9px] text-neutral-400">
              {{ hoveredTrendPoint.point.reportingCities }} Reporting Stations
            </div>
          </div>

          <div
            v-else-if="!lineChartData && !props.isTrendsLoading"
            class="h-full flex flex-col items-center justify-center text-xs text-neutral-400 space-y-1"
          >
            <UIcon
              name="i-lucide-database"
              class="text-lg text-neutral-400"
            />
            <span>Fetching real national telemetry history...</span>
          </div>
        </div>

        <!-- Metric Summary Strip -->
        <div
          v-if="lineChartData"
          class="grid grid-cols-4 gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs"
        >
          <div class="p-2 rounded-xl bg-neutral-50 dark:bg-neutral-950/50">
            <div class="text-[10px] text-neutral-400 font-semibold">
              Current
            </div>
            <div class="font-mono font-extrabold text-neutral-900 dark:text-white">
              {{ lineChartData.currentVal }} {{ trendMetricConfig.unit }}
            </div>
          </div>
          <div class="p-2 rounded-xl bg-neutral-50 dark:bg-neutral-950/50">
            <div class="text-[10px] text-neutral-400 font-semibold">
              Cycle Low
            </div>
            <div class="font-mono font-extrabold text-neutral-900 dark:text-white">
              {{ lineChartData.minVal }} {{ trendMetricConfig.unit }}
            </div>
          </div>
          <div class="p-2 rounded-xl bg-neutral-50 dark:bg-neutral-950/50">
            <div class="text-[10px] text-neutral-400 font-semibold">
              Cycle High
            </div>
            <div class="font-mono font-extrabold text-neutral-900 dark:text-white">
              {{ lineChartData.maxVal }} {{ trendMetricConfig.unit }}
            </div>
          </div>
          <div class="p-2 rounded-xl bg-neutral-50 dark:bg-neutral-950/50">
            <div class="text-[10px] text-neutral-400 font-semibold">
              Cycle Average
            </div>
            <div class="font-mono font-extrabold text-neutral-900 dark:text-white">
              {{ lineChartData.avgVal }} {{ trendMetricConfig.unit }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. COLUMN CHART: RANKINGS & COMPARATIVE ANALYSIS (100% REAL) -->
    <div class="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-extrabold text-neutral-900 dark:text-white flex items-center gap-2">
            <UIcon
              name="i-lucide-bar-chart-3"
              class="text-primary text-base"
            />
            <span>Rankings & Comparative Columns</span>
          </h3>
          <p class="text-xs text-neutral-400 mt-0.5">
            Real performance comparison across cities and regional clusters
          </p>
        </div>

        <!-- View Switcher -->
        <div class="flex items-center p-1 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs font-semibold">
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg transition-all"
            :class="columnChartTab === 'aqi' ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'"
            @click="columnChartTab = 'aqi'"
          >
            Cleanest vs Polluted AQI
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg transition-all"
            :class="columnChartTab === 'temp' ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'"
            @click="columnChartTab = 'temp'"
          >
            Thermal Extremes
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg transition-all"
            :class="columnChartTab === 'state' ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'"
            @click="columnChartTab = 'state'"
          >
            State Averages
          </button>
        </div>
      </div>

      <!-- VIEW A: CLEANEST VS POLLUTED (BIFURCATED COLUMN CARDS) -->
      <div
        v-if="columnChartTab === 'aqi'"
        class="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <!-- Cleanest Cities Columns -->
        <div class="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-extrabold uppercase text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <UIcon
                name="i-lucide-sparkles"
                class="text-sm"
              />
              Top 5 Cleanest Air Cities
            </span>
            <span class="text-[10px] font-mono text-emerald-600/80">Lowest US-AQI</span>
          </div>

          <div class="space-y-2">
            <div
              v-for="c in cleanestCities"
              :key="c.city"
              class="group flex items-center justify-between p-2 rounded-lg bg-white dark:bg-neutral-800/90 border border-emerald-500/20 hover:border-emerald-500 transition-all cursor-pointer shadow-xs"
              @click="emit('selectCity', c)"
            >
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <div class="truncate">
                  <span class="text-xs font-bold text-neutral-900 dark:text-white group-hover:text-emerald-500 transition-colors">
                    {{ c.city }}
                  </span>
                  <span class="text-[10px] text-neutral-400 ml-1">({{ c.state }})</span>
                </div>
              </div>

              <!-- Animated Column Bar & Stat -->
              <div class="flex items-center gap-2">
                <div class="w-20 sm:w-28 h-2 rounded-full bg-neutral-100 dark:bg-neutral-700 overflow-hidden flex">
                  <div
                    class="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    :style="{ width: `${Math.max((c.usAqi / maxRankingAqi) * 100, 8)}%` }"
                  />
                </div>
                <span class="w-10 text-right font-mono text-xs font-black text-emerald-600 dark:text-emerald-400">
                  {{ c.usAqi }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Most Polluted Cities Columns -->
        <div class="p-4 rounded-xl bg-red-500/5 border border-red-500/20 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-extrabold uppercase text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <UIcon
                name="i-lucide-alert-triangle"
                class="text-sm"
              />
              Top 5 Most Polluted Cities
            </span>
            <span class="text-[10px] font-mono text-red-600/80">Highest US-AQI</span>
          </div>

          <div class="space-y-2">
            <div
              v-for="c in mostPollutedCities"
              :key="c.city"
              class="group flex items-center justify-between p-2 rounded-lg bg-white dark:bg-neutral-800/90 border border-red-500/20 hover:border-red-500 transition-all cursor-pointer shadow-xs"
              @click="emit('selectCity', c)"
            >
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                <div class="truncate">
                  <span class="text-xs font-bold text-neutral-900 dark:text-white group-hover:text-red-500 transition-colors">
                    {{ c.city }}
                  </span>
                  <span class="text-[10px] text-neutral-400 ml-1">({{ c.state }})</span>
                </div>
              </div>

              <!-- Animated Column Bar & Stat -->
              <div class="flex items-center gap-2">
                <div class="w-20 sm:w-28 h-2 rounded-full bg-neutral-100 dark:bg-neutral-700 overflow-hidden flex">
                  <div
                    class="h-full bg-gradient-to-r from-red-500 to-rose-600 rounded-full transition-all duration-500"
                    :style="{ width: `${Math.max((c.usAqi / maxRankingAqi) * 100, 8)}%` }"
                  />
                </div>
                <span class="w-10 text-right font-mono text-xs font-black text-red-600 dark:text-red-400">
                  {{ c.usAqi }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- VIEW B: THERMAL EXTREMES (HOTTEST VS COLDEST) -->
      <div
        v-else-if="columnChartTab === 'temp'"
        class="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <!-- Hottest -->
        <div class="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-extrabold uppercase text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <UIcon
                name="i-lucide-flame"
                class="text-sm"
              />
              Top 5 Hottest Locations
            </span>
            <span class="text-[10px] font-mono text-amber-600/80">Peak Recorded Temp</span>
          </div>

          <div class="space-y-2">
            <div
              v-for="c in hottestCities"
              :key="c.city"
              class="group flex items-center justify-between p-2 rounded-lg bg-white dark:bg-neutral-800/90 border border-amber-500/20 hover:border-amber-500 transition-all cursor-pointer shadow-xs"
              @click="emit('selectCity', c)"
            >
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <div class="truncate">
                  <span class="text-xs font-bold text-neutral-900 dark:text-white group-hover:text-amber-500 transition-colors">
                    {{ c.city }}
                  </span>
                  <span class="text-[10px] text-neutral-400 ml-1">({{ c.state }})</span>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <div class="w-20 sm:w-28 h-2 rounded-full bg-neutral-100 dark:bg-neutral-700 overflow-hidden flex">
                  <div
                    class="h-full bg-amber-500 rounded-full transition-all duration-500"
                    :style="{ width: `${Math.max((c.temperature / maxRankingTemp) * 100, 10)}%` }"
                  />
                </div>
                <span class="w-12 text-right font-mono text-xs font-black text-amber-600 dark:text-amber-400">
                  {{ c.temperature }}°C
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Coldest -->
        <div class="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-extrabold uppercase text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
              <UIcon
                name="i-lucide-snowflake"
                class="text-sm"
              />
              Top 5 Coolest Locations
            </span>
            <span class="text-[10px] font-mono text-cyan-600/80">Lowest Recorded Temp</span>
          </div>

          <div class="space-y-2">
            <div
              v-for="c in coldestCities"
              :key="c.city"
              class="group flex items-center justify-between p-2 rounded-lg bg-white dark:bg-neutral-800/90 border border-cyan-500/20 hover:border-cyan-500 transition-all cursor-pointer shadow-xs"
              @click="emit('selectCity', c)"
            >
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="w-2 h-2 rounded-full bg-cyan-500 shrink-0" />
                <div class="truncate">
                  <span class="text-xs font-bold text-neutral-900 dark:text-white group-hover:text-cyan-500 transition-colors">
                    {{ c.city }}
                  </span>
                  <span class="text-[10px] text-neutral-400 ml-1">({{ c.state }})</span>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <div class="w-20 sm:w-28 h-2 rounded-full bg-neutral-100 dark:bg-neutral-700 overflow-hidden flex">
                  <div
                    class="h-full bg-cyan-500 rounded-full transition-all duration-500"
                    :style="{ width: `${Math.max((c.temperature / maxRankingTemp) * 100, 10)}%` }"
                  />
                </div>
                <span class="w-12 text-right font-mono text-xs font-black text-cyan-600 dark:text-cyan-400">
                  {{ c.temperature }}°C
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- VIEW C: STATE-WISE AGGREGATES -->
      <div
        v-else-if="columnChartTab === 'state'"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <div
          v-for="st in stateAverages"
          :key="st.state"
          class="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200/80 dark:border-neutral-800/80 space-y-2 cursor-pointer hover:border-primary/50 transition-colors"
          @click="emit('jumpToMatrix', { state: st.state })"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-neutral-900 dark:text-white truncate">
              {{ st.state }}
            </span>
            <span class="text-[10px] font-mono text-neutral-400">
              {{ st.count }} {{ st.count === 1 ? 'City' : 'Cities' }}
            </span>
          </div>

          <div class="flex items-baseline justify-between">
            <span class="text-[10px] text-neutral-400 font-semibold">Avg AQI</span>
            <span
              class="font-mono text-sm font-black"
              :class="st.avgAqi <= 50 ? 'text-emerald-500' : st.avgAqi <= 100 ? 'text-amber-500' : 'text-red-500'"
            >
              {{ st.avgAqi }}
            </span>
          </div>

          <div class="w-full h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="st.avgAqi <= 50 ? 'bg-emerald-500' : st.avgAqi <= 100 ? 'bg-amber-500' : 'bg-red-500'"
              :style="{ width: `${Math.min((st.avgAqi / maxStateAqi) * 100, 100)}%` }"
            />
          </div>

          <div class="flex items-center justify-between text-[10px] text-neutral-400 pt-1">
            <span>Avg Temp: <strong class="text-neutral-700 dark:text-neutral-300 font-mono">{{ st.avgTemp }}°C</strong></span>
            <span class="text-primary hover:underline">Filter &rarr;</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
