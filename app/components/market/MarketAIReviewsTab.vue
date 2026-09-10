<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { AIReviewsListResponse } from '../../types/market'

const emit = defineEmits<{
  (e: 'open-stock', symbol: string): void
}>()

const isLoading = ref(true)
const isRefreshing = ref(false)
const errorMsg = ref<string | null>(null)
const data = ref<AIReviewsListResponse | null>(null)

const searchQuery = ref('')
const selectedRating = ref('all')
const sortBy = ref('ai_score')
const sortOrder = ref<'asc' | 'desc'>('desc')
const viewMode = ref<'grid' | 'table'>('grid')

async function loadAIReviews(force = false) {
  if (force) isRefreshing.value = true
  else isLoading.value = true
  errorMsg.value = null

  try {
    const res = await $fetch<AIReviewsListResponse>('/api/market/ai-reviews', {
      query: {
        search: searchQuery.value || undefined,
        rating: selectedRating.value !== 'all' ? selectedRating.value : undefined,
        sortBy: sortBy.value,
        sortOrder: sortOrder.value,
        limit: 100
      }
    })
    data.value = res
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string }, message?: string }
    errorMsg.value = fetchErr?.data?.statusMessage || fetchErr?.message || 'Failed to load AI reviews'
  } finally {
    isLoading.value = false
    isRefreshing.value = false
  }
}

onMounted(() => {
  loadAIReviews()
})

const filteredReviews = computed(() => {
  if (!data.value?.reviews) return []
  return data.value.reviews
})

function getScoreColor(score: number) {
  if (score >= 75) return 'text-emerald-500'
  if (score >= 56) return 'text-teal-500'
  if (score >= 45) return 'text-amber-500'
  if (score >= 25) return 'text-orange-500'
  return 'text-rose-500'
}

function getScoreBg(score: number) {
  if (score >= 75) return 'border-emerald-500/30 bg-emerald-500/5'
  if (score >= 56) return 'border-teal-500/30 bg-teal-500/5'
  if (score >= 45) return 'border-amber-500/30 bg-amber-500/5'
  if (score >= 25) return 'border-orange-500/30 bg-orange-500/5'
  return 'border-rose-500/30 bg-rose-500/5'
}

function getRatingBadgeColor(rating: string): 'success' | 'primary' | 'warning' | 'error' | 'neutral' {
  if (rating === 'Strong Bullish') return 'success'
  if (rating === 'Bullish') return 'primary'
  if (rating === 'Neutral') return 'warning'
  if (rating === 'Bearish') return 'error'
  if (rating === 'Strong Bearish') return 'error'
  return 'neutral'
}

