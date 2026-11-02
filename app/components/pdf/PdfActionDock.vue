<script setup lang="ts">
defineProps<{
  actionLabel: string
  actionIcon?: string
  isProcessing?: boolean
  progressPercent?: number
  statusMessage?: string
  fileCount?: number
  canExecute?: boolean
}>()

const emit = defineEmits<{
  (e: 'execute'): void
  (e: 'reset'): void
}>()
</script>

<template>
  <div class="sticky bottom-4 inset-x-0 z-30 max-w-4xl mx-auto px-4">
    <div class="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-xl rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
      <!-- Status & Progress -->
      <div class="w-full sm:w-auto flex-1 min-w-0">
        <div class="flex items-center justify-between sm:justify-start gap-2 mb-1">
          <span class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
            {{ isProcessing ? statusMessage || 'Processing document...' : `${fileCount || 0} file(s) loaded` }}
          </span>
          <span
            v-if="isProcessing"
            class="text-xs font-mono font-bold text-primary"
          >
            {{ progressPercent }}%
          </span>
        </div>

        <!-- Progress Bar -->
        <div
          v-if="isProcessing"
          class="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden"
        >
          <div
            class="h-full bg-primary transition-all duration-300"
            :style="{ width: `${progressPercent}%` }"
          />
        </div>
        <p
          v-else
          class="text-[11px] text-slate-400 truncate"
        >
          All operations execute locally in browser memory.
        </p>
      </div>

      <!-- Action Controls -->
      <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
        <UButton
          variant="outline"
          size="sm"
          color="neutral"
          icon="i-lucide-x"
          :disabled="isProcessing"
          @click="emit('reset')"
        >
          Clear
        </UButton>

        <UButton
          color="primary"
          size="sm"
          :icon="actionIcon || 'i-lucide-check-circle'"
          :loading="isProcessing"
          :disabled="!canExecute || isProcessing"
          class="font-bold shadow-xs"
          @click="emit('execute')"
        >
          {{ actionLabel }}
        </UButton>
      </div>
    </div>
  </div>
</template>

