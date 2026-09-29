<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useWeather } from '~/composables/useWeather'
import WeatherDashboardTab from '~/components/weather/WeatherDashboardTab.vue'
import WeatherPulseRibbon from '~/components/weather/WeatherPulseRibbon.vue'
import WeatherCityTable from '~/components/weather/WeatherCityTable.vue'
import WeatherCityDetailModal from '~/components/weather/WeatherCityDetailModal.vue'
import WeatherMarketWidget from '~/components/weather/WeatherMarketWidget.vue'
import WeatherComparisonView from '~/components/weather/WeatherComparisonView.vue'

definePageMeta({
  layout: 'default'
})

// Tab navigation: 'dashboard' (Executive Overview) | 'matrix' (Live Matrix & Directory) | 'comparison' (Multi-City Comparator)
const activeTab = ref<'dashboard' | 'matrix' | 'comparison'>('dashboard')

const {
  cities,
  pulse,
  selectedCity,
  historyData,
  statsData,
  nationalTrends,
  isLoading,
  isHistoryLoading,
  isStatsLoading,
  isTrendsLoading,
  isModalOpen,
  error,
  searchQuery,
  selectedState,
  aqiFilter,
  sortKey,
  sortOrder,
  selectedRange,
  availableStates,
  filteredCities,
  fetchLatest,
  fetchNationalTrends,
  openCityModal,
  changeRange,
  toggleSort
} = useWeather()

onMounted(async () => {
  if (cities.value.length === 0) {
    await fetchLatest()
  }
  if (nationalTrends.value.length === 0) {
    await fetchNationalTrends(24)
  }
})

const showMacroInsights = ref(false)

function handleSelectCityByName(cityName: string) {
  const found = cities.value.find(c => c.city.toLowerCase() === cityName.toLowerCase())
  if (found) {
    openCityModal(found)
  }
}

function handleJumpToMatrix(filter?: { aqiFilter?: 'ALL' | 'GOOD' | 'MODERATE' | 'POOR' | 'SEVERE' | 'RAIN'; state?: string }) {
  if (filter?.aqiFilter) {
    aqiFilter.value = filter.aqiFilter
  }
  if (filter?.state) {
    selectedState.value = filter.state
  }
  activeTab.value = 'matrix'
}
</script>