function fmtCur(val?: number) {
  if (val === undefined || val === null || isNaN(val)) return 'N/A'
  return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const ratingFilterOptions = [
  { id: 'all', label: 'All Ratings' },
  { id: 'Strong Bullish', label: 'Strong Bullish (76-100)' },
  { id: 'Bullish', label: 'Bullish (56-75)' },
  { id: 'Neutral', label: 'Neutral (45-55)' },
  { id: 'Bearish', label: 'Bearish (25-44)' },
  { id: 'Strong Bearish', label: 'Strong Bearish (0-24)' }
]

const sortOptions = [
  { value: 'ai_score', label: 'AI Score (High to Low)' },
  { value: 'algorithmic_score', label: 'Algorithmic Score' },
  { value: 'current_price', label: 'Stock Price' },
  { value: 'updated_at', label: 'Last Evaluated' },
  { value: 'symbol', label: 'Symbol Name' }
]

function handleSortChange(newVal: string) {
  sortBy.value = newVal
  loadAIReviews()
}

function handleRatingChange(newRating: string) {
  selectedRating.value = newRating
  loadAIReviews()
}
</script>

<template>
  <div class="space-y-4">
    <!-- Top Stats Banner -->
    <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
      <!-- Total Evaluated -->
      <div class="p-3.5 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 shadow-2xs flex items-center gap-3">
        <div class="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <UIcon
            name="i-lucide-sparkles"
            class="h-5 w-5"
          />
        </div>
        <div>
          <div class="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
            Total AI Evaluated
          </div>
          <div class="text-lg font-black text-neutral-900 dark:text-white">
            {{ data?.stats.total ?? 0 }} <span class="text-xs font-normal text-neutral-400">Stocks</span>
          </div>
        </div>
      </div>

      <!-- Bullish Reviews -->
      <div class="p-3.5 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 shadow-2xs flex items-center gap-3">
        <div class="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
          <UIcon
            name="i-lucide-flame"
            class="h-5 w-5"
          />
        </div>
        <div>
          <div class="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
            Bullish Confluence
          </div>
          <div class="text-lg font-black text-emerald-500">
            {{ data?.stats.bullishCount ?? 0 }}
          </div>
        </div>
      </div>

      <!-- Neutral / Bearish -->
      <div class="p-3.5 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 shadow-2xs flex items-center gap-3">
        <div class="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
          <UIcon
            name="i-lucide-scale"
            class="h-5 w-5"
          />
        </div>
        <div>
          <div class="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
            Neutral / Bearish
          </div>
          <div class="text-lg font-black text-neutral-700 dark:text-neutral-300">
            {{ (data?.stats.neutralCount ?? 0) + (data?.stats.bearishCount ?? 0) }}
          </div>
        </div>
      </div>

      <!-- Average AI Score -->
      <div class="p-3.5 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 shadow-2xs flex items-center gap-3">
        <div class="h-10 w-10 rounded-xl bg-teal-500/10 text-teal-500 flex items-center justify-center shrink-0">
          <UIcon
            name="i-lucide-gauge"
            class="h-5 w-5"
          />
        </div>
        <div>
          <div class="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
            Average AI Score
          </div>
          <div class="text-lg font-black text-teal-500">
            {{ data?.stats.avgAiScore ?? 0 }}<span class="text-xs font-normal text-neutral-400">/100</span>
          </div>
        </div>
      </div>

      <!-- Automation Status -->
      <div class="p-3.5 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 shadow-2xs col-span-2 sm:col-span-4 lg:col-span-1 flex items-center justify-between lg:flex-col lg:items-start lg:justify-center">
        <div>
          <div class="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>GitHub Cron Sync</span>
          </div>
          <div class="text-xs font-semibold text-neutral-900 dark:text-white mt-0.5">
            {{ data?.stats.lastRunTime ? `Updated at ${data.stats.lastRunTime}` : 'Automated Daily' }}
          </div>
        </div>
        <UButton
          size="xs"
          variant="soft"
          color="primary"
          icon="i-lucide-refresh-cw"
          :loading="isRefreshing"
          @click="loadAIReviews(true)"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <!-- Filter & Search Toolbar -->
    <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-2xl bg-neutral-100/50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700/60">
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
        <!-- Search Input -->
        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          placeholder="Filter by symbol or company name..."
          size="sm"
          class="sm:max-w-xs"
          @keyup.enter="loadAIReviews()"
        />

        <!-- Rating Filter Pills -->
        <div class="flex items-center gap-1 overflow-x-auto scrollbar-none py-1">
          <button
            v-for="opt in ratingFilterOptions"
            :key="opt.id"
            type="button"
            class="px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all select-none"
            :class="selectedRating === opt.id ? 'bg-primary text-white shadow-xs' : 'bg-neutral-200/60 dark:bg-neutral-700/60 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'"
            @click="handleRatingChange(opt.id)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- Right controls: Sort & View Toggle -->
      <div class="flex items-center gap-2 self-end sm:self-auto">
        <select
          :value="sortBy"
          class="text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary"
          @change="handleSortChange(($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="opt in sortOptions"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </option>
        </select>

        <!-- View Mode Switcher -->
        <div class="inline-flex rounded-xl p-0.5 border border-neutral-200 dark:border-neutral-700 bg-neutral-200/50 dark:bg-neutral-800/80">
          <button
            type="button"
            class="p-1 rounded-lg transition-all"
            :class="viewMode === 'grid' ? 'bg-white dark:bg-neutral-700 text-primary shadow-xs' : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'"
            title="Grid Cards"
            @click="viewMode = 'grid'"
          >
            <UIcon
              name="i-lucide-layout-grid"
              class="h-4 w-4"
            />
          </button>
          <button
            type="button"
            class="p-1 rounded-lg transition-all"
            :class="viewMode === 'table' ? 'bg-white dark:bg-neutral-700 text-primary shadow-xs' : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'"
            title="Data Table"
            @click="viewMode = 'table'"
          >
            <UIcon
              name="i-lucide-table"
              class="h-4 w-4"
            />
          </button>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div
      v-if="isLoading"
      class="py-20 text-center space-y-3"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="animate-spin text-3xl text-primary mx-auto"
      />
      <p class="text-xs font-medium text-neutral-400">
        Loading AI Technical Reviews from Database...
      </p>
    </div>

    <!-- Error State -->
    <div
      v-else-if="errorMsg"
      class="py-12 text-center space-y-3"
    >
      <div class="h-12 w-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
        <UIcon
          name="i-lucide-alert-circle"
          class="h-6 w-6"
        />
      </div>
      <p class="text-sm font-bold text-rose-500">
        {{ errorMsg }}
      </p>
      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        @click="loadAIReviews()"
      >
        Retry
      </UButton>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="filteredReviews.length === 0"
      class="py-16 text-center space-y-3 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8"
    >
      <div class="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
        <UIcon
          name="i-lucide-sparkles"
          class="h-6 w-6"
        />
      </div>
      <div class="space-y-1">
        <p class="text-sm font-bold text-neutral-900 dark:text-white">
          No AI Reviews Found
        </p>
        <p class="text-xs text-neutral-400 max-w-md mx-auto">
          No stocks match the selected filter. Stocks with internal score ≥ 60 are automatically evaluated by the GitHub Actions cron after market close.
        </p>
      </div>
    </div>

    <!-- 1. GRID CARDS VIEW -->
    <div
      v-else-if="viewMode === 'grid'"
      class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5"
    >
      <div
        v-for="item in filteredReviews"
        :key="item.symbol"
        class="rounded-2xl border p-4 bg-white/70 dark:bg-neutral-900/60 backdrop-blur-sm transition-all hover:shadow-md hover:border-primary/40 flex flex-col justify-between space-y-3"
        :class="getScoreBg(item.aiScore)"
      >
        <!-- Header: Stock identity + Score Meter -->
        <div class="flex items-start justify-between gap-3">
          <div class="space-y-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-extrabold text-sm text-neutral-900 dark:text-white tracking-tight truncate">
                {{ item.symbol }}
              </span>
              <UBadge
                :color="getRatingBadgeColor(item.aiRating)"
                variant="subtle"
                size="xs"
                class="font-semibold"
              >
                {{ item.aiRating }}
              </UBadge>
            </div>
            <div class="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
              {{ item.companyName }}
            </div>
            <div class="text-xs font-bold text-neutral-900 dark:text-white pt-0.5">
              {{ fmtCur(item.currentPrice) }}
            </div>
          </div>

          <!-- Hero AI Score Badge -->
          <div class="text-right shrink-0 flex flex-col items-center">
            <div
              class="h-12 w-12 rounded-2xl border-2 flex flex-col items-center justify-center font-mono font-black text-base shadow-2xs"
              :class="[getScoreColor(item.aiScore), getScoreBg(item.aiScore)]"
            >
              {{ item.aiScore }}
            </div>
            <span class="text-[9px] uppercase tracking-wider text-neutral-400 font-bold mt-1">AI Score</span>
          </div>
        </div>

        <!-- Consensus Delta Bar -->
        <div class="p-2.5 rounded-xl bg-neutral-100/80 dark:bg-neutral-800/70 border border-neutral-200/70 dark:border-neutral-700/50 flex items-center justify-between text-[11px]">
          <div class="flex items-center gap-1.5">
            <span class="text-neutral-500 dark:text-neutral-400">Algo Score:</span>
            <span class="font-bold text-neutral-800 dark:text-neutral-200">{{ item.algorithmicScore }}</span>
          </div>

          <div class="flex items-center gap-1.5">
            <span class="text-neutral-500 dark:text-neutral-400">Consensus:</span>
            <span
              class="font-bold font-mono"
              :class="item.aiScore >= item.algorithmicScore ? 'text-emerald-500' : 'text-rose-500'"
            >
              {{ item.aiScore - item.algorithmicScore >= 0 ? '+' : '' }}{{ item.aiScore - item.algorithmicScore }}
            </span>
          </div>

          <div class="text-neutral-400 text-[10px]">
            {{ item.confidence }} Conf
          </div>
        </div>

        <!-- Executive Summary Snippet -->
        <p class="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed line-clamp-2 italic">
          "{{ item.executiveSummary }}"
        </p>

        <!-- Technical Key Levels Preview -->
        <div class="grid grid-cols-3 gap-1.5 text-center text-[10px] p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/50 dark:border-neutral-700/40">
          <div>
            <span class="text-neutral-400 block">Support</span>
            <span class="font-bold text-emerald-500 font-mono">{{ fmtCur(item.technicalLevels.support1) }}</span>
          </div>
          <div>
            <span class="text-neutral-400 block">Resistance</span>
            <span class="font-bold text-rose-500 font-mono">{{ fmtCur(item.technicalLevels.resistance1) }}</span>
          </div>
          <div>
            <span class="text-neutral-400 block">Stop Loss</span>
            <span class="font-bold text-amber-500 font-mono">{{ fmtCur(item.technicalLevels.stopLoss) }}</span>
          </div>
        </div>

        <!-- Card Footer -->
        <div class="pt-1 flex items-center justify-between gap-2 border-t border-neutral-200/50 dark:border-neutral-700/40 text-[10px]">
          <span class="text-neutral-400 font-mono truncate">
            {{ item.modelUsed }}
          </span>
          <UButton
            size="xs"
            color="primary"
            variant="ghost"
            icon="i-lucide-arrow-right"
            trailing
            class="font-bold cursor-pointer"
            @click="emit('open-stock', item.symbol)"
          >
            Full Review
          </UButton>
        </div>
      </div>
    </div>

    <!-- 2. DATA TABLE VIEW -->
    <div
      v-else-if="viewMode === 'table'"
      class="rounded-2xl border border-neutral-200 dark:border-neutral-700/80 overflow-hidden shadow-2xs"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-neutral-100 dark:bg-neutral-800/80 text-neutral-500 dark:text-neutral-400 font-semibold border-b border-neutral-200 dark:border-neutral-700">
            <tr>
              <th class="py-3 px-4">
                Equity
              </th>
              <th class="py-3 px-3">
                Price
              </th>
              <th class="py-3 px-3 text-center">
                AI Score
              </th>
              <th class="py-3 px-3">
                AI Rating
              </th>
              <th class="py-3 px-3 text-center">
                Algo Score
              </th>
              <th class="py-3 px-3">
                Key Levels (S1 / R1)
              </th>
              <th class="py-3 px-3">
                Confidence
              </th>
              <th class="py-3 px-4 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-200 dark:divide-neutral-700/60 bg-white dark:bg-neutral-900">
            <tr
              v-for="item in filteredReviews"
              :key="item.symbol"
              class="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
            >
              <td class="py-3 px-4">
                <div class="font-bold text-neutral-900 dark:text-white">
                  {{ item.symbol }}
                </div>
                <div class="text-[11px] text-neutral-400 truncate max-w-xs">
                  {{ item.companyName }}
                </div>
              </td>
              <td class="py-3 px-3 font-semibold text-neutral-900 dark:text-white">
                {{ fmtCur(item.currentPrice) }}
              </td>
              <td class="py-3 px-3 text-center">
                <span
                  class="font-black font-mono px-2 py-0.5 rounded-lg border text-xs"
                  :class="[getScoreColor(item.aiScore), getScoreBg(item.aiScore)]"
                >
                  {{ item.aiScore }}
                </span>
              </td>
              <td class="py-3 px-3">
                <UBadge
                  :color="getRatingBadgeColor(item.aiRating)"
                  variant="subtle"
                  size="xs"
                >
                  {{ item.aiRating }}
                </UBadge>
              </td>
              <td class="py-3 px-3 text-center font-mono font-bold text-neutral-700 dark:text-neutral-300">
                {{ item.algorithmicScore }}
              </td>
              <td class="py-3 px-3 font-mono text-[11px]">
                <span class="text-emerald-500 font-semibold">{{ fmtCur(item.technicalLevels.support1) }}</span>
                <span class="text-neutral-400 mx-1">/</span>
                <span class="text-rose-500 font-semibold">{{ fmtCur(item.technicalLevels.resistance1) }}</span>
              </td>
              <td class="py-3 px-3 text-neutral-500 dark:text-neutral-400">
                {{ item.confidence }}
              </td>
              <td class="py-3 px-4 text-right">
                <UButton
                  size="xs"
                  color="primary"
                  variant="soft"
                  icon="i-lucide-external-link"
                  class="cursor-pointer"
                  @click="emit('open-stock', item.symbol)"
                >
                  View
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
