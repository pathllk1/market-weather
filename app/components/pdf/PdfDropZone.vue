<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(
  defineProps<{
    multiple?: boolean
    accept?: string
    title?: string
    description?: string
    maxFiles?: number
  }>(),
  {
    multiple: true,
    accept: '.pdf,application/pdf',
    title: 'Drop PDF files here',
    description: 'or click to browse from your device',
    maxFiles: 50
  }
)

const emit = defineEmits<{
  (e: 'filesSelected', files: File[]): void
}>()

const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function handleDrop(e: DragEvent) {
  isDragging.value = false
  if (!e.dataTransfer?.files?.length) return

  const rawFiles = Array.from(e.dataTransfer.files)
  processFiles(rawFiles)
}

function handleFileInput(e: Event) {
  const target = e.target as HTMLInputElement
  if (!target.files?.length) return

  const rawFiles = Array.from(target.files)
  processFiles(rawFiles)
  target.value = '' // Reset so same file can be chosen again
}

function processFiles(incoming: File[]) {
  const acceptedTypes = props.accept.split(',').map(s => s.trim().toLowerCase())

  const valid = incoming.filter(f => {
    if (props.accept === '*' || props.accept === '*/*') return true
    const ext = '.' + f.name.split('.').pop()?.toLowerCase()
    return acceptedTypes.some(t => t === ext || (t.includes('/') && f.type.toLowerCase().includes(t.replace('/*', ''))))
  })

  if (valid.length > 0) {
    emit('filesSelected', valid.slice(0, props.maxFiles))
  }
}
</script>

<template>
  <div
    class="relative rounded-2xl border-2 border-dashed transition-all p-8 sm:p-12 text-center cursor-pointer group"
    :class="
      isDragging
        ? 'border-primary bg-primary/5 dark:bg-primary/10 scale-[1.01]'
        : 'border-slate-200 dark:border-slate-800 hover:border-primary/50 bg-white dark:bg-slate-900 shadow-xs'
    "
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    @drop.prevent="handleDrop"
    @click="fileInput?.click()"
  >
    <input
      ref="fileInput"
      type="file"
      class="hidden"
      :multiple="multiple"
      :accept="accept"
      @change="handleFileInput"
    >

    <div class="flex flex-col items-center justify-center space-y-3">
      <div
        class="w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 shadow-sm"
        :class="isDragging ? 'bg-primary text-white' : 'bg-primary/10 text-primary dark:bg-primary/20'"
      >
        <UIcon
          name="i-lucide-file-up"
          class="w-8 h-8"
        />
      </div>

      <div class="space-y-1">
        <h3 class="text-base font-bold text-slate-800 dark:text-slate-100 tracking-tight">
          {{ isDragging ? 'Release to upload files' : title }}
        </h3>
        <p class="text-xs text-slate-400 dark:text-slate-500">
          {{ description }}
        </p>
      </div>

      <div class="flex items-center gap-2 pt-2">
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
          <UIcon
            name="i-lucide-shield-check"
            class="w-3.5 h-3.5 text-emerald-500"
          />
          100% In-Browser Privacy
        </span>
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-mono">
          Zero Server Upload
        </span>
      </div>
    </div>
  </div>
</template>

