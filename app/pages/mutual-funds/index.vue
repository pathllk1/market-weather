<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useMutualFunds } from '../../composables/useMutualFunds'
import type { MFSchemeSearchItem } from '../../types/mutualFunds'
import type { MFUserView } from '../../components/mf/CreateViewModal.vue'
import type { DematAccount } from '../../types/portfolio'

useHead({
  title: 'Mutual Funds Intelligence & User Views — Live AMFI Screener | Market Weather',
  meta: [
    {
      name: 'description',
      content: 'Institutional Indian mutual funds intelligence, custom user-defined views, live AMFI NAV tracking, 1M to 5Y CAGR trailing returns, and instant portfolio investment.'
    }
  ]
})

const { searchFunds, getCategoryBadgeColor, isSearching } = useMutualFunds()

// User Views State
const views = ref<MFUserView[]>([])
const activeViewId = ref<string>('')
const isLoadingViews = ref(true)
const isLoadingSchemes = ref(false)

// Active View Schemes Enriched Data
interface EnrichedScheme {
  schemeCode: number
  schemeName: string
  fundHouse: string
  schemeType: string
  category: string
  latestNAV: number
  navDate: string
  dailyChange: number
  dailyChangePct: number
  trailingReturns: {
    '1M': number | null
    '6M': number | null
    '1Y': number | null
    '3Y': number | null
    '5Y': number | null
  }
}

const activeViewSchemes = ref<EnrichedScheme[]>([])

// Modals State
const isCreateViewModalOpen = ref(false)
const viewToEdit = ref<MFUserView | null>(null)

const isDetailModalOpen = ref(false)
const selectedDetailCode = ref<number | null>(null)

const isLogTxModalOpen = ref(false)
const selectedInvestScheme = ref<{ schemeCode: number; schemeName: string; nav?: number } | null>(null)
const defaultPortfolios = ref<{ id: string; name: string }[]>([])
const dematAccounts = ref<DematAccount[]>([])

// Filter / Search inside table
const tableFilter = ref('')
const categoryFilter = ref('ALL')

// Quick Add Scheme to View Search
const quickAddQuery = ref('')
const quickAddResults = ref<MFSchemeSearchItem[]>([])

const activeView = computed(() => {
  return views.value.find(v => v.id === activeViewId.value) || views.value[0] || null
})

// Categories present in the active view
const uniqueCategories = computed(() => {
  const set = new Set<string>()
  for (const s of activeViewSchemes.value) {
    if (s.category) set.add(s.category)
  }
  return Array.from(set)
})

// Filtered Schemes Table
const filteredSchemes = computed(() => {
  let list = activeViewSchemes.value
  if (categoryFilter.value !== 'ALL') {
    list = list.filter(s => s.category === categoryFilter.value)
  }
  if (tableFilter.value.trim()) {
    const q = tableFilter.value.toLowerCase()
    list = list.filter(s =>
      s.schemeName.toLowerCase().includes(q) ||
      s.fundHouse.toLowerCase().includes(q) ||
      String(s.schemeCode).includes(q)
    )
  }
  return list
})

// Top Stats
const top3YPerformer = computed(() => {
  if (activeViewSchemes.value.length === 0) return null
  return [...activeViewSchemes.value]
    .filter(s => s.trailingReturns['3Y'] !== null)
    .sort((a, b) => (b.trailingReturns['3Y'] || 0) - (a.trailingReturns['3Y'] || 0))[0] || null
})

// Fetch User Views
async function loadViews() {
  isLoadingViews.value = true
  try {
    const res = await $fetch<{ views: MFUserView[] }>('/api/mf/views')
    views.value = res.views || []
    if (views.value.length > 0) {
      // Pick default or first
      const def = views.value.find(v => v.is_default) || views.value[0]
      if (def) activeViewId.value = def.id
    }
  } catch (err) {
    console.error('Failed to load MF views:', err)
  } finally {
    isLoadingViews.value = false
  }
}

// Fetch Schemes for Active View
async function loadActiveViewSchemes() {
  if (!activeViewId.value) return
  isLoadingSchemes.value = true
  try {
    const res = await $fetch<{ view: any; schemes: EnrichedScheme[] }>(`/api/mf/views/${activeViewId.value}/schemes`)
    activeViewSchemes.value = res.schemes || []
  } catch (err) {
    console.error('Failed to load schemes for view:', err)
    activeViewSchemes.value = []
  } finally {
    isLoadingSchemes.value = false
  }
}

