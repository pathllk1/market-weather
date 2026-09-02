<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type {
  CityLatestWeather,
  NationalWeatherPulse,
  WeatherHistoryResponse
} from '~/types/weather'
import WeatherAqiBadge from './WeatherAqiBadge.vue'

const props = defineProps<{
  cities: CityLatestWeather[]
  pulse: NationalWeatherPulse | null
}>()

const emit = defineEmits<{
  (e: 'select-city', city: CityLatestWeather): void
}>()

// Top-level comparison mode: 'cities' (Multi-City Cross-Sectional) | 'dates' (Temporal Over Time)
const comparisonMode = ref<'cities' | 'dates'>('cities')

// Temporal sub-mode: 'single' (1 City • 2 Dates) | 'dual' (2 Cities • 2 Dates Matrix)
const temporalSubMode = ref<'single' | 'dual'>('dual')

// ==========================================
// MODE 1: MULTI-CITY COMPARISON STATE & LOGIC
// ==========================================

const CITY_COLORS = [
  {
    name: 'cyan',
    stroke: '#06b6d4',
    bg: 'bg-cyan-500/15',
    text: 'text-cyan-600 dark:text-cyan-400',
    border: 'border-cyan-500/40',
    hex: '#06b6d4'
  },
  {
    name: 'purple',
    stroke: '#a855f7',
    bg: 'bg-purple-500/15',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-500/40',
    hex: '#a855f7'
  },
  {
    name: 'amber',
    stroke: '#f59e0b',
    bg: 'bg-amber-500/15',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/40',
    hex: '#f59e0b'
  },
  {
    name: 'emerald',
    stroke: '#10b981',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/40',
    hex: '#10b981'
  }
]

const selectedCityNames = ref<string[]>(['Delhi', 'Mumbai', 'Bengaluru'])
const selectedMetric = ref<'temp' | 'aqi' | 'humidity' | 'pm25'>('temp')
const selectedRange = ref<'24h' | '7d' | '30d'>('7d')

const presets = computed(() => {
  const list = [
    {
      id: 'metros',
      label: 'Metro Giants',
      icon: 'i-lucide-building-2',
      cities: ['Delhi', 'Mumbai', 'Bengaluru', 'Kolkata']
    },
    {
      id: 'north_south',
      label: 'North vs South',
      icon: 'i-lucide-compass',
      cities: ['Delhi', 'Chennai']
    },
    {
      id: 'tech_hubs',
      label: 'Tech Hubs',
      icon: 'i-lucide-cpu',
      cities: ['Bengaluru', 'Hyderabad', 'Pune']
    },
    {
      id: 'coastal',
      label: 'Coastal Watch',
      icon: 'i-lucide-waves',
      cities: ['Mumbai', 'Chennai', 'Kolkata']
    }
  ]

  if (props.pulse) {
    if (props.pulse.hottestCity && props.pulse.coldestCity && props.pulse.hottestCity.city !== props.pulse.coldestCity.city) {
      list.push({
        id: 'thermal_extremes',
        label: 'Thermal Extremes',
        icon: 'i-lucide-flame',
        cities: [props.pulse.hottestCity.city, props.pulse.coldestCity.city]
      })
    }
    if (props.pulse.cleanestCity && props.pulse.mostPollutedCity && props.pulse.cleanestCity.city !== props.pulse.mostPollutedCity.city) {
      list.push({
        id: 'aqi_extremes',
        label: 'AQI Extremes',
        icon: 'i-lucide-wind',
        cities: [props.pulse.cleanestCity.city, props.pulse.mostPollutedCity.city]
      })
    }
  }

  return list
})

const citySearchQuery = ref('')
const isAddDropdownOpen = ref(false)

const availableToAddCities = computed(() => {
  const query = citySearchQuery.value.toLowerCase().trim()
  return props.cities.filter((c) => {
    if (selectedCityNames.value.includes(c.city)) return false
    if (!query) return true
    return c.city.toLowerCase().includes(query) || c.state.toLowerCase().includes(query)
  })
})

function addCity(cityName: string) {
  if (selectedCityNames.value.length < 4 && !selectedCityNames.value.includes(cityName)) {
    selectedCityNames.value.push(cityName)
    citySearchQuery.value = ''
    isAddDropdownOpen.value = false
  }
}

function removeCity(cityName: string) {
  if (selectedCityNames.value.length > 2) {
    selectedCityNames.value = selectedCityNames.value.filter(c => c !== cityName)
  }
}

function applyPreset(cities: string[]) {
  const valid = cities.filter(name => props.cities.some(c => c.city.toLowerCase() === name.toLowerCase()))
  if (valid.length >= 2) {
    selectedCityNames.value = valid.slice(0, 4)
  }
}

const comparedCities = computed(() => {
  return selectedCityNames.value.map((name, idx) => {
    const city = props.cities.find(c => c.city.toLowerCase() === name.toLowerCase())
    const theme = CITY_COLORS[idx % CITY_COLORS.length]!
    return {
      name,
      city,
      theme
    }
  }).filter((c): c is { name: string; city: CityLatestWeather; theme: typeof CITY_COLORS[0] } => Boolean(c.city))
})

const comparisonStats = computed(() => {
  const list = comparedCities.value
  if (list.length === 0) return null

  let warmest = list[0]!
  let coolest = list[0]!
  let cleanest = list[0]!
  let mostPolluted = list[0]!
  let highestHumidity = list[0]!
  let lowestHumidity = list[0]!
  let highestWind = list[0]!

  for (const item of list) {
    if (item.city.temperature > warmest.city.temperature) warmest = item
    if (item.city.temperature < coolest.city.temperature) coolest = item
    if (item.city.usAqi < cleanest.city.usAqi) cleanest = item
    if (item.city.usAqi > mostPolluted.city.usAqi) mostPolluted = item
    if (item.city.relativeHumidity > highestHumidity.city.relativeHumidity) highestHumidity = item
    if (item.city.relativeHumidity < lowestHumidity.city.relativeHumidity) lowestHumidity = item
    if (item.city.windSpeed > highestWind.city.windSpeed) highestWind = item
  }

  const tempDiff = Math.abs(warmest.city.temperature - coolest.city.temperature)
  const aqiDiff = Math.abs(mostPolluted.city.usAqi - cleanest.city.usAqi)

  return {
    warmest,
    coolest,
    cleanest,
    mostPolluted,
    highestHumidity,
    lowestHumidity,
    highestWind,
    tempDiff: Number(tempDiff.toFixed(1)),
    aqiDiff: Math.round(aqiDiff)
  }
})

const historyCache = ref<Record<string, WeatherHistoryResponse>>({})
const isLoadingCharts = ref(false)

async function loadMultiCityHistory() {
  isLoadingCharts.value = true
  try {
    const promises = selectedCityNames.value.map(async (cityName) => {
      const cacheKey = `${cityName}_${selectedRange.value}`
      if (historyCache.value[cacheKey]) return

      try {
        const res: any = await $fetch(`/api/weather/history?city=${encodeURIComponent(cityName)}&range=${selectedRange.value}`)
        if (res.success && res.data) {
          historyCache.value[cacheKey] = res.data
        }
      } catch (err) {
        console.warn(`[Comparison] Failed to load history for ${cityName}:`, err)
      }
    })

    await Promise.all(promises)
  } finally {
    isLoadingCharts.value = false
  }
}

watch([selectedCityNames, selectedRange], () => {
  if (comparisonMode.value === 'cities') {
    loadMultiCityHistory()
  }
}, { deep: true, immediate: true })

const svgWidth = 900
const svgHeight = 220

const multiChartData = computed(() => {
  const series: Array<{
    name: string
    color: string
    theme: typeof CITY_COLORS[0]
    points: Array<{ x: number; y: number; val: number; time: string }>
    path: string
    areaPath: string
  }> = []

  let minVal = Infinity
  let maxVal = -Infinity
  let maxLen = 0

  for (const item of comparedCities.value) {
    const cacheKey = `${item.name}_${selectedRange.value}`
    const histData = historyCache.value[cacheKey]
    if (!histData || !histData.history || histData.history.length === 0) continue

    if (histData.history.length > maxLen) maxLen = histData.history.length

    for (const p of histData.history) {
      let val = p.temperature
      if (selectedMetric.value === 'aqi') val = p.usAqi
      else if (selectedMetric.value === 'humidity') val = p.relativeHumidity
      else if (selectedMetric.value === 'pm25') val = p.pm25

      if (val < minVal) minVal = val
      if (val > maxVal) maxVal = val
    }
  }

  if (minVal === Infinity || maxVal === -Infinity || maxLen === 0) {
    return null
  }

  if (selectedMetric.value === 'temp') {
    minVal = Math.floor(minVal - 2)
    maxVal = Math.ceil(maxVal + 2)
  } else if (selectedMetric.value === 'aqi') {
    minVal = 0
    maxVal = Math.max(100, Math.ceil(maxVal * 1.1))
  } else if (selectedMetric.value === 'humidity') {
    minVal = 0
    maxVal = 100
  } else {
    minVal = 0
    maxVal = Math.max(50, Math.ceil(maxVal * 1.15))
  }

  const range = maxVal - minVal || 1

  for (const item of comparedCities.value) {
    const cacheKey = `${item.name}_${selectedRange.value}`
    const histData = historyCache.value[cacheKey]
    if (!histData || !histData.history || histData.history.length === 0) continue

    const pts = histData.history
    const mappedPoints: Array<{ x: number; y: number; val: number; time: string }> = []
    let path = ''

    pts.forEach((p, idx) => {
      let val = p.temperature
      if (selectedMetric.value === 'aqi') val = p.usAqi
      else if (selectedMetric.value === 'humidity') val = p.relativeHumidity
      else if (selectedMetric.value === 'pm25') val = p.pm25

      const x = pts.length > 1 ? (idx / (pts.length - 1)) * svgWidth : svgWidth / 2
      const y = svgHeight - ((val - minVal) / range) * (svgHeight - 40) - 20

      mappedPoints.push({
        x,
        y,
        val,
        time: p.timestampLocal
      })

      if (idx === 0) {
        path += `M ${x.toFixed(1)} ${y.toFixed(1)}`
      } else {
        path += ` L ${x.toFixed(1)} ${y.toFixed(1)}`
      }
    })

    const firstX = mappedPoints[0]?.x.toFixed(1) || '0'
    const lastX = mappedPoints[mappedPoints.length - 1]?.x.toFixed(1) || String(svgWidth)
    const areaPath = `${path} L ${lastX} ${svgHeight} L ${firstX} ${svgHeight} Z`

    series.push({
      name: item.name,
      color: item.theme.stroke,
      theme: item.theme,
      points: mappedPoints,
      path,
      areaPath
    })
  }

  return {
    series,
    minVal,
    maxVal,
    maxLen
  }
})

