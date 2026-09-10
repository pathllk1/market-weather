<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'portfolio-created', id: string): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val)
})

const name = ref('')
const description = ref('')
const initialCapital = ref<number>(1000000)
const isSubmitting = ref(false)
const errorMessage = ref('')

const CAPITAL_PRESETS = [
  { label: '₹1 Lakh', value: 100000 },
  { label: '₹5 Lakhs', value: 500000 },
  { label: '₹10 Lakhs', value: 1000000 },
  { label: '₹25 Lakhs', value: 2500000 },
  { label: '₹50 Lakhs', value: 5000000 }
]

watch(() => props.modelValue, (open) => {
  if (open) {
    name.value = ''
    description.value = ''
    initialCapital.value = 1000000
    errorMessage.value = ''
  }
})

async function handleCreatePortfolio() {
  if (!name.value.trim()) {
    errorMessage.value = 'Portfolio name is required'
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''

  try {
    const res = await $fetch<{ id: string }>('/api/backtest/portfolios', {
      method: 'POST',
      body: {
        name: name.value.trim(),
        description: description.value.trim() || undefined,
        initialCapital: initialCapital.value,
        currency: 'INR'
      }
    })

    emit('portfolio-created', res.id)
    isOpen.value = false
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }, message?: string }
    errorMessage.value = e.data?.statusMessage || e.message || 'Failed to create backtest portfolio'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="isOpen">
    <template #content>
      <div class="p-6 space-y-5">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <div class="flex items-center gap-2">
            <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UIcon
                name="i-lucide-folder-plus"
                class="h-5 w-5"
              />
            </div>
            <div>
              <h3 class="text-base font-bold text-neutral-900 dark:text-white">
                Create Backtest Workspace
              </h3>
              <p class="text-xs text-neutral-500 dark:text-neutral-400">
                Initialize a new isolated testing portfolio
              </p>
            </div>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            size="xs"
            @click="isOpen = false"
          />
        </div>

        <div class="space-y-4">
          <!-- Portfolio Name -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-neutral-700 dark:text-neutral-300">Portfolio Name</label>
            <UInput
              v-model="name"
              placeholder="e.g. Swing Breakout 2026, NIFTY 50 Dip Buying"
              class="w-full"
            />
          </div>

          <!-- Description -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-neutral-700 dark:text-neutral-300">Strategy Description (Optional)</label>
            <UTextarea
              v-model="description"
              :rows="2"
              placeholder="e.g. Daily timeframe testing of 200 EMA + RSI divergence setups..."
              class="w-full text-xs"
            />
          </div>

          <!-- Starting Capital -->
          <div class="space-y-2">
            <label class="text-xs font-medium text-neutral-700 dark:text-neutral-300">Starting Capital (INR)</label>
            <UInput
              v-model.number="initialCapital"
              type="number"
              min="1000"
              step="10000"
              class="w-full font-mono"
            />

            <!-- Presets -->
            <div class="flex flex-wrap gap-1.5 pt-1">
              <button
                v-for="p in CAPITAL_PRESETS"
                :key="p.value"
                type="button"
                class="px-2 py-1 text-xs rounded-lg transition-all"
                :class="initialCapital === p.value ? 'bg-primary text-white font-semibold shadow-xs' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'"
                @click="initialCapital = p.value"
              >
                {{ p.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- Error Message -->
        <div
          v-if="errorMessage"
          class="p-3 text-xs rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 flex items-center gap-2"
        >
          <UIcon
            name="i-lucide-alert-circle"
            class="h-4 w-4 shrink-0"
          />
          <span>{{ errorMessage }}</span>
        </div>

        <!-- Submit Actions -->
        <div class="flex justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <UButton
            color="neutral"
            variant="ghost"
            @click="isOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            color="primary"
            :loading="isSubmitting"
            @click="handleCreatePortfolio"
          >
            Create Portfolio
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