// Load default portfolio for investments
async function loadDefaultPortfolio() {
  try {
    const res = await $fetch<{ portfolios: any[] }>('/api/portfolio')
    defaultPortfolios.value = (res?.portfolios || []).map(p => ({ id: p.id, name: p.name }))
  } catch (err) {
    console.error('Failed to load portfolios:', err)
  }
}

async function loadDematAccounts() {
  try {
    const res = await $fetch<{ dematAccounts: DematAccount[] }>('/api/demat')
    dematAccounts.value = res.dematAccounts || []
  } catch (err) {
    console.error('Failed to load demat accounts:', err)
  }
}

watch(activeViewId, () => {
  categoryFilter.value = 'ALL'
  tableFilter.value = ''
  loadActiveViewSchemes()
})

// View Actions
function openCreateView() {
  viewToEdit.value = null
  isCreateViewModalOpen.value = true
}

function openEditView(view: MFUserView) {
  viewToEdit.value = view
  isCreateViewModalOpen.value = true
}

async function deleteView(id: string) {
  if (!confirm('Are you sure you want to delete this view?')) return
  try {
    await $fetch(`/api/mf/views/${id}`, { method: 'DELETE' })
    await loadViews()
  } catch (err: any) {
    alert(err.data?.message || 'Failed to delete view')
  }
}

// Quick Add Scheme to Current View
let quickTimer: any = null
function handleQuickSearchInput() {
  clearTimeout(quickTimer)
  if (quickAddQuery.value.trim().length < 2) {
    quickAddResults.value = []
    return
  }
  quickTimer = setTimeout(async () => {
    quickAddResults.value = await searchFunds(quickAddQuery.value)
  }, 300)
}

async function addSchemeToCurrentView(item: MFSchemeSearchItem) {
  if (!activeView.value) return
  const currentCodes = activeView.value.scheme_codes || []
  if (currentCodes.includes(item.schemeCode)) {
    quickAddQuery.value = ''
    quickAddResults.value = []
    return
  }

  const updatedCodes = [...currentCodes, item.schemeCode]
  try {
    await $fetch(`/api/mf/views/${activeView.value.id}`, {
      method: 'PUT',
      body: { scheme_codes: updatedCodes }
    })
    quickAddQuery.value = ''
    quickAddResults.value = []
    await loadViews()
    await loadActiveViewSchemes()
  } catch (err) {
    console.error('Failed to add scheme to view:', err)
  }
}

async function removeSchemeFromCurrentView(code: number) {
  if (!activeView.value) return
  const updatedCodes = (activeView.value.scheme_codes || []).filter(c => c !== code)
  try {
    await $fetch(`/api/mf/views/${activeView.value.id}`, {
      method: 'PUT',
      body: { scheme_codes: updatedCodes }
    })
    await loadViews()
    await loadActiveViewSchemes()
  } catch (err) {
    console.error('Failed to remove scheme:', err)
  }
}

// Detail & Invest Actions
function openDetail(code: number) {
  selectedDetailCode.value = code
  isDetailModalOpen.value = true
}

function openInvest(scheme: { schemeCode: number; schemeName: string; latestNAV?: number }) {
  selectedInvestScheme.value = {
    schemeCode: scheme.schemeCode,
    schemeName: scheme.schemeName,
    nav: scheme.latestNAV
  }
  isLogTxModalOpen.value = true
}

function fmtNav(val: number) {
  return '₹' + (val || 0).toFixed(4)
}

onMounted(() => {
  loadViews()
  loadDefaultPortfolio()
  loadDematAccounts()
})
</script>

