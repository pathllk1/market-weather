<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  portfolioId: string
  symbol: string
  currentPrice: number
  initialTarget?: number | null
  initialStopLoss?: number | null
  initialNotes?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'saved'): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const targetPrice = ref<number | undefined>(undefined)
const stopLoss = ref<number | undefined>(undefined)
const targetNotes = ref('')
const isSubmitting = ref(false)
const errorMessage = ref('')

watch(() => props.modelValue, (val) => {
  if (val) {
    targetPrice.value = props.initialTarget || undefined
    stopLoss.value = props.initialStopLoss || undefined
    targetNotes.value = props.initialNotes || ''
  }
})

// Risk to Reward Ratio
const riskReward = computed(() => {
  const current = props.currentPrice
  const target = targetPrice.value
  const stop = stopLoss.value

  if (!current || !target || !stop || target <= current || stop >= current) {
    return null
  }

  const upside = ((target - current) / current) * 100
  const downside = ((current - stop) / current) * 100
  const ratio = downside > 0 ? upside / downside : 0

  return {
    upside: Number(upside.toFixed(1)),
    downside: Number(downside.toFixed(1)),
    ratio: Number(ratio.toFixed(2))
  }
})

async function handleSubmit() {
  isSubmitting.value = true
  errorMessage.value = ''

  try {
    await $fetch(`/api/portfolio/${props.portfolioId}/targets`, {
      method: 'POST',
      body: {
        symbol: props.symbol,
        targetPrice: targetPrice.value || null,
        stopLoss: stopLoss.value || null,
        targetNotes: targetNotes.value || null
      }
    })

    emit('saved')
    isOpen.value = false
  } catch (err: any) {
    errorMessage.value = err?.data?.statusMessage || 'Failed to save target'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    title="Target & Stop-Loss"
    :description="`${symbol} (Current: ₹${currentPrice.toFixed(2)})`"
    :ui="{ content: 'sm:max-w-md' }"
  >
    <template #body>
      <div class="space-y-4">
        <form class="space-y-3" @submit.prevent="handleSubmit">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
              Target Price (₹)
            </label>
            <input
              v-model.number="targetPrice"
              type="number"
              step="0.05"
              placeholder="e.g. 1500"
              class="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-mono font-bold text-neutral-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-rose-600 dark:text-rose-400 mb-1">
              Stop-Loss (₹)
            </label>
            <input
              v-model.number="stopLoss"
              type="number"
              step="0.05"
              placeholder="e.g. 1200"
              class="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-mono font-bold text-neutral-900 dark:text-white focus:outline-hidden focus:border-rose-500"
            />
          </div>
        </div>

        <!-- Risk-Reward Intelligence Card -->
        <div
          v-if="riskReward"
          class="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs space-y-1"
        >
          <div class="flex items-center justify-between">
            <span class="text-neutral-500 font-medium">Risk to Reward Ratio</span>
            <span class="font-bold font-mono text-primary text-sm">{{ riskReward.ratio }} : 1</span>
          </div>
          <div class="flex items-center justify-between text-[11px] font-mono">
            <span class="text-emerald-600 dark:text-emerald-400 font-bold">+{{ riskReward.upside }}% Potential Upside</span>
            <span class="text-rose-600 dark:text-rose-400 font-bold">-{{ riskReward.downside }}% Max Risk</span>
          </div>
        </div>

        <div>
          <label class="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            Rationale / Thesis
          </label>
          <textarea
            v-model="targetNotes"
            rows="2"
            placeholder="e.g. Resistance level at 200 EMA breakout, support at 1200 swing low..."
            class="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs text-neutral-900 dark:text-white focus:outline-hidden focus:border-primary"
          />
        </div>

        <p v-if="errorMessage" class="text-xs text-rose-500 font-medium">{{ errorMessage }}</p>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <button
            type="button"
            class="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            @click="isOpen = false"
          >
            Cancel
          </button>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-xs font-bold text-white hover:bg-primary-dark transition-all shadow-xs"
          >
            <UIcon v-if="isSubmitting" name="i-lucide-loader-2" class="h-3.5 w-3.5 animate-spin" />
            <span>Save Target Levels</span>
          </button>
        </div>
      </form>
    </div>
  </template>
</UModal>
</template>
