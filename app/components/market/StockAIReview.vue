<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { AITechnicalReviewResponse } from '../../types/market'
import { getCsrfTokenFromCookie } from '../../utils/csrf'

const props = defineProps<{
  symbol: string
  currentPrice?: number
}>()

const isLoading = ref(false)
const isRefreshing = ref(false)
const errorMsg = ref<string | null>(null)
const review = ref<AITechnicalReviewResponse | null>(null)

async function fetchAIReview(forceRefresh = false) {
  if (!props.symbol) return
  if (forceRefresh) isRefreshing.value = true
  else isLoading.value = true
  errorMsg.value = null

  try {
    const csrf = getCsrfTokenFromCookie()
    const data = await $fetch<AITechnicalReviewResponse>('/api/market/ai-review', {
      method: 'POST',
      headers: {
        ...(csrf ? { 'X-CSRF-Token': csrf } : {})
      },
      body: {
        symbol: props.symbol,
        forceRefresh
      }
    })
    review.value = data
  } catch (err: unknown) {
    console.error('Failed to generate AI technical review:', err)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchErr = err as any
    errorMsg.value = fetchErr?.data?.statusMessage || fetchErr?.message || 'Failed to generate AI review'
  } finally {
    isLoading.value = false
    isRefreshing.value = false
  }
}

watch(() => props.symbol, (newSym) => {
  if (newSym) {
    fetchAIReview(false)
  }
})

onMounted(() => {
  if (props.symbol) {
    fetchAIReview(false)
  }
})

// Visual Score Styling
const scoreColor = computed(() => {
  const s = review.value?.aiScore ?? 50
  if (s >= 75) return 'text-emerald-500'
  if (s >= 56) return 'text-teal-500'
  if (s >= 45) return 'text-amber-500'
  if (s >= 25) return 'text-orange-500'
  return 'text-rose-500'
})

const scoreBorderColor = computed(() => {
  const s = review.value?.aiScore ?? 50
  if (s >= 75) return 'border-emerald-500/40 bg-emerald-500/5'
  if (s >= 56) return 'border-teal-500/40 bg-teal-500/5'
  if (s >= 45) return 'border-amber-500/40 bg-amber-500/5'
  if (s >= 25) return 'border-orange-500/40 bg-orange-500/5'
  return 'border-rose-500/40 bg-rose-500/5'
})

const ratingBadgeColor = computed((): 'success' | 'primary' | 'warning' | 'error' | 'neutral' => {
  const r = review.value?.aiRating
  if (r === 'Strong Bullish') return 'success'
  if (r === 'Bullish') return 'primary'
  if (r === 'Neutral') return 'warning'
  if (r === 'Bearish') return 'error'
  if (r === 'Strong Bearish') return 'error'
  return 'neutral'
})

// Consensus vs Algorithmic Score
const scoreDelta = computed(() => {
  if (!review.value) return 0
  return review.value.aiScore - review.value.algorithmicScore
})

const consensusLabel = computed(() => {
  const diff = Math.abs(scoreDelta.value)
  if (diff <= 5) return 'High Consensus'
  if (diff <= 15) return 'Moderate Alignment'
  return 'Model Divergence'
})

const consensusBadgeColor = computed((): 'success' | 'primary' | 'warning' => {
  const diff = Math.abs(scoreDelta.value)
  if (diff <= 5) return 'success'
  if (diff <= 15) return 'primary'
  return 'warning'
})

