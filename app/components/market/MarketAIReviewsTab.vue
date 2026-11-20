<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { AIReviewsListResponse, AITechnicalReviewResponse } from '../../types/market'

const emit = defineEmits<{
  'open-stock': [symbol: string]
}>()

const isLoading = ref(true)
const isRefreshing = ref(false)
const errorMsg = ref<string | null>(null)
const data = ref<AIReviewsListResponse | null>(null)

// Smart Filter States
const timeframe = ref<'latest_batch' | 'today' | 'top_conviction' | 'all'>('latest_batch')
const searchQuery = ref('')
const selectedRating = ref('all')
const sortBy = ref('smart_momentum')
const sortOrder = ref<'asc' | 'desc'>('desc')
const viewMode = ref<'grid' | 'table'>('grid')

// On-demand re-analyze state tracking
const reanalyzingSymbols = ref<Record<string, boolean>>({})
const reanalyzeSuccess = ref<Record<string, boolean>>({})

async function loadAIReviews(force = false) {
  if (force) isRefreshing.value = true
  else isLoading.value = true
  errorMsg.value = null

  try {
    const res = await $fetch<AIReviewsListResponse>('/api/market/ai-reviews', {
      query: {
        search: searchQuery.value || undefined,
        rating: selectedRating.value !== 'all' ? selectedRating.value : undefined,
        timeframe: timeframe.value !== 'all' ? timeframe.value : undefined,
        sortBy: sortBy.value,
        sortOrder: sortOrder.value,
        limit: timeframe.value === 'latest_batch' ? 20 : 100
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

// Relative freshness calculation helper
function getAgeInfo(updatedAt?: number, generatedAt?: string) {
  let timeMs = Number(updatedAt)
  if ((!timeMs || isNaN(timeMs)) && generatedAt) {
    const parsed = Date.parse(generatedAt)
    if (!isNaN(parsed)) timeMs = parsed
  }
  if (!timeMs || isNaN(timeMs) || timeMs <= 0) {
    return {
      label: generatedAt || 'Recorded',
      color: 'neutral' as const,
      isFresh: false,
      isStale: false,
      dotClass: 'bg-neutral-400'
    }
  }

  const diffMs = Math.max(0, Date.now() - timeMs)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffHours < 1) {
    return {
      label: 'Just now',
      color: 'emerald' as const,
      isFresh: true,
      isStale: false,
      dotClass: 'bg-emerald-500 animate-pulse'
    }
  }
  if (diffHours < 24) {
    return {
      label: `${diffHours}h ago (Today)`,
      color: 'emerald' as const,
      isFresh: true,
      isStale: false,
      dotClass: 'bg-emerald-500'
    }
  }
  if (diffDays === 1) {
    return {
      label: 'Yesterday',
      color: 'teal' as const,
      isFresh: true,
      isStale: false,
      dotClass: 'bg-teal-500'
    }
  }
  if (diffDays <= 5) {
    return {
      label: `${diffDays}d ago`,
      color: 'neutral' as const,
      isFresh: false,
      isStale: false,
      dotClass: 'bg-neutral-400'
    }
  }
  return {
    label: `${diffDays}d ago · Stale`,
    color: 'warning' as const,
    isFresh: false,
    isStale: true,
    dotClass: 'bg-amber-500'
  }
}

function getAgeBadgeClasses(updatedAt?: number, generatedAt?: string) {
  const info = getAgeInfo(updatedAt, generatedAt)
  if (info.isFresh) {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
  }
  if (info.isStale) {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
  }
  if (info.color === 'teal') {
    return 'border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400'
  }
  return 'border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400'
}

// Risk/Reward & Upside metric calculator
function getRiskReward(currentPrice: number, levels?: { resistance1?: number, stopLoss?: number }) {
  if (!currentPrice || currentPrice <= 0 || !levels?.resistance1 || !levels?.stopLoss) return null
  const r1 = Number(levels.resistance1)
  const sl = Number(levels.stopLoss)
  if (r1 <= 0 || sl <= 0) return null

  const upsidePercent = ((r1 - currentPrice) / currentPrice) * 100
  const downsidePercent = ((currentPrice - sl) / currentPrice) * 100

  if (isNaN(upsidePercent) || isNaN(downsidePercent)) return null

  let ratioStr = 'N/A'
  if (downsidePercent > 0 && upsidePercent > 0) {
    const ratio = upsidePercent / downsidePercent
    ratioStr = `1 : ${ratio.toFixed(1)}`
  }

  return {
    upsidePercent: (upsidePercent >= 0 ? '+' : '') + upsidePercent.toFixed(1) + '%',
    downsidePercent: '-' + Math.abs(downsidePercent).toFixed(1) + '%',
    ratio: ratioStr,
    isFavorable: upsidePercent > downsidePercent && downsidePercent > 0
  }
}

// Single-stock on-demand AI re-analysis
async function reanalyzeStock(symbol: string) {
  if (reanalyzingSymbols.value[symbol]) return
  reanalyzingSymbols.value[symbol] = true
  reanalyzeSuccess.value[symbol] = false

  try {
    const refreshed = await $fetch<AITechnicalReviewResponse>('/api/market/ai-review', {
      method: 'POST',
      body: { symbol, forceRefresh: true }
    })
    if (refreshed && data.value?.reviews) {
      const idx = data.value.reviews.findIndex(r => r.symbol === symbol)
      if (idx !== -1) {
        data.value.reviews[idx] = refreshed
      } else {
        data.value.reviews.unshift(refreshed)
      }
      reanalyzeSuccess.value[symbol] = true
      setTimeout(() => {
        reanalyzeSuccess.value[symbol] = false
      }, 4000)
    }
  } catch (err: unknown) {
    console.error(`Failed to refresh AI analysis for ${symbol}:`, err)
  } finally {
    reanalyzingSymbols.value[symbol] = false
  }
}

const timeframeFilterOptions = [
  { id: 'latest_batch' as const, label: '⚡ Latest 20', icon: 'i-lucide-zap' },
  { id: 'today' as const, label: '📅 Today', icon: 'i-lucide-clock' },
  { id: 'top_conviction' as const, label: '🏆 Top (76+)', icon: 'i-lucide-award' },
  { id: 'all' as const, label: '🌐 All', icon: 'i-lucide-layers' }
]

const ratingFilterOptions = [
  { id: 'all', label: 'All Ratings' },
  { id: 'Strong Bullish', label: 'Strong Bullish (76-100)' },
  { id: 'Bullish', label: 'Bullish (56-75)' },
  { id: 'Neutral', label: 'Neutral (45-55)' },
  { id: 'Bearish', label: 'Bearish (<45)' }
]

const sortOptions = [
  { value: 'smart_momentum', label: '⚡ Smart Momentum' },
  { value: 'updated_at', label: '🕒 Last Evaluated' },
  { value: 'ai_score', label: '🔥 AI Score (High to Low)' },
  { value: 'consensus_delta', label: '📊 Consensus Delta' },
  { value: 'algorithmic_score', label: '🤖 Algorithmic Score' },
  { value: 'current_price', label: '💰 Stock Price' },
  { value: 'symbol', label: '🔤 Symbol Name' }
]

function handleTimeframeChange(newTimeframe: 'latest_batch' | 'today' | 'top_conviction' | 'all') {
  timeframe.value = newTimeframe
  loadAIReviews()
}

function handleSortChange(newVal: string) {
  sortBy.value = newVal
  loadAIReviews()
}

function handleRatingChange(newRating: string) {
  selectedRating.value = newRating
  loadAIReviews()
}

function resetFilters() {
  timeframe.value = 'latest_batch'
  selectedRating.value = 'all'
  searchQuery.value = ''
  sortBy.value = 'smart_momentum'
  loadAIReviews()
}
</script>

<template>
  <div class="space-y-2.5">
    <!-- TIER 1: Ultra-Compact KPI Ribbon (Height ~38px) -->
    <div class="px-3.5 py-1.5 rounded-xl bg-neutral-100/80 dark:bg-neutral-800/60 border border-neutral-200/80 dark:border-neutral-700/60 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs">
      <!-- Left: Consolidated Metrics -->
      <div class="flex items-center gap-3 sm:gap-4 overflow-x-auto scrollbar-none py-0.5">
        <div class="flex items-center gap-1.5 shrink-0">
          <UIcon
            name="i-lucide-sparkles"
            class="h-3.5 w-3.5 text-primary"
          />
          <span class="font-black text-neutral-900 dark:text-white font-mono">{{ data?.stats.total ?? 0 }}</span>
          <span class="text-[11px] text-neutral-500 dark:text-neutral-400">Evaluated</span>
        </div>
        <span class="text-neutral-300 dark:text-neutral-700 hidden sm:inline">•</span>
        <div class="flex items-center gap-1.5 shrink-0">
          <UIcon
            name="i-lucide-flame"
            class="h-3.5 w-3.5 text-emerald-500"
          />
          <span class="font-black text-emerald-500 font-mono">{{ data?.stats.bullishCount ?? 0 }}</span>
          <span class="text-[11px] text-neutral-500 dark:text-neutral-400">Bullish</span>
        </div>
        <span class="text-neutral-300 dark:text-neutral-700 hidden sm:inline">•</span>
        <div class="flex items-center gap-1.5 shrink-0">
          <UIcon
            name="i-lucide-scale"
            class="h-3.5 w-3.5 text-amber-500"
          />
          <span class="font-black text-neutral-700 dark:text-neutral-300 font-mono">{{ (data?.stats.neutralCount ?? 0) + (data?.stats.bearishCount ?? 0) }}</span>
          <span class="text-[11px] text-neutral-500 dark:text-neutral-400">Neutral/Bearish</span>
        </div>
        <span class="text-neutral-300 dark:text-neutral-700 hidden sm:inline">•</span>
        <div class="flex items-center gap-1.5 shrink-0">
          <UIcon
            name="i-lucide-gauge"
            class="h-3.5 w-3.5 text-teal-500"
          />
          <span class="font-black text-teal-500 font-mono">{{ data?.stats.avgAiScore ?? 0 }}</span>
          <span class="text-[11px] text-neutral-500 dark:text-neutral-400">/100 Avg</span>
        </div>
      </div>

      <!-- Right: Sync status & Quick refresh -->
      <div class="flex items-center gap-2 shrink-0 text-[11px] text-neutral-500 dark:text-neutral-400">
        <span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        <span class="truncate max-w-[220px] sm:max-w-none">
          {{ data?.stats.lastRunTime ? `Synced: ${data.stats.lastRunTime}` : 'Cron Automated Daily' }}
        </span>
        <span
          v-if="timeframe === 'latest_batch'"
          class="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
        >
          Latest 20 Active
        </span>
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-refresh-cw"
          :loading="isRefreshing"
          class="cursor-pointer -mr-1"
          title="Refresh AI Reviews"
          @click="loadAIReviews(true)"
        />
      </div>
    </div>

    <!-- TIER 2: Unified Command Bar (Single Responsive Row) -->
    <div class="p-2 rounded-xl bg-neutral-100/60 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/60 flex flex-wrap items-center justify-between gap-2">
      <!-- Left: Segmented Timeframe Switcher + Search -->
      <div class="flex items-center gap-2 flex-wrap flex-1 min-w-[260px]">
        <!-- Segmented Timeframe Switcher -->
        <div class="inline-flex rounded-lg p-0.5 border border-neutral-200/80 dark:border-neutral-700/80 bg-neutral-200/60 dark:bg-neutral-800/80 shrink-0">
          <button
            v-for="tf in timeframeFilterOptions"
            :key="tf.id"
            type="button"
            class="px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1 select-none cursor-pointer"
            :class="timeframe === tf.id ? 'bg-primary text-white shadow-2xs' : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white'"
            @click="handleTimeframeChange(tf.id)"
          >
            <UIcon
              :name="tf.icon"
              class="h-3.5 w-3.5"
            />
            <span>{{ tf.label }}</span>
            <span
              v-if="tf.id === 'latest_batch'"
              class="text-[8px] px-1 py-0.2 rounded bg-white/20 uppercase font-black tracking-wide"
            >
              Fresh
            </span>
          </button>
        </div>

        <!-- Compact Search Input -->
        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          placeholder="Search symbol / company..."
          size="xs"
          class="w-full sm:w-44 md:w-52 shrink-0"
          @keyup.enter="loadAIReviews()"
        />

        <!-- Count indicator -->
        <span class="text-[11px] text-neutral-400 font-mono hidden xl:inline">
          ({{ filteredReviews.length }} {{ timeframe === 'latest_batch' ? 'batch' : 'records' }})
        </span>
      </div>

      <!-- Right: Rating Filter + Sort Select + View Mode -->
      <div class="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
        <!-- Rating Select -->
        <select
          :value="selectedRating"
          class="text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer font-medium"
          @change="handleRatingChange(($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="opt in ratingFilterOptions"
            :key="opt.id"
            :value="opt.id"
          >
            {{ opt.label }}
          </option>
        </select>

        <!-- Sort Select -->
        <select
          :value="sortBy"
          class="text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer font-medium max-w-[190px]"
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

        <!-- View Switcher -->
        <div class="inline-flex rounded-lg p-0.5 border border-neutral-200 dark:border-neutral-700 bg-neutral-200/50 dark:bg-neutral-800/80">
          <button
            type="button"
            class="p-1 rounded-md transition-all cursor-pointer"
            :class="viewMode === 'grid' ? 'bg-white dark:bg-neutral-700 text-primary shadow-2xs' : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'"
            title="Grid Cards"
            @click="viewMode = 'grid'"
          >
            <UIcon
              name="i-lucide-layout-grid"
              class="h-3.5 w-3.5"
            />
          </button>
          <button
            type="button"
            class="p-1 rounded-md transition-all cursor-pointer"
            :class="viewMode === 'table' ? 'bg-white dark:bg-neutral-700 text-primary shadow-2xs' : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'"
            title="Data Table"
            @click="viewMode = 'table'"
          >
            <UIcon
              name="i-lucide-table"
              class="h-3.5 w-3.5"
            />
          </button>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div
      v-if="isLoading"
      class="py-16 text-center space-y-3"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="animate-spin text-3xl text-primary mx-auto"
      />
      <p class="text-xs font-medium text-neutral-400">
        Loading AI Technical Reviews...
      </p>
    </div>

    <!-- Error State -->
    <div
      v-else-if="errorMsg"
      class="py-10 text-center space-y-3"
    >
      <div class="h-10 w-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
        <UIcon
          name="i-lucide-alert-circle"
          class="h-5 w-5"
        />
      </div>
      <p class="text-xs font-bold text-rose-500">
        {{ errorMsg }}
      </p>
      <UButton
        color="neutral"
        variant="outline"
        size="xs"
        @click="loadAIReviews()"
      >
        Retry
      </UButton>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="filteredReviews.length === 0"
      class="py-12 text-center space-y-2 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6"
    >
      <div class="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
        <UIcon
          name="i-lucide-sparkles"
          class="h-5 w-5"
        />
      </div>
      <div class="space-y-1">
        <p class="text-xs font-bold text-neutral-900 dark:text-white">
          No AI Reviews Found
        </p>
        <p class="text-[11px] text-neutral-400 max-w-sm mx-auto">
          No stocks match the selected filter. Try selecting "All" or clearing your search.
        </p>
        <div class="pt-1">
          <UButton
            size="xs"
            color="primary"
            variant="outline"
            class="cursor-pointer"
            @click="resetFilters()"
          >
            Reset Filters
          </UButton>
        </div>
      </div>
    </div>

    <!-- 1. GRID CARDS VIEW (High-density padding) -->
    <div
      v-else-if="viewMode === 'grid'"
      class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
    >
      <div
        v-for="item in filteredReviews"
        :key="item.symbol"
        class="rounded-xl border p-3.5 bg-white/70 dark:bg-neutral-900/60 backdrop-blur-sm transition-all hover:shadow-md hover:border-primary/40 flex flex-col justify-between space-y-2.5 relative group"
        :class="[
          getScoreBg(item.aiScore),
          getAgeInfo(item.updatedAt, item.generatedAt).isFresh ? 'ring-1 ring-emerald-500/30' : ''
        ]"
      >
        <!-- Header: Stock identity + Score Meter -->
        <div class="flex items-start justify-between gap-2.5">
          <div class="space-y-0.5 min-w-0 flex-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="font-extrabold text-sm text-neutral-900 dark:text-white tracking-tight truncate">
                {{ item.symbol }}
              </span>
              <UBadge
                :color="getRatingBadgeColor(item.aiRating)"
                variant="subtle"
                size="xs"
                class="font-semibold text-[10px] py-0 px-1.5"
              >
                {{ item.aiRating }}
              </UBadge>
              <!-- Relative Freshness Pill -->
              <span
                class="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.2 rounded border whitespace-nowrap"
                :class="getAgeBadgeClasses(item.updatedAt, item.generatedAt)"
              >
                <span
                  class="h-1.5 w-1.5 rounded-full"
                  :class="getAgeInfo(item.updatedAt, item.generatedAt).dotClass"
                />
                {{ getAgeInfo(item.updatedAt, item.generatedAt).label }}
              </span>
            </div>
            <div class="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
              {{ item.companyName }}
            </div>
            <div class="text-xs font-black text-neutral-900 dark:text-white pt-0.5">
              {{ fmtCur(item.currentPrice) }}
            </div>
          </div>

          <!-- Hero AI Score Badge -->
          <div class="text-right shrink-0 flex flex-col items-center">
            <div
              class="h-11 w-11 rounded-xl border-2 flex flex-col items-center justify-center font-mono font-black text-base shadow-2xs relative"
              :class="[getScoreColor(item.aiScore), getScoreBg(item.aiScore)]"
            >
              {{ item.aiScore }}
              <span
                v-if="getAgeInfo(item.updatedAt, item.generatedAt).isFresh"
                class="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-500 border-2 border-white dark:border-neutral-900 animate-ping"
              />
              <span
                v-if="getAgeInfo(item.updatedAt, item.generatedAt).isFresh"
                class="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-500 border-2 border-white dark:border-neutral-900"
              />
            </div>
            <span class="text-[8px] uppercase tracking-wider text-neutral-400 font-bold mt-0.5">AI Score</span>
          </div>
        </div>

        <!-- Consensus & Algo Metrics Bar -->
        <div class="p-2 rounded-lg bg-neutral-100/80 dark:bg-neutral-800/70 border border-neutral-200/70 dark:border-neutral-700/50 flex items-center justify-between text-[11px]">
          <div class="flex items-center gap-1">
            <span class="text-neutral-500 dark:text-neutral-400">Algo:</span>
            <span class="font-bold text-neutral-800 dark:text-neutral-200 font-mono">{{ item.algorithmicScore }}</span>
          </div>

          <div class="flex items-center gap-1">
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

        <!-- Quantitative Target & Risk/Reward Insights -->
        <div
          v-if="getRiskReward(item.currentPrice, item.technicalLevels)"
          class="px-2.5 py-1 rounded-lg bg-neutral-100/60 dark:bg-neutral-800/50 border border-neutral-200/50 dark:border-neutral-700/40 flex items-center justify-between text-[10px]"
        >
          <div class="flex items-center gap-1">
            <span class="text-neutral-400">Upside (R1):</span>
            <span class="font-bold text-emerald-500 font-mono">
              {{ getRiskReward(item.currentPrice, item.technicalLevels)?.upsidePercent }}
            </span>
          </div>
          <div class="flex items-center gap-1">
            <span class="text-neutral-400">Risk (SL):</span>
            <span class="font-bold text-amber-500 font-mono">
              {{ getRiskReward(item.currentPrice, item.technicalLevels)?.downsidePercent }}
            </span>
          </div>
          <div class="flex items-center gap-1">
            <span class="text-neutral-400">R:R:</span>
            <span class="font-bold font-mono text-neutral-700 dark:text-neutral-300">
              {{ getRiskReward(item.currentPrice, item.technicalLevels)?.ratio }}
            </span>
          </div>
        </div>

        <!-- Executive Summary Snippet -->
        <p class="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed line-clamp-2 italic">
          "{{ item.executiveSummary }}"
        </p>

        <!-- Technical Key Levels Preview -->
        <div class="grid grid-cols-3 gap-1 text-center text-[10px] p-1.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/50 dark:border-neutral-700/40">
          <div>
            <span class="text-neutral-400 block text-[9px]">Support</span>
            <span class="font-bold text-emerald-500 font-mono">{{ fmtCur(item.technicalLevels.support1) }}</span>
          </div>
          <div>
            <span class="text-neutral-400 block text-[9px]">Resistance</span>
            <span class="font-bold text-rose-500 font-mono">{{ fmtCur(item.technicalLevels.resistance1) }}</span>
          </div>
          <div>
            <span class="text-neutral-400 block text-[9px]">Stop Loss</span>
            <span class="font-bold text-amber-500 font-mono">{{ fmtCur(item.technicalLevels.stopLoss) }}</span>
          </div>
        </div>

        <!-- Card Footer -->
        <div class="pt-1.5 flex items-center justify-between gap-2 border-t border-neutral-200/50 dark:border-neutral-700/40 text-[10px]">
          <div class="flex items-center gap-1 text-neutral-400 min-w-0">
            <UIcon
              name="i-lucide-cpu"
              class="h-3 w-3 shrink-0"
            />
            <span
              class="font-mono truncate max-w-[100px] sm:max-w-[130px]"
              :title="item.modelUsed"
            >
              {{ item.modelUsed.replace(' (Groq)', '') }}
            </span>
            <span class="text-neutral-300 dark:text-neutral-600">•</span>
            <span
              class="truncate"
              :title="item.generatedAt"
            >
              {{ item.generatedAt }}
            </span>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <!-- Re-analyze button -->
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              :icon="reanalyzeSuccess[item.symbol] ? 'i-lucide-check' : 'i-lucide-refresh-cw'"
              :loading="reanalyzingSymbols[item.symbol]"
              class="cursor-pointer"
              :class="reanalyzeSuccess[item.symbol] ? 'text-emerald-500' : 'text-neutral-400 hover:text-primary'"
              :title="reanalyzeSuccess[item.symbol] ? 'AI Analysis Updated!' : 'Re-analyze with AI now'"
              @click.stop="reanalyzeStock(item.symbol)"
            />

            <!-- Full Review button -->
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
    </div>

    <!-- 2. DATA TABLE VIEW -->
    <div
      v-else-if="viewMode === 'table'"
      class="rounded-xl border border-neutral-200 dark:border-neutral-700/80 overflow-hidden shadow-2xs"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-neutral-100 dark:bg-neutral-800/80 text-neutral-500 dark:text-neutral-400 font-semibold border-b border-neutral-200 dark:border-neutral-700">
            <tr>
              <th class="py-2.5 px-3">
                Equity
              </th>
              <th class="py-2.5 px-3">
                Price
              </th>
              <th class="py-2.5 px-2 text-center">
                AI Score
              </th>
              <th class="py-2.5 px-3">
                AI Rating
              </th>
              <th class="py-2.5 px-3">
                Freshness
              </th>
              <th class="py-2.5 px-2 text-center">
                Algo
              </th>
              <th class="py-2.5 px-2">
                Upside (R1)
              </th>
              <th class="py-2.5 px-2">
                R:R
              </th>
              <th class="py-2.5 px-3">
                Key Levels (S1 / R1)
              </th>
              <th class="py-2.5 px-3 text-right">
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
              <td class="py-2.5 px-3">
                <div class="font-bold text-neutral-900 dark:text-white">
                  {{ item.symbol }}
                </div>
                <div class="text-[11px] text-neutral-400 truncate max-w-xs">
                  {{ item.companyName }}
                </div>
              </td>
              <td class="py-2.5 px-3 font-semibold text-neutral-900 dark:text-white">
                {{ fmtCur(item.currentPrice) }}
              </td>
              <td class="py-2.5 px-2 text-center">
                <span
                  class="font-black font-mono px-2 py-0.5 rounded-md border text-xs"
                  :class="[getScoreColor(item.aiScore), getScoreBg(item.aiScore)]"
                >
                  {{ item.aiScore }}
                </span>
              </td>
              <td class="py-2.5 px-3">
                <UBadge
                  :color="getRatingBadgeColor(item.aiRating)"
                  variant="subtle"
                  size="xs"
                >
                  {{ item.aiRating }}
                </UBadge>
              </td>
              <td class="py-2.5 px-3">
                <span
                  class="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border whitespace-nowrap"
                  :class="getAgeBadgeClasses(item.updatedAt, item.generatedAt)"
                >
                  <span
                    class="h-1.5 w-1.5 rounded-full"
                    :class="getAgeInfo(item.updatedAt, item.generatedAt).dotClass"
                  />
                  {{ getAgeInfo(item.updatedAt, item.generatedAt).label }}
                </span>
              </td>
              <td class="py-2.5 px-2 text-center font-mono font-bold text-neutral-700 dark:text-neutral-300">
                {{ item.algorithmicScore }}
                <span
                  class="text-[10px] ml-0.5"
                  :class="item.aiScore >= item.algorithmicScore ? 'text-emerald-500' : 'text-rose-500'"
                >
                  ({{ item.aiScore - item.algorithmicScore >= 0 ? '+' : '' }}{{ item.aiScore - item.algorithmicScore }})
                </span>
              </td>
              <td class="py-2.5 px-2 font-mono font-bold text-[11px] text-emerald-500">
                {{ getRiskReward(item.currentPrice, item.technicalLevels)?.upsidePercent || 'N/A' }}
              </td>
              <td class="py-2.5 px-2 font-mono text-[11px] text-neutral-700 dark:text-neutral-300">
                {{ getRiskReward(item.currentPrice, item.technicalLevels)?.ratio || 'N/A' }}
              </td>
              <td class="py-2.5 px-3 font-mono text-[11px]">
                <span class="text-emerald-500 font-semibold">{{ fmtCur(item.technicalLevels.support1) }}</span>
                <span class="text-neutral-400 mx-1">/</span>
                <span class="text-rose-500 font-semibold">{{ fmtCur(item.technicalLevels.resistance1) }}</span>
              </td>
              <td class="py-2.5 px-3 text-right">
                <div class="flex items-center justify-end gap-1.5">
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :icon="reanalyzeSuccess[item.symbol] ? 'i-lucide-check' : 'i-lucide-refresh-cw'"
                    :loading="reanalyzingSymbols[item.symbol]"
                    class="cursor-pointer"
                    :class="reanalyzeSuccess[item.symbol] ? 'text-emerald-500' : 'text-neutral-400 hover:text-primary'"
                    :title="reanalyzeSuccess[item.symbol] ? 'AI Analysis Updated!' : 'Re-analyze with AI now'"
                    @click.stop="reanalyzeStock(item.symbol)"
                  />
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
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