function getMetricUnit(m: string): string {
  if (m === 'temp') return '°C'
  if (m === 'aqi') return ' AQI'
  if (m === 'humidity') return '%'
  if (m === 'pm25') return ' µg/m³'
  return ''
}

function getMetricLabel(m: string): string {
  if (m === 'temp') return 'Temperature'
  if (m === 'aqi') return 'Air Quality Index'
  if (m === 'humidity') return 'Relative Humidity'
  if (m === 'pm25') return 'PM2.5 Particulate'
  return ''
}

function getComfortAssessment(c: CityLatestWeather) {
  const temp = c.temperature
  const hum = c.relativeHumidity

  let thermalStatus = 'Pleasant & Comfortable'
  let thermalBadge = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
  let acDemand = 'Low / Fan Only'

  if (temp >= 38 || c.apparentTemperature >= 42) {
    thermalStatus = 'Severe Heat Stress'
    thermalBadge = 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
    acDemand = 'Extreme AC Load'
  } else if (temp >= 33 || (temp >= 30 && hum >= 70)) {
    thermalStatus = 'Hot & Muggy / Sticky'
    thermalBadge = 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
    acDemand = 'High AC Cooling'
  } else if (temp <= 15) {
    thermalStatus = 'Cold / Heating Required'
    thermalBadge = 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
    acDemand = 'Heating Needed'
  }

  let outdoorSafety = 'Safe for Outdoors'
  let outdoorBadge = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
  let maskAdvice = 'Not Required'

  if (c.usAqi > 200) {
    outdoorSafety = 'Avoid Outdoor Activity'
    outdoorBadge = 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
    maskAdvice = 'N95 Respirator Mandatory'
  } else if (c.usAqi > 100) {
    outdoorSafety = 'Caution / Sensitive Limit'
    outdoorBadge = 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30'
    maskAdvice = 'Mask Recommended'
  }

  if (c.precipitation > 2) {
    outdoorSafety = 'Rain Alert / Wet Ground'
  }

  return {
    thermalStatus,
    thermalBadge,
    acDemand,
    outdoorSafety,
    outdoorBadge,
    maskAdvice
  }
}

// ==========================================
// MODE 2: TEMPORAL COMPARISON (1 CITY 2 DATES OR 2 CITIES 2 DATES)
// ==========================================

const city1Name = ref('Delhi')
const city2Name = ref('Mumbai')
const selectedDateA = ref('')
const selectedDateB = ref('')
const availableDates = ref<string[]>([])

// Matrix data loaded from /api/weather/compare-dates
const compareMatrix = ref<Record<string, any>>({})
const isLoadingTemporal = ref(false)
const selectedDiurnalMetric = ref<'temp' | 'aqi' | 'humidity' | 'pm25'>('temp')

// Load Date comparison data (supports 1 or 2 cities)
async function loadTemporalComparison() {
  const citiesToFetch = temporalSubMode.value === 'dual' 
    ? [city1Name.value, city2Name.value].filter(Boolean)
    : [city1Name.value]

  if (citiesToFetch.length === 0) return
  isLoadingTemporal.value = true

  try {
    const params = new URLSearchParams({
      cities: citiesToFetch.join(',')
    })
    if (selectedDateA.value) params.set('dateA', selectedDateA.value)
    if (selectedDateB.value) params.set('dateB', selectedDateB.value)

    const res: any = await $fetch(`/api/weather/compare-dates?${params.toString()}`)
    if (res.success && res.data) {
      availableDates.value = res.data.availableDates || []
      selectedDateA.value = res.data.dateA
      selectedDateB.value = res.data.dateB
      compareMatrix.value = res.data.matrix || {}
    }
  } catch (err) {
    console.error('Failed to load temporal comparison:', err)
  } finally {
    isLoadingTemporal.value = false
  }
}

function handleCityChange() {
  loadTemporalComparison()
}

// Quick 1-Click Temporal Presets
function applyTemporalInterval(type: 'yesterday' | '7d' | '14d' | '30d') {
  if (availableDates.value.length === 0) return
  selectedDateA.value = availableDates.value[0] || ''

  if (type === 'yesterday') {
    selectedDateB.value = availableDates.value[1] || availableDates.value[0] || ''
  } else if (type === '7d') {
    selectedDateB.value = availableDates.value[7] || availableDates.value[1] || availableDates.value[0] || ''
  } else if (type === '14d') {
    selectedDateB.value = availableDates.value[14] || availableDates.value[availableDates.value.length - 1] || ''
  } else if (type === '30d') {
    selectedDateB.value = availableDates.value[30] || availableDates.value[availableDates.value.length - 1] || ''
  }
  loadTemporalComparison()
}

function applyDualCityPreset(c1: string, c2: string) {
  city1Name.value = c1
  city2Name.value = c2
  applyTemporalInterval('7d')
}

// Format readable date string
function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '—'
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  const year = parseInt(parts[0]!, 10)
  const month = parseInt(parts[1]!, 10) - 1
  const day = parseInt(parts[2]!, 10)
  const date = new Date(year, month, day)
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date)
}

// Data accessors for 2 Cities x 2 Dates
const c1SummaryA = computed(() => compareMatrix.value[city1Name.value]?.summaryA || null)
const c1SummaryB = computed(() => compareMatrix.value[city1Name.value]?.summaryB || null)
const c2SummaryA = computed(() => compareMatrix.value[city2Name.value]?.summaryA || null)
const c2SummaryB = computed(() => compareMatrix.value[city2Name.value]?.summaryB || null)

// Computed deltas for City 1 (Date A vs Date B)
const c1Deltas = computed(() => {
  if (!c1SummaryA.value || !c1SummaryB.value) return null
  const a = c1SummaryA.value
  const b = c1SummaryB.value
  return {
    temp: Number((a.avgTemp - b.avgTemp).toFixed(1)),
    maxTemp: Number((a.maxTemp - b.maxTemp).toFixed(1)),
    aqi: Math.round(a.avgAqi - b.avgAqi),
    rain: Number((a.totalRain - b.totalRain).toFixed(1)),
    humidity: Math.round(a.avgHumidity - b.avgHumidity),
    pm25: Number((a.avgPm25 - b.avgPm25).toFixed(1)),
    wind: Number((a.avgWind - b.avgWind).toFixed(1))
  }
})

// Computed deltas for City 2 (Date A vs Date B)
const c2Deltas = computed(() => {
  if (!c2SummaryA.value || !c2SummaryB.value) return null
  const a = c2SummaryA.value
  const b = c2SummaryB.value
  return {
    temp: Number((a.avgTemp - b.avgTemp).toFixed(1)),
    maxTemp: Number((a.maxTemp - b.maxTemp).toFixed(1)),
    aqi: Math.round(a.avgAqi - b.avgAqi),
    rain: Number((a.totalRain - b.totalRain).toFixed(1)),
    humidity: Math.round(a.avgHumidity - b.avgHumidity),
    pm25: Number((a.avgPm25 - b.avgPm25).toFixed(1)),
    wind: Number((a.avgWind - b.avgWind).toFixed(1))
  }
})

// Spatial delta between City 1 and City 2 on Date A
const spatialDeltasA = computed(() => {
  if (!c1SummaryA.value || !c2SummaryA.value) return null
  const c1 = c1SummaryA.value
  const c2 = c2SummaryA.value
  return {
    temp: Number((c1.avgTemp - c2.avgTemp).toFixed(1)),
    aqi: Math.round(c1.avgAqi - c2.avgAqi),
    rain: Number((c1.totalRain - c2.totalRain).toFixed(1)),
    humidity: Math.round(c1.avgHumidity - c2.avgHumidity),
    pm25: Number((c1.avgPm25 - c2.avgPm25).toFixed(1))
  }
})

// Difference-in-Differences Trend Divergence
const trendDivergence = computed(() => {
  if (!c1Deltas.value || !c2Deltas.value) return null
  const d1 = c1Deltas.value
  const d2 = c2Deltas.value

  // AQI Improvement: more negative delta means more improvement
  let aqiNarrative = ''
  if (d1.aqi < d2.aqi) {
    const diff = Math.abs(d1.aqi - d2.aqi)
    aqiNarrative = `${city1Name.value} air quality improved significantly more than ${city2Name.value} (Δ ${diff} AQI relative advantage).`
  } else if (d2.aqi < d1.aqi) {
    const diff = Math.abs(d2.aqi - d1.aqi)
    aqiNarrative = `${city2Name.value} air quality improved significantly more than ${city1Name.value} (Δ ${diff} AQI relative advantage).`
  } else {
    aqiNarrative = `Both cities experienced identical air quality shifts over this time window.`
  }

  let tempNarrative = ''
  if (d1.temp > d2.temp) {
    tempNarrative = `${city1Name.value} warmed faster than ${city2Name.value} (Δ +${(d1.temp - d2.temp).toFixed(1)}°C higher thermal delta).`
  } else {
    tempNarrative = `${city2Name.value} warmed faster than ${city1Name.value} (Δ +${(d2.temp - d1.temp).toFixed(1)}°C higher thermal delta).`
  }

  return {
    aqiNarrative,
    tempNarrative
  }
})

