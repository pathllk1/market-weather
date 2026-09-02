<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { CostMethod, Portfolio } from '~/types/portfolio'

const props = defineProps<{
  modelValue: boolean
  portfolioToEdit?: Portfolio | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'saved', portfolioId: string): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const isEditing = computed(() => Boolean(props.portfolioToEdit))

const name = ref('')
const description = ref('')
const benchmarkSymbol = ref('^NSEI')
const costMethod = ref<CostMethod>('FIFO')
const isPaperTrading = ref(false)
const initialCapital = ref(1000000)

const isSubmitting = ref(false)
const errorMessage = ref('')

watch(() => props.modelValue, (val) => {
  if (val) {
    if (props.portfolioToEdit) {
      name.value = props.portfolioToEdit.name
      description.value = props.portfolioToEdit.description || ''
      benchmarkSymbol.value = props.portfolioToEdit.benchmarkSymbol || '^NSEI'
      costMethod.value = props.portfolioToEdit.costMethod || 'FIFO'
      isPaperTrading.value = props.portfolioToEdit.isPaperTrading
      initialCapital.value = props.portfolioToEdit.initialCapital || 1000000
    } else {
      name.value = ''
      description.value = ''
      benchmarkSymbol.value = '^NSEI'
      costMethod.value = 'FIFO'
      isPaperTrading.value = false
      initialCapital.value = 1000000
    }
  }
})

async function handleSubmit() {
  if (!name.value.trim()) {
    errorMessage.value = 'Please enter a portfolio name.'
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''

  try {
    if (isEditing.value && props.portfolioToEdit) {
      await $fetch(`/api/portfolio/${props.portfolioToEdit.id}`, {
        method: 'PUT',
        body: {
          name: name.value.trim(),
          description: description.value.trim(),
          benchmarkSymbol: benchmarkSymbol.value,
          costMethod: costMethod.value,
          initialCapital: initialCapital.value
        }
      })
      emit('saved', props.portfolioToEdit.id)
    } else {
      const res = await $fetch<{ success: boolean; portfolioId: string }>('/api/portfolio', {
        method: 'POST',
        body: {
          name: name.value.trim(),
          description: description.value.trim(),
          benchmarkSymbol: benchmarkSymbol.value,
          costMethod: costMethod.value,
          isPaperTrading: isPaperTrading.value,
          initialCapital: initialCapital.value
        }
      })
      emit('saved', res.portfolioId)
    }
    isOpen.value = false
  } catch (err: any) {
    errorMessage.value = err?.data?.statusMessage || 'Failed to save portfolio'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="isEditing ? 'Edit Portfolio Configuration' : 'Create New Portfolio'"
    description="Manage asset baskets, benchmarks, and tax cost methods"
    :ui="{ content: 'sm:max-w-lg' }"
  >
    <template #body>
      <div class="space-y-4">
        <form class="space-y-3" @submit.prevent="handleSubmit">
        <!-- Portfolio Name -->
        <div>
          <label class="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            Portfolio Name
          </label>
          <input
            v-model="name"
            type="text"
            placeholder="e.g. Long-Term Compounders, F&O Alpha Basket..."
            class="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3.5 py-2 text-xs font-semibold text-neutral-900 dark:text-white focus:outline-hidden focus:border-primary"
          />
        </div>

        <!-- Description -->
        <div>
          <label class="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            Investment Thesis / Description
          </label>
          <textarea
            v-model="description"
            rows="2"
            placeholder="e.g. Focus on high-ROCE capital-efficient leaders with minimal leverage..."
            class="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3.5 py-2 text-xs text-neutral-900 dark:text-white focus:outline-hidden focus:border-primary"
          />
        </div>

        <!-- Benchmark & Cost Method -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Benchmark Index
            </label>
            <select
              v-model="benchmarkSymbol"
              class="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-medium text-neutral-900 dark:text-white focus:outline-hidden focus:border-primary"
            >
              <option value="^NSEI">NIFTY 50 Benchmark</option>
              <option value="^NSEBANK">NIFTY Bank</option>
              <option value="^CNXIT">NIFTY IT</option>
              <option value="^CNXMID">NIFTY Midcap 100</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Tax Cost Accounting Method
            </label>
            <select
              v-model="costMethod"
              class="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-medium text-neutral-900 dark:text-white focus:outline-hidden focus:border-primary"
            >
              <option value="FIFO">FIFO (First-In, First-Out)</option>
              <option value="LIFO">LIFO (Last-In, First-Out)</option>
              <option value="AVG">Weighted Average Cost</option>
            </select>
          </div>
        </div>

        <!-- Paper Trading Switch (only on creation) -->
        <div
          v-if="!isEditing"
          class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/50 p-3 flex items-center justify-between"
        >
          <div>
            <span class="block text-xs font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
              <UIcon name="i-lucide-gamepad-2" class="h-4 w-4 text-primary" />
              <span>Virtual Paper Trading Mode</span>
            </span>
            <span class="text-[11px] text-neutral-500">Test strategies with simulated capital using real-time price feeds.</span>
          </div>
          <input
            v-model="isPaperTrading"
            type="checkbox"
            class="h-4 w-4 rounded text-primary"
          />
        </div>

        <!-- Initial Capital -->
        <div>
          <label class="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            Allocated Initial Capital (₹)
          </label>
          <input
            v-model.number="initialCapital"
            type="number"
            step="10000"
            min="1000"
            class="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-mono font-bold text-neutral-900 dark:text-white focus:outline-hidden focus:border-primary"
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
            <span>{{ isEditing ? 'Save Changes' : 'Initialize Portfolio' }}</span>
          </button>
        </div>
      </form>
    </div>
  </template>
</UModal>
</template>