<template>
  <div class="w-full px-3 sm:px-6 py-4 sm:py-5 space-y-4">
    <!-- Tab Navigation Bar -->
    <div class="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
      <div class="flex items-center gap-2">
        <!-- TAB 1: EXECUTIVE DASHBOARD (DEFAULT) -->
        <button
          type="button"
          class="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all select-none"
          :class="activeTab === 'dashboard' ? 'bg-primary text-white shadow-md' : 'bg-neutral-100 dark:bg-neutral-800/80 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
          @click="activeTab = 'dashboard'"
        >
          <UIcon
            name="i-lucide-layout-dashboard"
            class="h-4 w-4"
          />
          <span>Executive Overview</span>
          <UBadge
            color="primary"
            variant="subtle"
            size="xs"
            class="text-[9px] px-1 py-0"
          >
            Live
          </UBadge>
        </button>

        <!-- TAB 2: LIVE MATRIX DIRECTORY -->
        <button
          type="button"
          class="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all select-none"
          :class="activeTab === 'matrix' ? 'bg-primary text-white shadow-md' : 'bg-neutral-100 dark:bg-neutral-800/80 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
          @click="activeTab = 'matrix'"
        >
          <UIcon
            name="i-lucide-table"
            class="h-4 w-4"
          />
          <span>Live Weather & Matrix</span>
          <span
            v-if="cities.length > 0"
            class="text-[10px] font-normal opacity-80"
          >({{ cities.length }} Cities)</span>
        </button>

        <!-- TAB 3: CITY COMPARISON -->
        <button
          type="button"
          class="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all select-none"
          :class="activeTab === 'comparison' ? 'bg-primary text-white shadow-md' : 'bg-neutral-100 dark:bg-neutral-800/80 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
          @click="activeTab = 'comparison'"
        >
          <UIcon
            name="i-lucide-scale"
            class="h-4 w-4"
          />
          <span>City Comparison</span>
        </button>
      </div>
    </div>

    <!-- TAB 1: EXECUTIVE DASHBOARD (DEFAULT VIEW) -->
    <div
      v-show="activeTab === 'dashboard'"
      class="space-y-4"
    >
      <WeatherDashboardTab
        :cities="cities"
        :pulse="pulse"
        :national-trends="nationalTrends"
        :is-loading="isLoading"
        :is-trends-loading="isTrendsLoading"
        @select-city="openCityModal"
        @select-city-by-name="handleSelectCityByName"
        @refresh="fetchLatest(true)"
        @jump-to-matrix="handleJumpToMatrix"
        @change-trends-hours="fetchNationalTrends"
      />
    </div>

    <!-- TAB 1: EXISTING LIVE WEATHER MATRIX & DIRECTORY (PRESERVED) -->
    <div
      v-show="activeTab === 'matrix'"
      class="space-y-4"
    >
      <!-- Top Environmental Pulse & KPI Ribbon -->
      <WeatherPulseRibbon
        :pulse="pulse"
        :is-loading="isLoading"
        @refresh="fetchLatest(true)"
        @select-city="handleSelectCityByName"
      />

      <!-- Error Banner -->
      <div
        v-if="error"
        class="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-center justify-between"
      >
        <span>{{ error }}</span>
        <UButton
          size="xs"
          color="error"
          variant="ghost"
          @click="fetchLatest(true)"
        >
          Retry
        </UButton>
      </div>

      <!-- Main High-Density City Matrix & Filters -->
      <WeatherCityTable
        :cities="filteredCities"
        :available-states="availableStates"
        :search-query="searchQuery"
        :selected-state="selectedState"
        :aqi-filter="aqiFilter"
        :sort-key="sortKey"
        :sort-order="sortOrder"
        @update:search-query="searchQuery = $event"
        @update:selected-state="selectedState = $event"
        @update:aqi-filter="aqiFilter = $event"
        @toggle-sort="toggleSort"
        @select-city="openCityModal"
      />

      <!-- Optional Collapsible Market Sectoral Correlations -->
      <div class="pt-2 border-t border-neutral-100 dark:border-neutral-800/60">
        <button
          type="button"
          class="inline-flex items-center gap-2 text-xs font-semibold text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors py-1.5 px-3 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800"
          @click="showMacroInsights = !showMacroInsights"
        >
          <UIcon
            :name="showMacroInsights ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
            class="text-xs"
          />
          <UIcon
            name="i-lucide-trending-up"
            class="text-sm text-primary"
          />
          <span>Market & Sectoral Equity Correlation Insights</span>
          <UBadge
            color="neutral"
            variant="subtle"
            size="xs"
            class="text-[9px]"
          >
            Optional Macro
          </UBadge>
        </button>

        <div
          v-if="showMacroInsights"
          class="mt-3"
        >
          <WeatherMarketWidget />
        </div>
      </div>
    </div>

    <!-- TAB 2: MULTI-CITY COMPARISON ENGINE -->
    <div
      v-show="activeTab === 'comparison'"
      class="space-y-4"
    >
      <WeatherComparisonView
        :cities="cities"
        :pulse="pulse"
        @select-city="openCityModal"
      />
    </div>

    <!-- City Deep-Dive Time-Series Modal (Shared across both tabs) -->
    <WeatherCityDetailModal
      :open="isModalOpen"
      :city="selectedCity"
      :history="historyData"
      :stats="statsData"
      :is-loading="isHistoryLoading"
      :is-stats-loading="isStatsLoading"
      :selected-range="selectedRange"
      @update:open="isModalOpen = $event"
      @change-range="changeRange"
    />
  </div>
</template>