<template>
  <div class="space-y-6 w-full py-4">
    <!-- 1. HEADER & MACRO INTELLIGENCE STRIP -->
    <div class="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-5 shadow-xs relative overflow-hidden">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div class="space-y-1.5">
          <div class="flex items-center gap-2 flex-wrap">
            <UBadge color="primary" variant="subtle" size="sm">
              ⚡ 100% Free Live AMFI Feed (MFAPI.in)
            </UBadge>
            <UBadge color="neutral" variant="subtle" size="sm">
              45,000+ Schemes Tracked
            </UBadge>
          </div>
          <h1 class="text-xl sm:text-2xl font-black text-neutral-900 dark:text-white tracking-tight flex items-center gap-2">
            <UIcon name="i-lucide-pie-chart" class="h-6 w-6 text-primary" />
            <span>Mutual Funds Market Intelligence</span>
          </h1>
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            Institutional scheme screening, customizable user views, live daily NAVs, and trailing CAGR analytics.
          </p>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <UButton
            color="primary"
            icon="i-lucide-folder-plus"
            size="sm"
            @click="openCreateView"
          >
            New Custom View
          </UButton>
        </div>
      </div>

      <!-- Quick KPI Strip -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-800 font-mono">
        <div class="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800">
          <span class="text-neutral-400 block text-[10px] uppercase tracking-wider font-semibold">Active View Funds</span>
          <span class="text-lg font-black text-neutral-900 dark:text-white">{{ activeViewSchemes.length }} Schemes</span>
        </div>
        <div class="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800">
          <span class="text-neutral-400 block text-[10px] uppercase tracking-wider font-semibold">Categories Covered</span>
          <span class="text-lg font-black text-indigo-600 dark:text-indigo-400">{{ uniqueCategories.length }} Classes</span>
        </div>
        <div class="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800">
          <span class="text-neutral-400 block text-[10px] uppercase tracking-wider font-semibold">Top 3Y CAGR Performer</span>
          <span class="text-lg font-black text-emerald-600 dark:text-emerald-400">
            {{ top3YPerformer ? `+${top3YPerformer.trailingReturns['3Y']}%` : 'N/A' }}
          </span>
        </div>
        <div class="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800">
          <span class="text-neutral-400 block text-[10px] uppercase tracking-wider font-semibold">AMFI Feed Status</span>
          <span class="text-lg font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Daily
          </span>
        </div>
      </div>
    </div>

    <!-- 2. USER PREFERRED VIEWS NAVIGATION STRIP -->
    <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-4 shadow-xs">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <span class="text-xs font-bold text-neutral-400 uppercase tracking-wider shrink-0 mr-1">
            Preferred Views:
          </span>
          <button
            v-for="v in views"
            :key="v.id"
            type="button"
            class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
            :class="activeViewId === v.id
              ? 'bg-primary text-white shadow-xs'
              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
            @click="activeViewId = v.id"
          >
            <UIcon v-if="v.is_default" name="i-lucide-star" class="h-3.5 w-3.5 text-amber-400" />
            <span>{{ v.name }}</span>
            <span class="text-[10px] opacity-75">({{ v.scheme_codes?.length || 0 }})</span>
          </button>
        </div>

        <!-- Active View Actions -->
        <div v-if="activeView" class="flex items-center gap-2 shrink-0">
          <UButton
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-lucide-edit-3"
            @click="openEditView(activeView)"
          >
            Edit View
          </UButton>
          <UButton
            v-if="views.length > 1"
            variant="ghost"
            color="error"
            size="xs"
            icon="i-lucide-trash-2"
            @click="deleteView(activeView.id)"
          >
            Delete
          </UButton>
        </div>
      </div>

      <!-- Active View Details & Quick Add Search Bar -->
      <div v-if="activeView" class="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 class="font-bold text-sm text-neutral-900 dark:text-white flex items-center gap-2">
            <span>{{ activeView.name }}</span>
            <UBadge v-if="activeView.is_default" color="primary" variant="subtle" size="xs">Default</UBadge>
          </h2>
          <p class="text-xs text-neutral-400 mt-0.5">
            {{ activeView.description || 'Custom mutual fund tracking basket.' }}
          </p>
        </div>

        <!-- Quick Add Autocomplete -->
        <div class="relative w-full md:w-80">
          <UInput
            v-model="quickAddQuery"
            placeholder="+ Add any scheme to this view..."
            icon="i-lucide-plus-circle"
            size="sm"
            class="w-full"
            @input="handleQuickSearchInput"
          />
          <UIcon
            v-if="isSearching"
            name="i-lucide-loader-2"
            class="animate-spin absolute right-3 top-2 h-4 w-4 text-primary"
          />

          <!-- Autocomplete Dropdown -->
          <div
            v-if="quickAddResults.length > 0"
            class="absolute z-50 right-0 left-0 top-full mt-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800 text-xs"
          >
            <button
              v-for="item in quickAddResults"
              :key="item.schemeCode"
              type="button"
              class="w-full text-left p-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center justify-between gap-2 cursor-pointer transition-colors"
              @click="addSchemeToCurrentView(item)"
            >
              <span class="font-medium line-clamp-1">{{ item.schemeName }}</span>
              <span class="text-[10px] font-mono text-primary shrink-0">+ Add</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. SCREENER TABLE CONTROLS (CATEGORY TABS & SEARCH) -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <!-- Category Filter Pills -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
        <button
          type="button"
          class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
          :class="categoryFilter === 'ALL'
            ? 'bg-primary text-white shadow-xs'
            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
          @click="categoryFilter = 'ALL'"
        >
          All Categories ({{ activeViewSchemes.length }})
        </button>
        <button
          v-for="cat in uniqueCategories"
          :key="cat"
          type="button"
          class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
          :class="categoryFilter === cat
            ? 'bg-primary text-white shadow-xs'
            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
          @click="categoryFilter = cat"
        >
          {{ cat }}
        </button>
      </div>

      <!-- Search in View -->
      <div class="w-full sm:w-64">
        <UInput
          v-model="tableFilter"
          placeholder="Filter schemes in view..."
          icon="i-lucide-search"
          size="sm"
          class="w-full"
        />
      </div>
    </div>

    <!-- 4. INSTITUTIONAL SCHEME SCREENER TABLE -->
    <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs">
      <div v-if="isLoadingSchemes" class="py-16 text-center text-xs text-neutral-400 space-y-2">
        <UIcon name="i-lucide-loader-2" class="h-6 w-6 animate-spin text-primary mx-auto" />
        <p>Loading live AMFI NAVs & trailing CAGR returns...</p>
      </div>

      <div v-else-if="filteredSchemes.length === 0" class="py-16 text-center text-xs text-neutral-400 space-y-2">
        <UIcon name="i-lucide-pie-chart" class="h-8 w-8 text-neutral-300 mx-auto" />
        <p class="font-bold text-neutral-600 dark:text-neutral-300">No mutual funds in this view yet.</p>
        <p>Use the search bar above to add funds or switch categories.</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-400 uppercase font-mono text-[10px] tracking-wider border-b border-neutral-200 dark:border-neutral-800">
            <tr>
              <th class="py-3 px-4">Scheme & Fund House</th>
              <th class="py-3 px-4">Category</th>
              <th class="py-3 px-4 text-right">Latest NAV</th>
              <th class="py-3 px-3 text-right">1M</th>
              <th class="py-3 px-3 text-right">6M</th>
              <th class="py-3 px-3 text-right">1Y</th>
              <th class="py-3 px-3 text-right font-bold text-neutral-900 dark:text-white">3Y CAGR</th>
              <th class="py-3 px-3 text-right">5Y CAGR</th>
              <th class="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-100 dark:divide-neutral-800">
            <tr
              v-for="s in filteredSchemes"
              :key="s.schemeCode"
              class="hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 transition-colors"
            >
              <!-- Scheme & Fund House -->
              <td class="py-3.5 px-4">
                <div class="font-bold text-neutral-900 dark:text-white line-clamp-1 max-w-[320px]">
                  {{ s.schemeName }}
                </div>
                <div class="text-[11px] text-neutral-400 flex items-center gap-2 mt-0.5">
                  <span class="font-semibold text-neutral-600 dark:text-neutral-300">{{ s.fundHouse }}</span>
                  <span>•</span>
                  <span class="font-mono">#{{ s.schemeCode }}</span>
                </div>
              </td>

              <!-- Category -->
              <td class="py-3.5 px-4">
                <UBadge :color="getCategoryBadgeColor(s.category)" variant="subtle" size="xs">
                  {{ s.category }}
                </UBadge>
              </td>

              <!-- Latest NAV -->
              <td class="py-3.5 px-4 text-right font-mono">
                <div class="font-bold text-neutral-900 dark:text-white">{{ fmtNav(s.latestNAV) }}</div>
                <div :class="s.dailyChangePct >= 0 ? 'text-emerald-500' : 'text-rose-500'" class="text-[10px] font-semibold">
                  {{ s.dailyChangePct >= 0 ? '+' : '' }}{{ s.dailyChangePct.toFixed(2) }}% (1D)
                </div>
              </td>

              <!-- 1M Return -->
              <td class="py-3.5 px-3 text-right font-mono">
                <span v-if="s.trailingReturns['1M'] !== null" :class="s.trailingReturns['1M'] >= 0 ? 'text-emerald-500' : 'text-rose-500'" class="font-medium">
                  {{ s.trailingReturns['1M'] >= 0 ? '+' : '' }}{{ s.trailingReturns['1M'] }}%
                </span>
                <span v-else class="text-neutral-400">-</span>
              </td>

              <!-- 6M Return -->
              <td class="py-3.5 px-3 text-right font-mono">
                <span v-if="s.trailingReturns['6M'] !== null" :class="s.trailingReturns['6M'] >= 0 ? 'text-emerald-500' : 'text-rose-500'" class="font-medium">
                  {{ s.trailingReturns['6M'] >= 0 ? '+' : '' }}{{ s.trailingReturns['6M'] }}%
                </span>
                <span v-else class="text-neutral-400">-</span>
              </td>

              <!-- 1Y Return -->
              <td class="py-3.5 px-3 text-right font-mono">
                <span v-if="s.trailingReturns['1Y'] !== null" :class="s.trailingReturns['1Y'] >= 0 ? 'text-emerald-500' : 'text-rose-500'" class="font-medium">
                  {{ s.trailingReturns['1Y'] >= 0 ? '+' : '' }}{{ s.trailingReturns['1Y'] }}%
                </span>
                <span v-else class="text-neutral-400">-</span>
              </td>

              <!-- 3Y CAGR -->
              <td class="py-3.5 px-3 text-right font-mono">
                <span v-if="s.trailingReturns['3Y'] !== null" :class="s.trailingReturns['3Y'] >= 0 ? 'text-emerald-500' : 'text-rose-500'" class="font-bold">
                  {{ s.trailingReturns['3Y'] >= 0 ? '+' : '' }}{{ s.trailingReturns['3Y'] }}%
                </span>
                <span v-else class="text-neutral-400">-</span>
              </td>

              <!-- 5Y CAGR -->
              <td class="py-3.5 px-3 text-right font-mono">
                <span v-if="s.trailingReturns['5Y'] !== null" :class="s.trailingReturns['5Y'] >= 0 ? 'text-emerald-500' : 'text-rose-500'" class="font-medium">
                  {{ s.trailingReturns['5Y'] >= 0 ? '+' : '' }}{{ s.trailingReturns['5Y'] }}%
                </span>
                <span v-else class="text-neutral-400">-</span>
              </td>

              <!-- Action Buttons -->
              <td class="py-3.5 px-4 text-right">
                <div class="flex items-center justify-end gap-1.5">
                  <!-- Universal + Invest Action (One-Time Lumpsum or Recurring SIP) -->
                  <UButton
                    color="primary"
                    size="xs"
                    icon="i-lucide-plus"
                    @click="openInvest(s)"
                  >
                    + Invest
                  </UButton>

                  <!-- Historical Canvas Chart Modal -->
                  <UButton
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    icon="i-lucide-line-chart"
                    @click="openDetail(s.schemeCode)"
                  >
                    Chart
                  </UButton>

                  <!-- Remove from View -->
                  <UButton
                    variant="ghost"
                    color="error"
                    size="xs"
                    icon="i-lucide-x"
                    title="Remove from this view"
                    @click="removeSchemeFromCurrentView(s.schemeCode)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 5. EMBEDDED MODALS -->
    <!-- Create / Edit Custom View Modal -->
    <MfCreateViewModal
      v-model="isCreateViewModalOpen"
      :view-to-edit="viewToEdit"
      @saved="loadViews"
    />

    <!-- Deep Dive TradingView Historical NAV Modal -->
    <MfFundDetailModal
      v-model="isDetailModalOpen"
      :scheme-code="selectedDetailCode"
      @invest="openInvest({ schemeCode: $event, schemeName: `Scheme #${$event}` })"
    />

    <!-- Universal Log Transaction Modal (SIP vs One-Time Lumpsum) -->
    <PortfolioLogMFTransactionModal
      v-if="defaultPortfolios[0]"
      v-model="isLogTxModalOpen"
      :portfolio-id="defaultPortfolios[0].id"
      :default-scheme="selectedInvestScheme"
      :demat-accounts="dematAccounts"
      @saved="navigateTo('/portfolio')"
    />
  </div>
</template>
