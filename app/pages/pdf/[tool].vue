<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { usePdfEngine, type PageThumbnail } from '../../composables/usePdfEngine'
import PdfDropZone from '../../components/pdf/PdfDropZone.vue'
import PdfPageGrid from '../../components/pdf/PdfPageGrid.vue'
import PdfFileCardGrid, { type DocumentFileCard } from '../../components/pdf/PdfFileCardGrid.vue'
import PdfActionDock from '../../components/pdf/PdfActionDock.vue'

const route = useRoute()
const toolId = computed(() => String(route.params.tool || 'merge').toLowerCase())

const toolMetadata: Record<string, { title: string; desc: string; icon: string; action: string; multiple: boolean; accept?: string }> = {
  merge: {
    title: 'Merge PDF Documents',
    desc: 'Select or drag multiple PDF files to combine them into a single clean document.',
    icon: 'i-lucide-combine',
    action: 'Merge & Download',
    multiple: true
  },
  split: {
    title: 'Split PDF by Page Range',
    desc: 'Extract specific pages or chapters into a brand-new PDF document.',
    icon: 'i-lucide-scissors',
    action: 'Extract & Download',
    multiple: false
  },
  rotate: {
    title: 'Rotate PDF Pages',
    desc: 'Rotate specific pages or all pages clockwise with real-time visual feedback.',
    icon: 'i-lucide-rotate-cw',
    action: 'Save & Download',
    multiple: false
  },
  'remove-pages': {
    title: 'Remove PDF Pages',
    desc: 'Click on individual page cards to exclude them from the exported document.',
    icon: 'i-lucide-file-x-2',
    action: 'Remove & Download',
    multiple: false
  },
  watermark: {
    title: 'Watermark PDF',
    desc: 'Stamp custom enterprise security text (e.g. Confidential, Draft, Internal) with custom opacity.',
    icon: 'i-lucide-stamp',
    action: 'Watermark & Download',
    multiple: false
  },
  'page-numbers': {
    title: 'Add Dynamic Page Numbers',
    desc: 'Insert formatted page numbers across your entire PDF document automatically.',
    icon: 'i-lucide-hash',
    action: 'Number & Download',
    multiple: false
  },
  'images-to-pdf': {
    title: 'Convert Images to PDF',
    desc: 'Combine JPG and PNG images into a presentation-grade consolidated PDF.',
    icon: 'i-lucide-image',
    action: 'Convert & Download',
    multiple: true,
    accept: 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg'
  },
  protect: {
    title: 'Encrypt & Protect PDF',
    desc: 'Add password encryption to your PDF document to restrict viewing.',
    icon: 'i-lucide-lock',
    action: 'Encrypt & Download',
    multiple: false
  },
  unlock: {
    title: 'Unlock Password-Protected PDF',
    desc: 'Remove password restrictions from an encrypted PDF using your known password.',
    icon: 'i-lucide-unlock',
    action: 'Decrypt & Download',
    multiple: false
  }
}

const currentTool = computed(() => {
  return toolMetadata[toolId.value] || toolMetadata.merge!
})

useHead({
  title: computed(() => `${currentTool.value.title} | Enterprise PDF Studio`)
})

const {
  isProcessing,
  progressPercent,
  statusMessage,
  errorMessage,
  mergePdfs,
  splitPdf,
  rotatePdf,
  removePages,
  watermarkPdf,
  addPageNumbers,
  imagesToPdf,
  inspectPdf,
  renderPageThumbnail,
  renderAllPageThumbnails,
  downloadBlob,
  formatBytes
} = usePdfEngine()

// File & Card State
const selectedFiles = ref<File[]>([])
const documentCards = ref<DocumentFileCard[]>([])
const pages = ref<PageThumbnail[]>([])
const pageRotations = ref<Map<number, number>>(new Map())
const totalDocumentPages = ref(0)
const isLoadingThumbnails = ref(false)

// Tool Specific Form Options
const splitRange = ref('1-5')
const watermarkText = ref('CONFIDENTIAL')
const watermarkOpacity = ref(0.25)
const watermarkAngle = ref(-45)
const pageNumberFormat = ref<'number' | 'page_of_total'>('page_of_total')
const pageNumberPosition = ref<'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-right'>('bottom-center')
const docPassword = ref('')

