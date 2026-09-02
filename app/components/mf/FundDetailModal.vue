<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { createChart, AreaSeries, ColorType, LineStyle, CrosshairMode } from 'lightweight-charts'
import type { MFDetailResponse } from '../../types/mutualFunds'
import { useMutualFunds } from '../../composables/useMutualFunds'

const props = defineProps<{
  modelValue: boolean
  schemeCode: number | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'invest', schemeCode: number, schemeName: string): void
}>()

const isOpen = ref(props.modelValue)
watch(() => props.modelValue, (val) => { isOpen.value = val })
watch(isOpen, (val) => { emit('update:modelValue', val) })

const { fetchFundDetails, getCategoryBadgeColor } = useMutualFunds()

const isLoading = ref(false)
const fundData = ref<MFDetailResponse | null>(null)
const chartContainer = ref<HTMLDivElement | null>(null)
let chart: any = null
let areaSeries: any = null

watch(() => props.schemeCode, (newCode) => {
  if (newCode && isOpen.value) {
    loadFund()
  }
})

watch(isOpen, (val) => {
  if (val && props.schemeCode) {
    loadFund()
  } else {
    cleanupChart()
  }
})

async function loadFund() {
  if (!props.schemeCode) return
  try {
    isLoading.value = true
    fundData.value = await fetchFundDetails(props.schemeCode)
    await nextTick()
    renderChart()
  } finally {
    isLoading.value = false
  }
}

function cleanupChart() {
  if (chart) {
    chart.remove()
    chart = null
    areaSeries = null
  }
}

function renderChart() {
  if (!chartContainer.value || !fundData.value?.chartPoints || fundData.value.chartPoints.length === 0) return
  cleanupChart()

  const isDark = document.documentElement.classList.contains('dark')

  chart = createChart(chartContainer.value, {
    width: chartContainer.value.clientWidth,
    height: 280,
    layout: {
      background: { type: ColorType.Solid, color: isDark ? '#171717' : '#ffffff' },
      textColor: isDark ? '#a3a3a3' : '#525252',
      fontFamily: 'Inter, system-ui, sans-serif'
    },
    grid: {
      vertLines: { color: isDark ? '#262626' : '#f1f5f9' },
      horzLines: { color: isDark ? '#262626' : '#f1f5f9' }
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: isDark ? '#525252' : '#cbd5e1', width: 1, style: LineStyle.Dashed },
      horzLine: { color: isDark ? '#525252' : '#cbd5e1', width: 1, style: LineStyle.Dashed }
    },
    rightPriceScale: {
      borderColor: isDark ? '#262626' : '#e2e8f0',
      scaleMargins: { top: 0.1, bottom: 0.1 },
      autoScale: true
    },
    timeScale: {
      borderColor: isDark ? '#262626' : '#e2e8f0',
      rightOffset: 6,
      barSpacing: 10,
      minBarSpacing: 3,
      fixLeftEdge: true
    }
  })

  areaSeries = chart.addSeries(AreaSeries, {
    topColor: 'rgba(99, 102, 241, 0.45)',
    bottomColor: 'rgba(99, 102, 241, 0.02)',
    lineColor: '#6366f1',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: true,
    priceFormat: {
      type: 'custom',
      formatter: (p: number) => '₹' + p.toFixed(2)
    }
  })

  areaSeries.setData(fundData.value.chartPoints)
  chart.timeScale().fitContent()
}

function handleInvestClick() {
  if (!fundData.value) return
  emit('invest', fundData.value.meta.scheme_code, fundData.value.meta.scheme_name)
  isOpen.value = false
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :ui="{
      content: 'sm:max-w-4xl w-[calc(100vw-2rem)] max-h-[92vh] flex flex-col',
      body: 'p-5 sm:p-6 overflow-y-auto space-y-4'
    }"
  >
    <template #header>
      <div v-if="fundData" class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full pr-4">
        <div>
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="font-bold text-base sm:text-lg text-neutral-900 dark:text-white">
              {{ fundData.meta.scheme_name }}
            </h3>
            <UBadge :color="getCategoryBadgeColor(fundData.meta.scheme_category)" variant="subtle" size="xs">
              {{ fundData.meta.scheme_category }}
            </UBadge>
          </div>
          <p class="text-xs text-neutral-400 mt-0.5">
            {{ fundData.meta.fund_house }} • AMFI Code: {{ fundData.meta.scheme_code }}
          </p>
        </div>

        <div class="flex items-center gap-3">
          <div class="text-right">
            <div class="text-lg font-mono font-bold text-neutral-900 dark:text-white">
              ₹{{ fundData.latestNAV.toFixed(4) }}
            </div>
            <div class="text-[11px] text-neutral-400 font-mono">
              NAV Date: {{ fundData.latestDate }}
            </div>
          </div>

          <button
            type="button"
            class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-all cursor-pointer whitespace-nowrap active:scale-95"
            @click="handleInvestClick"
          >
            <UIcon name="i-lucide-plus" class="h-4 w-4" />
            <span>Invest</span>
          </button>
        </div>
      </div>
      <div v-else-if="isLoading" class="flex items-center gap-2">
        <UIcon name="i-lucide-loader-2" class="animate-spin text-primary" />
        <span class="text-xs font-medium text-neutral-400">Loading fund intelligence...</span>
      </div>
    </template>

    <template #body>
      <div v-if="isLoading && !fundData" class="py-16 text-center">
        <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-primary mx-auto" />
      </div>

      <div v-else-if="fundData" class="space-y-5">
        <!-- Trailing Returns Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <div
            v-for="(val, period) in fundData.trailingReturns"
            :key="period"
            class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 p-2.5 text-center space-y-0.5"
          >
            <div class="text-[10px] uppercase font-bold text-neutral-400">{{ period }} Return</div>
            <div
              class="text-sm font-mono font-black"
              :class="val === null ? 'text-neutral-400' : (val >= 0 ? 'text-emerald-500' : 'text-rose-500')"
            >
              {{ val !== null ? `${val >= 0 ? '+' : ''}${val}%` : 'N/A' }}
            </div>
            <div class="text-[9px] text-neutral-400">
              {{ ['3Y', '5Y'].includes(String(period)) ? 'Annualized CAGR' : 'Absolute' }}
            </div>
          </div>
        </div>

        <!-- Historical NAV Canvas Chart Card -->
        <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-3 shadow-xs">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-line-chart" class="h-4 w-4 text-primary" />
              <span class="text-xs font-bold text-neutral-900 dark:text-white">Historical Net Asset Value (NAV) Curve</span>
            </div>
            <span class="text-[10px] font-mono text-neutral-400">Full Inception History</span>
          </div>

          <div ref="chartContainer" class="w-full h-[280px] relative" />
        </div>
      </div>
    </template>
  </UModal>
</template>
