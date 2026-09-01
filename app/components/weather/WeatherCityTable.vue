<script setup lang="ts">
import type { CityLatestWeather } from '~/types/weather'
import WeatherAqiBadge from './WeatherAqiBadge.vue'

const props = defineProps<{
  cities: CityLatestWeather[]
  availableStates: Array<{ state: string, count: number }>
  searchQuery: string
  selectedState: string
  aqiFilter: 'ALL' | 'GOOD' | 'MODERATE' | 'POOR' | 'SEVERE' | 'RAIN'
  sortKey: 'aqi' | 'temp' | 'humidity' | 'rain' | 'city'
  sortOrder: 'asc' | 'desc'
}>()

const emit = defineEmits<{
  (e: 'update:searchQuery' | 'update:selectedState', val: string): void
  (e: 'update:aqiFilter', val: 'ALL' | 'GOOD' | 'MODERATE' | 'POOR' | 'SEVERE' | 'RAIN'): void
  (e: 'toggleSort', key: 'aqi' | 'temp' | 'humidity' | 'rain' | 'city'): void
  (e: 'selectCity', city: CityLatestWeather): void
}>()
</script>

<template>
  <div class="space-y-3">
    <!-- Filters & Search Toolbar -->
    <div class="p-3 sm:p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2.5">
        <!-- Search Input -->
        <div class="relative min-w-[200px] flex-1 max-w-sm">
          <UIcon
            name="i-lucide-search"
            class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm"
          />
          <input
            :value="props.searchQuery"
            type="text"
            placeholder="Search city or state..."
            class="w-full pl-9 pr-3 py-1.5 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/80 focus:outline-none focus:ring-1 focus:ring-primary text-neutral-900 dark:text-white"
            @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
          >
        </div>

        <!-- State Selector -->
        <div class="flex items-center gap-1.5">
          <label class="text-[11px] font-semibold text-neutral-500 hidden sm:inline">State:</label>
          <select
            :value="props.selectedState"
            class="px-2.5 py-1.5 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/80 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
            @change="emit('update:selectedState', ($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="st in props.availableStates"
              :key="st.state"
              :value="st.state"
            >
              {{ st.state === 'ALL' ? `All States (${st.count})` : `${st.state} (${st.count})` }}
            </option>
          </select>
        </div>
      </div>

      <!-- Quick Category Toggle Pills -->
      <div class="flex flex-wrap items-center gap-1.5 pt-1 border-t border-neutral-100 dark:border-neutral-800/60">
        <button
          type="button"
          class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
          :class="props.aqiFilter === 'ALL'
            ? 'bg-primary text-white shadow-xs'
            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'"
          @click="emit('update:aqiFilter', 'ALL')"
        >
          All Cities ({{ props.cities.length }})
        </button>

        <button
          type="button"
          class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
          :class="props.aqiFilter === 'GOOD'
            ? 'bg-emerald-600 text-white shadow-xs'
            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'"
          @click="emit('update:aqiFilter', 'GOOD')"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Clean Air (≤50)
        </button>

        <button
          type="button"
          class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
          :class="props.aqiFilter === 'MODERATE'
            ? 'bg-amber-600 text-white shadow-xs'
            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'"
          @click="emit('update:aqiFilter', 'MODERATE')"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Moderate (51-100)
        </button>

        <button
          type="button"
          class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
          :class="props.aqiFilter === 'POOR'
            ? 'bg-red-600 text-white shadow-xs'
            : 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20'"
          @click="emit('update:aqiFilter', 'POOR')"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-red-500" />
          Unhealthy (101-200)
        </button>

        <button
          type="button"
          class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
          :class="props.aqiFilter === 'SEVERE'
            ? 'bg-purple-600 text-white shadow-xs'
            : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20'"
          @click="emit('update:aqiFilter', 'SEVERE')"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-purple-500" />
          Severe (>200)
        </button>

        <button
          type="button"
          class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
          :class="props.aqiFilter === 'RAIN'
            ? 'bg-cyan-600 text-white shadow-xs'
            : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20'"
          @click="emit('update:aqiFilter', 'RAIN')"
        >
          <UIcon
            name="i-lucide-cloud-rain"
            class="text-xs"
          />
          Active Rain
        </button>
      </div>
    </div>

    <!-- Table Container -->
    <div class="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 select-none">
            <tr>
              <th
                class="px-4 py-3 font-bold cursor-pointer hover:text-neutral-900 dark:hover:text-white transition-colors"
                @click="emit('toggleSort', 'city')"
              >
                <div class="flex items-center gap-1">
                  <span>City & State</span>
                  <UIcon
                    v-if="props.sortKey === 'city'"
                    :name="props.sortOrder === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'"
                    class="text-xs text-primary"
                  />
                </div>
              </th>

              <th class="px-3 py-3 font-bold">
                Condition
              </th>

              <th
                class="px-3 py-3 font-bold text-right cursor-pointer hover:text-neutral-900 dark:hover:text-white transition-colors"
                @click="emit('toggleSort', 'temp')"
              >
                <div class="flex items-center justify-end gap-1">
                  <span>Temp (°C)</span>
                  <UIcon
                    v-if="props.sortKey === 'temp'"
                    :name="props.sortOrder === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'"
                    class="text-xs text-primary"
                  />
                </div>
              </th>

              <th class="px-3 py-3 font-bold text-right hidden sm:table-cell">
                Feels Like
              </th>

              <th
                class="px-3 py-3 font-bold text-right hidden md:table-cell cursor-pointer hover:text-neutral-900 dark:hover:text-white transition-colors"
                @click="emit('toggleSort', 'humidity')"
              >
                <div class="flex items-center justify-end gap-1">
                  <span>Humidity</span>
                  <UIcon
                    v-if="props.sortKey === 'humidity'"
                    :name="props.sortOrder === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'"
                    class="text-xs text-primary"
                  />
                </div>
              </th>

              <th
                class="px-3 py-3 font-bold text-right cursor-pointer hover:text-neutral-900 dark:hover:text-white transition-colors"
                @click="emit('toggleSort', 'rain')"
              >
                <div class="flex items-center justify-end gap-1">
                  <span>Rain (mm)</span>
                  <UIcon
                    v-if="props.sortKey === 'rain'"
                    :name="props.sortOrder === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'"
                    class="text-xs text-primary"
                  />
                </div>
              </th>

              <th
                class="px-4 py-3 font-bold text-right cursor-pointer hover:text-neutral-900 dark:hover:text-white transition-colors"
                @click="emit('toggleSort', 'aqi')"
              >
                <div class="flex items-center justify-end gap-1">
                  <span>Air Quality (AQI)</span>
                  <UIcon
                    v-if="props.sortKey === 'aqi'"
                    :name="props.sortOrder === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'"
                    class="text-xs text-primary"
                  />
                </div>
              </th>

              <th class="px-3 py-3 font-bold text-right hidden lg:table-cell">
                PM2.5 (µg/m³)
              </th>

              <th class="px-4 py-3 font-bold text-center">
                Action
              </th>
            </tr>
          </thead>

          <tbody class="divide-y divide-neutral-100 dark:divide-neutral-800/60">
            <tr
              v-for="c in props.cities"
              :key="c.city"
              class="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer group"
              @click="emit('selectCity', c)"
            >
              <!-- City & State -->
              <td class="px-4 py-3">
                <div class="font-bold text-neutral-900 dark:text-white group-hover:text-primary transition-colors">
                  {{ c.city }}
                </div>
                <div class="text-[11px] text-neutral-400">
                  {{ c.state }}
                </div>
              </td>

              <!-- Weather Condition Icon & Text -->
              <td class="px-3 py-3">
                <div class="flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300">
                  <UIcon
                    :name="c.weatherCondition.icon"
                    class="text-base shrink-0 text-primary"
                  />
                  <span class="truncate max-w-[110px] text-[11px]">
                    {{ c.weatherCondition.description }}
                  </span>
                </div>
              </td>

              <!-- Temperature -->
              <td class="px-3 py-3 text-right font-mono font-bold text-neutral-900 dark:text-white">
                {{ c.temperature.toFixed(1) }}°
              </td>

              <!-- Feels Like -->
              <td class="px-3 py-3 text-right font-mono text-neutral-500 hidden sm:table-cell">
                {{ c.apparentTemperature.toFixed(1) }}°
              </td>

              <!-- Humidity -->
              <td class="px-3 py-3 text-right font-mono text-neutral-600 dark:text-neutral-400 hidden md:table-cell">
                {{ c.relativeHumidity }}%
              </td>

              <!-- Rain -->
              <td class="px-3 py-3 text-right font-mono">
                <span
                  v-if="c.precipitation > 0"
                  class="text-cyan-600 dark:text-cyan-400 font-bold"
                >
                  {{ c.precipitation.toFixed(1) }} mm
                </span>
                <span
                  v-else
                  class="text-neutral-400"
                >
                  0.0
                </span>
              </td>

              <!-- AQI Badge -->
              <td class="px-4 py-3 text-right">
                <WeatherAqiBadge
                  :aqi="c.usAqi"
                  :category="c.aqiCategory"
                  size="xs"
                />
              </td>

              <!-- PM2.5 -->
              <td class="px-3 py-3 text-right font-mono text-neutral-600 dark:text-neutral-400 hidden lg:table-cell">
                {{ c.pm25.toFixed(1) }}
              </td>

              <!-- Detail Action -->
              <td class="px-4 py-3 text-center">
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-chevron-right"
                  class="group-hover:translate-x-0.5 transition-transform"
                  aria-label="View City Analysis"
                  @click.stop="emit('selectCity', c)"
                />
              </td>
            </tr>

            <tr v-if="props.cities.length === 0">
              <td
                colspan="9"
                class="px-4 py-12 text-center text-neutral-400 text-xs"
              >
                No cities found matching your current filter criteria.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
