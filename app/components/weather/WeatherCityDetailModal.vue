<script setup lang="ts">
import { ref, computed } from 'vue'
import type { CityLatestWeather, WeatherHistoryResponse, WeatherHistoryPoint } from '~/types/weather'
import WeatherAqiBadge from './WeatherAqiBadge.vue'

const props = defineProps<{
  open: boolean
  city: CityLatestWeather | null
  history: WeatherHistoryResponse | null
  isLoading?: boolean
  selectedRange: '24h' | '7d' | '30d' | '90d' | 'all'
}>()

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  (e: 'changeRange', range: '24h' | '7d' | '30d' | '90d' | 'all'): void
}>()

const ranges: Array<{ label: string, value: '24h' | '7d' | '30d' | '90d' | 'all' }> = [
  { label: '24 Hours', value: '24h' },
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '90 Days', value: '90d' },
  { label: 'All History', value: 'all' }
]

const svgWidth = 900
const svgHeight = 180

// Hover state
const hoverIndex = ref<number | null>(null)

// Computed SVG Path for Temperature & AQI curves
const chartData = computed(() => {
  if (!props.history || props.history.history.length === 0) return null
  const pts = props.history.history

  const first = pts[0]
  if (!first) return null

  // Min and Max for Temp
  let minTemp = first.temperature
  let maxTemp = first.temperature
  let minAqi = first.usAqi
  let maxAqi = first.usAqi
  let maxRain = 0

  for (const p of pts) {
    if (p.temperature < minTemp) minTemp = p.temperature
    if (p.temperature > maxTemp) maxTemp = p.temperature
    if (p.usAqi < minAqi) minAqi = p.usAqi
    if (p.usAqi > maxAqi) maxAqi = p.usAqi
    if (p.precipitation > maxRain) maxRain = p.precipitation
  }

  // Padding
  minTemp = Math.floor(minTemp - 2)
  maxTemp = Math.ceil(maxTemp + 2)
  if (minTemp === maxTemp) maxTemp += 5
  minAqi = 0
  maxAqi = Math.max(100, Math.ceil(maxAqi * 1.15))

  const getX = (idx: number) => {
    if (pts.length <= 1) return svgWidth / 2
    return (idx / (pts.length - 1)) * svgWidth
  }

  const getYTemp = (temp: number) => {
    return svgHeight - ((temp - minTemp) / (maxTemp - minTemp)) * (svgHeight - 40) - 20
  }

  const getYAqi = (aqi: number) => {
    return svgHeight - (aqi / maxAqi) * (svgHeight - 40) - 20
  }

  // SVG Paths
  let tempPath = ''
  let aqiPath = ''
  pts.forEach((p, i) => {
    const x = getX(i)
    const yt = getYTemp(p.temperature)
    const ya = getYAqi(p.usAqi)

    if (i === 0) {
      tempPath += `M ${x.toFixed(1)} ${yt.toFixed(1)}`
      aqiPath += `M ${x.toFixed(1)} ${ya.toFixed(1)}`
    } else {
      tempPath += ` L ${x.toFixed(1)} ${yt.toFixed(1)}`
      aqiPath += ` L ${x.toFixed(1)} ${ya.toFixed(1)}`
    }
  })

  // Closed Area Paths for Gradient Fill
  const firstX = getX(0).toFixed(1)
  const lastX = getX(pts.length - 1).toFixed(1)
  const bottomY = svgHeight.toFixed(1)

  const tempAreaPath = `${tempPath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`
  const aqiAreaPath = `${aqiPath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`

  return {
    pts,
    minTemp,
    maxTemp,
    minAqi,
    maxAqi,
    maxRain,
    tempPath,
    aqiPath,
    tempAreaPath,
    aqiAreaPath,
    getX,
    getYTemp,
    getYAqi,
    pointsCount: pts.length
  }
})

