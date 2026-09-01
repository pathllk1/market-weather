<script setup lang="ts">
import type { NationalWeatherPulse } from '~/types/weather'
import WeatherAqiBadge from './WeatherAqiBadge.vue'

const props = defineProps<{
  pulse: NationalWeatherPulse | null
  isLoading?: boolean
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'selectCity', city: string): void
}>()
</script>

<template>
  <div
    v-if="props.pulse"
    class="space-y-3"
  >
    <!-- Top Header Ribbon -->
    <div class="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
          <UIcon
            name="i-lucide-cloud-sun"
            class="text-2xl"
          />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-base sm:text-lg font-extrabold tracking-tight text-neutral-900 dark:text-white">
              National Air Quality & Weather Pulse
            </h1>
            <UBadge
              color="primary"
              variant="subtle"
              size="xs"
              class="font-mono text-[10px]"
            >
              51 Cities Live
            </UBadge>
          </div>
          <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Hourly atmospheric telemetry across 24 Indian States & Territories
          </p>
        </div>
      </div>

      <!-- Controls: DB Counter & Refresh Button -->
      <div class="flex items-center gap-2">
        <div class="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700/60 text-neutral-600 dark:text-neutral-300 text-xs font-mono">
          <UIcon
            name="i-lucide-database"
            class="text-xs text-primary"
          />
          <span>{{ props.pulse.totalReadings.toLocaleString() }} Telemetry Logs</span>
        </div>

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

    <!-- 4 KPI Cards Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <!-- 1. National Average AQI -->
      <div class="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs flex items-center justify-between">
        <div class="space-y-1">
          <div class="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 flex items-center gap-1">
            <UIcon
              name="i-lucide-activity"
              class="text-xs text-primary"
            />
            <span>National Avg AQI</span>
          </div>
          <div class="flex items-baseline gap-2">
            <span class="text-2xl font-extrabold font-mono text-neutral-900 dark:text-white">
              {{ props.pulse.nationalAvgAqi }}
            </span>
            <WeatherAqiBadge
              :aqi="props.pulse.nationalAvgAqi"
              :category="props.pulse.nationalAqiCategory"
              size="xs"
            />
          </div>
          <p class="text-[11px] text-neutral-500 dark:text-neutral-400">
            Across 51 major metropolitan clusters
          </p>
        </div>
      </div>

      <!-- 2. Cleanest Air Leader -->
      <button
        type="button"
        class="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 shadow-xs text-left transition-all group"
        @click="emit('selectCity', props.pulse.cleanestCity.city)"
      >
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <UIcon
              name="i-lucide-sparkles"
              class="text-xs"
            />
            <span>Cleanest Air</span>
          </span>
          <UIcon
            name="i-lucide-external-link"
            class="text-xs text-neutral-400 group-hover:text-emerald-500 transition-colors"
          />
        </div>
        <div class="flex items-baseline justify-between mt-1">
          <div>
            <div class="text-base font-extrabold text-neutral-900 dark:text-white group-hover:text-emerald-500 transition-colors">
              {{ props.pulse.cleanestCity.city }}
            </div>
            <div class="text-[11px] text-neutral-400">
              {{ props.pulse.cleanestCity.state }}
            </div>
          </div>
          <WeatherAqiBadge
            :aqi="props.pulse.cleanestCity.aqi"
            size="sm"
          />
        </div>
      </button>

      <!-- 3. Most Polluted Hotspot -->
      <button
        type="button"
        class="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-red-500/50 dark:hover:border-red-500/50 shadow-xs text-left transition-all group"
        @click="emit('selectCity', props.pulse.mostPollutedCity.city)"
      >
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1">
            <UIcon
              name="i-lucide-alert-triangle"
              class="text-xs"
            />
            <span>Pollution Hotspot</span>
          </span>
          <UIcon
            name="i-lucide-external-link"
            class="text-xs text-neutral-400 group-hover:text-red-500 transition-colors"
          />
        </div>
        <div class="flex items-baseline justify-between mt-1">
          <div>
            <div class="text-base font-extrabold text-neutral-900 dark:text-white group-hover:text-red-500 transition-colors">
              {{ props.pulse.mostPollutedCity.city }}
            </div>
            <div class="text-[11px] text-neutral-400">
              {{ props.pulse.mostPollutedCity.state }}
            </div>
          </div>
          <WeatherAqiBadge
            :aqi="props.pulse.mostPollutedCity.aqi"
            size="sm"
          />
        </div>
      </button>

      <!-- 4. Thermal & Rainfall Extremes -->
      <div class="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-1.5">
        <div class="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 flex items-center justify-between">
          <span class="flex items-center gap-1">
            <UIcon
              name="i-lucide-cloud-rain"
              class="text-xs text-cyan-500"
            />
            <span>Precipitation & Heat</span>
          </span>
          <span class="text-[10px] text-cyan-600 dark:text-cyan-400 font-bold">
            {{ props.pulse.activeRainCount }} Rain Zones
          </span>
        </div>
        <div class="flex items-center justify-between text-xs pt-1">
          <span class="text-neutral-500">Hottest:</span>
          <button
            type="button"
            class="font-bold text-neutral-800 dark:text-neutral-200 hover:text-primary transition-colors"
            @click="emit('selectCity', props.pulse.hottestCity.city)"
          >
            {{ props.pulse.hottestCity.city }} ({{ props.pulse.hottestCity.temperature }}°C)
          </button>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-neutral-500">Coolest:</span>
          <button
            type="button"
            class="font-bold text-neutral-800 dark:text-neutral-200 hover:text-primary transition-colors"
            @click="emit('selectCity', props.pulse.coldestCity.city)"
          >
            {{ props.pulse.coldestCity.city }} ({{ props.pulse.coldestCity.temperature }}°C)
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
