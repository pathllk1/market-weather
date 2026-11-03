<script setup lang="ts">
import { ref } from 'vue'

export interface GridPageItem {
  pageNumber: number
  rotation: number
  isDeleted: boolean
  thumbnailUrl?: string
  dataUrl?: string
}

defineProps<{
  pages: GridPageItem[]
  title?: string
  isLoadingThumbnails?: boolean
}>()

const emit = defineEmits<{
  (e: 'rotatePage' | 'toggleDeletePage', pageNumber: number): void
  (e: 'movePage', fromIndex: number, toIndex: number): void
  (e: 'resetAll'): void
}>()

const draggedIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

function onDragStart(e: DragEvent, index: number) {
  draggedIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragOver(e: DragEvent, index: number) {
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move'
  }
  if (draggedIndex.value !== null && draggedIndex.value !== index) {
    dragOverIndex.value = index
  }
}

function onDragLeave(e: DragEvent, index: number) {
  if (dragOverIndex.value === index) {
    dragOverIndex.value = null
  }
}

function onDrop(e: DragEvent, toIndex: number) {
  e.preventDefault()
  const fromIndex = draggedIndex.value
  draggedIndex.value = null
  dragOverIndex.value = null

  if (fromIndex !== null && fromIndex !== toIndex) {
    emit('movePage', fromIndex, toIndex)
  }
}

function onDragEnd() {
  draggedIndex.value = null
  dragOverIndex.value = null
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h4 class="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <UIcon
            name="i-lucide-grip-vertical"
            class="w-4 h-4 text-primary"
          />
          {{ title || 'Document Page Organizer' }}
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
          Drag and drop page thumbnails to reorder • Rotate or exclude pages before exporting
        </p>
      </div>

      <UButton
        variant="ghost"
        size="xs"
        color="neutral"
        icon="i-lucide-rotate-ccw"
        @click="emit('resetAll')"
      >
        Reset Order & Edits
      </UButton>
    </div>

    <!-- Page Grid (Drag and Drop Sortable) -->
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      <div
        v-for="(p, index) in pages"
        :key="p.pageNumber"
        draggable="true"
        class="group relative bg-white dark:bg-slate-900 border rounded-xl p-3 flex flex-col items-center justify-between transition-all duration-150 shadow-2xs hover:shadow-md cursor-grab active:cursor-grabbing select-none"
        :class="[
          draggedIndex === index ? 'opacity-30 scale-95 border-dashed border-primary shadow-inner' : '',
          dragOverIndex === index ? 'ring-2 ring-primary ring-offset-2 border-primary scale-102 bg-primary/5 shadow-md' : '',
          p.isDeleted
            ? 'opacity-40 border-rose-300 dark:border-rose-900/50 bg-rose-50/20'
            : 'border-slate-200 dark:border-slate-800'
        ]"
        @dragstart="onDragStart($event, index)"
        @dragover="onDragOver($event, index)"
        @dragenter="onDragOver($event, index)"
        @dragleave="onDragLeave($event, index)"
        @drop="onDrop($event, index)"
        @dragend="onDragEnd"
      >
        <!-- Page Indicator Top Bar -->
        <div class="w-full flex items-center justify-between text-[11px] font-mono text-slate-400 mb-2">
          <div class="flex items-center gap-1">
            <UIcon
              name="i-lucide-grip-vertical"
              class="w-3 h-3 text-slate-400 group-hover:text-primary transition-colors cursor-grab"
            />
            <span class="font-bold text-slate-800 dark:text-slate-200">
              #{{ index + 1 }}
            </span>
            <span class="text-[10px] text-slate-400 font-normal">
              (p.{{ p.pageNumber }})
            </span>
          </div>

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
              class="max-h-full max-w-full object-contain rounded-xs shadow-xs border border-slate-200/80 dark:border-slate-700 bg-white pointer-events-none"
            >
          </div>

          <!-- Fallback Skeleton while canvas is generating -->
          <div
            v-else
            class="w-full h-full p-2 flex flex-col justify-between transition-transform duration-200 animate-pulse pointer-events-none"
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
            class="absolute inset-0 bg-rose-950/30 backdrop-blur-[1px] flex items-center justify-center pointer-events-none"
          >
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white shadow-xs">
              Excluded
            </span>
          </div>
        </div>

        <!-- Quick Action Bar -->
        <div class="w-full flex items-center justify-between gap-1 mt-2.5 pt-1.5 border-t border-slate-100 dark:border-slate-800">
          <!-- Move Left / Right Click Fallbacks -->
          <div class="flex items-center gap-0.5">
            <button
              type="button"
              class="p-1 text-slate-400 hover:text-primary disabled:opacity-20 disabled:hover:text-slate-400 cursor-pointer"
              :disabled="index === 0"
              title="Move Left"
              @click.stop="emit('movePage', index, index - 1)"
            >
              <UIcon
                name="i-lucide-chevron-left"
                class="w-3.5 h-3.5"
              />
            </button>
            <button
              type="button"
              class="p-1 text-slate-400 hover:text-primary disabled:opacity-20 disabled:hover:text-slate-400 cursor-pointer"
              :disabled="index === pages.length - 1"
              title="Move Right"
              @click.stop="emit('movePage', index, index + 1)"
            >
              <UIcon
                name="i-lucide-chevron-right"
                class="w-3.5 h-3.5"
              />
            </button>
          </div>

          <!-- Rotate & Exclude -->
          <div class="flex items-center gap-0.5">
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
  </div>
</template>
