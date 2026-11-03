<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  usePdfEngine,
  type PageThumbnail,
  type CompressResult,
  type PageImageOutput,
  type PdfToExcelResult,
  type PdfToWordResult
} from '../../composables/usePdfEngine'
import PdfDropZone from '../../components/pdf/PdfDropZone.vue'
import PdfPageGrid from '../../components/pdf/PdfPageGrid.vue'
import PdfFileCardGrid, { type DocumentFileCard } from '../../components/pdf/PdfFileCardGrid.vue'
import PdfActionDock from '../../components/pdf/PdfActionDock.vue'

const route = useRoute()
const toolId = computed(() => String(route.params.tool || 'merge').toLowerCase())

const toolMetadata: Record<string, { title: string, desc: string, icon: string, action: string, multiple: boolean, accept?: string }> = {
  'merge': {
    title: 'Merge PDF Documents',
    desc: 'Select or drag multiple PDF files to combine them into a single clean document.',
    icon: 'i-lucide-combine',
    action: 'Merge & Download',
    multiple: true
  },
  'split': {
    title: 'Split PDF by Page Range',
    desc: 'Extract specific pages or chapters into a brand-new PDF document.',
    icon: 'i-lucide-scissors',
    action: 'Extract & Download',
    multiple: false
  },
  'compress': {
    title: 'Compress PDF Document',
    desc: 'Reduce file size by 30% to 85% with smart vector stream indexing or portal-ready quantization.',
    icon: 'i-lucide-minimize-2',
    action: 'Compress & Download',
    multiple: false
  },
  'pdf-to-excel': {
    title: 'Convert PDF to Excel (.xlsx / .csv)',
    desc: 'Extract financial ledgers, balance sheets, and invoices into structured Excel spreadsheets.',
    icon: 'i-lucide-table',
    action: 'Extract & Download',
    multiple: false
  },
  'pdf-to-word': {
    title: 'Convert PDF to Word (.docx)',
    desc: 'Convert your PDF document into an editable Microsoft Word document with reflowed headings and tables.',
    icon: 'i-lucide-file-text',
    action: 'Convert to Word',
    multiple: false
  },
  'pdf-to-image': {
    title: 'Convert PDF to High-Res Images',
    desc: 'Extract every page into crisp PNG, JPG, or WebP images with single-click multi-page ZIP export.',
    icon: 'i-lucide-image',
    action: 'Convert & Download',
    multiple: false
  },
  'images-to-pdf': {
    title: 'Convert Images to PDF',
    desc: 'Combine JPG and PNG images into a presentation-grade consolidated PDF.',
    icon: 'i-lucide-file-image',
    action: 'Convert & Download',
    multiple: true,
    accept: 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg'
  },
  'rotate': {
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
  'organize': {
    title: 'Organize PDF Pages',
    desc: 'Drag and drop page thumbnails to sort and reorder. Rotate or exclude pages visually with live previews.',
    icon: 'i-lucide-arrow-down-up',
    action: 'Save & Download',
    multiple: false
  },
  'watermark': {
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
  organizePdf,
  watermarkPdf,
  addPageNumbers,
  imagesToPdf,
  compressPdf,
  pdfToImages,
  pdfToExcel,
  pdfToWord,
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

// 1. Compress Options & Result
const compressTier = ref<'lossless' | 'balanced' | 'extreme'>('balanced')
const compressStats = ref<CompressResult | null>(null)

// 2. PDF to Image Options & Result
const imageFormat = ref<'png' | 'jpeg' | 'webp'>('png')
const imageDpiScale = ref<number>(2) // 1=75 DPI, 2=150 DPI, 4=300 DPI
const imageOutputs = ref<PageImageOutput[]>([])

// 3. PDF to Excel Options & Result
const excelFormat = ref<'xlsx' | 'csv'>('xlsx')
const excelSheetMode = ref<'multi_sheet' | 'single_sheet'>('multi_sheet')
const excelTableOnly = ref<boolean>(false)
const excelStats = ref<PdfToExcelResult | null>(null)

// 4. PDF to Word Options & Result
const wordPreservePageBreaks = ref<boolean>(true)
const wordStats = ref<PdfToWordResult | null>(null)

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
        inspectPdf(card.file).then((inspect) => {
          const found = documentCards.value.find(c => c.id === cardId)
          if (found) found.numPages = inspect.numPages
        })
        renderPageThumbnail(card.file, 1, 0.4).then((thumb) => {
          const found = documentCards.value.find(c => c.id === cardId)
          if (found) {
            if (thumb) {
              found.thumbnailUrl = thumb
            }
            found.isLoadingThumbnail = false
          }
        }).catch((err) => {
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

    // Reset previous results
    compressStats.value = null
    imageOutputs.value = []
    excelStats.value = null
    wordStats.value = null

    // If tool uses page grid, inspect & render page previews
    if (['split', 'rotate', 'remove-pages', 'watermark', 'page-numbers', 'organize'].includes(toolId.value)) {
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
      renderAllPageThumbnails(targetFile, 60, 0.35).then((renderedPages) => {
        if (renderedPages.length > 0) {
          pages.value = renderedPages
        }
      }).finally(() => {
        isLoadingThumbnails.value = false
      })
    } else {
      // General inspection
      inspectPdf(targetFile).then((inspect) => {
        totalDocumentPages.value = inspect.numPages
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

function handleMovePage(fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || fromIndex >= pages.value.length || toIndex < 0 || toIndex >= pages.value.length) return
  const item = pages.value.splice(fromIndex, 1)[0]!
  pages.value.splice(toIndex, 0, item)
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
  pages.value.forEach((p) => {
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
  compressStats.value = null
  imageOutputs.value = []
  excelStats.value = null
  wordStats.value = null
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
      if (outputBytes) downloadBlob(outputBytes, outputFilename)
    } else if (toolId.value === 'split') {
      outputBytes = await splitPdf(firstFile, splitRange.value)
      outputFilename = `${baseName}_split.pdf`
      if (outputBytes) downloadBlob(outputBytes, outputFilename)
    } else if (toolId.value === 'compress') {
      const res = await compressPdf(firstFile, compressTier.value)
      compressStats.value = res
      downloadBlob(res.bytes, `${baseName}_compressed.pdf`)
    } else if (toolId.value === 'pdf-to-image') {
      const res = await pdfToImages(firstFile, {
        format: imageFormat.value,
        dpiScale: imageDpiScale.value
      })
      imageOutputs.value = res.images
      if (res.zipBlob && res.zipFilename) {
        downloadBlob(res.zipBlob, res.zipFilename, 'application/zip')
      } else if (res.images[0]) {
        const mime = imageFormat.value === 'png' ? 'image/png' : imageFormat.value === 'webp' ? 'image/webp' : 'image/jpeg'
        downloadBlob(res.images[0].blob, res.images[0].filename, mime)
      }
    } else if (toolId.value === 'pdf-to-excel') {
      const res = await pdfToExcel(firstFile, {
        format: excelFormat.value,
        sheetMode: excelSheetMode.value,
        tableOnly: excelTableOnly.value
      })
      excelStats.value = res
      const mime = excelFormat.value === 'csv'
        ? 'text/csv'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      downloadBlob(res.data, res.filename, mime)
    } else if (toolId.value === 'pdf-to-word') {
      const res = await pdfToWord(firstFile, {
        preservePageBreaks: wordPreservePageBreaks.value
      })
      wordStats.value = res
      downloadBlob(res.blob, res.filename, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    } else if (['organize', 'rotate', 'remove-pages'].includes(toolId.value)) {
      outputBytes = await organizePdf(firstFile, pages.value)
      outputFilename = `${baseName}_${toolId.value === 'organize' ? 'organized' : (toolId.value === 'rotate' ? 'rotated' : 'trimmed')}.pdf`
      if (outputBytes) downloadBlob(outputBytes, outputFilename)
    } else if (toolId.value === 'watermark') {
      outputBytes = await watermarkPdf(firstFile, {
        text: watermarkText.value,
        opacity: watermarkOpacity.value,
        angle: watermarkAngle.value
      })
      outputFilename = `${baseName}_watermarked.pdf`
      if (outputBytes) downloadBlob(outputBytes, outputFilename)
    } else if (toolId.value === 'page-numbers') {
      outputBytes = await addPageNumbers(firstFile, {
        format: pageNumberFormat.value,
        position: pageNumberPosition.value
      })
      outputFilename = `${baseName}_numbered.pdf`
      if (outputBytes) downloadBlob(outputBytes, outputFilename)
    } else if (toolId.value === 'images-to-pdf') {
      const orderedFiles = documentCards.value.length > 0
        ? documentCards.value.map(d => d.file)
        : selectedFiles.value
      outputBytes = await imagesToPdf(orderedFiles)
      outputFilename = 'Images_Presentation.pdf'
      if (outputBytes) downloadBlob(outputBytes, outputFilename)
    }
  } catch (err) {
    console.error('Operation failed:', err)
  }
}

function copyImageToClipboard(img: PageImageOutput) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && 'ClipboardItem' in window) {
    try {
      const ClipboardItemConstructor = (window as unknown as { ClipboardItem: new (data: Record<string, Blob>) => ClipboardItem }).ClipboardItem
      const item = new ClipboardItemConstructor({ [img.blob.type]: img.blob })
      navigator.clipboard.write([item])
      alert(`Page ${img.pageNumber} copied to clipboard!`)
    } catch {
      window.open(img.dataUrl, '_blank')
    }
  } else {
    window.open(img.dataUrl, '_blank')
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
        Local Client Execution • $0 Cloud Cost
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
      <!-- Multi-File Card Grid (For Merge & Images-to-PDF) -->
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

      <!-- Single File Selected Strip -->
      <div
        v-else
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex items-center justify-between"
      >
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <UIcon
              name="i-lucide-file-text"
              class="w-5 h-5"
            />
          </div>
          <div>
            <div class="text-xs font-bold text-slate-900 dark:text-slate-100">
              {{ selectedFiles[0]?.name }}
            </div>
            <div class="text-[11px] text-slate-400 font-mono">
              {{ formatBytes(selectedFiles[0]?.size || 0) }} • {{ totalDocumentPages }} pages detected
            </div>
          </div>
        </div>

        <UButton
          variant="ghost"
          size="xs"
          color="neutral"
          icon="i-lucide-refresh-cw"
          @click="resetAll"
        >
          Change Document
        </UButton>
      </div>

      <!-- ==================== TOOL CONFIGURATIONS ==================== -->

      <!-- 1. Compress Tool Options -->
      <div
        v-if="toolId === 'compress'"
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4"
      >
        <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <UIcon
            name="i-lucide-sliders"
            class="w-4 h-4 text-primary"
          />
          Compression Strategy
        </h3>

        <!-- 3-Tier Radio Selection -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <!-- Tier 1: Smart Vector -->
          <label
            class="border-2 rounded-xl p-4 cursor-pointer transition-all flex flex-col justify-between"
            :class="compressTier === 'lossless' ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'"
          >
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-slate-900 dark:text-slate-100">Smart Vector</span>
                <input
                  v-model="compressTier"
                  type="radio"
                  value="lossless"
                  class="text-primary"
                >
              </div>
              <p class="text-[11px] text-slate-500 leading-relaxed">
                Compacts indirect object streams. 100% vector crispness, text remains selectable.
              </p>
            </div>
            <span class="mt-3 inline-block text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 w-fit">
              ~20% - 35% Savings
            </span>
          </label>

          <!-- Tier 2: Balanced -->
          <label
            class="border-2 rounded-xl p-4 cursor-pointer transition-all flex flex-col justify-between"
            :class="compressTier === 'balanced' ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'"
          >
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-slate-900 dark:text-slate-100">Balanced (Recommended)</span>
                <input
                  v-model="compressTier"
                  type="radio"
                  value="balanced"
                  class="text-primary"
                >
              </div>
              <p class="text-[11px] text-slate-500 leading-relaxed">
                150 DPI calibrated quantization. Greatly reduces heavy embedded images & scans.
              </p>
            </div>
            <span class="mt-3 inline-block text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 w-fit">
              ~50% - 70% Savings
            </span>
          </label>

          <!-- Tier 3: Extreme -->
          <label
            class="border-2 rounded-xl p-4 cursor-pointer transition-all flex flex-col justify-between"
            :class="compressTier === 'extreme' ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'"
          >
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-slate-900 dark:text-slate-100">Maximum Upload</span>
                <input
                  v-model="compressTier"
                  type="radio"
                  value="extreme"
                  class="text-primary"
                >
              </div>
              <p class="text-[11px] text-slate-500 leading-relaxed">
                High-efficiency 96 DPI downsampling. Engineered for government portals & email attachments.
              </p>
            </div>
            <span class="mt-3 inline-block text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 w-fit">
              ~75% - 88% Savings
            </span>
          </label>
        </div>

        <!-- Savings Success Banner (Appears after compression) -->
        <div
          v-if="compressStats"
          class="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between"
        >
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-check-circle"
              class="w-4 h-4 text-emerald-500 shrink-0"
            />
            <span>
              Compressed from <b>{{ formatBytes(compressStats.originalSize) }}</b> down to <b>{{ formatBytes(compressStats.compressedSize) }}</b>. Saved {{ compressStats.savingsFormatted }}!
            </span>
          </div>
          <span class="font-mono font-bold text-sm bg-emerald-200 dark:bg-emerald-900 px-2.5 py-0.5 rounded-full">
            -{{ compressStats.ratioPercent }}%
          </span>
        </div>
      </div>

      <!-- 2. PDF to Image Options -->
      <div
        v-if="toolId === 'pdf-to-image'"
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4"
      >
        <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <UIcon
            name="i-lucide-sliders"
            class="w-4 h-4 text-primary"
          />
          Image Resolution & Output Format
        </h3>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
          <UFormField label="Image Format">
            <select
              v-model="imageFormat"
              class="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
            >
              <option value="png">
                PNG (Lossless, Sharp Vector Lines)
              </option>
              <option value="jpeg">
                JPEG (Standard Compact Format)
              </option>
              <option value="webp">
                WebP (Modern High-Efficiency)
              </option>
            </select>
          </UFormField>

          <UFormField label="Resolution / DPI Scale">
            <select
              v-model.number="imageDpiScale"
              class="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
            >
              <option :value="1">
                Standard Web (75 DPI / 1x)
              </option>
              <option :value="2">
                Retina Display (150 DPI / 2x - Recommended)
              </option>
              <option :value="4">
                Ultra-Sharp Print (300 DPI / 4x)
              </option>
            </select>
          </UFormField>
        </div>

        <p class="text-xs text-slate-400">
          • Documents with multiple pages are automatically compiled into a single convenient <b>.ZIP</b> package.
        </p>

        <!-- Converted Images Gallery -->
        <div
          v-if="imageOutputs.length > 0"
          class="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-700 dark:text-slate-200">
              Generated Images ({{ imageOutputs.length }})
            </span>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            <div
              v-for="img in imageOutputs"
              :key="img.pageNumber"
              class="border border-slate-200 dark:border-slate-800 rounded-xl p-2 bg-slate-50 dark:bg-slate-800/50 space-y-1.5 text-center group"
            >
              <div class="w-full aspect-[3/4] bg-white rounded overflow-hidden flex items-center justify-center border shadow-xs">
                <img
                  :src="img.dataUrl"
                  :alt="img.filename"
                  class="max-h-full max-w-full object-contain"
                >
              </div>
              <div class="text-[10px] font-mono text-slate-600 truncate">
                Page {{ img.pageNumber }} ({{ img.sizeFormatted }})
              </div>
              <button
                type="button"
                class="w-full text-[10px] py-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-primary hover:text-white transition-colors cursor-pointer"
                @click="copyImageToClipboard(img)"
              >
                Copy Image
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. PDF to Excel Options -->
      <div
        v-if="toolId === 'pdf-to-excel'"
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-5"
      >
        <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <UIcon
            name="i-lucide-sliders"
            class="w-4 h-4 text-primary"
          />
          Spreadsheet Extraction & Layout Settings
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          <!-- Format Selector -->
          <div class="space-y-2">
            <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">File Format</span>
            <div class="grid grid-cols-2 gap-2.5">
              <label
                class="border-2 rounded-xl p-3 cursor-pointer flex items-center justify-between transition-all"
                :class="excelFormat === 'xlsx' ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'"
              >
                <div>
                  <div class="text-xs font-bold text-slate-900 dark:text-slate-100">Excel (.xlsx)</div>
                  <div class="text-[10px] text-slate-400">Styled header & formulas</div>
                </div>
                <input
                  v-model="excelFormat"
                  type="radio"
                  value="xlsx"
                  class="text-primary"
                >
              </label>

              <label
                class="border-2 rounded-xl p-3 cursor-pointer flex items-center justify-between transition-all"
                :class="excelFormat === 'csv' ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'"
              >
                <div>
                  <div class="text-xs font-bold text-slate-900 dark:text-slate-100">Raw CSV (.csv)</div>
                  <div class="text-[10px] text-slate-400">Universal data format</div>
                </div>
                <input
                  v-model="excelFormat"
                  type="radio"
                  value="csv"
                  class="text-primary"
                >
              </label>
            </div>
          </div>

          <!-- Multi-Page Sheet Structure -->
          <div class="space-y-2">
            <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">Worksheet Organization</span>
            <div class="grid grid-cols-2 gap-2.5">
              <label
                class="border-2 rounded-xl p-3 cursor-pointer flex items-center justify-between transition-all"
                :class="excelSheetMode === 'multi_sheet' ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'"
              >
                <div>
                  <div class="text-xs font-bold text-slate-900 dark:text-slate-100">Separate Sheets</div>
                  <div class="text-[10px] text-slate-400">One tab per PDF page</div>
                </div>
                <input
                  v-model="excelSheetMode"
                  type="radio"
                  value="multi_sheet"
                  class="text-primary"
                >
              </label>

              <label
                class="border-2 rounded-xl p-3 cursor-pointer flex items-center justify-between transition-all"
                :class="excelSheetMode === 'single_sheet' ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'"
              >
                <div>
                  <div class="text-xs font-bold text-slate-900 dark:text-slate-100">Single Master Sheet</div>
                  <div class="text-[10px] text-slate-400">All pages consolidated</div>
                </div>
                <input
                  v-model="excelSheetMode"
                  type="radio"
                  value="single_sheet"
                  class="text-primary"
                >
              </label>
            </div>
          </div>
        </div>

        <!-- Extraction Filters -->
        <div class="flex items-center gap-2 pt-1">
          <input
            id="tableOnlyCheckbox"
            v-model="excelTableOnly"
            type="checkbox"
            class="rounded text-primary border-slate-300 focus:ring-primary"
          >
          <label
            for="tableOnlyCheckbox"
            class="text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            Extract <b>structured tables only</b> (exclude introductory paragraphs and notes from spreadsheet)
          </label>
        </div>

        <p class="text-xs text-slate-400 leading-relaxed">
          • Spatial coordinate engine automatically groups table columns, aligns missing cells without left-shifting, parses currency values, and formats data cells into native spreadsheet types.
        </p>

        <!-- Extraction Stats & Preview Banner -->
        <div
          v-if="excelStats"
          class="space-y-4 pt-2"
        >
          <div class="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <UIcon
                name="i-lucide-check-circle"
                class="w-4 h-4 text-emerald-500 shrink-0"
              />
              <span>
                Exported <b>{{ excelStats.filename }}</b> with high-precision column alignment.
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-mono text-[11px] bg-emerald-200/80 dark:bg-emerald-900 px-2 py-0.5 rounded font-semibold">
                {{ excelStats.tableCount }} Tables
              </span>
              <span class="font-mono text-[11px] bg-emerald-200/80 dark:bg-emerald-900 px-2 py-0.5 rounded font-semibold">
                {{ excelStats.rowCount }} Data Rows
              </span>
              <span class="font-mono text-[11px] bg-emerald-200/80 dark:bg-emerald-900 px-2 py-0.5 rounded font-semibold">
                {{ excelStats.colCount }} Columns
              </span>
            </div>
          </div>

          <!-- Live Table Preview -->
          <div
            v-if="excelStats.previewRows && excelStats.previewRows.length > 0"
            class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900"
          >
            <div class="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span class="flex items-center gap-1.5">
                <UIcon
                  name="i-lucide-table"
                  class="w-3.5 h-3.5 text-primary"
                />
                Live Extracted Data Preview (First {{ excelStats.previewRows.length }} Rows)
              </span>
              <span class="text-[10px] text-slate-400 font-normal">
                Verifies exact column alignment before spreadsheet opening
              </span>
            </div>
            <div class="overflow-x-auto max-h-64">
              <table class="w-full text-xs text-left">
                <tbody>
                  <tr
                    v-for="(pRow, rIdx) in excelStats.previewRows"
                    :key="rIdx"
                    :class="rIdx === 0 ? 'bg-slate-800 text-white font-semibold' : (rIdx % 2 === 0 ? 'bg-slate-50/50 dark:bg-slate-800/30' : 'bg-white dark:bg-slate-900')"
                    class="border-b border-slate-100 dark:border-slate-800/60"
                  >
                    <td
                      v-for="(pCell, cIdx) in pRow"
                      :key="cIdx"
                      class="px-3 py-2 border-r border-slate-200/50 dark:border-slate-800/60 last:border-r-0 truncate max-w-xs"
                      :class="typeof pCell === 'number' ? 'text-right font-mono' : ''"
                    >
                      {{ pCell !== '' ? pCell : '—' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. PDF to Word Options -->
      <div
        v-if="toolId === 'pdf-to-word'"
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4"
      >
        <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <UIcon
            name="i-lucide-sliders"
            class="w-4 h-4 text-primary"
          />
          Word Document Reflow Settings
        </h3>

        <div class="max-w-xl space-y-3">
          <div class="flex items-center gap-2">
            <input
              id="preservePageBreaksCheckbox"
              v-model="wordPreservePageBreaks"
              type="checkbox"
              class="rounded text-primary border-slate-300 focus:ring-primary"
            >
            <label
              for="preservePageBreaksCheckbox"
              class="text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Preserve original <b>PDF page breaks</b> between sections
            </label>
          </div>

          <div class="space-y-1.5 text-xs text-slate-500 leading-relaxed">
            <p>
              • The in-browser reflow engine analyzes document typography to synthesize <b>Heading 1</b>, <b>Heading 2</b>, continuous flowing body paragraphs, and <b>unified multi-row native Word Tables</b> with aligned columns and borders.
            </p>
            <p>
              • Output format: <b>Microsoft Word Document (.docx)</b> compatible with Microsoft Word, Google Docs, Apple Pages, and LibreOffice.
            </p>
          </div>
        </div>

        <!-- Word Stats Banner -->
        <div
          v-if="wordStats"
          class="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-3"
        >
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-check-circle"
              class="w-4 h-4 text-emerald-500 shrink-0"
            />
            <span>
              Compiled <b>{{ wordStats.filename }}</b> with native Word typography.
            </span>
          </div>
          <div class="flex items-center gap-2">
            <span class="font-mono text-[11px] bg-emerald-200/80 dark:bg-emerald-900 px-2 py-0.5 rounded font-semibold">
              {{ wordStats.headingsCount }} Headings
            </span>
            <span class="font-mono text-[11px] bg-emerald-200/80 dark:bg-emerald-900 px-2 py-0.5 rounded font-semibold">
              {{ wordStats.paragraphsCount }} Flowing Paragraphs
            </span>
            <span class="font-mono text-[11px] bg-emerald-200/80 dark:bg-emerald-900 px-2 py-0.5 rounded font-semibold">
              {{ wordStats.tablesCount }} Native Tables
            </span>
          </div>
        </div>
      </div>

      <!-- 5. Split Range Config -->
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
            :help="`Total pages detected: ${totalDocumentPages}. Example: 1-3, 5, 8-10`"
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

      <!-- 6. Watermark Configuration -->
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

          <UFormField :label="`Opacity (${Math.round(watermarkOpacity * 100)}%)`">
            <input
              v-model.number="watermarkOpacity"
              type="range"
              min="0.05"
              max="0.8"
              step="0.05"
              class="w-full mt-2"
            >
          </UFormField>

          <UFormField :label="`Rotation Angle (${watermarkAngle}°)`">
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

      <!-- 7. Page Numbers Configuration -->
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

      <!-- 8. Visual Page Grid (For Organize, Rotate & Remove Pages) -->
      <div
        v-if="pages.length > 0 && ['organize', 'rotate', 'remove-pages'].includes(toolId)"
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs"
      >
        <PdfPageGrid
          :pages="pages"
          :is-loading-thumbnails="isLoadingThumbnails"
          @rotate-page="handleRotatePage"
          @toggle-delete-page="handleToggleDeletePage"
          @move-page="handleMovePage"
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
