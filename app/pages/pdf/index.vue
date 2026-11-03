<script setup lang="ts">
import { ref, computed } from 'vue'

useHead({
  title: 'Enterprise PDF Studio | Secure In-Browser Document Engine',
  meta: [
    {
      name: 'description',
      content: 'In-house enterprise PDF tools. Merge, split, rotate, watermark, page-number, and convert PDFs directly in browser memory with zero third-party cloud uploads.'
    }
  ]
})

interface PdfTool {
  id: string
  title: string
  description: string
  icon: string
  category: 'organize' | 'security' | 'convert' | 'optimize'
  badge?: string
  to: string
}

const activeCategory = ref<'all' | 'organize' | 'security' | 'convert' | 'optimize'>('all')
const searchQuery = ref('')

const tools: PdfTool[] = [
  {
    id: 'merge',
    title: 'Merge PDF',
    description: 'Combine multiple PDF files into a single unified document in your preferred order.',
    icon: 'i-lucide-combine',
    category: 'organize',
    badge: 'Popular',
    to: '/pdf/merge'
  },
  {
    id: 'split',
    title: 'Split PDF',
    description: 'Extract specific page ranges (e.g. 1-5, 8, 12) or split a document into separate files.',
    icon: 'i-lucide-scissors',
    category: 'organize',
    badge: 'Fast',
    to: '/pdf/split'
  },
  {
    id: 'compress',
    title: 'Compress PDF',
    description: 'Reduce file size by 30% to 85% while keeping vector text sharp or optimizing for portal uploads.',
    icon: 'i-lucide-minimize-2',
    category: 'optimize',
    badge: 'Essential',
    to: '/pdf/compress'
  },
  {
    id: 'pdf-to-excel',
    title: 'PDF to Excel',
    description: 'Extract financial statements and tables into structured .xlsx spreadsheets or clean CSV format.',
    icon: 'i-lucide-table',
    category: 'convert',
    badge: 'Smart Tables',
    to: '/pdf/pdf-to-excel'
  },
  {
    id: 'pdf-to-word',
    title: 'PDF to Word',
    description: 'Convert PDF documents into editable Microsoft Word (.docx) files with heading & table reflow.',
    icon: 'i-lucide-file-text',
    category: 'convert',
    badge: 'Reflow',
    to: '/pdf/pdf-to-word'
  },
  {
    id: 'pdf-to-image',
    title: 'PDF to Image',
    description: 'Convert PDF pages into high-DPI PNG, JPG, or WebP images with single-click multi-page ZIP export.',
    icon: 'i-lucide-image',
    category: 'convert',
    badge: 'High-Res',
    to: '/pdf/pdf-to-image'
  },
  {
    id: 'images-to-pdf',
    title: 'JPG & PNG to PDF',
    description: 'Convert image files into a single presentation-grade PDF document with auto-fit margins.',
    icon: 'i-lucide-file-image',
    category: 'convert',
    to: '/pdf/images-to-pdf'
  },
  {
    id: 'rotate',
    title: 'Rotate PDF',
    description: 'Rotate specific pages or entire documents 90°, 180°, or 270° clockwise with live previews.',
    icon: 'i-lucide-rotate-cw',
    category: 'organize',
    to: '/pdf/rotate'
  },
  {
    id: 'remove-pages',
    title: 'Remove Pages',
    description: 'Delete unwanted or blank pages visually from any multi-page PDF document.',
    icon: 'i-lucide-file-x-2',
    category: 'organize',
    to: '/pdf/remove-pages'
  },
  {
    id: 'watermark',
    title: 'Watermark PDF',
    description: 'Apply custom text watermarks (e.g. Confidential, Draft, Internal) with custom opacity and angles.',
    icon: 'i-lucide-stamp',
    category: 'optimize',
    badge: 'Enterprise',
    to: '/pdf/watermark'
  },
  {
    id: 'page-numbers',
    title: 'Add Page Numbers',
    description: 'Insert dynamic page numbering headers or footers ("Page X of Y" or numeric digits).',
    icon: 'i-lucide-hash',
    category: 'optimize',
    to: '/pdf/page-numbers'
  }
]

const filteredTools = computed(() => {
  return tools.filter(t => {
    const matchesCategory = activeCategory.value === 'all' || t.category === activeCategory.value
    const query = searchQuery.value.toLowerCase().trim()
    const matchesSearch = !query || t.title.toLowerCase().includes(query) || t.description.toLowerCase().includes(query)
    return matchesCategory && matchesSearch
  })
})
</script>