// 4-Curve Diurnal Overlay Chart Computation
const fourCurveDiurnalData = computed(() => {
  const c1Data = compareMatrix.value[city1Name.value]
  const c2Data = compareMatrix.value[city2Name.value]

  const ptsC1A = c1Data?.pointsA || []
  const ptsC1B = c1Data?.pointsB || []
  const ptsC2A = temporalSubMode.value === 'dual' ? (c2Data?.pointsA || []) : []
  const ptsC2B = temporalSubMode.value === 'dual' ? (c2Data?.pointsB || []) : []

  if (ptsC1A.length === 0 && ptsC1B.length === 0 && ptsC2A.length === 0) return null

  const getMetricVal = (p: any) => {
    if (selectedDiurnalMetric.value === 'temp') return p.temperature
    if (selectedDiurnalMetric.value === 'aqi') return p.usAqi
    if (selectedDiurnalMetric.value === 'humidity') return p.relativeHumidity
    if (selectedDiurnalMetric.value === 'pm25') return p.pm25
    return p.temperature
  }

  let minVal = Infinity
  let maxVal = -Infinity

  const allPoints = [...ptsC1A, ...ptsC1B, ...ptsC2A, ...ptsC2B]
  for (const p of allPoints) {
    const v = getMetricVal(p)
    if (v < minVal) minVal = v
    if (v > maxVal) maxVal = v
  }

  if (minVal === Infinity || maxVal === -Infinity) return null

  if (selectedDiurnalMetric.value === 'temp') {
    minVal = Math.floor(minVal - 2)
    maxVal = Math.ceil(maxVal + 2)
  } else if (selectedDiurnalMetric.value === 'aqi') {
    minVal = 0
    maxVal = Math.max(100, Math.ceil(maxVal * 1.15))
  } else if (selectedDiurnalMetric.value === 'humidity') {
    minVal = 0
    maxVal = 100
  } else {
    minVal = 0
    maxVal = Math.max(50, Math.ceil(maxVal * 1.15))
  }

  const range = maxVal - minVal || 1

  const buildPath = (pts: any[]) => {
    if (pts.length === 0) return { path: '', areaPath: '', mapped: [] }
    const mapped: Array<{ x: number; y: number; val: number; time: string }> = []
    let path = ''

    pts.forEach((p, idx) => {
      const val = getMetricVal(p)
      const x = pts.length > 1 ? (idx / (pts.length - 1)) * svgWidth : svgWidth / 2
      const y = svgHeight - ((val - minVal) / range) * (svgHeight - 40) - 20

      mapped.push({
        x,
        y,
        val,
        time: p.hourLocal || p.timestampLocal
      })

      if (idx === 0) {
        path += `M ${x.toFixed(1)} ${y.toFixed(1)}`
      } else {
        path += ` L ${x.toFixed(1)} ${y.toFixed(1)}`
      }
    })

    const firstX = mapped[0]?.x.toFixed(1) || '0'
    const lastX = mapped[mapped.length - 1]?.x.toFixed(1) || String(svgWidth)
    const areaPath = `${path} L ${lastX} ${svgHeight} L ${firstX} ${svgHeight} Z`

    return { path, areaPath, mapped }
  }

  const curveC1A = buildPath(ptsC1A)
  const curveC1B = buildPath(ptsC1B)
  const curveC2A = buildPath(ptsC2A)
  const curveC2B = buildPath(ptsC2B)

  return {
    curveC1A,
    curveC1B,
    curveC2A,
    curveC2B,
    minVal,
    maxVal
  }
})

// Watchers to auto-load temporal data
watch([comparisonMode, temporalSubMode], ([mode]) => {
  if (mode === 'dates' && availableDates.value.length === 0) {
    loadTemporalComparison()
  }
}, { immediate: true })
</script>

