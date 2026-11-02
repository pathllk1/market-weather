<script setup lang="ts">
export interface GridPageItem {
  pageNumber: number
  rotation: number
  isDeleted: boolean
  thumbnailUrl?: string
  dataUrl?: string
}

const props = defineProps<{
  pages: GridPageItem[]
  title?: string
  isLoadingThumbnails?: boolean
}>()

const emit = defineEmits<{
  (e: 'rotatePage', pageNumber: number): void
  (e: 'toggleDeletePage', pageNumber: number): void
  (e: 'resetAll'): void
}>()
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h4 class="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          {{ title || 'Document Page Editor' }}
          <span
            v-if="isLoadingThumbnails"
            class="text-[10px] font-mono font-medium text-primary flex items-center gap-1"
          >
            <UIcon
              name="i-lucide-loader-2"
              class="w-3 h-3 animate-spin"
            />
            Rendering Previews...
          </span>
        </h4>
        <p class="text-xs text-slate-400">
          Rotate individual pages or click delete to exclude them from the output
        </p>
      </div>

      <UButton
        variant="ghost"
        size="xs"
        color="neutral"
        icon="i-lucide-rotate-ccw"
        @click="emit('resetAll')"
      >
        Reset Edits
      </UButton>
    </div>

    <!-- Page Grid -->
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      <div
        v-for="p in pages"
        :key="p.pageNumber"
        class="group relative bg-white dark:bg-slate-900 border rounded-xl p-3 flex flex-col items-center justify-between transition-all shadow-2xs hover:shadow-md"
        :class="
          p.isDeleted
            ? 'opacity-40 border-rose-300 dark:border-rose-900/50 bg-rose-50/20'
            : 'border-slate-200 dark:border-slate-800'
        "
      >
        <!-- Page Indicator Top Bar -->
        <div class="w-full flex items-center justify-between text-[11px] font-mono text-slate-400 mb-2">
          <span class="font-bold text-slate-700 dark:text-slate-300">
            Page {{ p.pageNumber }}
          </span>
          <span
            v-if="p.rotation !== 0"
            class="text-blue-600 font-semibold"
          >
            {{ p.rotation }}°
          </span>
        </div>

        <!-- Document Canvas Page Preview (matches iLovePDF realistic paper preview) -->
        <div class="w-full aspect-[3/4] bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-center relative overflow-hidden transition-transform duration-200 p-1.5">
          <!-- Real Document Page Image Render -->
          <div
            v-if="p.thumbnailUrl || p.dataUrl"
            class="w-full h-full flex items-center justify-center transition-transform duration-200"
            :style="{ transform: `rotate(${p.rotation}deg)` }"
          >
            <img
              :src="p.thumbnailUrl || p.dataUrl"
              :alt="`Page ${p.pageNumber}`"
              class="max-h-full max-w-full object-contain rounded-xs shadow-xs border border-slate-200/80 dark:border-slate-700 bg-white"
            >
          </div>

          <!-- Fallback Skeleton while canvas is generating -->
          <div
            v-else
            class="w-full h-full p-2 flex flex-col justify-between transition-transform duration-200 animate-pulse"
            :style="{ transform: `rotate(${p.rotation}deg)` }"
          >
            <div class="space-y-1 opacity-40">
              <div class="h-1.5 bg-slate-400 rounded-full w-3/4" />
              <div class="h-1.5 bg-slate-300 rounded-full w-full" />
              <div class="h-1.5 bg-slate-300 rounded-full w-5/6" />
              <div class="h-1.5 bg-slate-300 rounded-full w-2/3" />
            </div>
            <div class="text-center font-mono text-xs font-bold text-slate-400">
              {{ p.pageNumber }}
            </div>
          </div>

          <!-- Deleted / Excluded Overlay -->
          <div
            v-if="p.isDeleted"
            class="absolute inset-0 bg-rose-950/30 backdrop-blur-[1px] flex items-center justify-center"
          >
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white shadow-xs">
              Excluded
            </span>
          </div>
        </div>

        <!-- Quick Action Bar -->
        <div class="w-full flex items-center justify-center gap-1 mt-2.5 pt-1.5 border-t border-slate-100 dark:border-slate-800">
          <UButton
            variant="ghost"
            size="xs"
            color="neutral"
            icon="i-lucide-rotate-cw"
            title="Rotate 90° Clockwise"
            @click.stop="emit('rotatePage', p.pageNumber)"
          />
          <UButton
            variant="ghost"
            size="xs"
            :color="p.isDeleted ? 'primary' : 'error'"
            :icon="p.isDeleted ? 'i-lucide-undo-2' : 'i-lucide-trash-2'"
            :title="p.isDeleted ? 'Restore Page' : 'Exclude Page'"
            @click.stop="emit('toggleDeletePage', p.pageNumber)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

