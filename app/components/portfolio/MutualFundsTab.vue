<script setup lang="ts">
import { ref, computed } from 'vue'
import type { MFHolding, MFHoldingsResponse } from '../../types/mutualFunds'
import type { DematAccount } from '../../types/portfolio'
import { useMutualFunds } from '../../composables/useMutualFunds'

const props = defineProps<{
  portfolioId: string
  dematAccounts: DematAccount[]
  holdingsData: MFHoldingsResponse | null
  isLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const { getCategoryBadgeColor } = useMutualFunds()

// Modals
const isLogModalOpen = ref(false)
const isDetailModalOpen = ref(false)
const selectedSchemeCode = ref<number | null>(null)
const selectedHoldingToInvest = ref<{ schemeCode: number; schemeName: string; nav?: number } | null>(null)

// Filtering
const selectedCategory = ref('ALL')
const selectedMode = ref('ALL')

const categoryOptions = computed(() => {
  if (!props.holdingsData?.holdings) return ['ALL']
  const cats = new Set(props.holdingsData.holdings.map(h => h.category).filter(Boolean))
  return ['ALL', ...Array.from(cats)]
})

const filteredHoldings = computed(() => {
  if (!props.holdingsData?.holdings) return []
  return props.holdingsData.holdings.filter(h => {
    const matchCat = selectedCategory.value === 'ALL' || h.category === selectedCategory.value
    const matchMode = selectedMode.value === 'ALL' || h.holdingMode === selectedMode.value
    return matchCat && matchMode
  })
})

function openFundChart(schemeCode: number) {
  selectedSchemeCode.value = schemeCode
  isDetailModalOpen.value = true
}

function openInvestHolding(h: MFHolding) {
  selectedHoldingToInvest.value = {
    schemeCode: h.schemeCode,
    schemeName: h.schemeName,
    nav: h.currentNav
  }
  isLogModalOpen.value = true
}

function openNewInvest() {
  selectedHoldingToInvest.value = null
  isLogModalOpen.value = true
}

function handleInvestFromDetail(schemeCode: number) {
  isDetailModalOpen.value = false
  const found = props.holdingsData?.holdings.find(h => h.schemeCode === schemeCode)
  selectedHoldingToInvest.value = {
    schemeCode,
    schemeName: found?.schemeName || `Scheme #${schemeCode}`,
    nav: found?.currentNav
  }
  isLogModalOpen.value = true
}

function fmtCur(val: number) {
  return '₹' + (val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
</script>

<template>
  <div class="space-y-6">
    <!-- 1. MUTUAL FUNDS EXECUTIVE METRICS STRIP -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Total MF Valuation -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-1.5 shadow-xs">
        <div class="flex items-center justify-between text-neutral-400">
          <span class="text-xs font-semibold uppercase tracking-wider">MF Portfolio Valuation</span>
          <UIcon name="i-lucide-wallet" class="h-4 w-4 text-primary" />
        </div>
        <div class="text-2xl font-black font-mono text-neutral-900 dark:text-white">
          {{ fmtCur(holdingsData?.totalMFCurrentValue || 0) }}
        </div>
        <div class="text-xs font-mono" :class="(holdingsData?.totalMFPnL || 0) >= 0 ? 'text-emerald-500 font-semibold' : 'text-rose-500 font-semibold'">
          {{ (holdingsData?.totalMFPnL || 0) >= 0 ? '+' : '' }}{{ fmtCur(holdingsData?.totalMFPnL || 0) }}
          ({{ (holdingsData?.totalMFReturnPct || 0) >= 0 ? '+' : '' }}{{ (holdingsData?.totalMFReturnPct || 0).toFixed(2) }}%)
        </div>
      </div>

      <!-- Total Invested in MFs -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-1.5 shadow-xs">
        <div class="flex items-center justify-between text-neutral-400">
          <span class="text-xs font-semibold uppercase tracking-wider">Total Capital Invested</span>
          <UIcon name="i-lucide-landmark" class="h-4 w-4 text-emerald-500" />
        </div>
        <div class="text-2xl font-black font-mono text-neutral-900 dark:text-white">
          {{ fmtCur(holdingsData?.totalMFInvested || 0) }}
        </div>
        <div class="text-xs text-neutral-400">
          SIP & Lumpsum Inflows
        </div>
      </div>

      <!-- Active Schemes Count -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-1.5 shadow-xs">
        <div class="flex items-center justify-between text-neutral-400">
          <span class="text-xs font-semibold uppercase tracking-wider">Active MF Schemes</span>
          <UIcon name="i-lucide-layers" class="h-4 w-4 text-indigo-500" />
        </div>
        <div class="text-2xl font-black font-mono text-neutral-900 dark:text-white">
          {{ holdingsData?.holdings.length || 0 }}
        </div>
        <div class="text-xs text-neutral-400">
          Across {{ categoryOptions.length - 1 }} Asset Categories
        </div>
      </div>

      <!-- Overall Performance -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-1.5 shadow-xs">
        <div class="flex items-center justify-between text-neutral-400">
          <span class="text-xs font-semibold uppercase tracking-wider">Average Fund Return</span>
          <UIcon name="i-lucide-trending-up" class="h-4 w-4 text-emerald-500" />
        </div>
        <div class="text-2xl font-black font-mono" :class="(holdingsData?.totalMFReturnPct || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'">
          {{ (holdingsData?.totalMFReturnPct || 0) >= 0 ? '+' : '' }}{{ (holdingsData?.totalMFReturnPct || 0).toFixed(2) }}%
        </div>
        <div class="text-xs text-neutral-400">
          Unrealized Profit on Cost
        </div>
      </div>
    </div>

    <!-- 2. ACTIONS BAR & CATEGORY SLICER -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-neutral-900 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-xs font-bold text-neutral-500 uppercase tracking-wider mr-1">Category:</span>
        <button
          v-for="cat in categoryOptions"
          :key="cat"
          type="button"
          class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
          :class="selectedCategory === cat
            ? 'bg-primary text-white shadow-xs'
            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'"
          @click="selectedCategory = cat"
        >
          {{ cat }}
        </button>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          color="primary"
          icon="i-lucide-plus"
          size="sm"
          class="cursor-pointer"
          @click="openNewInvest"
        >
          Record SIP / Lumpsum
        </UButton>
      </div>
    </div>

    <!-- 3. MUTUAL FUNDS HOLDINGS TABLE -->
    <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs overflow-hidden">
      <!-- Loading State -->
      <div v-if="isLoading" class="py-16 text-center">
        <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-primary mx-auto" />
        <p class="text-xs text-neutral-400 mt-2">Loading mutual fund holdings...</p>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="!holdingsData?.holdings || holdingsData.holdings.length === 0"
        class="py-16 px-6 text-center max-w-md mx-auto space-y-4"
      >
        <div class="h-16 w-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
          <UIcon name="i-lucide-pie-chart" class="h-8 w-8" />
        </div>
        <div class="space-y-1">
          <h4 class="font-bold text-base text-neutral-900 dark:text-white">No Mutual Funds Added Yet</h4>
          <p class="text-xs text-neutral-400">
            Track your SIPs and lumpsum investments with automatic daily AMFI NAV updates powered by MFAPI.in.
          </p>
        </div>
        <UButton
          color="primary"
          icon="i-lucide-plus"
          size="md"
          @click="isLogModalOpen = true"
        >
          Record First SIP Investment
        </UButton>
      </div>

      <!-- Holdings Table -->
      <div v-else class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-neutral-100 dark:border-neutral-800 text-[11px] font-bold uppercase tracking-wider text-neutral-400 bg-neutral-50/50 dark:bg-neutral-800/30">
              <th class="p-4 pl-6">Scheme Name & Category</th>
              <th class="p-4 text-right">Units Held</th>
              <th class="p-4 text-right">Avg NAV / Current NAV</th>
              <th class="p-4 text-right">Invested Capital</th>
              <th class="p-4 text-right">Current Valuation</th>
              <th class="p-4 text-right">Unrealized P&L</th>
              <th class="p-4 text-center pr-6">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
            <tr
              v-for="h in filteredHoldings"
              :key="h.schemeCode"
              class="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40 transition-colors"
            >
              <!-- Scheme Info -->
              <td class="p-4 pl-6">
                <div class="space-y-1">
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="font-bold text-neutral-900 dark:text-white hover:text-primary transition-colors text-left line-clamp-1 cursor-pointer"
                      @click="openFundChart(h.schemeCode)"
                    >
                      {{ h.schemeName }}
                    </button>
                    <UBadge :color="getCategoryBadgeColor(h.category)" variant="subtle" size="xs">
                      {{ h.category }}
                    </UBadge>
                  </div>
                  <div class="flex items-center gap-2 text-[11px] text-neutral-400">
                    <span>{{ h.amcName }}</span>
                    <span>•</span>
                    <span class="font-mono">#{{ h.schemeCode }}</span>
                    <span v-if="h.brokerName" class="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[10px] font-medium text-neutral-500">
                      {{ h.brokerName }}
                    </span>
                    <span v-if="h.folioNumber" class="font-mono text-[10px]">
                      Folio: {{ h.folioNumber }}
                    </span>
                  </div>
                </div>
              </td>

              <!-- Units -->
              <td class="p-4 text-right font-mono font-medium text-neutral-800 dark:text-neutral-200">
                {{ h.totalUnits.toFixed(4) }}
              </td>

              <!-- Avg NAV vs Current NAV -->
              <td class="p-4 text-right font-mono space-y-0.5">
                <div class="font-bold text-neutral-900 dark:text-white">
                  ₹{{ h.currentNav.toFixed(4) }}
                </div>
                <div class="text-[11px] text-neutral-400">
                  Avg: ₹{{ h.avgNav.toFixed(4) }}
                </div>
              </td>

              <!-- Invested Capital -->
              <td class="p-4 text-right font-mono font-semibold text-neutral-900 dark:text-white">
                {{ fmtCur(h.totalInvested) }}
              </td>

              <!-- Current Valuation -->
              <td class="p-4 text-right font-mono font-bold text-neutral-900 dark:text-white">
                {{ fmtCur(h.currentValue) }}
                <div class="text-[10px] text-neutral-400 font-normal">
                  {{ h.allocationPct }}% of MF Portfolio
                </div>
              </td>

              <!-- P&L -->
              <td class="p-4 text-right font-mono font-bold space-y-0.5" :class="h.unrealizedPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'">
                <div>{{ h.unrealizedPnL >= 0 ? '+' : '' }}{{ fmtCur(h.unrealizedPnL) }}</div>
                <div class="text-[11px]">
                  {{ h.unrealizedPnLPct >= 0 ? '+' : '' }}{{ h.unrealizedPnLPct.toFixed(2) }}%
                </div>
              </td>

              <!-- Action Buttons -->
              <td class="p-4 text-right pr-6">
                <div class="flex items-center justify-end gap-1.5">
                  <UButton
                    color="primary"
                    size="xs"
                    icon="i-lucide-plus"
                    @click="openInvestHolding(h)"
                  >
                    + Invest
                  </UButton>
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-line-chart"
                    title="Inspect Historical NAV Chart"
                    @click="openFundChart(h.schemeCode)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modals -->
    <PortfolioLogMFTransactionModal
      v-model="isLogModalOpen"
      :portfolio-id="portfolioId"
      :demat-accounts="dematAccounts"
      :default-scheme="selectedHoldingToInvest"
      @saved="$emit('refresh')"
    />

    <MfFundDetailModal
      v-model="isDetailModalOpen"
      :scheme-code="selectedSchemeCode"
      @invest="handleInvestFromDetail"
    />
  </div>
</template>