function fmtCur(val?: number) {
  if (val === undefined || val === null || isNaN(val)) return 'N/A'
  return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
</script>

<template>
  <div class="space-y-4 text-xs">
    <!-- Header Control Strip -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-2xl bg-neutral-100/70 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700/60 shadow-2xs">
      <div class="flex items-center gap-2 flex-wrap">
        <div class="h-6 w-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <UIcon
            name="i-lucide-sparkles"
            class="h-3.5 w-3.5"
          />
        </div>
        <span class="font-bold text-neutral-900 dark:text-white">Independent AI Technical Evaluation</span>
        <UBadge
          v-if="review?.modelUsed"
          color="neutral"
          variant="subtle"
          size="xs"
          class="font-mono"
        >
          {{ review.modelUsed }}
        </UBadge>
        <span
          v-if="review?.generatedAt"
          class="text-[11px] text-neutral-400 font-mono"
        >
          • Generated {{ review.generatedAt }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          color="primary"
          variant="soft"
          size="xs"
          icon="i-lucide-refresh-cw"
          class="cursor-pointer font-semibold"
          :loading="isRefreshing"
          :disabled="isLoading || isRefreshing"
          @click="fetchAIReview(true)"
        >
          Re-analyze with AI
        </UButton>
      </div>
    </div>

    <!-- Loading State -->
    <div
      v-if="isLoading && !review"
      class="py-16 text-center space-y-3"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="animate-spin text-3xl text-primary mx-auto"
      />
      <div class="space-y-1">
        <p class="font-bold text-neutral-900 dark:text-white text-sm">
          Synthesizing Technical Confluence...
        </p>
        <p class="text-neutral-400 text-xs font-mono">
          Evaluating 25+ indicator parameters via Groq Llama 3.3 70B
        </p>
      </div>
    </div>

    <!-- Error State -->
    <div
      v-else-if="errorMsg && !review"
      class="py-12 text-center space-y-3"
    >
      <div class="h-12 w-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
        <UIcon
          name="i-lucide-alert-circle"
          class="h-6 w-6"
        />
      </div>
      <div class="space-y-1">
        <p class="font-bold text-rose-500 text-sm">
          {{ errorMsg }}
        </p>
        <p class="text-neutral-400 text-xs">
          Could not generate AI review for {{ props.symbol }}
        </p>
      </div>
      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        @click="fetchAIReview(true)"
      >
        Retry Analysis
      </UButton>
    </div>

    <!-- Main Content -->
    <div
      v-else-if="review"
      class="space-y-4"
    >
      <!-- 1. HERO SCORECARD & CONSENSUS DIVERGENCE STRIP -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <!-- AI Score Hero Card -->
        <div
          class="p-4 rounded-2xl border relative overflow-hidden flex flex-col justify-between space-y-3 shadow-xs"
          :class="scoreBorderColor"
        >
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              AI Technical Score
            </span>
            <UBadge
              :color="ratingBadgeColor"
              variant="subtle"
              size="xs"
            >
              {{ review.aiRating }}
            </UBadge>
          </div>

          <div class="flex items-baseline gap-2">
            <div
              class="text-4xl sm:text-5xl font-black font-mono tracking-tight"
              :class="scoreColor"
            >
              {{ review.aiScore }}
            </div>
            <span class="text-xs font-mono text-neutral-400 font-bold">/ 100</span>
          </div>

          <div class="flex items-center justify-between text-[11px] font-medium text-neutral-500 pt-1 border-t border-neutral-200/50 dark:border-neutral-800/50">
            <span>Confidence: <strong class="text-neutral-900 dark:text-white">{{ review.confidence }}</strong></span>
            <span>Horizon: <strong class="text-neutral-900 dark:text-white">{{ review.timeHorizon }}</strong></span>
          </div>
        </div>

        <!-- Algorithmic vs AI Comparison Card -->
        <div class="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex flex-col justify-between space-y-3 shadow-xs">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Score Consensus
            </span>
            <UBadge
              :color="consensusBadgeColor"
              variant="subtle"
              size="xs"
            >
              {{ consensusLabel }}
            </UBadge>
          </div>

          <div class="grid grid-cols-2 gap-2 text-center py-1">
            <div class="p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800">
              <span class="text-[10px] text-neutral-400 block mb-0.5">AI Engine</span>
              <span
                class="text-xl font-bold font-mono"
                :class="scoreColor"
              >{{ review.aiScore }}</span>
            </div>
            <div class="p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800">
              <span class="text-[10px] text-neutral-400 block mb-0.5">Algorithmic</span>
              <span class="text-xl font-bold font-mono text-neutral-700 dark:text-neutral-300">
                {{ review.algorithmicScore }}
              </span>
            </div>
          </div>

          <p class="text-[10px] text-neutral-400 leading-tight">
            <span v-if="Math.abs(scoreDelta) <= 5">Both models show aligned conviction with {{ Math.abs(scoreDelta) }} pt spread.</span>
            <span v-else-if="scoreDelta > 0">AI is more bullish (+{{ scoreDelta }} pts) detecting positive divergence.</span>
            <span v-else>AI is more cautious ({{ scoreDelta }} pts) highlighting latent resistance.</span>
          </p>
        </div>

        <!-- Quick Summary Card -->
        <div class="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex flex-col justify-between space-y-2.5 shadow-xs">
          <span class="text-[11px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
            <UIcon
              name="i-lucide-activity"
              class="h-3.5 w-3.5 text-primary"
            />
            <span>Executive Verdict</span>
          </span>

          <p class="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed italic line-clamp-4">
            "{{ review.executiveSummary }}"
          </p>

          <div class="text-[10px] text-neutral-400 font-mono">
            Zero score bias: AI processed raw technicals only.
          </div>
        </div>
      </div>

      <!-- 2. KEY STRENGTHS VS RISKS MATRIX -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <!-- Bullish Tailwinds / Strengths -->
        <div class="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/10 space-y-2.5">
          <div class="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs uppercase tracking-wider">
            <UIcon
              name="i-lucide-trending-up"
              class="h-4 w-4"
            />
            <span>Key Technical Strengths</span>
          </div>
          <ul class="space-y-1.5 text-xs text-neutral-700 dark:text-neutral-300">
            <li
              v-for="(str, idx) in review.keyStrengths"
              :key="idx"
              class="flex items-start gap-2"
            >
              <UIcon
                name="i-lucide-check-circle-2"
                class="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5"
              />
              <span>{{ str }}</span>
            </li>
          </ul>
        </div>

        <!-- Technical Risks & Resistance -->
        <div class="p-4 rounded-2xl border border-rose-500/20 bg-rose-500/5 dark:bg-rose-950/10 space-y-2.5">
          <div class="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-xs uppercase tracking-wider">
            <UIcon
              name="i-lucide-alert-triangle"
              class="h-4 w-4"
            />
            <span>Key Technical Risks & Barriers</span>
          </div>
          <ul class="space-y-1.5 text-xs text-neutral-700 dark:text-neutral-300">
            <li
              v-for="(risk, idx) in review.keyRisks"
              :key="idx"
              class="flex items-start gap-2"
            >
              <UIcon
                name="i-lucide-x-circle"
                class="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5"
              />
              <span>{{ risk }}</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- 3. IDENTIFIED SUPPORT & RESISTANCE TECHNICAL LEVELS -->
      <div class="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-3 shadow-xs">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <UIcon
              name="i-lucide-binary"
              class="h-4 w-4 text-primary"
            />
            <span>AI Calculated Technical Levels</span>
          </span>
          <span class="text-[11px] text-neutral-400 font-mono">Current: {{ fmtCur(review.currentPrice) }}</span>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center font-mono">
          <!-- Support 2 -->
          <div class="p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800">
            <span class="text-[10px] font-sans text-neutral-400 uppercase tracking-wider block">Support 2</span>
            <span class="text-sm font-bold text-emerald-600 dark:text-emerald-400">{{ fmtCur(review.technicalLevels?.support2) }}</span>
          </div>

          <!-- Support 1 -->
          <div class="p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800">
            <span class="text-[10px] font-sans text-neutral-400 uppercase tracking-wider block">Support 1</span>
            <span class="text-sm font-bold text-emerald-600 dark:text-emerald-400">{{ fmtCur(review.technicalLevels?.support1) }}</span>
          </div>

          <!-- Suggested Stop Loss -->
          <div class="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <span class="text-[10px] font-sans text-rose-500 uppercase tracking-wider block font-bold">Stop Loss</span>
            <span class="text-sm font-bold text-rose-500">{{ fmtCur(review.technicalLevels?.stopLoss) }}</span>
          </div>

          <!-- Resistance 1 -->
          <div class="p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800">
            <span class="text-[10px] font-sans text-neutral-400 uppercase tracking-wider block">Resistance 1</span>
            <span class="text-sm font-bold text-rose-600 dark:text-rose-400">{{ fmtCur(review.technicalLevels?.resistance1) }}</span>
          </div>

          <!-- Resistance 2 -->
          <div class="p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800">
            <span class="text-[10px] font-sans text-neutral-400 uppercase tracking-wider block">Resistance 2</span>
            <span class="text-sm font-bold text-rose-600 dark:text-rose-400">{{ fmtCur(review.technicalLevels?.resistance2) }}</span>
          </div>
        </div>
      </div>

      <!-- 4. TRADING TACTICS & ACTION PLAN -->
      <div class="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-1.5 shadow-xs">
        <span class="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
          <UIcon
            name="i-lucide-compass"
            class="h-4 w-4 text-primary"
          />
          <span>Actionable Trading Tactics</span>
        </span>
        <p class="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed font-sans">
          {{ review.tradingTactics }}
        </p>
      </div>
    </div>
  </div>
</template>