<template>
  <div class="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
    <!-- Header Hero Banner -->
    <div class="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-8 sm:p-12 text-white shadow-xl relative overflow-hidden border border-slate-800">
      <div class="relative z-10 max-w-2xl space-y-3">
        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-white/10 text-emerald-400 border border-white/10 backdrop-blur-sm">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          100% In-Browser Engine • Zero Third-Party Uploads
        </div>

        <h1 class="text-3xl sm:text-4xl font-black tracking-tight text-white">
          Enterprise PDF Studio
        </h1>
        <p class="text-sm sm:text-base text-slate-300 leading-relaxed">
          High-performance PDF tools that run completely within your workstation memory. Merge, split, rotate, watermark, and convert without risking sensitive financial or tax documents to cloud services.
        </p>

        <!-- Stats Bar -->
        <div class="pt-4 flex flex-wrap items-center gap-6 text-xs text-slate-400 font-mono">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-cpu"
              class="w-4 h-4 text-primary"
            />
            <span>Pure JS & Wasm Engine</span>
          </div>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-shield-check"
              class="w-4 h-4 text-emerald-400"
            />
            <span>DPDP / Banking Grade Privacy</span>
          </div>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-zap"
              class="w-4 h-4 text-amber-400"
            />
            <span>Instant Execution</span>
          </div>
        </div>
      </div>

      <!-- Background Ambient Glow -->
      <div class="absolute -right-20 -bottom-20 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
    </div>

    <!-- Filters & Search Toolbar -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
      <!-- Category Pills -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
        <UButton
          :variant="activeCategory === 'all' ? 'solid' : 'ghost'"
          :color="activeCategory === 'all' ? 'primary' : 'neutral'"
          size="xs"
          class="font-bold rounded-lg"
          @click="activeCategory = 'all'"
        >
          All Tools ({{ tools.length }})
        </UButton>
        <UButton
          :variant="activeCategory === 'organize' ? 'solid' : 'ghost'"
          :color="activeCategory === 'organize' ? 'primary' : 'neutral'"
          size="xs"
          class="font-bold rounded-lg"
          @click="activeCategory = 'organize'"
        >
          Organize
        </UButton>
        <UButton
          :variant="activeCategory === 'optimize' ? 'solid' : 'ghost'"
          :color="activeCategory === 'optimize' ? 'primary' : 'neutral'"
          size="xs"
          class="font-bold rounded-lg"
          @click="activeCategory = 'optimize'"
        >
          Watermark & Numbers
        </UButton>
        <UButton
          :variant="activeCategory === 'convert' ? 'solid' : 'ghost'"
          :color="activeCategory === 'convert' ? 'primary' : 'neutral'"
          size="xs"
          class="font-bold rounded-lg"
          @click="activeCategory = 'convert'"
        >
          Convert
        </UButton>
        <UButton
          :variant="activeCategory === 'security' ? 'solid' : 'ghost'"
          :color="activeCategory === 'security' ? 'primary' : 'neutral'"
          size="xs"
          class="font-bold rounded-lg"
          @click="activeCategory = 'security'"
        >
          Security
        </UButton>
      </div>

      <!-- Search Input -->
      <div class="w-full sm:w-72">
        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          placeholder="Filter PDF tools..."
          size="sm"
          class="w-full"
        />
      </div>
    </div>

    <!-- Tool Cards Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <NuxtLink
        v-for="tool in filteredTools"
        :key="tool.id"
        :to="tool.to"
        class="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 transition-all duration-200 hover:shadow-lg hover:border-primary/50 flex flex-col justify-between relative overflow-hidden"
      >
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div class="w-12 h-12 rounded-xl bg-primary/10 dark:bg-primary/20 text-primary flex items-center justify-center transition-transform group-hover:scale-110">
              <UIcon
                :name="tool.icon"
                class="w-6 h-6"
              />
            </div>
            <span
              v-if="tool.badge"
              class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
            >
              {{ tool.badge }}
            </span>
          </div>

          <div>
            <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors flex items-center gap-1.5">
              <span>{{ tool.title }}</span>
              <UIcon
                name="i-lucide-arrow-right"
                class="w-4 h-4 opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0"
              />
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
              {{ tool.description }}
            </p>
          </div>
        </div>

        <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-primary">
          <span>Launch Workbench</span>
          <UIcon
            name="i-lucide-chevron-right"
            class="w-4 h-4"
          />
        </div>
      </NuxtLink>
    </div>
  </div>
</template>

