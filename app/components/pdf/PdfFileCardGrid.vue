<script setup lang="ts">
import { ref } from 'vue'

export interface DocumentFileCard {
  id: string
  file: File
  name: string
  sizeFormatted: string
  numPages: number
  thumbnailUrl?: string
  rotation: number
  isLoadingThumbnail?: boolean
}

defineProps<{
  files: DocumentFileCard[]
  accept?: string
}>()

const emit = defineEmits<{
  (e: 'removeFile' | 'rotateFile', index: number): void
  (e: 'moveFile', fromIndex: number, toIndex: number): void
  (e: 'addFiles', files: File[]): void
}>()

const draggedIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

function handleFileInput(e: Event) {
  const target = e.target as HTMLInputElement
  if (!target.files?.length) return
  emit('addFiles', Array.from(target.files))
  target.value = ''
}

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
    emit('moveFile', fromIndex, toIndex)
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
      <div class="flex items-center gap-2">
        <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
          <UIcon
            name="i-lucide-grip-vertical"
            class="w-4 h-4 text-primary"
          />
          Selected Documents ({{ files.length }})
        </h3>
        <span class="text-xs text-slate-400">
          • Drag & drop cards to reorder files for merging
        </span>
      </div>

      <label class="text-xs font-semibold text-primary hover:underline cursor-pointer flex items-center gap-1">
        <UIcon
          name="i-lucide-plus"
          class="w-3.5 h-3.5"
        />
        Add More Documents
        <input
          type="file"
          class="hidden"
          multiple
          :accept="accept || '.pdf,application/pdf'"
          @change="handleFileInput"
        >
      </label>
    </div>

    <!-- Cards Grid (Drag and Drop Sortable) -->
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
      <div
        v-for="(doc, idx) in files"
        :key="doc.id"
        draggable="true"
        class="group relative bg-white dark:bg-slate-900 border rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 shadow-xs cursor-grab active:cursor-grabbing select-none"
        :class="[
          draggedIndex === idx ? 'opacity-30 scale-95 border-dashed border-primary shadow-inner' : '',
          dragOverIndex === idx ? 'ring-2 ring-primary ring-offset-2 border-primary scale-102 bg-primary/5 shadow-xl' : 'border-slate-200/90 dark:border-slate-800 hover:shadow-xl hover:border-primary/50'
        ]"
        @dragstart="onDragStart($event, idx)"
        @dragover="onDragOver($event, idx)"
        @dragenter="onDragOver($event, idx)"
        @dragleave="onDragLeave($event, idx)"
        @drop="onDrop($event, idx)"
        @dragend="onDragEnd"
      >
        <!-- Top Controls Overlay (Visible on hover) -->
        <div class="absolute top-2.5 inset-x-2.5 z-10 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
          <!-- Move Left / Right Click Fallback -->
          <div class="flex items-center gap-1 bg-slate-900/80 backdrop-blur-md rounded-lg p-0.5 text-white shadow-xs">
            <button
              type="button"
              class="p-1 hover:text-primary transition-colors disabled:opacity-30 disabled:hover:text-white"
              :disabled="idx === 0"
              title="Move Left"
              @click.stop="emit('moveFile', idx, idx - 1)"
            >
              <UIcon
                name="i-lucide-chevron-left"
                class="w-3.5 h-3.5"
              />
            </button>
            <button
              type="button"
              class="p-1 hover:text-primary transition-colors disabled:opacity-30 disabled:hover:text-white"
              :disabled="idx === files.length - 1"
              title="Move Right"
              @click.stop="emit('moveFile', idx, idx + 1)"
            >
              <UIcon
                name="i-lucide-chevron-right"
                class="w-3.5 h-3.5"
              />
            </button>
          </div>

          <!-- Rotate & Remove -->
          <div class="flex items-center gap-1 bg-slate-900/80 backdrop-blur-md rounded-lg p-0.5 text-white shadow-xs">
            <button
              type="button"
              class="p-1 hover:text-amber-400 transition-colors"
              title="Rotate Document 90°"
              @click.stop="emit('rotateFile', idx)"
            >
              <UIcon
                name="i-lucide-rotate-cw"
                class="w-3.5 h-3.5"
              />
            </button>
            <button
              type="button"
              class="p-1 hover:text-rose-400 transition-colors"
              title="Remove File"
              @click.stop="emit('removeFile', idx)"
            >
              <UIcon
                name="i-lucide-x"
                class="w-3.5 h-3.5"
              />
            </button>
          </div>
        </div>

        <!-- Rendered White Paper Preview (matches user screenshot) -->
        <div class="w-full aspect-[3/4] bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 p-2.5 flex items-center justify-center relative overflow-hidden my-1">
          <!-- Active Thumbnail Canvas Image -->
          <div
            v-if="doc.thumbnailUrl"
            class="w-full h-full flex items-center justify-center transition-transform duration-200"
            :style="{ transform: `rotate(${doc.rotation}deg)` }"
          >
            <img
              :src="doc.thumbnailUrl"
              :alt="doc.name"
              class="max-h-full max-w-full object-contain rounded-sm shadow-md border border-slate-200/90 dark:border-slate-700 bg-white pointer-events-none"
            >
          </div>

          <!-- Loading Shimmer Skeleton while canvas renders -->
          <div
            v-else-if="doc.isLoadingThumbnail"
            class="w-full h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 space-y-2 animate-pulse pointer-events-none"
          >
            <UIcon
              name="i-lucide-file-text"
              class="w-12 h-12 stroke-[1.2]"
            />
            <span class="text-[10px] font-mono font-medium">Generating Preview...</span>
          </div>

          <!-- Document Mockup Fallback if canvas is not supported/delayed -->
          <div
            v-else
            class="w-full h-full bg-white dark:bg-slate-800 rounded-sm shadow-xs border border-slate-200 dark:border-slate-700 p-3 flex flex-col justify-between pointer-events-none"
            :style="{ transform: `rotate(${doc.rotation}deg)` }"
          >
            <div class="space-y-1.5 opacity-60">
              <div class="flex items-center gap-1.5 mb-2">
                <UIcon
                  name="i-lucide-file-text"
                  class="w-4 h-4 text-rose-500"
                />
                <div class="h-2 bg-slate-300 dark:bg-slate-600 rounded w-2/3" />
              </div>
              <div class="h-1 bg-slate-200 dark:bg-slate-700 rounded w-full" />
              <div class="h-1 bg-slate-200 dark:bg-slate-700 rounded w-5/6" />
              <div class="h-1 bg-slate-200 dark:bg-slate-700 rounded w-full" />
              <div class="h-1 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
            </div>
            <div class="text-[9px] font-mono text-slate-400 text-center">
              PDF Document
            </div>
          </div>

          <!-- Document Order Number Badge -->
          <div class="absolute bottom-2 left-2 z-10 px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-slate-900/70 text-white backdrop-blur-sm">
            #{{ idx + 1 }}
          </div>

          <!-- Page Count Badge -->
          <div
            v-if="doc.numPages > 0"
            class="absolute bottom-2 right-2 z-10 px-2 py-0.5 rounded-md text-[10px] font-medium font-mono bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 shadow-2xs border border-slate-200/80 dark:border-slate-700"
          >
            {{ doc.numPages }} pg
          </div>
        </div>

        <!-- Bottom File Meta Info -->
        <div class="pt-2 text-center">
          <div
            class="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate"
            :title="doc.name"
          >
            {{ doc.name }}
          </div>
          <div class="text-[10px] text-slate-400 font-mono mt-0.5">
            {{ doc.sizeFormatted }}
          </div>
        </div>
      </div>

      <!-- Add Document Quick Tile -->
      <label class="border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-primary/60 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all bg-slate-50/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-900 min-h-[220px] text-center group">
        <input
          type="file"
          class="hidden"
          multiple
          :accept="accept || '.pdf,application/pdf'"
          @change="handleFileInput"
        >
        <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 group-hover:bg-primary/10 text-slate-400 group-hover:text-primary flex items-center justify-center transition-colors">
          <UIcon
            name="i-lucide-plus"
            class="w-5 h-5"
          />
        </div>
        <span class="text-xs font-bold text-slate-700 dark:text-slate-300 group-hover:text-primary">
          Add Document
        </span>
        <span class="text-[10px] text-slate-400">
          Upload more files
        </span>
      </label>
    </div>
  </div>
</template>
