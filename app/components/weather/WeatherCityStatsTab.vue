<script setup lang="ts">
import { ref, computed } from 'vue'
import type { CityWeatherStats, PeriodAggregatedRow, CityLatestWeather } from '~/types/weather'
import WeatherAqiBadge from './WeatherAqiBadge.vue'

const props = defineProps<{
  stats: CityWeatherStats | null
  isLoading?: boolean
  city?: CityLatestWeather | null
}>()

// Active sub-tab inside Analytics: '7d' | 'monthly' | 'yearly' | 'records' | 'chemistry'
const activeSubScope = ref<'7d' | 'monthly' | 'yearly' | 'records' | 'chemistry'>('7d')

// Sort configuration for the tabular view
const sortKey = ref<'period' | 'avgTemp' | 'avgAqi' | 'avgPm25' | 'rain'>('period')
const sortAsc = ref(false)

function toggleTableSort(key: 'period' | 'avgTemp' | 'avgAqi' | 'avgPm25' | 'rain') {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = false
  }
}

// Active rows based on sub-scope
const currentRows = computed<PeriodAggregatedRow[]>(() => {
  if (!props.stats) return []
  let rows: PeriodAggregatedRow[] = []
  if (activeSubScope.value === '7d') {
    rows = [...props.stats.sevenDays.days]
  } else if (activeSubScope.value === 'monthly') {
    rows = [...props.stats.monthly.months]
  } else if (activeSubScope.value === 'yearly') {
    rows = [...props.stats.yearly.years]
  } else {
    return []
  }

  // Apply sorting
  rows.sort((a, b) => {
    let valA = 0
    let valB = 0
    if (sortKey.value === 'period') {
      return sortAsc.value
        ? a.period.localeCompare(b.period)
        : b.period.localeCompare(a.period)
    } else if (sortKey.value === 'avgTemp') {
      valA = a.temperature.avg
      valB = b.temperature.avg
    } else if (sortKey.value === 'avgAqi') {
      valA = a.usAqi.avg
      valB = b.usAqi.avg
    } else if (sortKey.value === 'avgPm25') {
      valA = a.pm25.avg
      valB = b.pm25.avg
    } else if (sortKey.value === 'rain') {
      valA = a.totalRain
      valB = b.totalRain
    }
    return sortAsc.value ? valA - valB : valB - valA
  })

  return rows
})

// Current summary metrics for the active scope
const activeSummary = computed(() => {
  if (!props.stats) return null
  if (activeSubScope.value === '7d') {
    return {
      scopeTitle: 'Last 7 Days Aggregates',
      subtitle: 'Dynamic day-by-day telemetry rollup with 24-hour sensor integration',
      temp: props.stats.sevenDays.summary.temperature,
      aqi: props.stats.sevenDays.summary.usAqi,
      aqiCat: props.stats.sevenDays.summary.aqiCategory,
      pm25: props.stats.sevenDays.summary.pm25,
      humidity: props.stats.sevenDays.summary.humidity,
      rain: props.stats.sevenDays.summary.totalRain,
      wind: props.stats.sevenDays.summary.windSpeed
    }
  }
  if (activeSubScope.value === 'monthly') {
    return {
      scopeTitle: 'Monthly-Wise Aggregates',
      subtitle: 'Calendar month breakdown showing seasonal progression & monsoon impacts',
      temp: props.stats.monthly.summary.temperature,
      aqi: props.stats.monthly.summary.usAqi,
      aqiCat: props.stats.monthly.summary.aqiCategory,
      pm25: props.stats.monthly.months[0]?.pm25 || { min: 0, max: 0, avg: 0 },
      humidity: props.stats.monthly.months[0]?.humidity || { min: 0, max: 0, avg: 0 },
      rain: props.stats.monthly.summary.totalRain,
      wind: props.stats.monthly.months[0]?.windSpeed || { min: 0, max: 0, avg: 0 }
    }
  }
  if (activeSubScope.value === 'yearly') {
    return {
      scopeTitle: 'Yearly-Wise Aggregates',
      subtitle: 'Annual climate footprint, macro pollution trends & annual rainfall totals',
      temp: props.stats.yearly.summary.temperature,
      aqi: props.stats.yearly.summary.usAqi,
      aqiCat: props.stats.yearly.summary.aqiCategory,
      pm25: props.stats.yearly.years[0]?.pm25 || { min: 0, max: 0, avg: 0 },
      humidity: props.stats.yearly.years[0]?.humidity || { min: 0, max: 0, avg: 0 },
      rain: props.stats.yearly.summary.totalRain,
      wind: props.stats.yearly.years[0]?.windSpeed || { min: 0, max: 0, avg: 0 }
    }
  }
  return null
})

// Helper to compute percentage position of avg between min and max for range bars
function getAvgPosition(min: number, max: number, avg: number): number {
  if (max <= min) return 50
  const ratio = (avg - min) / (max - min)
  return Math.max(5, Math.min(95, Math.round(ratio * 100)))
}
</script>