// Active datapoint under mouse cursor
const activePoint = computed<WeatherHistoryPoint | null>(() => {
  if (!chartData.value) return null
  const pts = chartData.value.pts
  if (hoverIndex.value !== null) {
    const p = pts[hoverIndex.value]
    if (p) return p
  }
  // Default to the latest reading if not hovering
  const lastPoint = pts[pts.length - 1]
  return lastPoint ?? null
})

// Hover coordinate computations
const hoverCoords = computed(() => {
  if (!chartData.value || activePoint.value === null) return null
  const idx = hoverIndex.value !== null ? hoverIndex.value : chartData.value.pts.length - 1
  const x = chartData.value.getX(idx)
  const yTemp = chartData.value.getYTemp(activePoint.value.temperature)
  const yAqi = chartData.value.getYAqi(activePoint.value.usAqi)

  return {
    x,
    yTemp,
    yAqi
  }
})

function handleSvgMouseMove(e: MouseEvent) {
  if (!chartData.value || chartData.value.pts.length === 0) return
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const clientX = e.clientX
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  hoverIndex.value = Math.round(ratio * (chartData.value.pts.length - 1))
}

function handleSvgMouseLeave() {
  hoverIndex.value = null
}
</script>

<template>
  <UModal
    :open="props.open"
    :ui="{
      content: 'sm:max-w-5xl md:max-w-6xl lg:max-w-7xl xl:max-w-[1400px] w-[calc(100vw-2rem)] max-h-[94vh] flex flex-col bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl rounded-2xl',
      body: 'flex-1 overflow-y-auto p-4 sm:p-6 space-y-6'
    }"
    @update:open="emit('update:open', $event)"
  >
    <template #header>
      <div
        v-if="props.city"
        class="flex flex-wrap items-center justify-between gap-3 w-full"
      >
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <UIcon
              :name="props.city.weatherCondition.icon"
              class="text-2xl"
            />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-lg font-extrabold text-neutral-900 dark:text-white">
                {{ props.city.city }}
              </h2>
              <UBadge
                color="neutral"
                variant="subtle"
                size="xs"
                class="font-bold"
              >
                {{ props.city.state }}
              </UBadge>
              <WeatherAqiBadge
                :aqi="props.city.usAqi"
                :category="props.city.aqiCategory"
                size="xs"
              />
            </div>
            <p class="text-xs text-neutral-500 mt-0.5">
              {{ props.city.weatherCondition.description }} • GPS: {{ props.city.latitude }}°N, {{ props.city.longitude }}°E • Ingestion: Continuous Live Telemetry
            </p>
          </div>
        </div>

        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="sm"
          class="rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
          aria-label="Close"
          @click="emit('update:open', false)"
        />
      </div>
    </template>

    <template #body>
      <div
        v-if="props.city"
        class="space-y-6"
      >
        <!-- Metric Cards Row -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 shadow-xs">
            <div class="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
              Temperature
            </div>
            <div class="text-2xl font-mono font-extrabold text-neutral-900 dark:text-white mt-1">
              {{ props.city.temperature.toFixed(1) }}°C
            </div>
            <div class="text-[11px] text-neutral-400 mt-0.5">
              Feels like {{ props.city.apparentTemperature.toFixed(1) }}°C
            </div>
          </div>

          <div class="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 shadow-xs">
            <div class="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
              Air Quality Index
            </div>
            <div class="text-2xl font-mono font-extrabold text-neutral-900 dark:text-white mt-1">
              {{ props.city.usAqi }} <span class="text-sm font-normal text-neutral-400">AQI</span>
            </div>
            <div class="text-[11px] text-neutral-400 mt-0.5">
              Category: {{ props.city.aqiCategory.label }}
            </div>
          </div>

          <div class="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 shadow-xs">
            <div class="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
              Humidity & Rain
            </div>
            <div class="text-2xl font-mono font-extrabold text-neutral-900 dark:text-white mt-1">
              {{ props.city.relativeHumidity }}%
            </div>
            <div class="text-[11px] text-neutral-400 mt-0.5">
              {{ props.city.precipitation > 0 ? `${props.city.precipitation} mm rainfall` : 'No precipitation' }}
            </div>
          </div>

          <div class="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 shadow-xs">
            <div class="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
              Wind & Time
            </div>
            <div class="text-2xl font-mono font-extrabold text-neutral-900 dark:text-white mt-1">
              {{ props.city.windSpeed.toFixed(1) }} <span class="text-sm font-normal text-neutral-400">km/h</span>
            </div>
            <div class="text-[11px] text-neutral-400 mt-0.5 truncate">
              {{ props.city.timestampLocal }}
            </div>
          </div>
        </div>

        <!-- Health Guidance Advisory Box -->
        <div
          class="p-4 rounded-xl border flex items-start gap-3 shadow-xs"
          :class="props.city.aqiCategory.badgeClass"
        >
          <UIcon
            name="i-lucide-shield-alert"
            class="text-xl shrink-0 mt-0.5"
          />
          <div>
            <div class="text-xs font-bold uppercase tracking-wider">
              Health & Activity Advisory: {{ props.city.aqiCategory.label }} Air
            </div>
            <p class="text-xs mt-0.5 opacity-90 leading-relaxed">
              {{ props.city.aqiCategory.healthAdvisory }} {{ props.city.aqiCategory.description }}
            </p>
          </div>
        </div>

        <!-- Dynamic Time-Series Trend Section with Real Hover UI -->
        <div class="p-4 sm:p-5 rounded-2xl bg-neutral-50/60 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700/60 space-y-4 shadow-xs">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-extrabold text-neutral-900 dark:text-white flex items-center gap-2">
                <UIcon
                  name="i-lucide-chart-spline"
                  class="text-primary text-base"
                />
                <span>Interactive Historical Telemetry Curves</span>
              </h3>
              <p class="text-xs text-neutral-500">
                Hover over the graphs to inspect exact historical datapoints, peak smog hours, and thermal inversions
              </p>
            </div>

            <!-- Dynamic Range Filter Buttons -->
            <div class="flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
              <button
                v-for="r in ranges"
                :key="r.value"
                type="button"
                class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                :class="props.selectedRange === r.value
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
                @click="emit('changeRange', r.value)"
              >
                {{ r.label }}
              </button>
            </div>
          </div>

          <!-- Loading State for History -->
          <div
            v-if="props.isLoading"
            class="py-20 text-center text-xs text-neutral-400"
          >
            <UIcon
              name="i-lucide-loader-2"
              class="animate-spin text-3xl mb-2 text-primary"
            />
            <p class="font-semibold text-neutral-500">
              Querying dynamic time-series from database...
            </p>
          </div>

          <!-- Chart Area with Hover UI -->
          <div
            v-else-if="chartData"
            class="space-y-4"
          >
            <!-- Real-Time Hover Telemetry Strip (Active Scrubber) -->
            <div
              v-if="activePoint"
              class="p-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700/80 shadow-xs flex flex-wrap items-center justify-between gap-3 transition-all"
            >
              <div class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-clock"
                  class="text-sm text-primary"
                />
                <span class="text-xs font-mono font-bold text-neutral-900 dark:text-white">
                  {{ activePoint.timestampLocal || activePoint.timestampUtc }}
                </span>
                <span
                  v-if="hoverIndex !== null"
                  class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary uppercase"
                >
                  Inspecting Point
                </span>
                <span
                  v-else
                  class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-500 uppercase"
                >
                  Latest Snapshot
                </span>
              </div>

              <div class="flex flex-wrap items-center gap-4 text-xs font-mono">
                <div class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-emerald-500" />
                  <span class="text-neutral-500">Temp:</span>
                  <span class="font-bold text-neutral-900 dark:text-white">{{ activePoint.temperature.toFixed(1) }}°C</span>
                </div>

                <div class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-blue-500" />
                  <span class="text-neutral-500">Humidity:</span>
                  <span class="font-bold text-neutral-900 dark:text-white">{{ activePoint.relativeHumidity }}%</span>
                </div>

                <div class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-red-500" />
                  <span class="text-neutral-500">AQI:</span>
                  <WeatherAqiBadge
                    :aqi="activePoint.usAqi"
                    size="xs"
                  />
                </div>

                <div class="flex items-center gap-1.5">
                  <span class="text-neutral-500">PM2.5:</span>
                  <span class="font-bold text-neutral-900 dark:text-white">{{ activePoint.pm25 }} µg/m³</span>
                </div>

                <div
                  v-if="activePoint.precipitation > 0"
                  class="flex items-center gap-1 text-cyan-600 dark:text-cyan-400 font-bold"
                >
                  <UIcon
                    name="i-lucide-cloud-rain"
                    class="text-xs"
                  />
                  <span>{{ activePoint.precipitation.toFixed(1) }} mm</span>
                </div>
              </div>
            </div>

            <!-- Chart 1: Air Quality Index (AQI) Curve with Interactive Hover -->
            <div class="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-2 relative">
              <div class="flex items-center justify-between text-xs">
                <div class="flex items-center gap-2 font-bold text-neutral-800 dark:text-neutral-200">
                  <span class="w-2.5 h-2.5 rounded-full bg-red-500 inline-block shadow-xs" />
                  <span>Air Quality Index (AQI) Over Time</span>
                </div>
                <div class="flex items-center gap-3 text-neutral-500 font-mono text-[11px]">
                  <span>Peak AQI: <strong class="text-red-500">{{ chartData.maxAqi }}</strong></span>
                  <span>Resolution: {{ chartData.pointsCount }} datapoints</span>
                </div>
              </div>

              <!-- Interactive SVG Canvas -->
              <div
                class="relative h-[160px] w-full cursor-crosshair select-none"
                @mousemove="handleSvgMouseMove"
                @mouseleave="handleSvgMouseLeave"
              >
                <svg
                  viewBox="0 0 900 180"
                  preserveAspectRatio="none"
                  class="w-full h-full overflow-visible"
                >
                  <defs>
                    <linearGradient
                      id="aqiAreaGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stop-color="#ef4444"
                        stop-opacity="0.35"
                      />
                      <stop
                        offset="100%"
                        stop-color="#ef4444"
                        stop-opacity="0.0"
                      />
                    </linearGradient>
                  </defs>

                  <!-- Horizontal Reference Gridlines -->
                  <line
                    x1="0"
                    y1="140"
                    x2="900"
                    y2="140"
                    stroke="currentColor"
                    class="text-neutral-100 dark:text-neutral-800"
                    stroke-width="1"
                    stroke-dasharray="4 4"
                  />
                  <line
                    x1="0"
                    y1="90"
                    x2="900"
                    y2="90"
                    stroke="currentColor"
                    class="text-neutral-100 dark:text-neutral-800"
                    stroke-width="1"
                    stroke-dasharray="4 4"
                  />
                  <line
                    x1="0"
                    y1="40"
                    x2="900"
                    y2="40"
                    stroke="currentColor"
                    class="text-neutral-100 dark:text-neutral-800"
                    stroke-width="1"
                    stroke-dasharray="4 4"
                  />

                  <!-- Gradient Area Fill -->
                  <path
                    :d="chartData.aqiAreaPath"
                    fill="url(#aqiAreaGrad)"
                  />

                  <!-- Trend Line -->
                  <path
                    :d="chartData.aqiPath"
                    fill="none"
                    stroke="#ef4444"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />

                  <!-- Hover Crosshair Line and Glowing Indicator -->
                  <g v-if="hoverCoords">
                    <line
                      :x1="hoverCoords.x"
                      y1="0"
                      :x2="hoverCoords.x"
                      y2="180"
                      stroke="#ef4444"
                      stroke-width="1.5"
                      stroke-dasharray="3 3"
                      class="opacity-70"
                    />
                    <circle
                      :cx="hoverCoords.x"
                      :cy="hoverCoords.yAqi"
                      r="6"
                      fill="#ef4444"
                      stroke="#ffffff"
                      stroke-width="2.5"
                      class="shadow-lg"
                    />
                  </g>
                </svg>
              </div>

              <!-- Time Bounds Bar -->
              <div
                v-if="chartData.pts.length > 0"
                class="flex items-center justify-between text-[10px] font-mono text-neutral-400 pt-1 border-t border-neutral-100 dark:border-neutral-800/60"
              >
                <span>{{ chartData.pts[0]?.timestampLocal || chartData.pts[0]?.timestampUtc || '' }}</span>
                <span class="hidden sm:inline">Midpoint: {{ chartData.pts[Math.floor(chartData.pts.length / 2)]?.timestampLocal || '' }}</span>
                <span>{{ chartData.pts[chartData.pts.length - 1]?.timestampLocal || chartData.pts[chartData.pts.length - 1]?.timestampUtc || '' }}</span>
              </div>
            </div>

            <!-- Chart 2: Temperature (°C) Curve with Interactive Hover -->
            <div class="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-2 relative">
              <div class="flex items-center justify-between text-xs">
                <div class="flex items-center gap-2 font-bold text-neutral-800 dark:text-neutral-200">
                  <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-xs" />
                  <span>Thermal Profile (°C) Over Time</span>
                </div>
                <div class="flex items-center gap-3 text-neutral-500 font-mono text-[11px]">
                  <span>Range: <strong class="text-emerald-600 dark:text-emerald-400">{{ chartData.minTemp }}°C to {{ chartData.maxTemp }}°C</strong></span>
                  <span>Relative Humidity Tracked</span>
                </div>
              </div>

              <!-- Interactive SVG Canvas -->
              <div
                class="relative h-[160px] w-full cursor-crosshair select-none"
                @mousemove="handleSvgMouseMove"
                @mouseleave="handleSvgMouseLeave"
              >
                <svg
                  viewBox="0 0 900 180"
                  preserveAspectRatio="none"
                  class="w-full h-full overflow-visible"
                >
                  <defs>
                    <linearGradient
                      id="tempAreaGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stop-color="#10b981"
                        stop-opacity="0.3"
                      />
                      <stop
                        offset="100%"
                        stop-color="#10b981"
                        stop-opacity="0.0"
                      />
                    </linearGradient>
                  </defs>

                  <!-- Horizontal Reference Gridlines -->
                  <line
                    x1="0"
                    y1="140"
                    x2="900"
                    y2="140"
                    stroke="currentColor"
                    class="text-neutral-100 dark:text-neutral-800"
                    stroke-width="1"
                    stroke-dasharray="4 4"
                  />
                  <line
                    x1="0"
                    y1="90"
                    x2="900"
                    y2="90"
                    stroke="currentColor"
                    class="text-neutral-100 dark:text-neutral-800"
                    stroke-width="1"
                    stroke-dasharray="4 4"
                  />
                  <line
                    x1="0"
                    y1="40"
                    x2="900"
                    y2="40"
                    stroke="currentColor"
                    class="text-neutral-100 dark:text-neutral-800"
                    stroke-width="1"
                    stroke-dasharray="4 4"
                  />

                  <!-- Gradient Area Fill -->
                  <path
                    :d="chartData.tempAreaPath"
                    fill="url(#tempAreaGrad)"
                  />

                  <!-- Trend Line -->
                  <path
                    :d="chartData.tempPath"
                    fill="none"
                    stroke="#10b981"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />

                  <!-- Hover Crosshair Line and Glowing Indicator -->
                  <g v-if="hoverCoords">
                    <line
                      :x1="hoverCoords.x"
                      y1="0"
                      :x2="hoverCoords.x"
                      y2="180"
                      stroke="#10b981"
                      stroke-width="1.5"
                      stroke-dasharray="3 3"
                      class="opacity-70"
                    />
                    <circle
                      :cx="hoverCoords.x"
                      :cy="hoverCoords.yTemp"
                      r="6"
                      fill="#10b981"
                      stroke="#ffffff"
                      stroke-width="2.5"
                      class="shadow-lg"
                    />
                  </g>
                </svg>
              </div>

              <!-- Time Bounds Bar -->
              <div
                v-if="chartData.pts.length > 0"
                class="flex items-center justify-between text-[10px] font-mono text-neutral-400 pt-1 border-t border-neutral-100 dark:border-neutral-800/60"
              >
                <span>{{ chartData.pts[0]?.timestampLocal || chartData.pts[0]?.timestampUtc || '' }}</span>
                <span class="hidden sm:inline">Midpoint: {{ chartData.pts[Math.floor(chartData.pts.length / 2)]?.timestampLocal || '' }}</span>
                <span>{{ chartData.pts[chartData.pts.length - 1]?.timestampLocal || chartData.pts[chartData.pts.length - 1]?.timestampUtc || '' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Chemical Pollutant Decomposition -->
        <div class="p-4 sm:p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-3 shadow-xs">
          <h3 class="text-sm font-extrabold text-neutral-900 dark:text-white">
            Chemical Pollutant Decomposition & Molecular Weights
          </h3>

          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div class="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700/60">
              <div class="text-[11px] text-neutral-500 font-bold">
                PM2.5 (Fine)
              </div>
              <div class="text-base font-mono font-extrabold text-neutral-900 dark:text-white mt-1">
                {{ props.city.pm25 }} <span class="text-[10px] font-normal text-neutral-400">µg/m³</span>
              </div>
              <div class="text-[10px] text-neutral-400 mt-0.5">
                Safe limit: 30
              </div>
            </div>

            <div class="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700/60">
              <div class="text-[11px] text-neutral-500 font-bold">
                PM10 (Coarse)
              </div>
              <div class="text-base font-mono font-extrabold text-neutral-900 dark:text-white mt-1">
                {{ props.city.pm10 }} <span class="text-[10px] font-normal text-neutral-400">µg/m³</span>
              </div>
              <div class="text-[10px] text-neutral-400 mt-0.5">
                Safe limit: 60
              </div>
            </div>

            <div class="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700/60">
              <div class="text-[11px] text-neutral-500 font-bold">
                CO (Carbon Monoxide)
              </div>
              <div class="text-base font-mono font-extrabold text-neutral-900 dark:text-white mt-1">
                {{ props.city.carbonMonoxide }} <span class="text-[10px] font-normal text-neutral-400">µg/m³</span>
              </div>
              <div class="text-[10px] text-neutral-400 mt-0.5">
                Combustion
              </div>
            </div>

            <div class="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700/60">
              <div class="text-[11px] text-neutral-500 font-bold">
                NO₂ (Nitrogen Dioxide)
              </div>
              <div class="text-base font-mono font-extrabold text-neutral-900 dark:text-white mt-1">
                {{ props.city.nitrogenDioxide }} <span class="text-[10px] font-normal text-neutral-400">µg/m³</span>
              </div>
              <div class="text-[10px] text-neutral-400 mt-0.5">
                Traffic emissions
              </div>
            </div>

            <div class="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700/60">
              <div class="text-[11px] text-neutral-500 font-bold">
                SO₂ (Sulphur Dioxide)
              </div>
              <div class="text-base font-mono font-extrabold text-neutral-900 dark:text-white mt-1">
                {{ props.city.sulphurDioxide }} <span class="text-[10px] font-normal text-neutral-400">µg/m³</span>
              </div>
              <div class="text-[10px] text-neutral-400 mt-0.5">
                Industrial activity
              </div>
            </div>

            <div class="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700/60">
              <div class="text-[11px] text-neutral-500 font-bold">
                O₃ (Ozone)
              </div>
              <div class="text-base font-mono font-extrabold text-neutral-900 dark:text-white mt-1">
                {{ props.city.ozone }} <span class="text-[10px] font-normal text-neutral-400">µg/m³</span>
              </div>
              <div class="text-[10px] text-neutral-400 mt-0.5">
                Photochemical smog
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
