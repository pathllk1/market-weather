<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { MarketWeatherSectorImpact } from '~/types/weather'

const impacts = ref<MarketWeatherSectorImpact[]>([])
const isLoading = ref(false)

async function fetchCorrelations() {
  try {
    isLoading.value = true
    const res = await $fetch<{ success: boolean, data: MarketWeatherSectorImpact[] }>('/api/weather/correlations')
    if (res.success && res.data) {
      impacts.value = res.data
    }
  } catch (err) {
    console.error('Failed to load weather-market correlations:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchCorrelations()
})
</script>

<template>
  <div class="p-4 sm:p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          <UIcon
            name="i-lucide-trending-up"
            class="text-lg"
          />
        </div>
        <div>
          <h3 class="text-sm font-extrabold text-neutral-900 dark:text-white">
            Market & Environmental Cross-Correlation
          </h3>
          <p class="text-xs text-neutral-500">
            Sectoral equity implications driven by regional monsoon spread & temperature extremes
          </p>
        </div>
      </div>
      <UBadge
        color="success"
        variant="subtle"
        size="xs"
        class="font-mono text-[10px]"
      >
        Macro Insights
      </UBadge>
    </div>

    <!-- 3 Sector Cards Grid -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div
        v-for="sec in impacts"
        :key="sec.sector"
        class="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-850 space-y-2.5"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-neutral-900 dark:text-white truncate">
            {{ sec.sector }}
          </span>
          <UBadge
            :color="sec.status === 'positive' ? 'success' : sec.status === 'watch' ? 'warning' : 'neutral'"
            variant="subtle"
            size="xs"
            class="uppercase text-[9px] font-bold font-mono"
          >
            {{ sec.status }}
          </UBadge>
        </div>

        <div class="text-[11px] text-primary font-semibold">
          {{ sec.metric }}
        </div>

        <p class="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
          {{ sec.summary }}
        </p>

        <!-- Stocks affected -->
        <div class="pt-2 border-t border-neutral-200/60 dark:border-neutral-800 space-y-1">
          <span class="text-[10px] uppercase font-bold text-neutral-400 block">
            Correlated Equities
          </span>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="stk in sec.stocks"
              :key="stk.symbol"
              class="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700/60 text-neutral-800 dark:text-neutral-200"
              :title="stk.correlationFactor"
            >
              {{ stk.symbol.replace('.NS', '') }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