<template>
  <div class="space-y-6">
    <!-- Sub-Scope Navigation Pills -->
    <div class="flex flex-wrap items-center justify-between gap-3 p-1.5 rounded-2xl bg-neutral-100 dark:bg-neutral-800/70 border border-neutral-200/80 dark:border-neutral-700/60 shadow-xs">
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all select-none"
          :class="activeSubScope === '7d'
            ? 'bg-primary text-white shadow-sm'
            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
          @click="activeSubScope = '7d'"
        >
          <UIcon name="i-lucide-calendar-days" class="text-sm" />
          <span>Last 7 Days</span>
        </button>

        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all select-none"
          :class="activeSubScope === 'monthly'
            ? 'bg-primary text-white shadow-sm'
            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
          @click="activeSubScope = 'monthly'"
        >
          <UIcon name="i-lucide-calendar-range" class="text-sm" />
          <span>Monthly Wise</span>
          <span v-if="props.stats?.monthly.months.length" class="text-[10px] opacity-80">
            ({{ props.stats.monthly.months.length }} mo)
          </span>
        </button>

        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all select-none"
          :class="activeSubScope === 'yearly'
            ? 'bg-primary text-white shadow-sm'
            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
          @click="activeSubScope = 'yearly'"
        >
          <UIcon name="i-lucide-calendar" class="text-sm" />
          <span>Yearly Wise</span>
        </button>

        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all select-none"
          :class="activeSubScope === 'records'
            ? 'bg-primary text-white shadow-sm'
            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
          @click="activeSubScope = 'records'"
        >
          <UIcon name="i-lucide-trophy" class="text-sm" />
          <span>Records & Micro-Climate</span>
        </button>

        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all select-none"
          :class="activeSubScope === 'chemistry'
            ? 'bg-primary text-white shadow-sm'
            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
          @click="activeSubScope = 'chemistry'"
        >
          <UIcon name="i-lucide-flask-conical" class="text-sm" />
          <span>Pollutant Matrix</span>
        </button>
      </div>

      <!-- Total telemetry badge -->
      <div v-if="props.stats" class="text-[11px] font-mono text-neutral-500 px-2 py-0.5 hidden sm:flex items-center gap-1.5">
        <UIcon name="i-lucide-database" class="text-xs text-primary" />
        <span>{{ props.stats.totalReadings.toLocaleString() }} total readings analyzed</span>
      </div>
    </div>

    <!-- Loading State -->
    <div
      v-if="props.isLoading"
      class="py-24 text-center text-xs text-neutral-400"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="animate-spin text-3xl mb-3 text-primary mx-auto"
      />
      <p class="font-bold text-neutral-700 dark:text-neutral-300 text-sm">
        Computing statistical aggregations across telemetry records...
      </p>
      <p class="text-xs text-neutral-500 mt-1">
        Evaluating min, max, avg variances and environmental thresholds
      </p>
    </div>

    <!-- Data Loaded View -->
    <div v-else-if="props.stats" class="space-y-6">
      <!-- 1. EXECUTIVE SUMMARY STRIP (For 7d, monthly, yearly) -->
      <div v-if="activeSummary" class="space-y-4">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 class="text-base font-extrabold text-neutral-900 dark:text-white flex items-center gap-2">
              <span>{{ activeSummary.scopeTitle }}</span>
              <UBadge color="primary" variant="subtle" size="xs">
                Min • Avg • Max Profile
              </UBadge>
            </h3>
            <p class="text-xs text-neutral-500">
              {{ activeSummary.subtitle }}
            </p>
          </div>
        </div>

        <!-- 4 Core Executive Metric Cards with Visual Min-Avg-Max Range Bars -->
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <!-- Card 1: Temperature Range -->
          <div class="p-4 rounded-2xl bg-white dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 shadow-xs space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                <UIcon name="i-lucide-thermometer" class="text-amber-500 text-base" />
                Temperature Range
              </span>
              <span class="text-xs font-mono font-bold text-neutral-900 dark:text-white">
                Avg: <span class="text-amber-600 dark:text-amber-400 text-sm">{{ activeSummary.temp.avg }}°C</span>
              </span>
            </div>

            <!-- Min - Avg - Max Breakdown Grid -->
            <div class="grid grid-cols-3 gap-2 text-center py-1 bg-neutral-50 dark:bg-neutral-900/60 rounded-xl p-2 border border-neutral-100 dark:border-neutral-800">
              <div>
                <div class="text-[10px] text-neutral-400 uppercase font-semibold">Min</div>
                <div class="text-base font-mono font-extrabold text-blue-600 dark:text-blue-400">
                  {{ activeSummary.temp.min }}°C
                </div>
              </div>
              <div class="border-x border-neutral-200 dark:border-neutral-800 px-1">
                <div class="text-[10px] text-amber-500 uppercase font-bold">Avg</div>
                <div class="text-base font-mono font-extrabold text-neutral-900 dark:text-white">
                  {{ activeSummary.temp.avg }}°C
                </div>
              </div>
              <div>
                <div class="text-[10px] text-neutral-400 uppercase font-semibold">Max</div>
                <div class="text-base font-mono font-extrabold text-red-600 dark:text-red-400">
                  {{ activeSummary.temp.max }}°C
                </div>
              </div>
            </div>

            <!-- Visual Range Bar with Avg Pin -->
            <div class="space-y-1.5">
              <div class="relative h-2.5 w-full rounded-full bg-gradient-to-r from-blue-500 via-amber-400 to-red-500 shadow-inner">
                <!-- Solid indicator thumb for Avg position -->
                <div
                  class="absolute -top-1 -bottom-1 w-2.5 bg-white dark:bg-neutral-200 rounded-full shadow-md ring-1 ring-neutral-900/30 transform -translate-x-1/2 pointer-events-none flex items-center justify-center"
                  :style="{ left: `${getAvgPosition(activeSummary.temp.min, activeSummary.temp.max, activeSummary.temp.avg)}%` }"
                >
                  <div class="w-1 h-2 bg-amber-500 rounded-full" />
                </div>
              </div>
              <div class="flex justify-between text-[10px] font-mono text-neutral-400">
                <span>Spread: {{ (activeSummary.temp.max - activeSummary.temp.min).toFixed(1) }}°C variance</span>
                <span>Avg pos: {{ getAvgPosition(activeSummary.temp.min, activeSummary.temp.max, activeSummary.temp.avg) }}%</span>
              </div>
            </div>
          </div>

          <!-- Card 2: Air Quality Index (AQI) Range -->
          <div class="p-4 rounded-2xl bg-white dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 shadow-xs space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                <UIcon name="i-lucide-wind" class="text-primary text-base" />
                Air Quality Index (AQI)
              </span>
              <WeatherAqiBadge
                :aqi="activeSummary.aqi.avg"
                :category="activeSummary.aqiCat"
                size="xs"
              />
            </div>

            <!-- Min - Avg - Max Breakdown Grid -->
            <div class="grid grid-cols-3 gap-2 text-center py-1 bg-neutral-50 dark:bg-neutral-900/60 rounded-xl p-2 border border-neutral-100 dark:border-neutral-800">
              <div>
                <div class="text-[10px] text-neutral-400 uppercase font-semibold">Cleanest</div>
                <div class="text-base font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                  {{ activeSummary.aqi.min }}
                </div>
              </div>
              <div class="border-x border-neutral-200 dark:border-neutral-800 px-1">
                <div class="text-[10px] text-primary uppercase font-bold">Avg AQI</div>
                <div class="text-base font-mono font-extrabold text-neutral-900 dark:text-white">
                  {{ activeSummary.aqi.avg }}
                </div>
              </div>
              <div>
                <div class="text-[10px] text-neutral-400 uppercase font-semibold">Peak Smog</div>
                <div class="text-base font-mono font-extrabold text-rose-600 dark:text-rose-400">
                  {{ activeSummary.aqi.max }}
                </div>
              </div>
            </div>

            <!-- Visual Range Bar with Avg Pin -->
            <div class="space-y-1.5">
              <div class="relative h-2.5 w-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 via-orange-500 to-rose-600 shadow-inner">
                <div
                  class="absolute -top-1 -bottom-1 w-2.5 bg-white dark:bg-neutral-200 rounded-full shadow-md ring-1 ring-neutral-900/30 transform -translate-x-1/2 pointer-events-none flex items-center justify-center"
                  :style="{ left: `${getAvgPosition(activeSummary.aqi.min, activeSummary.aqi.max, activeSummary.aqi.avg)}%` }"
                >
                  <div class="w-1 h-2 bg-primary rounded-full" />
                </div>
              </div>
              <div class="flex justify-between text-[10px] font-mono text-neutral-400">
                <span>Category: {{ activeSummary.aqiCat.label }}</span>
                <span>Delta: {{ activeSummary.aqi.max - activeSummary.aqi.min }} pts</span>
              </div>
            </div>
          </div>

          <!-- Card 3: PM2.5 Fine Particles -->
          <div class="p-4 rounded-2xl bg-white dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 shadow-xs space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                <UIcon name="i-lucide-activity" class="text-purple-500 text-base" />
                PM2.5 Concentration
              </span>
              <span class="text-xs font-mono font-bold text-neutral-500">
                WHO: 15 µg/m³
              </span>
            </div>

            <!-- Min - Avg - Max Breakdown Grid -->
            <div class="grid grid-cols-3 gap-2 text-center py-1 bg-neutral-50 dark:bg-neutral-900/60 rounded-xl p-2 border border-neutral-100 dark:border-neutral-800">
              <div>
                <div class="text-[10px] text-neutral-400 uppercase font-semibold">Min</div>
                <div class="text-base font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                  {{ activeSummary.pm25.min }}
                </div>
              </div>
              <div class="border-x border-neutral-200 dark:border-neutral-800 px-1">
                <div class="text-[10px] text-purple-500 uppercase font-bold">Avg PM2.5</div>
                <div class="text-base font-mono font-extrabold text-neutral-900 dark:text-white">
                  {{ activeSummary.pm25.avg }}
                </div>
              </div>
              <div>
                <div class="text-[10px] text-neutral-400 uppercase font-semibold">Peak</div>
                <div class="text-base font-mono font-extrabold text-rose-600 dark:text-rose-400">
                  {{ activeSummary.pm25.max }}
                </div>
              </div>
            </div>

            <!-- Status Indicator -->
            <div class="space-y-1">
              <div class="flex items-center justify-between text-[11px] font-semibold pt-1">
                <span class="text-neutral-500">Sensor Status:</span>
                <span
                  class="font-bold"
                  :class="activeSummary.pm25.avg <= 30 ? 'text-emerald-600 dark:text-emerald-400' : activeSummary.pm25.avg <= 60 ? 'text-amber-500' : 'text-red-500'"
                >
                  {{ activeSummary.pm25.avg <= 30 ? 'Safe Baseline' : activeSummary.pm25.avg <= 60 ? 'Elevated Fine Dust' : 'Hazardous Inhalable' }}
                </span>
              </div>
              <div class="text-[10px] text-neutral-400 font-mono">
                Micrograms per cubic meter (µg/m³)
              </div>
            </div>
          </div>

          <!-- Card 4: Rainfall & Atmosphere -->
          <div class="p-4 rounded-2xl bg-white dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 shadow-xs space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                <UIcon name="i-lucide-cloud-rain" class="text-cyan-500 text-base" />
                Precipitation & Moisture
              </span>
              <span class="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400">
                {{ activeSummary.rain }} mm total
              </span>
            </div>

            <!-- Min - Avg - Max Breakdown Grid -->
            <div class="grid grid-cols-2 gap-2 text-center py-1 bg-neutral-50 dark:bg-neutral-900/60 rounded-xl p-2 border border-neutral-100 dark:border-neutral-800">
              <div>
                <div class="text-[10px] text-neutral-400 uppercase font-semibold">Total Rainfall</div>
                <div class="text-base font-mono font-extrabold text-cyan-600 dark:text-cyan-400">
                  {{ activeSummary.rain }} mm
                </div>
              </div>
              <div class="border-l border-neutral-200 dark:border-neutral-800 pl-1">
                <div class="text-[10px] text-neutral-400 uppercase font-semibold">Avg Humidity</div>
                <div class="text-base font-mono font-extrabold text-neutral-900 dark:text-white">
                  {{ activeSummary.humidity.avg }}%
                </div>
              </div>
            </div>

            <!-- Humidity range span -->
            <div class="space-y-1">
              <div class="flex items-center justify-between text-[11px] font-semibold pt-1">
                <span class="text-neutral-500">Humidity Range:</span>
                <span class="font-mono text-neutral-900 dark:text-white">
                  {{ activeSummary.humidity.min }}% to {{ activeSummary.humidity.max }}%
                </span>
              </div>
              <div class="text-[10px] text-neutral-400 font-mono">
                Avg wind: {{ activeSummary.wind.avg }} km/h (peak: {{ activeSummary.wind.max }})
              </div>
            </div>
          </div>
        </div>

        <!-- 2. HIGH DENSITY COMPARATIVE TABLE -->
        <div class="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-xs">
          <div class="p-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 class="text-sm font-extrabold text-neutral-900 dark:text-white flex items-center gap-2">
                <UIcon name="i-lucide-table" class="text-primary text-base" />
                <span>{{ activeSubScope === '7d' ? 'Daily Progression Telemetry' : activeSubScope === 'monthly' ? 'Monthly Comparison Archive' : 'Annual Climate Registry' }}</span>
              </h4>
              <p class="text-xs text-neutral-500">
                Click column headers to sort by Temperature, AQI, PM2.5, or Rainfall
              </p>
            </div>

            <div class="text-xs font-mono text-neutral-400">
              Showing {{ currentRows.length }} aggregated intervals
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-800 text-[11px] font-bold text-neutral-500 uppercase tracking-wider select-none">
                  <th class="py-3 px-4 cursor-pointer hover:text-neutral-900 dark:hover:text-white" @click="toggleTableSort('period')">
                    <div class="flex items-center gap-1.5">
                      <span>Timeline Period</span>
                      <UIcon v-if="sortKey === 'period'" :name="sortAsc ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'" class="text-xs text-primary" />
                    </div>
                  </th>
                  <th class="py-3 px-3 text-center">
                    <span>Readings</span>
                  </th>
                  <th class="py-3 px-4 cursor-pointer hover:text-neutral-900 dark:hover:text-white" @click="toggleTableSort('avgTemp')">
                    <div class="flex items-center gap-1.5">
                      <span>Temperature (°C) [Min / Avg / Max]</span>
                      <UIcon v-if="sortKey === 'avgTemp'" :name="sortAsc ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'" class="text-xs text-primary" />
                    </div>
                  </th>
                  <th class="py-3 px-4 cursor-pointer hover:text-neutral-900 dark:hover:text-white" @click="toggleTableSort('avgAqi')">
                    <div class="flex items-center gap-1.5">
                      <span>Air Quality (US AQI) [Min / Avg / Max]</span>
                      <UIcon v-if="sortKey === 'avgAqi'" :name="sortAsc ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'" class="text-xs text-primary" />
                    </div>
                  </th>
                  <th class="py-3 px-4 cursor-pointer hover:text-neutral-900 dark:hover:text-white" @click="toggleTableSort('avgPm25')">
                    <div class="flex items-center gap-1.5">
                      <span>PM2.5 (µg/m³)</span>
                      <UIcon v-if="sortKey === 'avgPm25'" :name="sortAsc ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'" class="text-xs text-primary" />
                    </div>
                  </th>
                  <th class="py-3 px-3 text-center">
                    <span>Humidity</span>
                  </th>
                  <th class="py-3 px-4 text-right cursor-pointer hover:text-neutral-900 dark:hover:text-white" @click="toggleTableSort('rain')">
                    <div class="flex items-center justify-end gap-1.5">
                      <span>Total Rainfall</span>
                      <UIcon v-if="sortKey === 'rain'" :name="sortAsc ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'" class="text-xs text-primary" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-neutral-100 dark:divide-neutral-800 font-mono">
                <tr
                  v-for="(row, idx) in currentRows"
                  :key="row.period"
                  class="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                >
                  <!-- Period / Date -->
                  <td class="py-3 px-4">
                    <div class="font-bold text-neutral-900 dark:text-white font-sans text-xs">
                      {{ row.label }}
                    </div>
                    <div class="text-[10px] text-neutral-400 font-mono">
                      {{ row.period }}
                    </div>
                  </td>

                  <!-- Readings Count -->
                  <td class="py-3 px-3 text-center text-neutral-500 text-xs">
                    {{ row.readingsCount }}
                  </td>

                  <!-- Temperature Min / Avg / Max -->
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-2">
                      <span class="text-xs text-blue-500 font-bold">{{ row.temperature.min }}°</span>
                      <div class="relative w-20 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                        <div
                          class="absolute top-0 bottom-0 bg-gradient-to-r from-blue-500 to-amber-500 rounded-full"
                          :style="{
                            left: `${Math.max(0, Math.min(80, (row.temperature.min / 45) * 100))}%`,
                            width: `${Math.max(20, Math.min(100, ((row.temperature.max - row.temperature.min) / 45) * 100))}%`
                          }"
                        />
                      </div>
                      <span class="text-xs font-bold text-neutral-900 dark:text-white">{{ row.temperature.avg }}°</span>
                      <span class="text-xs text-red-500 font-bold">{{ row.temperature.max }}°</span>
                    </div>
                    <div v-if="row.apparentTemperature" class="text-[10px] text-neutral-400 font-sans mt-0.5">
                      Feels like avg: {{ row.apparentTemperature.avg }}°C
                    </div>
                  </td>

                  <!-- AQI Min / Avg / Max + Badge -->
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-2.5">
                      <WeatherAqiBadge
                        :aqi="row.usAqi.avg"
                        :category="row.aqiCategory"
                        size="xs"
                      />
                      <span class="text-xs text-neutral-500">
                        ({{ row.usAqi.min }} - <strong class="text-neutral-900 dark:text-white">{{ row.usAqi.avg }}</strong> - {{ row.usAqi.max }})
                      </span>
                    </div>
                  </td>

                  <!-- PM2.5 -->
                  <td class="py-3 px-4">
                    <div class="font-bold text-neutral-900 dark:text-white">
                      {{ row.pm25.avg }} <span class="text-[10px] font-normal text-neutral-400">µg/m³</span>
                    </div>
                    <div class="text-[10px] text-neutral-400">
                      Range: {{ row.pm25.min }} - {{ row.pm25.max }}
                    </div>
                  </td>

                  <!-- Humidity -->
                  <td class="py-3 px-3 text-center text-neutral-600 dark:text-neutral-400">
                    <div>{{ row.humidity.avg }}%</div>
                    <div class="text-[10px] text-neutral-400">({{ row.humidity.min }}% - {{ row.humidity.max }}%)</div>
                  </td>

                  <!-- Total Rain -->
                  <td class="py-3 px-4 text-right">
                    <span
                      class="font-bold"
                      :class="row.totalRain > 0 ? 'text-cyan-600 dark:text-cyan-400' : 'text-neutral-400'"
                    >
                      {{ row.totalRain > 0 ? `${row.totalRain.toFixed(1)} mm` : '0 mm' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 3. ALL-TIME RECORDS & MICRO-CLIMATE VIEW (When activeSubScope === 'records') -->
      <div v-if="activeSubScope === 'records'" class="space-y-6">
        <div>
          <h3 class="text-base font-extrabold text-neutral-900 dark:text-white flex items-center gap-2">
            <UIcon name="i-lucide-award" class="text-amber-500 text-lg" />
            <span>All-Time Records & Telemetry Extremes</span>
          </h3>
          <p class="text-xs text-neutral-500">
            Absolute minimums, peak maximums, and weather anomalies recorded for {{ props.stats.city }}
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <!-- Record 1: Hottest Temperature -->
          <div class="p-4 rounded-2xl bg-white dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/80 shadow-xs space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-red-500 uppercase tracking-wider flex items-center gap-1.5">
                <UIcon name="i-lucide-flame" class="text-base" />
                Peak Heat Record
              </span>
              <UBadge color="error" variant="subtle" size="xs">Historical High</UBadge>
            </div>
            <div class="text-3xl font-mono font-extrabold text-neutral-900 dark:text-white">
              {{ props.stats.records.hottest.temperature }}°C
            </div>
            <div class="text-xs text-neutral-500 font-sans">
              Feels like {{ props.stats.records.hottest.feelsLike }}°C
            </div>
            <div class="text-[11px] font-mono text-neutral-400 pt-1 border-t border-neutral-100 dark:border-neutral-700/60">
              Recorded: {{ props.stats.records.hottest.date }}
            </div>
          </div>

          <!-- Record 2: Coldest Temperature -->
          <div class="p-4 rounded-2xl bg-white dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/80 shadow-xs space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-blue-500 uppercase tracking-wider flex items-center gap-1.5">
                <UIcon name="i-lucide-snowflake" class="text-base" />
                Coldest Record
              </span>
              <UBadge color="primary" variant="subtle" size="xs">Historical Low</UBadge>
            </div>
            <div class="text-3xl font-mono font-extrabold text-neutral-900 dark:text-white">
              {{ props.stats.records.coldest.temperature }}°C
            </div>
            <div class="text-xs text-neutral-500 font-sans">
              Minimum thermal reading in telemetry
            </div>
            <div class="text-[11px] font-mono text-neutral-400 pt-1 border-t border-neutral-100 dark:border-neutral-700/60">
              Recorded: {{ props.stats.records.coldest.date }}
            </div>
          </div>

          <!-- Record 3: Highest Pollution Spike -->
          <div class="p-4 rounded-2xl bg-white dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/80 shadow-xs space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-rose-600 uppercase tracking-wider flex items-center gap-1.5">
                <UIcon name="i-lucide-shield-alert" class="text-base" />
                Peak Pollution Spike
              </span>
              <WeatherAqiBadge
                :aqi="props.stats.records.highestAqi.aqi"
                :category="props.stats.records.highestAqi.category"
                size="xs"
              />
            </div>
            <div class="text-3xl font-mono font-extrabold text-rose-600 dark:text-rose-400">
              {{ props.stats.records.highestAqi.aqi }} <span class="text-sm font-normal text-neutral-400">AQI</span>
            </div>
            <div class="text-xs text-neutral-500 font-sans">
              Category: {{ props.stats.records.highestAqi.category.label }}
            </div>
            <div class="text-[11px] font-mono text-neutral-400 pt-1 border-t border-neutral-100 dark:border-neutral-700/60">
              Recorded: {{ props.stats.records.highestAqi.date }}
            </div>
          </div>

          <!-- Record 4: Cleanest Air Day -->
          <div class="p-4 rounded-2xl bg-white dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/80 shadow-xs space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1.5">
                <UIcon name="i-lucide-sparkles" class="text-base" />
                Cleanest Air Reading
              </span>
              <WeatherAqiBadge
                :aqi="props.stats.records.lowestAqi.aqi"
                :category="props.stats.records.lowestAqi.category"
                size="xs"
              />
            </div>
            <div class="text-3xl font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
              {{ props.stats.records.lowestAqi.aqi }} <span class="text-sm font-normal text-neutral-400">AQI</span>
            </div>
            <div class="text-xs text-neutral-500 font-sans">
              Best breathing window recorded
            </div>
            <div class="text-[11px] font-mono text-neutral-400 pt-1 border-t border-neutral-100 dark:border-neutral-700/60">
              Recorded: {{ props.stats.records.lowestAqi.date }}
            </div>
          </div>

          <!-- Record 5: Wettest Downpour -->
          <div class="p-4 rounded-2xl bg-white dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/80 shadow-xs space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-cyan-600 uppercase tracking-wider flex items-center gap-1.5">
                <UIcon name="i-lucide-cloud-lightning" class="text-base" />
                Heaviest Downpour
              </span>
              <UBadge color="neutral" variant="subtle" size="xs">Monsoon Peak</UBadge>
            </div>
            <div class="text-3xl font-mono font-extrabold text-cyan-600 dark:text-cyan-400">
              {{ props.stats.records.wettestDay.rain }} <span class="text-sm font-normal text-neutral-400">mm</span>
            </div>
            <div class="text-xs text-neutral-500 font-sans">
              Max single reading precipitation
            </div>
            <div class="text-[11px] font-mono text-neutral-400 pt-1 border-t border-neutral-100 dark:border-neutral-700/60">
              Recorded: {{ props.stats.records.wettestDay.date }}
            </div>
          </div>

          <!-- Record 6: Peak Wind Gust -->
          <div class="p-4 rounded-2xl bg-white dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/80 shadow-xs space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                <UIcon name="i-lucide-wind" class="text-base" />
                Peak Wind Velocity
              </span>
              <UBadge color="neutral" variant="subtle" size="xs">Wind Gust</UBadge>
            </div>
            <div class="text-3xl font-mono font-extrabold text-neutral-900 dark:text-white">
              {{ props.stats.records.maxWind.wind }} <span class="text-sm font-normal text-neutral-400">km/h</span>
            </div>
            <div class="text-xs text-neutral-500 font-sans">
              Maximum kinetic wind event
            </div>
            <div class="text-[11px] font-mono text-neutral-400 pt-1 border-t border-neutral-100 dark:border-neutral-700/60">
              Recorded: {{ props.stats.records.maxWind.date }}
            </div>
          </div>
        </div>

        <!-- Diurnal Micro-Climate: Daytime vs Nighttime Comparison -->
        <div class="p-5 rounded-2xl bg-gradient-to-br from-neutral-50 to-neutral-100/60 dark:from-neutral-900 dark:to-neutral-800/60 border border-neutral-200 dark:border-neutral-800 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 class="text-sm font-extrabold text-neutral-900 dark:text-white flex items-center gap-2">
                <UIcon name="i-lucide-sun-medium" class="text-amber-500 text-base" />
                <span>Diurnal Micro-Climate: Daytime vs Nighttime Patterns</span>
              </h4>
              <p class="text-xs text-neutral-500">
                Reveals nocturnal smog inversions and thermal radiation cooling across 24-hour cycles
              </p>
            </div>

            <div class="flex items-center gap-2">
              <UBadge color="neutral" variant="subtle" size="xs" class="font-mono">
                Temp Variance: {{ props.stats.diurnal.tempVariance > 0 ? `+${props.stats.diurnal.tempVariance}` : props.stats.diurnal.tempVariance }}°C
              </UBadge>
              <UBadge :color="props.stats.diurnal.aqiVariance > 0 ? 'error' : 'success'" variant="subtle" size="xs" class="font-mono">
                AQI Delta: {{ props.stats.diurnal.aqiVariance > 0 ? `Day +${props.stats.diurnal.aqiVariance}` : `Night +${Math.abs(props.stats.diurnal.aqiVariance)}` }}
              </UBadge>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Daytime Box -->
            <div class="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <UIcon name="i-lucide-sun" class="text-base text-amber-500" />
                  Daytime (06:00 - 18:00 IST)
                </span>
                <span class="text-[10px] font-mono text-neutral-400">
                  {{ props.stats.diurnal.daytime.hoursCount }} hours
                </span>
              </div>
              <div class="grid grid-cols-3 gap-2 text-center">
                <div class="p-2 rounded-lg bg-white/80 dark:bg-neutral-900/80">
                  <div class="text-[10px] text-neutral-400 font-semibold">Avg Temp</div>
                  <div class="text-base font-mono font-extrabold text-neutral-900 dark:text-white">
                    {{ props.stats.diurnal.daytime.avgTemp }}°C
                  </div>
                </div>
                <div class="p-2 rounded-lg bg-white/80 dark:bg-neutral-900/80">
                  <div class="text-[10px] text-neutral-400 font-semibold">Avg AQI</div>
                  <div class="text-base font-mono font-extrabold text-neutral-900 dark:text-white">
                    {{ props.stats.diurnal.daytime.avgAqi }}
                  </div>
                </div>
                <div class="p-2 rounded-lg bg-white/80 dark:bg-neutral-900/80">
                  <div class="text-[10px] text-neutral-400 font-semibold">Humidity</div>
                  <div class="text-base font-mono font-extrabold text-neutral-900 dark:text-white">
                    {{ props.stats.diurnal.daytime.avgHumidity }}%
                  </div>
                </div>
              </div>
            </div>

            <!-- Nighttime Box -->
            <div class="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/20 space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <UIcon name="i-lucide-moon" class="text-base text-indigo-500" />
                  Nighttime (18:00 - 06:00 IST)
                </span>
                <span class="text-[10px] font-mono text-neutral-400">
                  {{ props.stats.diurnal.nighttime.hoursCount }} hours
                </span>
              </div>
              <div class="grid grid-cols-3 gap-2 text-center">
                <div class="p-2 rounded-lg bg-white/80 dark:bg-neutral-900/80">
                  <div class="text-[10px] text-neutral-400 font-semibold">Avg Temp</div>
                  <div class="text-base font-mono font-extrabold text-neutral-900 dark:text-white">
                    {{ props.stats.diurnal.nighttime.avgTemp }}°C
                  </div>
                </div>
                <div class="p-2 rounded-lg bg-white/80 dark:bg-neutral-900/80">
                  <div class="text-[10px] text-neutral-400 font-semibold">Avg AQI</div>
                  <div class="text-base font-mono font-extrabold text-neutral-900 dark:text-white">
                    {{ props.stats.diurnal.nighttime.avgAqi }}
                  </div>
                </div>
                <div class="p-2 rounded-lg bg-white/80 dark:bg-neutral-900/80">
                  <div class="text-[10px] text-neutral-400 font-semibold">Humidity</div>
                  <div class="text-base font-mono font-extrabold text-neutral-900 dark:text-white">
                    {{ props.stats.diurnal.nighttime.avgHumidity }}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- AQI Category Distribution Bar Chart -->
        <div class="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-4">
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-extrabold text-neutral-900 dark:text-white flex items-center gap-2">
              <UIcon name="i-lucide-pie-chart" class="text-primary text-base" />
              <span>Air Quality Distribution & Health Exposure</span>
            </h4>
            <span class="text-xs text-neutral-400 font-mono">
              Total timeframe telemetry
            </span>
          </div>

          <!-- Stacked Bar of Categories -->
          <div class="w-full h-4 rounded-full overflow-hidden flex bg-neutral-200 dark:bg-neutral-800">
            <div
              v-for="b in props.stats.aqiDistribution"
              :key="b.category"
              class="h-full transition-all"
              :style="{ width: `${b.percentage}%`, backgroundColor: b.color }"
              :title="`${b.category}: ${b.percentage}% (${b.count} readings)`"
            />
          </div>

          <!-- Legend Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <div
              v-for="b in props.stats.aqiDistribution"
              :key="b.category"
              class="p-2.5 rounded-xl border flex flex-col justify-between"
              :class="b.badgeClass"
            >
              <div class="text-[11px] font-bold truncate">
                {{ b.category }}
              </div>
              <div class="mt-1 flex items-baseline justify-between font-mono">
                <span class="text-sm font-extrabold">{{ b.percentage }}%</span>
                <span class="text-[10px] opacity-75">{{ b.count }} hrs</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. POLLUTANT CHEMISTRY & WHO LIMITS (When activeSubScope === 'chemistry') -->
      <div v-if="activeSubScope === 'chemistry'" class="space-y-6">
        <div>
          <h3 class="text-base font-extrabold text-neutral-900 dark:text-white flex items-center gap-2">
            <UIcon name="i-lucide-flask-conical" class="text-primary text-lg" />
            <span>Comprehensive Chemical Pollutant Matrix</span>
          </h3>
          <p class="text-xs text-neutral-500">
            Min, Max, and Average telemetry compared against World Health Organization (WHO) air quality guidelines
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="chem in props.stats.pollutantChemistry"
            :key="chem.pollutant"
            class="p-4 rounded-2xl bg-white dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/80 shadow-xs space-y-3"
          >
            <div class="flex items-center justify-between">
              <div>
                <h4 class="text-sm font-extrabold text-neutral-900 dark:text-white">
                  {{ chem.pollutant }}
                </h4>
                <p class="text-[11px] text-neutral-500">
                  {{ chem.name }}
                </p>
              </div>

              <UBadge
                :color="chem.status === 'safe' ? 'success' : chem.status === 'moderate' ? 'warning' : 'error'"
                variant="subtle"
                size="xs"
              >
                {{ chem.status === 'safe' ? 'Within WHO Limit' : chem.status === 'moderate' ? 'Moderate Exposure' : 'Exceeds Guideline' }}
              </UBadge>
            </div>

            <!-- Min - Avg - Max -->
            <div class="grid grid-cols-3 gap-2 text-center py-1 bg-neutral-50 dark:bg-neutral-900/60 rounded-xl p-2 border border-neutral-100 dark:border-neutral-800 font-mono">
              <div>
                <div class="text-[10px] text-neutral-400 uppercase font-semibold">Min</div>
                <div class="text-sm font-extrabold text-neutral-700 dark:text-neutral-300">
                  {{ chem.min }}
                </div>
              </div>
              <div class="border-x border-neutral-200 dark:border-neutral-800 px-1">
                <div class="text-[10px] text-primary uppercase font-bold">Avg</div>
                <div class="text-base font-extrabold text-neutral-900 dark:text-white">
                  {{ chem.avg }}
                </div>
              </div>
              <div>
                <div class="text-[10px] text-neutral-400 uppercase font-semibold">Max</div>
                <div class="text-sm font-extrabold text-red-500">
                  {{ chem.max }}
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between text-[11px] text-neutral-500 pt-1 border-t border-neutral-100 dark:border-neutral-700/60">
              <span>WHO Guideline Limit:</span>
              <span class="font-mono font-bold text-neutral-800 dark:text-neutral-200">
                {{ chem.whoLimit }} {{ chem.unit }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