<template>
  <div class="space-y-6">
    <!-- Top-Level Comparison Mode Switcher Strip -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-3.5">
      <div class="flex items-center gap-1.5 p-1 rounded-2xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/80">
        <button
          type="button"
          class="flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all select-none"
          :class="comparisonMode === 'cities' ? 'bg-primary text-white shadow-sm' : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
          @click="comparisonMode = 'cities'"
        >
          <UIcon
            name="i-lucide-building-2"
            class="h-3.5 w-3.5"
          />
          <span>Between Cities</span>
          <span class="text-[10px] font-normal opacity-80">(Cross-Sectional)</span>
        </button>

        <button
          type="button"
          class="flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all select-none"
          :class="comparisonMode === 'dates' ? 'bg-primary text-white shadow-sm' : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
          @click="comparisonMode = 'dates'"
        >
          <UIcon
            name="i-lucide-calendar-days"
            class="h-3.5 w-3.5"
          />
          <span>Temporal Matrix</span>
          <span class="rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[9px] px-1.5 py-0.2 font-extrabold uppercase">
            Historical
          </span>
        </button>
      </div>

      <div class="text-xs text-neutral-500 dark:text-neutral-400">
        <span v-if="comparisonMode === 'cities'">Comparing {{ comparedCities.length }} Indian cities simultaneously</span>
        <span v-else-if="temporalSubMode === 'dual'">Spatio-Temporal Matrix: <strong>{{ city1Name }}</strong> vs <strong>{{ city2Name }}</strong> across two dates</span>
        <span v-else>Analyzing historical variance for <strong>{{ city1Name }}</strong> across two dates</span>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- VIEW A: MULTI-CITY COMPARISON MODE (BETWEEN CITIES)       -->
    <!-- ======================================================== -->
    <div
      v-show="comparisonMode === 'cities'"
      class="space-y-6"
    >
      <!-- Top Control Bar: City Selector & Instant Presets -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-5 shadow-sm space-y-4">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-base sm:text-lg font-black text-neutral-900 dark:text-white">
                Multi-City Environmental Comparator
              </h2>
              <UBadge
                color="primary"
                variant="subtle"
                size="xs"
              >
                {{ comparedCities.length }} Cities
              </UBadge>
            </div>
            <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Real-time side-by-side telemetry, variance indicators, and synchronized historical trendlines.
            </p>
          </div>

          <!-- City Selector Chips & Add Button -->
          <div class="flex items-center gap-2 flex-wrap">
            <div
              v-for="item in comparedCities"
              :key="item.name"
              class="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all shadow-sm"
              :class="[item.theme.border, item.theme.bg, item.theme.text]"
            >
              <span
                class="h-2 w-2 rounded-full"
                :style="{ backgroundColor: item.theme.stroke }"
              />
              <span>{{ item.name }}</span>
              <button
                v-if="comparedCities.length > 2"
                type="button"
                class="ml-1 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                title="Remove from comparison"
                @click="removeCity(item.name)"
              >
                <UIcon
                  name="i-lucide-x"
                  class="h-3 w-3"
                />
              </button>
            </div>

            <div
              v-if="comparedCities.length < 4"
              class="relative"
            >
              <UButton
                size="sm"
                variant="outline"
                color="neutral"
                icon="i-lucide-plus"
                @click="isAddDropdownOpen = !isAddDropdownOpen"
              >
                Add City
              </UButton>

              <div
                v-if="isAddDropdownOpen"
                class="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 shadow-2xl ring-1 ring-black/10 dark:ring-white/10"
              >
                <div class="mb-2 px-1">
                  <UInput
                    v-model="citySearchQuery"
                    icon="i-lucide-search"
                    placeholder="Search Indian city..."
                    size="xs"
                    autofocus
                  />
                </div>

                <div class="max-h-56 overflow-y-auto space-y-0.5">
                  <button
                    v-for="c in availableToAddCities"
                    :key="c.city"
                    type="button"
                    class="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                    @click="addCity(c.city)"
                  >
                    <span class="font-bold text-neutral-900 dark:text-white">{{ c.city }}</span>
                    <span class="text-[10px] text-neutral-500">{{ c.state }}</span>
                  </button>
                  <div
                    v-if="availableToAddCities.length === 0"
                    class="p-2 text-center text-xs text-neutral-500"
                  >
                    No cities found
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Presets -->
        <div class="flex items-center gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800/80 overflow-x-auto pb-1 text-xs">
          <span class="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 shrink-0 uppercase tracking-wider">
            Quick Presets:
          </span>
          <button
            v-for="preset in presets"
            :key="preset.id"
            type="button"
            class="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 px-2.5 py-1 font-semibold text-neutral-700 dark:text-neutral-300 hover:border-primary hover:text-primary transition-all shrink-0 select-none"
            @click="applyPreset(preset.cities)"
          >
            <UIcon
              :name="preset.icon"
              class="h-3.5 w-3.5 text-primary"
            />
            <span>{{ preset.label }}</span>
          </button>
        </div>
      </div>

      <!-- Quick Differential Snapshot Banner -->
      <div
        v-if="comparisonStats"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <div class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3.5 shadow-sm">
          <div class="flex items-center justify-between text-[11px] text-neutral-500">
            <span>Thermal Variance</span>
            <UIcon
              name="i-lucide-thermometer-sun"
              class="h-4 w-4 text-amber-500"
            />
          </div>
          <div class="mt-1 flex items-baseline gap-1.5">
            <span class="text-xl font-black font-mono text-neutral-900 dark:text-white">
              Δ {{ comparisonStats.tempDiff }}°C
            </span>
          </div>
          <div class="mt-1 text-[11px] text-neutral-500 truncate">
            Warmest: <span class="font-bold text-amber-600 dark:text-amber-400">{{ comparisonStats.warmest.name }}</span> ({{ comparisonStats.warmest.city.temperature }}°C)
          </div>
        </div>

        <div class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3.5 shadow-sm">
          <div class="flex items-center justify-between text-[11px] text-neutral-500">
            <span>Air Quality Spread</span>
            <UIcon
              name="i-lucide-wind"
              class="h-4 w-4 text-emerald-500"
            />
          </div>
          <div class="mt-1 flex items-baseline gap-1.5">
            <span class="text-xl font-black font-mono text-neutral-900 dark:text-white">
              Δ {{ comparisonStats.aqiDiff }} AQI
            </span>
          </div>
          <div class="mt-1 text-[11px] text-neutral-500 truncate">
            Cleanest: <span class="font-bold text-emerald-600 dark:text-emerald-400">{{ comparisonStats.cleanest.name }}</span> ({{ comparisonStats.cleanest.city.usAqi }} AQI)
          </div>
        </div>

        <div class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3.5 shadow-sm">
          <div class="flex items-center justify-between text-[11px] text-neutral-500">
            <span>Moisture Extremes</span>
            <UIcon
              name="i-lucide-droplets"
              class="h-4 w-4 text-blue-500"
            />
          </div>
          <div class="mt-1 flex items-baseline gap-1.5">
            <span class="text-xl font-black font-mono text-neutral-900 dark:text-white">
              {{ comparisonStats.highestHumidity.city.relativeHumidity }}%
            </span>
            <span class="text-xs text-neutral-400">max</span>
          </div>
          <div class="mt-1 text-[11px] text-neutral-500 truncate">
            Highest in <span class="font-bold text-blue-600 dark:text-blue-400">{{ comparisonStats.highestHumidity.name }}</span>
          </div>
        </div>

        <div class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3.5 shadow-sm">
          <div class="flex items-center justify-between text-[11px] text-neutral-500">
            <span>Wind Activity</span>
            <UIcon
              name="i-lucide-navigation"
              class="h-4 w-4 text-indigo-500"
            />
          </div>
          <div class="mt-1 flex items-baseline gap-1.5">
            <span class="text-xl font-black font-mono text-neutral-900 dark:text-white">
              {{ comparisonStats.highestWind.city.windSpeed }} km/h
            </span>
          </div>
          <div class="mt-1 text-[11px] text-neutral-500 truncate">
            Peak breeze in <span class="font-bold text-indigo-600 dark:text-indigo-400">{{ comparisonStats.highestWind.name }}</span>
          </div>
        </div>
      </div>

      <!-- Live Cards Grid -->
      <div
        class="grid gap-4"
        :class="{
          'grid-cols-1 md:grid-cols-2': comparedCities.length === 2,
          'grid-cols-1 md:grid-cols-3': comparedCities.length === 3,
          'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4': comparedCities.length === 4
        }"
      >
        <div
          v-for="item in comparedCities"
          :key="item.name"
          class="relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-white dark:bg-neutral-900 p-4 sm:p-5 shadow-sm transition-all hover:shadow-md"
          :class="item.theme.border"
        >
          <div
            class="absolute left-0 top-0 h-1.5 w-full"
            :style="{ backgroundColor: item.theme.stroke }"
          />

          <div>
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="flex items-center gap-1.5">
                  <h3 class="text-lg font-black text-neutral-900 dark:text-white">
                    {{ item.city.city }}
                  </h3>
                  <span
                    class="h-2 w-2 rounded-full"
                    :style="{ backgroundColor: item.theme.stroke }"
                  />
                </div>
                <p class="text-xs text-neutral-500 dark:text-neutral-400">
                  {{ item.city.state }} • {{ item.city.timestampLocal?.split(',')[1]?.trim() || 'Live' }}
                </p>
              </div>

              <button
                type="button"
                class="rounded-lg p-1 text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                title="Open City Deep-Dive"
                @click="emit('select-city', item.city)"
              >
                <UIcon
                  name="i-lucide-external-link"
                  class="h-4 w-4"
                />
              </button>
            </div>

            <div class="mt-4 flex items-center justify-between">
              <div>
                <div class="flex items-baseline gap-1">
                  <span class="text-3xl sm:text-4xl font-black font-mono text-neutral-900 dark:text-white">
                    {{ item.city.temperature.toFixed(1) }}°
                  </span>
                  <span class="text-sm font-semibold text-neutral-400">C</span>
                </div>
                <div class="text-[11px] text-neutral-500 font-medium">
                  Feels like {{ item.city.apparentTemperature.toFixed(1) }}°C
                </div>
              </div>

              <div class="flex flex-col items-end">
                <UIcon
                  :name="item.city.weatherCondition.icon || 'i-lucide-sun'"
                  class="h-8 w-8 text-neutral-800 dark:text-neutral-100"
                />
                <span class="text-xs font-bold text-neutral-700 dark:text-neutral-300 mt-1 text-right">
                  {{ item.city.weatherCondition.description }}
                </span>
              </div>
            </div>

            <div class="mt-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 p-3 border border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
              <span class="text-xs font-semibold text-neutral-600 dark:text-neutral-300">Air Quality</span>
              <WeatherAqiBadge
                :aqi="item.city.usAqi"
                :category="item.city.aqiCategory"
                size="sm"
              />
            </div>

            <div class="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div class="rounded-lg border border-neutral-100 dark:border-neutral-800/80 p-2">
                <span class="text-[10px] text-neutral-400 block font-medium">Humidity</span>
                <span class="font-bold font-mono text-neutral-800 dark:text-neutral-200">{{ item.city.relativeHumidity }}%</span>
              </div>
              <div class="rounded-lg border border-neutral-100 dark:border-neutral-800/80 p-2">
                <span class="text-[10px] text-neutral-400 block font-medium">Rain</span>
                <span class="font-bold font-mono" :class="item.city.precipitation > 0 ? 'text-blue-500' : 'text-neutral-800 dark:text-neutral-200'">
                  {{ item.city.precipitation }} mm
                </span>
              </div>
              <div class="rounded-lg border border-neutral-100 dark:border-neutral-800/80 p-2">
                <span class="text-[10px] text-neutral-400 block font-medium">Wind</span>
                <span class="font-bold font-mono text-neutral-800 dark:text-neutral-200">{{ item.city.windSpeed }} km/h</span>
              </div>
            </div>

            <div class="mt-3 flex items-center justify-between text-[11px] text-neutral-500 font-mono px-1">
              <span>PM2.5: <strong class="text-neutral-800 dark:text-neutral-200">{{ item.city.pm25 }}</strong></span>
              <span>PM10: <strong class="text-neutral-800 dark:text-neutral-200">{{ item.city.pm10 }}</strong></span>
              <span>NO₂: <strong class="text-neutral-800 dark:text-neutral-200">{{ item.city.nitrogenDioxide || '—' }}</strong></span>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800/80">
            <UButton
              block
              size="xs"
              variant="soft"
              color="neutral"
              @click="emit('select-city', item.city)"
            >
              View Full Telemetry
            </UButton>
          </div>
        </div>
      </div>

      <!-- Historical Trendlines -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-5 shadow-sm space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 class="text-sm sm:text-base font-black text-neutral-900 dark:text-white flex items-center gap-2">
              <UIcon
                name="i-lucide-line-chart"
                class="h-4 w-4 text-primary"
              />
              Historical Trajectory Comparison
            </h3>
            <p class="text-xs text-neutral-500 dark:text-neutral-400">
              Overlaid multi-series time trends for {{ getMetricLabel(selectedMetric) }} across {{ comparedCities.length }} cities.
            </p>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <div class="flex items-center rounded-xl border border-neutral-200 dark:border-neutral-800 p-0.5 bg-neutral-100/60 dark:bg-neutral-800/40 text-xs">
              <button
                v-for="m in ([
                  { id: 'temp', label: 'Temp' },
                  { id: 'aqi', label: 'AQI' },
                  { id: 'humidity', label: 'Humidity' },
                  { id: 'pm25', label: 'PM2.5' }
                ] as const)"
                :key="m.id"
                type="button"
                class="rounded-lg px-2.5 py-1 font-bold transition-all select-none"
                :class="selectedMetric === m.id ? 'bg-primary text-white shadow-sm' : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'"
                @click="selectedMetric = m.id"
              >
                {{ m.label }}
              </button>
            </div>

            <div class="flex items-center rounded-xl border border-neutral-200 dark:border-neutral-800 p-0.5 bg-neutral-100/60 dark:bg-neutral-800/40 text-xs">
              <button
                v-for="r in (['24h', '7d', '30d'] as const)"
                :key="r"
                type="button"
                class="rounded-lg px-2 py-1 font-bold transition-all select-none"
                :class="selectedRange === r ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm' : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'"
                @click="selectedRange = r"
              >
                {{ r.toUpperCase() }}
              </button>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-4 flex-wrap text-xs font-bold pt-1">
          <div
            v-for="item in comparedCities"
            :key="item.name"
            class="flex items-center gap-1.5"
          >
            <span
              class="h-2.5 w-2.5 rounded-full"
              :style="{ backgroundColor: item.theme.stroke }"
            />
            <span class="text-neutral-800 dark:text-neutral-200">{{ item.name }}</span>
          </div>
        </div>

        <div class="relative w-full rounded-xl bg-neutral-50/70 dark:bg-neutral-950/40 p-3 border border-neutral-100 dark:border-neutral-800/80">
          <div
            v-if="isLoadingCharts"
            class="flex h-56 items-center justify-center text-xs font-semibold text-neutral-500"
          >
            <UIcon
              name="i-lucide-loader-2"
              class="mr-2 h-4 w-4 animate-spin text-primary"
            />
            Syncing historical time-series...
          </div>

          <div
            v-else-if="multiChartData && multiChartData.series.length > 0"
            class="relative w-full"
          >
            <svg
              :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
              class="w-full h-56 overflow-visible"
            >
              <defs>
                <linearGradient
                  v-for="s in multiChartData.series"
                  :key="`grad-${s.name}`"
                  :id="`grad-${s.name}`"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    :stop-color="s.color"
                    stop-opacity="0.25"
                  />
                  <stop
                    offset="100%"
                    :stop-color="s.color"
                    stop-opacity="0.0"
                  />
                </linearGradient>
              </defs>

              <line
                x1="0"
                y1="30"
                :x2="svgWidth"
                y2="30"
                class="stroke-neutral-200 dark:stroke-neutral-800 stroke-[1]"
                stroke-dasharray="4 4"
              />
              <line
                x1="0"
                y1="110"
                :x2="svgWidth"
                y2="110"
                class="stroke-neutral-200 dark:stroke-neutral-800 stroke-[1]"
                stroke-dasharray="4 4"
              />
              <line
                x1="0"
                y1="190"
                :x2="svgWidth"
                y2="190"
                class="stroke-neutral-200 dark:stroke-neutral-800 stroke-[1]"
                stroke-dasharray="4 4"
              />

              <path
                v-for="s in multiChartData.series"
                :key="`area-${s.name}`"
                :d="s.areaPath"
                :fill="`url(#grad-${s.name})`"
              />

              <path
                v-for="s in multiChartData.series"
                :key="`line-${s.name}`"
                :d="s.path"
                fill="none"
                :stroke="s.color"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />

              <circle
                v-for="s in multiChartData.series"
                :key="`dot-${s.name}`"
                :cx="s.points[s.points.length - 1]?.x || 0"
                :cy="s.points[s.points.length - 1]?.y || 0"
                r="4"
                :fill="s.color"
                class="stroke-white dark:stroke-neutral-900 stroke-2"
              />
            </svg>

            <div class="flex justify-between text-[10px] font-mono text-neutral-400 mt-1">
              <span>Earlier ({{ selectedRange.toUpperCase() }})</span>
              <span>Range: {{ multiChartData.minVal }}{{ getMetricUnit(selectedMetric) }} to {{ multiChartData.maxVal }}{{ getMetricUnit(selectedMetric) }}</span>
              <span>Latest</span>
            </div>
          </div>
          <div
            v-else
            class="flex h-56 items-center justify-center text-xs text-neutral-500"
          >
            Insufficient historical readings available for this comparison window.
          </div>
        </div>
      </div>

      <!-- Matrix Table -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm">
        <div class="p-4 sm:p-5 border-b border-neutral-200 dark:border-neutral-800">
          <h3 class="text-sm sm:text-base font-black text-neutral-900 dark:text-white flex items-center gap-2">
            <UIcon
              name="i-lucide-scale"
              class="h-4 w-4 text-primary"
            />
            Parameter-by-Parameter Differential Matrix
          </h3>
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            Head-to-head comparison highlighting category leaders and environmental variance.
          </p>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-left text-xs">
            <thead>
              <tr class="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/60 font-bold uppercase tracking-wider text-[11px] text-neutral-600 dark:text-neutral-300">
                <th class="px-4 py-3.5 w-44">Telemetry Metric</th>
                <th
                  v-for="item in comparedCities"
                  :key="`th-${item.name}`"
                  class="px-4 py-3.5 text-right font-mono"
                >
                  <span class="inline-flex items-center gap-1.5">
                    <span
                      class="h-2 w-2 rounded-full"
                      :style="{ backgroundColor: item.theme.stroke }"
                    />
                    <span>{{ item.name }}</span>
                  </span>
                </th>
              </tr>
            </thead>

            <tbody class="divide-y divide-neutral-100 dark:divide-neutral-800/80 font-mono">
              <tr class="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition-colors">
                <td class="px-4 py-3 font-sans font-semibold text-neutral-700 dark:text-neutral-300">Temperature</td>
                <td
                  v-for="item in comparedCities"
                  :key="`temp-${item.name}`"
                  class="px-4 py-3 text-right font-black"
                  :class="{
                    'text-amber-600 dark:text-amber-400': item.name === comparisonStats?.warmest.name,
                    'text-blue-600 dark:text-blue-400': item.name === comparisonStats?.coolest.name && comparedCities.length > 1
                  }"
                >
                  {{ item.city.temperature.toFixed(1) }}°C
                  <span
                    v-if="item.name === comparisonStats?.warmest.name"
                    class="ml-1 text-[10px] font-bold text-amber-500"
                  >(Warmest)</span>
                  <span
                    v-else-if="item.name === comparisonStats?.coolest.name"
                    class="ml-1 text-[10px] font-bold text-blue-500"
                  >(Coolest)</span>
                </td>
              </tr>

              <tr class="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition-colors">
                <td class="px-4 py-3 font-sans font-semibold text-neutral-700 dark:text-neutral-300">Feels-Like / RealFeel</td>
                <td
                  v-for="item in comparedCities"
                  :key="`feel-${item.name}`"
                  class="px-4 py-3 text-right font-bold text-neutral-800 dark:text-neutral-200"
                >
                  {{ item.city.apparentTemperature.toFixed(1) }}°C
                </td>
              </tr>

              <tr class="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition-colors">
                <td class="px-4 py-3 font-sans font-semibold text-neutral-700 dark:text-neutral-300">Air Quality (US AQI)</td>
                <td
                  v-for="item in comparedCities"
                  :key="`aqi-${item.name}`"
                  class="px-4 py-3 text-right font-black"
                >
                  <div class="flex items-center justify-end gap-1.5">
                    <WeatherAqiBadge
                      :aqi="item.city.usAqi"
                      :category="item.city.aqiCategory"
                      size="xs"
                    />
                    <span
                      v-if="item.name === comparisonStats?.cleanest.name"
                      class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400"
                    >(Cleanest)</span>
                  </div>
                </td>
              </tr>

              <tr class="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition-colors">
                <td class="px-4 py-3 font-sans font-semibold text-neutral-700 dark:text-neutral-300">Fine Particulate (PM2.5)</td>
                <td
                  v-for="item in comparedCities"
                  :key="`pm25-${item.name}`"
                  class="px-4 py-3 text-right font-bold text-neutral-800 dark:text-neutral-200"
                >
                  {{ item.city.pm25 }} µg/m³
                </td>
              </tr>

              <tr class="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition-colors">
                <td class="px-4 py-3 font-sans font-semibold text-neutral-700 dark:text-neutral-300">Relative Humidity</td>
                <td
                  v-for="item in comparedCities"
                  :key="`hum-${item.name}`"
                  class="px-4 py-3 text-right font-bold text-neutral-800 dark:text-neutral-200"
                >
                  {{ item.city.relativeHumidity }}%
                </td>
              </tr>

              <tr class="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition-colors">
                <td class="px-4 py-3 font-sans font-semibold text-neutral-700 dark:text-neutral-300">Precipitation (Rain)</td>
                <td
                  v-for="item in comparedCities"
                  :key="`rain-${item.name}`"
                  class="px-4 py-3 text-right font-bold"
                  :class="item.city.precipitation > 0 ? 'text-blue-500' : 'text-neutral-500'"
                >
                  {{ item.city.precipitation > 0 ? `${item.city.precipitation} mm` : '0 mm (Dry)' }}
                </td>
              </tr>

              <tr class="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition-colors">
                <td class="px-4 py-3 font-sans font-semibold text-neutral-700 dark:text-neutral-300">Wind Speed</td>
                <td
                  v-for="item in comparedCities"
                  :key="`wind-${item.name}`"
                  class="px-4 py-3 text-right font-bold text-neutral-800 dark:text-neutral-200"
                >
                  {{ item.city.windSpeed }} km/h
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- VIEW B: TEMPORAL COMPARISON (1 CITY 2 DATES OR 2 CITIES 2 DATES) -->
    <!-- ======================================================== -->
    <div
      v-show="comparisonMode === 'dates'"
      class="space-y-6"
    >
      <!-- Sub-Mode Toggle Strip: 1 City 2 Dates vs 2 Cities 2 Dates -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-50 dark:bg-neutral-900/60 p-3 rounded-2xl border border-neutral-200 dark:border-neutral-800">
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold text-neutral-600 dark:text-neutral-300">Temporal Scope:</span>
          <div class="flex items-center gap-1 bg-white dark:bg-neutral-800 p-1 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs">
            <button
              type="button"
              class="px-3 py-1 rounded-lg font-bold transition-all select-none"
              :class="temporalSubMode === 'dual' ? 'bg-primary text-white shadow-sm' : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'"
              @click="temporalSubMode = 'dual'; loadTemporalComparison()"
            >
              2 Cities × 2 Dates Matrix
            </button>
            <button
              type="button"
              class="px-3 py-1 rounded-lg font-bold transition-all select-none"
              :class="temporalSubMode === 'single' ? 'bg-primary text-white shadow-sm' : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'"
              @click="temporalSubMode = 'single'; loadTemporalComparison()"
            >
              1 City × 2 Dates
            </button>
          </div>
        </div>

        <div class="text-[11px] text-neutral-500">
          <span v-if="temporalSubMode === 'dual'">Compare two cities simultaneously across two calendar dates</span>
          <span v-else>Deep dive into a single city's day-over-day evolution</span>
        </div>
      </div>

      <!-- Control Bar -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-5 shadow-sm space-y-4">
        <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <!-- Left: Title -->
          <div>
            <h3 class="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
              <UIcon
                name="i-lucide-grid"
                class="h-4 w-4 text-primary"
              />
              <span v-if="temporalSubMode === 'dual'">Dual-City Dual-Date Spatio-Temporal Matrix</span>
              <span v-else>Single City Temporal Comparator</span>
            </h3>
            <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              <span v-if="temporalSubMode === 'dual'">Compare <strong>{{ city1Name }}</strong> and <strong>{{ city2Name }}</strong> across {{ formatDisplayDate(selectedDateA) }} and {{ formatDisplayDate(selectedDateB) }}.</span>
              <span v-else>Compare environmental metrics for <strong>{{ city1Name }}</strong> across two dates.</span>
            </p>
          </div>

          <!-- Right: Dropdowns -->
          <div class="flex flex-wrap items-center gap-2.5">
            <!-- City 1 (Cyan) -->
            <div class="flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full bg-cyan-500 shrink-0" />
              <span class="text-xs font-bold text-cyan-600 dark:text-cyan-400 shrink-0">City 1:</span>
              <select
                v-model="city1Name"
                class="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-bold text-cyan-800 dark:text-cyan-200 outline-none"
                @change="handleCityChange"
              >
                <option
                  v-for="c in props.cities"
                  :key="`c1-${c.city}`"
                  :value="c.city"
                  class="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white"
                >
                  {{ c.city }}
                </option>
              </select>
            </div>

            <!-- City 2 (Amber) - only in dual mode -->
            <div
              v-if="temporalSubMode === 'dual'"
              class="flex items-center gap-1.5"
            >
              <span class="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
              <span class="text-xs font-bold text-amber-600 dark:text-amber-400 shrink-0">City 2:</span>
              <select
                v-model="city2Name"
                class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-bold text-amber-800 dark:text-amber-200 outline-none"
                @change="handleCityChange"
              >
                <option
                  v-for="c in props.cities"
                  :key="`c2-${c.city}`"
                  :value="c.city"
                  class="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white"
                >
                  {{ c.city }}
                </option>
              </select>
            </div>

            <!-- Date A (Reference) -->
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold text-neutral-600 dark:text-neutral-300 shrink-0">Date A:</span>
              <select
                v-model="selectedDateA"
                class="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1.5 text-xs font-bold text-neutral-900 dark:text-white outline-none"
                @change="loadTemporalComparison"
              >
                <option
                  v-for="d in availableDates"
                  :key="`da-${d}`"
                  :value="d"
                >
                  {{ formatDisplayDate(d) }}
                </option>
              </select>
            </div>

            <!-- Date B (Comparator) -->
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold text-neutral-600 dark:text-neutral-300 shrink-0">Date B:</span>
              <select
                v-model="selectedDateB"
                class="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1.5 text-xs font-bold text-neutral-900 dark:text-white outline-none"
                @change="loadTemporalComparison"
              >
                <option
                  v-for="d in availableDates"
                  :key="`db-${d}`"
                  :value="d"
                >
                  {{ formatDisplayDate(d) }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <!-- Presets Row -->
        <div class="flex items-center gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800/80 overflow-x-auto pb-1 text-xs">
          <span class="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 shrink-0 uppercase tracking-wider">
            Quick Intervals:
          </span>
          <button
            type="button"
            class="flex items-center gap-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 px-2.5 py-1 font-semibold text-neutral-700 dark:text-neutral-300 hover:border-primary hover:text-primary transition-all shrink-0 select-none"
            @click="applyTemporalInterval('yesterday')"
          >
            <span>Yesterday vs Today</span>
          </button>
          <button
            type="button"
            class="flex items-center gap-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 px-2.5 py-1 font-semibold text-neutral-700 dark:text-neutral-300 hover:border-primary hover:text-primary transition-all shrink-0 select-none"
            @click="applyTemporalInterval('7d')"
          >
            <span>7 Days Ago (Week-over-Week)</span>
          </button>
          <button
            type="button"
            class="flex items-center gap-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 px-2.5 py-1 font-semibold text-neutral-700 dark:text-neutral-300 hover:border-primary hover:text-primary transition-all shrink-0 select-none"
            @click="applyTemporalInterval('14d')"
          >
            <span>14 Days Ago</span>
          </button>
          <button
            type="button"
            class="flex items-center gap-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 px-2.5 py-1 font-semibold text-neutral-700 dark:text-neutral-300 hover:border-primary hover:text-primary transition-all shrink-0 select-none"
            @click="applyTemporalInterval('30d')"
          >
            <span>30 Days Ago</span>
          </button>

          <!-- Dual City Pairs (if in dual mode) -->
          <template v-if="temporalSubMode === 'dual'">
            <span class="text-[11px] font-bold text-neutral-400 dark:text-neutral-500 shrink-0 ml-2">| Pairs:</span>
            <button
              type="button"
              class="flex items-center gap-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 px-2.5 py-1 font-semibold text-primary hover:bg-primary/10 transition-all shrink-0"
              @click="applyDualCityPreset('Delhi', 'Mumbai')"
            >
              Delhi vs Mumbai
            </button>
            <button
              type="button"
              class="flex items-center gap-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 px-2.5 py-1 font-semibold text-primary hover:bg-primary/10 transition-all shrink-0"
              @click="applyDualCityPreset('Delhi', 'Bengaluru')"
            >
              Delhi vs Bengaluru
            </button>
            <button
              type="button"
              class="flex items-center gap-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 px-2.5 py-1 font-semibold text-primary hover:bg-primary/10 transition-all shrink-0"
              @click="applyDualCityPreset('Mumbai', 'Chennai')"
            >
              Mumbai vs Chennai
            </button>
          </template>
        </div>
      </div>

      <!-- Loading Indicator -->
      <div
        v-if="isLoadingTemporal"
        class="flex h-64 items-center justify-center rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-xs font-semibold text-neutral-500"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="mr-2 h-5 w-5 animate-spin text-primary"
        />
        Loading historical spatio-temporal comparison...
      </div>

      <div
        v-else-if="c1SummaryA"
        class="space-y-6"
      >
        <!-- 2x2 FOUR-QUADRANT SUMMARY CARDS (IN DUAL MODE) OR 2 CARDS (IN SINGLE MODE) -->
        <div
          class="grid gap-4"
          :class="temporalSubMode === 'dual' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'"
        >
          <!-- Quadrant 1: City 1 • Date A -->
          <div class="relative overflow-hidden rounded-2xl border border-cyan-500/50 bg-white dark:bg-neutral-900 p-4 shadow-sm space-y-3">
            <div class="absolute left-0 top-0 h-1.5 w-full bg-cyan-500" />
            <div class="flex items-center justify-between">
              <div>
                <span class="rounded bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 font-mono text-[10px] font-black px-1.5 py-0.5">
                  {{ city1Name }} • Date A
                </span>
                <h4 class="text-sm font-black text-neutral-900 dark:text-white mt-1">
                  {{ formatDisplayDate(c1SummaryA.date) }}
                </h4>
              </div>
              <WeatherAqiBadge
                :aqi="c1SummaryA.avgAqi"
                :category="c1SummaryA.aqiCategory"
                size="xs"
              />
            </div>

            <div class="flex items-baseline justify-between border-y border-neutral-100 dark:border-neutral-800/80 py-2">
              <span class="text-2xl font-black font-mono text-neutral-900 dark:text-white">{{ c1SummaryA.avgTemp }}°C</span>
              <span class="text-xs text-neutral-500 font-mono">Max: {{ c1SummaryA.maxTemp }}° / Min: {{ c1SummaryA.minTemp }}°</span>
            </div>

            <div class="grid grid-cols-3 gap-1 text-center text-[11px] font-mono">
              <div class="p-1 rounded bg-neutral-50 dark:bg-neutral-800/50">
                <span class="text-[9px] text-neutral-400 block font-sans">Humid</span>
                {{ c1SummaryA.avgHumidity }}%
              </div>
              <div class="p-1 rounded bg-neutral-50 dark:bg-neutral-800/50">
                <span class="text-[9px] text-neutral-400 block font-sans">Rain</span>
                {{ c1SummaryA.totalRain }}mm
              </div>
              <div class="p-1 rounded bg-neutral-50 dark:bg-neutral-800/50">
                <span class="text-[9px] text-neutral-400 block font-sans">PM2.5</span>
                {{ c1SummaryA.avgPm25 }}
              </div>
            </div>
          </div>

          <!-- Quadrant 2: City 1 • Date B -->
          <div
            v-if="c1SummaryB"
            class="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-white dark:bg-neutral-900 p-4 shadow-sm space-y-3"
          >
            <div class="absolute left-0 top-0 h-1.5 w-full bg-cyan-500/50" />
            <div class="flex items-center justify-between">
              <div>
                <span class="rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-mono text-[10px] font-bold px-1.5 py-0.5">
                  {{ city1Name }} • Date B
                </span>
                <h4 class="text-sm font-black text-neutral-900 dark:text-white mt-1">
                  {{ formatDisplayDate(c1SummaryB.date) }}
                </h4>
              </div>
              <WeatherAqiBadge
                :aqi="c1SummaryB.avgAqi"
                :category="c1SummaryB.aqiCategory"
                size="xs"
              />
            </div>

            <div class="flex items-baseline justify-between border-y border-neutral-100 dark:border-neutral-800/80 py-2">
              <span class="text-2xl font-black font-mono text-neutral-900 dark:text-white">{{ c1SummaryB.avgTemp }}°C</span>
              <span class="text-xs text-neutral-500 font-mono">Max: {{ c1SummaryB.maxTemp }}° / Min: {{ c1SummaryB.minTemp }}°</span>
            </div>

            <div class="grid grid-cols-3 gap-1 text-center text-[11px] font-mono">
              <div class="p-1 rounded bg-neutral-50 dark:bg-neutral-800/50">
                <span class="text-[9px] text-neutral-400 block font-sans">Humid</span>
                {{ c1SummaryB.avgHumidity }}%
              </div>
              <div class="p-1 rounded bg-neutral-50 dark:bg-neutral-800/50">
                <span class="text-[9px] text-neutral-400 block font-sans">Rain</span>
                {{ c1SummaryB.totalRain }}mm
              </div>
              <div class="p-1 rounded bg-neutral-50 dark:bg-neutral-800/50">
                <span class="text-[9px] text-neutral-400 block font-sans">PM2.5</span>
                {{ c1SummaryB.avgPm25 }}
              </div>
            </div>
          </div>

          <!-- Quadrant 3: City 2 • Date A (in Dual Mode) -->
          <div
            v-if="temporalSubMode === 'dual' && c2SummaryA"
            class="relative overflow-hidden rounded-2xl border border-amber-500/50 bg-white dark:bg-neutral-900 p-4 shadow-sm space-y-3"
          >
            <div class="absolute left-0 top-0 h-1.5 w-full bg-amber-500" />
            <div class="flex items-center justify-between">
              <div>
                <span class="rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono text-[10px] font-black px-1.5 py-0.5">
                  {{ city2Name }} • Date A
                </span>
                <h4 class="text-sm font-black text-neutral-900 dark:text-white mt-1">
                  {{ formatDisplayDate(c2SummaryA.date) }}
                </h4>
              </div>
              <WeatherAqiBadge
                :aqi="c2SummaryA.avgAqi"
                :category="c2SummaryA.aqiCategory"
                size="xs"
              />
            </div>

            <div class="flex items-baseline justify-between border-y border-neutral-100 dark:border-neutral-800/80 py-2">
              <span class="text-2xl font-black font-mono text-neutral-900 dark:text-white">{{ c2SummaryA.avgTemp }}°C</span>
              <span class="text-xs text-neutral-500 font-mono">Max: {{ c2SummaryA.maxTemp }}° / Min: {{ c2SummaryA.minTemp }}°</span>
            </div>

            <div class="grid grid-cols-3 gap-1 text-center text-[11px] font-mono">
              <div class="p-1 rounded bg-neutral-50 dark:bg-neutral-800/50">
                <span class="text-[9px] text-neutral-400 block font-sans">Humid</span>
                {{ c2SummaryA.avgHumidity }}%
              </div>
              <div class="p-1 rounded bg-neutral-50 dark:bg-neutral-800/50">
                <span class="text-[9px] text-neutral-400 block font-sans">Rain</span>
                {{ c2SummaryA.totalRain }}mm
              </div>
              <div class="p-1 rounded bg-neutral-50 dark:bg-neutral-800/50">
                <span class="text-[9px] text-neutral-400 block font-sans">PM2.5</span>
                {{ c2SummaryA.avgPm25 }}
              </div>
            </div>
          </div>

          <!-- Quadrant 4: City 2 • Date B (in Dual Mode) -->
          <div
            v-if="temporalSubMode === 'dual' && c2SummaryB"
            class="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-white dark:bg-neutral-900 p-4 shadow-sm space-y-3"
          >
            <div class="absolute left-0 top-0 h-1.5 w-full bg-amber-500/50" />
            <div class="flex items-center justify-between">
              <div>
                <span class="rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono text-[10px] font-bold px-1.5 py-0.5">
                  {{ city2Name }} • Date B
                </span>
                <h4 class="text-sm font-black text-neutral-900 dark:text-white mt-1">
                  {{ formatDisplayDate(c2SummaryB.date) }}
                </h4>
              </div>
              <WeatherAqiBadge
                :aqi="c2SummaryB.avgAqi"
                :category="c2SummaryB.aqiCategory"
                size="xs"
              />
            </div>

            <div class="flex items-baseline justify-between border-y border-neutral-100 dark:border-neutral-800/80 py-2">
              <span class="text-2xl font-black font-mono text-neutral-900 dark:text-white">{{ c2SummaryB.avgTemp }}°C</span>
              <span class="text-xs text-neutral-500 font-mono">Max: {{ c2SummaryB.maxTemp }}° / Min: {{ c2SummaryB.minTemp }}°</span>
            </div>

            <div class="grid grid-cols-3 gap-1 text-center text-[11px] font-mono">
              <div class="p-1 rounded bg-neutral-50 dark:bg-neutral-800/50">
                <span class="text-[9px] text-neutral-400 block font-sans">Humid</span>
                {{ c2SummaryB.avgHumidity }}%
              </div>
              <div class="p-1 rounded bg-neutral-50 dark:bg-neutral-800/50">
                <span class="text-[9px] text-neutral-400 block font-sans">Rain</span>
                {{ c2SummaryB.totalRain }}mm
              </div>
              <div class="p-1 rounded bg-neutral-50 dark:bg-neutral-800/50">
                <span class="text-[9px] text-neutral-400 block font-sans">PM2.5</span>
                {{ c2SummaryB.avgPm25 }}
              </div>
            </div>
          </div>
        </div>

        <!-- 4-CURVE SYNCHRONIZED 24-HOUR DIURNAL OVERLAY CHART -->
        <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-5 shadow-sm space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 class="text-sm sm:text-base font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <UIcon
                  name="i-lucide-activity"
                  class="h-4 w-4 text-primary"
                />
                Synchronized 24-Hour Diurnal Trajectory Overlay
              </h3>
              <p class="text-xs text-neutral-500 dark:text-neutral-400">
                <span v-if="temporalSubMode === 'dual'">Hourly telemetry curves (00:00 to 23:00) comparing {{ city1Name }} and {{ city2Name }} across both dates.</span>
                <span v-else>Hourly curves comparing {{ city1Name }} on Date A vs Date B.</span>
              </p>
            </div>

            <div class="flex items-center rounded-xl border border-neutral-200 dark:border-neutral-800 p-0.5 bg-neutral-100/60 dark:bg-neutral-800/40 text-xs">
              <button
                v-for="m in ([
                  { id: 'temp', label: 'Temp' },
                  { id: 'aqi', label: 'AQI' },
                  { id: 'humidity', label: 'Humidity' },
                  { id: 'pm25', label: 'PM2.5' }
                ] as const)"
                :key="m.id"
                type="button"
                class="rounded-lg px-2.5 py-1 font-bold transition-all select-none"
                :class="selectedDiurnalMetric === m.id ? 'bg-primary text-white shadow-sm' : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'"
                @click="selectedDiurnalMetric = m.id"
              >
                {{ m.label }}
              </button>
            </div>
          </div>

          <!-- Chart Legend with Line Style Badges -->
          <div class="flex items-center gap-4 flex-wrap text-xs font-bold pt-1">
            <div class="flex items-center gap-1.5">
              <span class="h-1 w-5 rounded bg-cyan-500" />
              <span class="text-cyan-700 dark:text-cyan-300">{{ city1Name }} (Date A: {{ formatDisplayDate(selectedDateA) }})</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="h-1 w-5 rounded border-b-2 border-dashed border-cyan-500" />
              <span class="text-cyan-600 dark:text-cyan-400 opacity-80">{{ city1Name }} (Date B: {{ formatDisplayDate(selectedDateB) }})</span>
            </div>
            <template v-if="temporalSubMode === 'dual'">
              <div class="flex items-center gap-1.5">
                <span class="h-1 w-5 rounded bg-amber-500" />
                <span class="text-amber-700 dark:text-amber-300">{{ city2Name }} (Date A: {{ formatDisplayDate(selectedDateA) }})</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="h-1 w-5 rounded border-b-2 border-dashed border-amber-500" />
                <span class="text-amber-600 dark:text-amber-400 opacity-80">{{ city2Name }} (Date B: {{ formatDisplayDate(selectedDateB) }})</span>
              </div>
            </template>
          </div>

          <!-- Canvas -->
          <div class="relative w-full rounded-xl bg-neutral-50/70 dark:bg-neutral-950/40 p-3 border border-neutral-100 dark:border-neutral-800/80">
            <div
              v-if="fourCurveDiurnalData"
              class="relative w-full"
            >
              <svg
                :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
                class="w-full h-56 overflow-visible"
              >
                <!-- Horizontal Grids -->
                <line
                  x1="0"
                  y1="30"
                  :x2="svgWidth"
                  y2="30"
                  class="stroke-neutral-200 dark:stroke-neutral-800 stroke-[1]"
                  stroke-dasharray="4 4"
                />
                <line
                  x1="0"
                  y1="110"
                  :x2="svgWidth"
                  y2="110"
                  class="stroke-neutral-200 dark:stroke-neutral-800 stroke-[1]"
                  stroke-dasharray="4 4"
                />
                <line
                  x1="0"
                  y1="190"
                  :x2="svgWidth"
                  y2="190"
                  class="stroke-neutral-200 dark:stroke-neutral-800 stroke-[1]"
                  stroke-dasharray="4 4"
                />

                <!-- City 2 Date B (Amber Dashed) -->
                <path
                  v-if="temporalSubMode === 'dual' && fourCurveDiurnalData.curveC2B.path"
                  :d="fourCurveDiurnalData.curveC2B.path"
                  fill="none"
                  stroke="#f59e0b"
                  stroke-width="2"
                  stroke-dasharray="6 4"
                  stroke-linecap="round"
                  class="opacity-70"
                />

                <!-- City 1 Date B (Cyan Dashed) -->
                <path
                  v-if="fourCurveDiurnalData.curveC1B.path"
                  :d="fourCurveDiurnalData.curveC1B.path"
                  fill="none"
                  stroke="#06b6d4"
                  stroke-width="2"
                  stroke-dasharray="6 4"
                  stroke-linecap="round"
                  class="opacity-70"
                />

                <!-- City 2 Date A (Amber Solid) -->
                <path
                  v-if="temporalSubMode === 'dual' && fourCurveDiurnalData.curveC2A.path"
                  :d="fourCurveDiurnalData.curveC2A.path"
                  fill="none"
                  stroke="#f59e0b"
                  stroke-width="3"
                  stroke-linecap="round"
                />

                <!-- City 1 Date A (Cyan Solid) -->
                <path
                  v-if="fourCurveDiurnalData.curveC1A.path"
                  :d="fourCurveDiurnalData.curveC1A.path"
                  fill="none"
                  stroke="#06b6d4"
                  stroke-width="3"
                  stroke-linecap="round"
                />
              </svg>

              <div class="flex justify-between text-[10px] font-mono text-neutral-400 mt-1">
                <span>00:00 (Midnight)</span>
                <span>Range: {{ fourCurveDiurnalData.minVal }}{{ getMetricUnit(selectedDiurnalMetric) }} to {{ fourCurveDiurnalData.maxVal }}{{ getMetricUnit(selectedDiurnalMetric) }}</span>
                <span>23:00 (Night)</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 2x2 MULTI-DIMENSIONAL DIFFERENTIAL SCORECARD TABLE -->
        <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm">
          <div class="p-4 sm:p-5 border-b border-neutral-200 dark:border-neutral-800">
            <h3 class="text-sm sm:text-base font-black text-neutral-900 dark:text-white flex items-center gap-2">
              <UIcon
                name="i-lucide-diff"
                class="h-4 w-4 text-primary"
              />
              <span v-if="temporalSubMode === 'dual'">2×2 Spatio-Temporal Differential Matrix Table</span>
              <span v-else>Daily Differential Variance Scorecard</span>
            </h3>
            <p class="text-xs text-neutral-500 dark:text-neutral-400">
              <span v-if="temporalSubMode === 'dual'">Simultaneous temporal progress (Date A vs B) and cross-city variance for {{ city1Name }} and {{ city2Name }}.</span>
              <span v-else>Quantified delta between Date A and Date B for {{ city1Name }}.</span>
            </p>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full border-collapse text-left text-xs">
              <thead>
                <tr class="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/60 font-bold uppercase tracking-wider text-[11px] text-neutral-600 dark:text-neutral-300">
                  <th class="px-4 py-3.5">Metric</th>
                  <!-- City 1 Columns -->
                  <th class="px-3 py-3.5 text-right font-mono text-cyan-700 dark:text-cyan-300 bg-cyan-500/5">{{ city1Name }} (A)</th>
                  <th class="px-3 py-3.5 text-right font-mono text-cyan-600 dark:text-cyan-400 bg-cyan-500/5">{{ city1Name }} (B)</th>
                  <th class="px-3 py-3.5 text-right font-mono text-cyan-700 dark:text-cyan-300 bg-cyan-500/10 font-black">{{ city1Name }} Δ</th>

                  <!-- City 2 Columns (Dual Mode) -->
                  <template v-if="temporalSubMode === 'dual' && c2SummaryA && c2SummaryB">
                    <th class="px-3 py-3.5 text-right font-mono text-amber-700 dark:text-amber-300 bg-amber-500/5">{{ city2Name }} (A)</th>
                    <th class="px-3 py-3.5 text-right font-mono text-amber-600 dark:text-amber-400 bg-amber-500/5">{{ city2Name }} (B)</th>
                    <th class="px-3 py-3.5 text-right font-mono text-amber-700 dark:text-amber-300 bg-amber-500/10 font-black">{{ city2Name }} Δ</th>
                    <th class="px-4 py-3.5 text-right font-mono font-black">Spatial Δ (A vs A)</th>
                  </template>
                </tr>
              </thead>

              <tbody
                v-if="c1Deltas"
                class="divide-y divide-neutral-100 dark:divide-neutral-800/80 font-mono"
              >
                <!-- Temperature -->
                <tr class="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition-colors">
                  <td class="px-4 py-3 font-sans font-semibold text-neutral-700 dark:text-neutral-300">Average Temperature</td>
                  <td class="px-3 py-3 text-right bg-cyan-500/5 font-bold">{{ c1SummaryA.avgTemp }}°C</td>
                  <td class="px-3 py-3 text-right bg-cyan-500/5">{{ c1SummaryB?.avgTemp || '—' }}°C</td>
                  <td
                    class="px-3 py-3 text-right bg-cyan-500/10 font-black"
                    :class="c1Deltas.temp > 0 ? 'text-amber-500' : 'text-blue-500'"
                  >
                    {{ c1Deltas.temp > 0 ? `+${c1Deltas.temp}°` : `${c1Deltas.temp}°` }}
                  </td>

                  <template v-if="temporalSubMode === 'dual' && c2SummaryA && c2SummaryB && c2Deltas">
                    <td class="px-3 py-3 text-right bg-amber-500/5 font-bold">{{ c2SummaryA.avgTemp }}°C</td>
                    <td class="px-3 py-3 text-right bg-amber-500/5">{{ c2SummaryB.avgTemp }}°C</td>
                    <td
                      class="px-3 py-3 text-right bg-amber-500/10 font-black"
                      :class="c2Deltas.temp > 0 ? 'text-amber-500' : 'text-blue-500'"
                    >
                      {{ c2Deltas.temp > 0 ? `+${c2Deltas.temp}°` : `${c2Deltas.temp}°` }}
                    </td>
                    <td class="px-4 py-3 text-right font-bold text-neutral-800 dark:text-neutral-200">
                      {{ spatialDeltasA?.temp && spatialDeltasA.temp > 0 ? `+${spatialDeltasA.temp}° (${city1Name} Warmer)` : `${spatialDeltasA?.temp}°` }}
                    </td>
                  </template>
                </tr>

                <!-- AQI -->
                <tr class="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition-colors">
                  <td class="px-4 py-3 font-sans font-semibold text-neutral-700 dark:text-neutral-300">Air Quality (US AQI)</td>
                  <td class="px-3 py-3 text-right bg-cyan-500/5 font-bold">{{ c1SummaryA.avgAqi }}</td>
                  <td class="px-3 py-3 text-right bg-cyan-500/5">{{ c1SummaryB?.avgAqi || '—' }}</td>
                  <td
                    class="px-3 py-3 text-right bg-cyan-500/10 font-black"
                    :class="c1Deltas.aqi < 0 ? 'text-emerald-500' : 'text-rose-500'"
                  >
                    {{ c1Deltas.aqi < 0 ? `${c1Deltas.aqi} (Cleaner)` : `+${c1Deltas.aqi} (Worse)` }}
                  </td>

                  <template v-if="temporalSubMode === 'dual' && c2SummaryA && c2SummaryB && c2Deltas">
                    <td class="px-3 py-3 text-right bg-amber-500/5 font-bold">{{ c2SummaryA.avgAqi }}</td>
                    <td class="px-3 py-3 text-right bg-amber-500/5">{{ c2SummaryB.avgAqi }}</td>
                    <td
                      class="px-3 py-3 text-right bg-amber-500/10 font-black"
                      :class="c2Deltas.aqi < 0 ? 'text-emerald-500' : 'text-rose-500'"
                    >
                      {{ c2Deltas.aqi < 0 ? `${c2Deltas.aqi} (Cleaner)` : `+${c2Deltas.aqi} (Worse)` }}
                    </td>
                    <td class="px-4 py-3 text-right font-bold">
                      <span :class="spatialDeltasA && spatialDeltasA.aqi < 0 ? 'text-emerald-500' : 'text-neutral-800 dark:text-neutral-200'">
                        {{ spatialDeltasA && spatialDeltasA.aqi < 0 ? `${spatialDeltasA.aqi} (${city1Name} Cleaner)` : `+${spatialDeltasA?.aqi} (${city2Name} Cleaner)` }}
                      </span>
                    </td>
                  </template>
                </tr>

                <!-- Precipitation -->
                <tr class="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition-colors">
                  <td class="px-4 py-3 font-sans font-semibold text-neutral-700 dark:text-neutral-300">Total Rainfall</td>
                  <td class="px-3 py-3 text-right bg-cyan-500/5 font-bold">{{ c1SummaryA.totalRain }} mm</td>
                  <td class="px-3 py-3 text-right bg-cyan-500/5">{{ c1SummaryB?.totalRain || '0' }} mm</td>
                  <td class="px-3 py-3 text-right bg-cyan-500/10 font-black">
                    {{ c1Deltas.rain > 0 ? `+${c1Deltas.rain} mm` : `${c1Deltas.rain} mm` }}
                  </td>

                  <template v-if="temporalSubMode === 'dual' && c2SummaryA && c2SummaryB && c2Deltas">
                    <td class="px-3 py-3 text-right bg-amber-500/5 font-bold">{{ c2SummaryA.totalRain }} mm</td>
                    <td class="px-3 py-3 text-right bg-amber-500/5">{{ c2SummaryB.totalRain }} mm</td>
                    <td class="px-3 py-3 text-right bg-amber-500/10 font-black">
                      {{ c2Deltas.rain > 0 ? `+${c2Deltas.rain} mm` : `${c2Deltas.rain} mm` }}
                    </td>
                    <td class="px-4 py-3 text-right font-bold text-neutral-800 dark:text-neutral-200">
                      {{ spatialDeltasA ? `${spatialDeltasA.rain} mm` : '—' }}
                    </td>
                  </template>
                </tr>

                <!-- Relative Humidity -->
                <tr class="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition-colors">
                  <td class="px-4 py-3 font-sans font-semibold text-neutral-700 dark:text-neutral-300">Humidity</td>
                  <td class="px-3 py-3 text-right bg-cyan-500/5 font-bold">{{ c1SummaryA.avgHumidity }}%</td>
                  <td class="px-3 py-3 text-right bg-cyan-500/5">{{ c1SummaryB?.avgHumidity || '0' }}%</td>
                  <td class="px-3 py-3 text-right bg-cyan-500/10 font-black">
                    {{ c1Deltas.humidity > 0 ? `+${c1Deltas.humidity}%` : `${c1Deltas.humidity}%` }}
                  </td>

                  <template v-if="temporalSubMode === 'dual' && c2SummaryA && c2SummaryB && c2Deltas">
                    <td class="px-3 py-3 text-right bg-amber-500/5 font-bold">{{ c2SummaryA.avgHumidity }}%</td>
                    <td class="px-3 py-3 text-right bg-amber-500/5">{{ c2SummaryB.avgHumidity }}%</td>
                    <td class="px-3 py-3 text-right bg-amber-500/10 font-black">
                      {{ c2Deltas.humidity > 0 ? `+${c2Deltas.humidity}%` : `${c2Deltas.humidity}%` }}
                    </td>
                    <td class="px-4 py-3 text-right font-bold text-neutral-800 dark:text-neutral-200">
                      {{ spatialDeltasA ? `${spatialDeltasA.humidity}%` : '—' }}
                    </td>
                  </template>
                </tr>

                <!-- PM2.5 -->
                <tr class="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition-colors">
                  <td class="px-4 py-3 font-sans font-semibold text-neutral-700 dark:text-neutral-300">PM2.5 Particulate</td>
                  <td class="px-3 py-3 text-right bg-cyan-500/5 font-bold">{{ c1SummaryA.avgPm25 }}</td>
                  <td class="px-3 py-3 text-right bg-cyan-500/5">{{ c1SummaryB?.avgPm25 || '0' }}</td>
                  <td
                    class="px-3 py-3 text-right bg-cyan-500/10 font-black"
                    :class="c1Deltas.pm25 < 0 ? 'text-emerald-500' : 'text-rose-500'"
                  >
                    {{ c1Deltas.pm25 > 0 ? `+${c1Deltas.pm25}` : `${c1Deltas.pm25}` }}
                  </td>

                  <template v-if="temporalSubMode === 'dual' && c2SummaryA && c2SummaryB && c2Deltas">
                    <td class="px-3 py-3 text-right bg-amber-500/5 font-bold">{{ c2SummaryA.avgPm25 }}</td>
                    <td class="px-3 py-3 text-right bg-amber-500/5">{{ c2SummaryB.avgPm25 }}</td>
                    <td
                      class="px-3 py-3 text-right bg-amber-500/10 font-black"
                      :class="c2Deltas.pm25 < 0 ? 'text-emerald-500' : 'text-rose-500'"
                    >
                      {{ c2Deltas.pm25 > 0 ? `+${c2Deltas.pm25}` : `${c2Deltas.pm25}` }}
                    </td>
                    <td class="px-4 py-3 text-right font-bold text-neutral-800 dark:text-neutral-200">
                      {{ spatialDeltasA ? `${spatialDeltasA.pm25} µg/m³` : '—' }}
                    </td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- TREND DIVERGENCE (DIFF-IN-DIFF) INSIGHTS (IN DUAL MODE) -->
        <div
          v-if="temporalSubMode === 'dual' && trendDivergence"
          class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 p-4 sm:p-5 space-y-3"
        >
          <div class="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
            <UIcon
              name="i-lucide-sparkles"
              class="h-4 w-4 text-primary"
            />
            <span>Spatio-Temporal Trend Divergence Insights</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div class="p-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700/80 space-y-1">
              <span class="font-bold text-emerald-600 dark:text-emerald-400 block">Air Quality Trajectory Divergence:</span>
              <p class="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                {{ trendDivergence.aqiNarrative }}
              </p>
            </div>

            <div class="p-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700/80 space-y-1">
              <span class="font-bold text-amber-600 dark:text-amber-400 block">Thermal Dynamic Divergence:</span>
              <p class="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                {{ trendDivergence.tempNarrative }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