async function handleFilesSelected(files: File[]) {
  if (currentTool.value.multiple) {
    const newCards: DocumentFileCard[] = files.map((file, idx) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${idx}`,
      file,
      name: file.name,
      sizeFormatted: formatBytes(file.size),
      numPages: 0,
      rotation: 0,
      isLoadingThumbnail: true
    }))

    documentCards.value.push(...newCards)
    selectedFiles.value = documentCards.value.map(d => d.file)

    // Asynchronously render realistic previews for each card with reactive proxy lookups
    for (const card of newCards) {
      const cardId = card.id
      if (card.file.type.startsWith('image/')) {
        const found = documentCards.value.find(c => c.id === cardId)
        if (found) {
          found.thumbnailUrl = URL.createObjectURL(card.file)
          found.numPages = 1
          found.isLoadingThumbnail = false
        }
      } else {
        inspectPdf(card.file).then(inspect => {
          const found = documentCards.value.find(c => c.id === cardId)
          if (found) found.numPages = inspect.numPages
        })
        renderPageThumbnail(card.file, 1, 0.4).then(thumb => {
          const found = documentCards.value.find(c => c.id === cardId)
          if (found) {
            if (thumb) {
              found.thumbnailUrl = thumb
            }
            found.isLoadingThumbnail = false
          }
        }).catch(err => {
          console.warn('Card preview failed:', err)
          const found = documentCards.value.find(c => c.id === cardId)
          if (found) {
            found.isLoadingThumbnail = false
          }
        })
      }
    }
  } else {
    selectedFiles.value = [files[0]!]
    const targetFile = selectedFiles.value[0]!

    // If tool uses page grid, inspect & render page previews
    if (['split', 'rotate', 'remove-pages', 'watermark', 'page-numbers'].includes(toolId.value)) {
      isLoadingThumbnails.value = true
      const inspect = await inspectPdf(targetFile)
      totalDocumentPages.value = inspect.numPages
      splitRange.value = inspect.numPages > 1 ? `1-${Math.min(5, inspect.numPages)}` : '1'

      // Initial placeholder pages
      pages.value = Array.from({ length: inspect.numPages }, (_, i) => ({
        pageNumber: i + 1,
        rotation: 0,
        isDeleted: false
      }))
      pageRotations.value.clear()

      // Asynchronously render high-fidelity canvas page previews
      renderAllPageThumbnails(targetFile, 60, 0.35).then(renderedPages => {
        if (renderedPages.length > 0) {
          pages.value = renderedPages
        }
      }).finally(() => {
        isLoadingThumbnails.value = false
      })
    }
  }
}

function handleMoveCard(fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || fromIndex >= documentCards.value.length || toIndex < 0 || toIndex >= documentCards.value.length) return
  const item = documentCards.value.splice(fromIndex, 1)[0]!
  documentCards.value.splice(toIndex, 0, item)
  selectedFiles.value = documentCards.value.map(d => d.file)
}

function handleRotateCard(index: number) {
  const card = documentCards.value[index]
  if (card) {
    card.rotation = (card.rotation + 90) % 360
  }
}

function handleRemoveCard(index: number) {
  documentCards.value.splice(index, 1)
  selectedFiles.value = documentCards.value.map(d => d.file)
  if (documentCards.value.length === 0) {
    resetAll()
  }
}

function handleRotatePage(pageNumber: number) {
  const p = pages.value.find(item => item.pageNumber === pageNumber)
  if (p) {
    p.rotation = (p.rotation + 90) % 360
    pageRotations.value.set(pageNumber, p.rotation)
  }
}

function handleToggleDeletePage(pageNumber: number) {
  const p = pages.value.find(item => item.pageNumber === pageNumber)
  if (p) {
    p.isDeleted = !p.isDeleted
  }
}

function handleResetEdits() {
  pages.value.forEach(p => {
    p.rotation = 0
    p.isDeleted = false
  })
  pageRotations.value.clear()
}

function resetAll() {
  documentCards.value = []
  selectedFiles.value = []
  pages.value = []
  pageRotations.value.clear()
  totalDocumentPages.value = 0
  isLoadingThumbnails.value = false
}

const canExecute = computed(() => {
  if (selectedFiles.value.length === 0) return false
  if (toolId.value === 'split' && !splitRange.value.trim()) return false
  if (toolId.value === 'watermark' && !watermarkText.value.trim()) return false
  return true
})

async function executeCurrentAction() {
  if (!canExecute.value || isProcessing.value) return

  try {
    const firstFile = selectedFiles.value[0]!
    const baseName = firstFile.name.replace(/\.[^/.]+$/, '')

    let outputBytes: Uint8Array | null = null
    let outputFilename = `${baseName}_processed.pdf`

    if (toolId.value === 'merge') {
      const orderedFiles = documentCards.value.length > 0
        ? documentCards.value.map(d => d.file)
        : selectedFiles.value
      outputBytes = await mergePdfs(orderedFiles)
      outputFilename = 'Consolidated_Merged_Document.pdf'
    } else if (toolId.value === 'split') {
      outputBytes = await splitPdf(firstFile, splitRange.value)
      outputFilename = `${baseName}_split.pdf`
    } else if (toolId.value === 'rotate') {
      outputBytes = await rotatePdf(firstFile, pageRotations.value)
      outputFilename = `${baseName}_rotated.pdf`
    } else if (toolId.value === 'remove-pages') {
      const toDelete = pages.value.filter(p => p.isDeleted).map(p => p.pageNumber - 1)
      outputBytes = await removePages(firstFile, toDelete)
      outputFilename = `${baseName}_trimmed.pdf`
    } else if (toolId.value === 'watermark') {
      outputBytes = await watermarkPdf(firstFile, {
        text: watermarkText.value,
        opacity: watermarkOpacity.value,
        angle: watermarkAngle.value
      })
      outputFilename = `${baseName}_watermarked.pdf`
    } else if (toolId.value === 'page-numbers') {
      outputBytes = await addPageNumbers(firstFile, {
        format: pageNumberFormat.value,
        position: pageNumberPosition.value
      })
      outputFilename = `${baseName}_numbered.pdf`
    } else if (toolId.value === 'images-to-pdf') {
      const orderedFiles = documentCards.value.length > 0
        ? documentCards.value.map(d => d.file)
        : selectedFiles.value
      outputBytes = await imagesToPdf(orderedFiles)
      outputFilename = 'Images_Presentation.pdf'
    }

    if (outputBytes) {
      downloadBlob(outputBytes, outputFilename)
    }
  } catch (err) {
    console.error('Operation failed:', err)
  }
}
</script>

<template>
  <div class="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6 pb-28">
    <!-- Breadcrumb & Nav -->
    <div class="flex items-center justify-between">
      <NuxtLink
        to="/pdf"
        class="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-primary transition-colors"
      >
        <UIcon
          name="i-lucide-arrow-left"
          class="w-4 h-4"
        />
        Back to PDF Studio
      </NuxtLink>

      <span class="inline-flex items-center gap-1 text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
        <UIcon
          name="i-lucide-cpu"
          class="w-3.5 h-3.5 text-primary"
        />
        Local Client Execution
      </span>
    </div>

    <!-- Tool Title Header -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <UIcon
            :name="currentTool.icon"
            class="w-6 h-6"
          />
        </div>
        <div>
          <h1 class="text-xl font-bold text-slate-900 dark:text-slate-100">
            {{ currentTool.title }}
          </h1>
          <p class="text-xs text-slate-500 mt-0.5">
            {{ currentTool.desc }}
          </p>
        </div>
      </div>
    </div>

    <!-- Error Banner -->
    <div
      v-if="errorMessage"
      class="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2"
    >
      <UIcon
        name="i-lucide-alert-circle"
        class="w-4 h-4 text-rose-500 shrink-0"
      />
      <span>{{ errorMessage }}</span>
    </div>

    <!-- Upload DropZone (If no files selected yet) -->
    <div v-if="selectedFiles.length === 0">
      <PdfDropZone
        :multiple="currentTool.multiple"
        :accept="currentTool.accept || '.pdf,application/pdf'"
        @files-selected="handleFilesSelected"
      />
    </div>

    <!-- Active Workbench Stage -->
    <div
      v-else
      class="space-y-6"
    >
      <!-- File Management Cards (Matches iLovePDF Document Grid Preview) -->
      <div
        v-if="currentTool.multiple"
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs"
      >
        <PdfFileCardGrid
          :files="documentCards"
          :accept="currentTool.accept || '.pdf,application/pdf'"
          @move-file="handleMoveCard"
          @rotate-file="handleRotateCard"
          @remove-file="handleRemoveCard"
          @add-files="handleFilesSelected"
        />
      </div>

      <!-- Tool Configuration Controls -->

      <!-- Split Range Config -->
      <div
        v-if="toolId === 'split'"
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4"
      >
        <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <UIcon
            name="i-lucide-sliders"
            class="w-4 h-4 text-primary"
          />
          Split Range Configuration
        </h3>
        <div class="max-w-md space-y-2">
          <UFormField
            label="Page Ranges to Extract"
            help="Total pages detected: {{ totalDocumentPages }}. Example: 1-3, 5, 8-10"
          >
            <UInput
              v-model="splitRange"
              icon="i-lucide-file-text"
              placeholder="e.g. 1-3, 5"
              class="w-full"
            />
          </UFormField>
        </div>
      </div>

      <!-- Watermark Configuration -->
      <div
        v-if="toolId === 'watermark'"
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4"
      >
        <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <UIcon
            name="i-lucide-sliders"
            class="w-4 h-4 text-primary"
          />
          Watermark Customization
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <UFormField label="Stamp Text">
            <UInput
              v-model="watermarkText"
              placeholder="e.g. CONFIDENTIAL"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Opacity ({{ Math.round(watermarkOpacity * 100) }}%)">
            <input
              v-model.number="watermarkOpacity"
              type="range"
              min="0.05"
              max="0.8"
              step="0.05"
              class="w-full mt-2"
            >
          </UFormField>

          <UFormField label="Rotation Angle ({{ watermarkAngle }}°)">
            <input
              v-model.number="watermarkAngle"
              type="range"
              min="-90"
              max="90"
              step="15"
              class="w-full mt-2"
            >
          </UFormField>
        </div>
      </div>

      <!-- Page Numbers Configuration -->
      <div
        v-if="toolId === 'page-numbers'"
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4"
      >
        <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <UIcon
            name="i-lucide-sliders"
            class="w-4 h-4 text-primary"
          />
          Page Numbering Options
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField label="Number Format">
            <select
              v-model="pageNumberFormat"
              class="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
            >
              <option value="page_of_total">
                Page X of Y (e.g. Page 1 of 12)
              </option>
              <option value="number">
                Digit Only (e.g. 1)
              </option>
            </select>
          </UFormField>

          <UFormField label="Footer Placement">
            <select
              v-model="pageNumberPosition"
              class="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
            >
              <option value="bottom-center">
                Bottom Center
              </option>
              <option value="bottom-right">
                Bottom Right
              </option>
              <option value="bottom-left">
                Bottom Left
              </option>
              <option value="top-right">
                Top Right
              </option>
            </select>
          </UFormField>
        </div>
      </div>

      <!-- Visual Page Grid (For Rotate & Remove Pages) -->
      <div
        v-if="pages.length > 0 && ['rotate', 'remove-pages'].includes(toolId)"
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs"
      >
        <PdfPageGrid
          :pages="pages"
          :is-loading-thumbnails="isLoadingThumbnails"
          @rotate-page="handleRotatePage"
          @toggle-delete-page="handleToggleDeletePage"
          @reset-all="handleResetEdits"
        />
      </div>

      <!-- Action Floating Dock -->
      <PdfActionDock
        :action-label="currentTool.action"
        :action-icon="currentTool.icon"
        :is-processing="isProcessing"
        :progress-percent="progressPercent"
        :status-message="statusMessage"
        :file-count="selectedFiles.length"
        :can-execute="canExecute"
        @execute="executeCurrentAction"
        @reset="resetAll"
      />
    </div>
  </div>
</template>

