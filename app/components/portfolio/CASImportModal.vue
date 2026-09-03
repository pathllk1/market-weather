<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { DematAccount } from '../../types/portfolio'
import type { CASInvestorInfo, CASSchemeSummary, CASTransaction } from '~~/server/utils/casParser'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    portfolioId: string
    dematAccounts?: DematAccount[]
  }>(),
  {
    dematAccounts: () => []
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'imported'): void
}>()

const isOpen = ref(props.modelValue)
watch(() => props.modelValue, (val) => { isOpen.value = val })
watch(isOpen, (val) => { emit('update:modelValue', val) })

// Wizard Step: 1 = Upload, 2 = Schemes Preview, 3 = Transactions Preview, 4 = Success
const currentStep = ref<1 | 2 | 3 | 4>(1)

// Step 1: Upload State
const selectedFile = ref<File | null>(null)
const pdfPassword = ref('')
const showPassword = ref(false)
const isParsing = ref(false)
const parseError = ref('')
const selectedDematId = ref('')

// Parsed Data State
const investorInfo = ref<CASInvestorInfo | null>(null)
const schemes = ref<CASSchemeSummary[]>([])
const transactions = ref<CASTransaction[]>([])
const duplicateCount = ref(0)

// Step 3 Filtering & Pagination
const txSearch = ref('')
const txSchemeFilter = ref('ALL')
const txTypeFilter = ref('ALL')
const hideReversals = ref(true)
const currentPage = ref(1)
const pageSize = ref(25)

// Step 4 Import Commit State (Client-orchestrated Batching)
const isImporting = ref(false)
const importProgress = ref(0)
const importSuccessMsg = ref('')
const BATCH_SIZE = 100
const importStatusText = ref('')
const totalBatches = ref(0)
const currentBatch = ref(0)
const totalImportedCount = ref(0)

// Reset state when opening modal
watch(isOpen, (open) => {
  if (open) {
    currentStep.value = 1
    selectedFile.value = null
    pdfPassword.value = ''
    parseError.value = ''
    investorInfo.value = null
    schemes.value = []
    transactions.value = []
    duplicateCount.value = 0
  }
})

function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    selectedFile.value = target.files[0]!
    parseError.value = ''
  }
}

function onDropFile(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0]!
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      selectedFile.value = file
      parseError.value = ''
    } else {
      parseError.value = 'Please select a valid PDF statement file.'
    }
  }
}

async function handleParsePDF() {
  if (!selectedFile.value) {
    parseError.value = 'Please select a CAS PDF file.'
    return
  }

  isParsing.value = true
  parseError.value = ''

  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)
    formData.append('password', pdfPassword.value)

    const res = await $fetch<any>(`/api/portfolio/${props.portfolioId}/mf/import/preview`, {
      method: 'POST',
      body: formData
    })

    if (res && res.success) {
      investorInfo.value = res.investor
      schemes.value = (res.schemes || []).map((s: CASSchemeSummary) => ({
        ...s,
        selected: s.transactionCount > 0
      }))
      transactions.value = (res.transactions || []).map((t: CASTransaction) => ({
        ...t,
        selected: !t.isDuplicate && !t.isReversal
      }))
      duplicateCount.value = res.duplicateCount || 0
      currentStep.value = 2
    } else {
      parseError.value = 'Could not parse CAS PDF.'
    }
  } catch (err: any) {
    console.error('CAS parse error:', err)
    parseError.value = err?.data?.statusMessage || err?.message || 'Failed to decrypt or parse PDF. Please verify your password.'
  } finally {
    isParsing.value = false
  }
}

// Scheme selection synchronization
function toggleScheme(scheme: CASSchemeSummary) {
  scheme.selected = !scheme.selected
  // Toggle all transactions under this scheme
  for (const t of transactions.value) {
    if (t.isin === scheme.isin && t.folioNumber === scheme.folioNumber) {
      t.selected = scheme.selected && !t.isDuplicate && (!hideReversals.value || !t.isReversal)
    }
  }
}

function selectAllSchemes(val: boolean) {
  for (const s of schemes.value) {
    s.selected = val
  }
  for (const t of transactions.value) {
    t.selected = val && !t.isDuplicate && (!hideReversals.value || !t.isReversal)
  }
}

// Filtered Transactions
const filteredTransactions = computed(() => {
  return transactions.value.filter((t) => {
    // Scheme filter
    if (txSchemeFilter.value !== 'ALL') {
      if (t.isin !== txSchemeFilter.value) return false
    }
    // Type filter
    if (txTypeFilter.value !== 'ALL' && t.transactionType !== txTypeFilter.value) {
      return false
    }
    // Hide reversals
    if (hideReversals.value && t.isReversal) {
      return false
    }
    // Search query
    if (txSearch.value.trim()) {
      const q = txSearch.value.toLowerCase()
      const matchName = t.schemeName.toLowerCase().includes(q)
      const matchFolio = t.folioNumber.toLowerCase().includes(q)
      const matchDesc = (t.description || '').toLowerCase().includes(q)
      if (!matchName && !matchFolio && !matchDesc) return false
    }
    return true
  })
})

const paginatedTransactions = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredTransactions.value.slice(start, start + pageSize.value)
})

const totalPages = computed(() => Math.ceil(filteredTransactions.value.length / pageSize.value) || 1)

// Metrics
const totalSelectedTxns = computed(() => transactions.value.filter(t => t.selected).length)
const totalSelectedAmount = computed(() => {
  return transactions.value
    .filter(t => t.selected && t.transactionType !== 'REDEMPTION')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
})

const totalSchemesSelectedCount = computed(() => schemes.value.filter(s => s.selected).length)

function selectAllFilteredTxns(val: boolean) {
  const ids = new Set(filteredTransactions.value.map(t => t.tempId))
  for (const t of transactions.value) {
    if (ids.has(t.tempId)) {
      t.selected = val && !t.isDuplicate
    }
  }
}

function deselectAllDuplicates() {
  for (const t of transactions.value) {
    if (t.isDuplicate) {
      t.selected = false
    }
  }
}

async function handleCommitImport() {
  const toImport = transactions.value.filter(t => t.selected)
  if (toImport.length === 0) {
    alert('Please select at least one transaction to import.')
    return
  }

  isImporting.value = true
  importProgress.value = 0
  totalImportedCount.value = 0

  const total = toImport.length
  totalBatches.value = Math.ceil(total / BATCH_SIZE)
  currentBatch.value = 0
  importStatusText.value = `Starting chunked batch import (${total} records across ${totalBatches.value} batches)...`

  try {
    for (let i = 0; i < total; i += BATCH_SIZE) {
      currentBatch.value++
      const chunk = toImport.slice(i, i + BATCH_SIZE)
      const startCount = i + 1
      const endCount = Math.min(i + chunk.length, total)
      importStatusText.value = `Importing Batch ${currentBatch.value} of ${totalBatches.value} (${startCount}-${endCount} of ${total} records)...`

      let attempts = 0
      let success = false
      let lastErr: any = null

      // Auto-retry up to 3 times per batch if any network glitch occurs
      while (attempts < 3 && !success) {
        try {
          attempts++
          const res = await $fetch<any>(`/api/portfolio/${props.portfolioId}/mf/import/commit`, {
            method: 'POST',
            body: {
              transactions: chunk,
              demat_account_id: selectedDematId.value || null
            }
          })

          if (res && res.success) {
            totalImportedCount.value += (res.insertedCount || chunk.length)
            success = true
          }
        } catch (err: any) {
          lastErr = err
          if (attempts < 3) {
            importStatusText.value = `Retrying batch ${currentBatch.value} of ${totalBatches.value} (Attempt ${attempts + 1})...`
            await new Promise(r => setTimeout(r, 1200))
          }
        }
      }

      if (!success) {
        throw new Error(lastErr?.data?.statusMessage || lastErr?.message || `Failed importing batch ${currentBatch.value} of ${totalBatches.value}`)
      }

      // Update progress
      importProgress.value = Math.round((endCount / total) * 100)
    }

    importProgress.value = 100
    importSuccessMsg.value = `Successfully imported ${totalImportedCount.value} transactions across ${totalSchemesSelectedCount.value} schemes in ${totalBatches.value} batches with zero timeouts.`
    currentStep.value = 4
    emit('imported')
  } catch (err: any) {
    console.error('Batch import failed:', err)
    alert(err?.message || 'Error during batch import')
  } finally {
    isImporting.value = false
  }
}

function fmtCur(val: number) {
  return '₹' + (val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :ui="{
      content: 'sm:max-w-4xl w-[calc(100vw-2rem)] flex flex-col max-h-[90vh]',
      body: 'p-5 sm:p-6 space-y-5 overflow-y-auto'
    }"
  >
    <template #header>
      <div class="flex items-center justify-between w-full pr-4">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <UIcon name="i-lucide-file-spreadsheet" class="h-5 w-5" />
          </div>
          <div>
            <h3 class="font-bold text-base text-neutral-900 dark:text-white flex items-center gap-2">
              Import CAS Statement (PDF)
              <span class="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                MFAPI.in Live
              </span>
            </h3>
            <p class="text-xs text-neutral-500 dark:text-neutral-400">
              CAMS & KFintech Consolidated Account Statements
            </p>
          </div>
        </div>

        <!-- Step Indicator -->
        <div class="hidden sm:flex items-center gap-1 text-xs font-semibold text-neutral-400">
          <span :class="currentStep === 1 ? 'text-primary font-bold' : ''">1. Upload</span>
          <span>→</span>
          <span :class="currentStep === 2 ? 'text-primary font-bold' : ''">2. Schemes</span>
          <span>→</span>
          <span :class="currentStep === 3 ? 'text-primary font-bold' : ''">3. Transactions</span>
        </div>
      </div>
    </template>

    <template #body>
      <div class="space-y-5">
        <!-- STEP 1: UPLOAD & PASSWORD -->
    <div v-if="currentStep === 1" class="space-y-6">
      <div
        class="border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer"
        :class="selectedFile
          ? 'border-primary/50 bg-primary/5 dark:bg-primary/10'
          : 'border-neutral-300 dark:border-neutral-700 hover:border-primary/50 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'"
        @dragover.prevent
        @drop="onDropFile"
        @click="($refs.fileInput as HTMLInputElement)?.click()"
      >
        <input
          ref="fileInput"
          type="file"
          accept=".pdf,application/pdf"
          class="hidden"
          @change="onFileChange"
        />

        <div v-if="selectedFile" class="space-y-2">
          <div class="h-14 w-14 rounded-2xl bg-primary text-white flex items-center justify-center mx-auto shadow-md">
            <UIcon name="i-lucide-file-text" class="h-7 w-7" />
          </div>
          <div class="font-bold text-sm text-neutral-900 dark:text-white">
            {{ selectedFile.name }}
          </div>
          <div class="text-xs text-neutral-500 dark:text-neutral-400">
            {{ (selectedFile.size / 1024).toFixed(1) }} KB • Click or drag another file to replace
          </div>
        </div>

        <div v-else class="space-y-2">
          <div class="h-14 w-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-400 flex items-center justify-center mx-auto">
            <UIcon name="i-lucide-upload-cloud" class="h-7 w-7" />
          </div>
          <div class="font-bold text-sm text-neutral-900 dark:text-white">
            Click to choose or drag & drop CAS PDF statement
          </div>
          <div class="text-xs text-neutral-500 dark:text-neutral-400">
            Supports official CAMS / KFintech Consolidated Account Statements (CAS)
          </div>
        </div>
      </div>

      <!-- Password Input -->
      <div class="space-y-1.5">
        <label class="text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center justify-between">
          <span>PDF Password (if protected)</span>
          <span class="text-neutral-400 font-normal">e.g. PAN in uppercase or DOB / Custom password</span>
        </label>
        <div class="relative">
          <input
            v-model="pdfPassword"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Enter statement PDF password"
            class="w-full px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary pr-10 text-neutral-900 dark:text-white"
          />
          <button
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            @click="showPassword = !showPassword"
          >
            <UIcon :name="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="h-4 w-4" />
          </button>
        </div>
      </div>

      <!-- Demat Mapping (Optional) -->
      <div v-if="dematAccounts && dematAccounts.length > 0" class="space-y-1.5">
        <div class="flex items-center justify-between">
          <label class="text-xs font-bold text-neutral-700 dark:text-neutral-300">
            Demat Account (For Demat-held schemes)
          </label>
          <span class="text-[11px] text-neutral-400">Direct Folios are tracked without Demat</span>
        </div>
        <select
          v-model="selectedDematId"
          class="w-full px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="">-- Direct with AMC / Physical Folio (Auto-track by Folio No) --</option>
          <option v-for="acc in dematAccounts" :key="acc.id" :value="acc.id">
            {{ acc.brokerName }} ({{ acc.accountName }})
          </option>
        </select>
        <p class="text-[11px] text-neutral-500 dark:text-neutral-400">
          Schemes in the statement flagged as <strong>Non-Demat</strong> are directly held with the fund house and will automatically be linked to their Folio Number without attaching to any Demat account.
        </p>
      </div>

      <!-- Error Banner -->
      <div v-if="parseError" class="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2">
        <UIcon name="i-lucide-alert-circle" class="h-4 w-4 shrink-0 mt-0.5" />
        <div>{{ parseError }}</div>
      </div>
    </div>

    <!-- STEP 2: SCHEMES RECONCILIATION PREVIEW -->
    <div v-else-if="currentStep === 2" class="space-y-5">
      <!-- Investor Profile Strip -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40 p-4 space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-200/60 dark:border-neutral-700/60 pb-3">
          <div>
            <div class="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <UIcon name="i-lucide-user-check" class="h-4 w-4 text-primary" />
              {{ investorInfo?.name || 'Investor Statement' }}
            </div>
            <div class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ investorInfo?.email }} • PAN: <span class="font-mono font-semibold">{{ investorInfo?.pan || 'N/A' }}</span>
            </div>
          </div>
          <div class="text-right text-xs">
            <span class="text-neutral-400">Period:</span>
            <span class="font-medium text-neutral-700 dark:text-neutral-300 ml-1">{{ investorInfo?.statementPeriod || 'N/A' }}</span>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <div class="text-neutral-400 uppercase tracking-wider text-[10px] font-bold">CAS Cost Value</div>
            <div class="text-sm font-bold font-mono text-neutral-900 dark:text-white">{{ fmtCur(investorInfo?.totalCost || 0) }}</div>
          </div>
          <div>
            <div class="text-neutral-400 uppercase tracking-wider text-[10px] font-bold">CAS Market Value</div>
            <div class="text-sm font-bold font-mono text-neutral-900 dark:text-white">{{ fmtCur(investorInfo?.totalMarketValue || 0) }}</div>
          </div>
          <div>
            <div class="text-neutral-400 uppercase tracking-wider text-[10px] font-bold">Schemes Detected</div>
            <div class="text-sm font-bold font-mono text-primary">{{ schemes.length }} schemes</div>
          </div>
          <div>
            <div class="text-neutral-400 uppercase tracking-wider text-[10px] font-bold">Total Transactions</div>
            <div class="text-sm font-bold font-mono text-neutral-900 dark:text-white">{{ transactions.length }} txns</div>
          </div>
        </div>
      </div>

      <!-- Schemes List Header & Selection Bar -->
      <div class="flex items-center justify-between text-xs">
        <div class="flex items-center gap-2">
          <span class="font-bold text-neutral-700 dark:text-neutral-300">Schemes to Import ({{ totalSchemesSelectedCount }} of {{ schemes.length }})</span>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="text-primary hover:underline font-semibold text-xs"
            @click="selectAllSchemes(true)"
          >
            Select All
          </button>
          <span>•</span>
          <button
            type="button"
            class="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-xs"
            @click="selectAllSchemes(false)"
          >
            Deselect All
          </button>
        </div>
      </div>

      <!-- Schemes Table -->
      <div class="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-2xs max-h-72 overflow-y-auto">
        <table class="w-full text-left text-xs border-collapse">
          <thead class="bg-neutral-100/75 dark:bg-neutral-800/75 sticky top-0 z-10 border-b border-neutral-200 dark:border-neutral-700">
            <tr>
              <th class="p-3 w-10 text-center">#</th>
              <th class="p-3 font-semibold text-neutral-700 dark:text-neutral-300">Scheme & Folio</th>
              <th class="p-3 font-semibold text-neutral-700 dark:text-neutral-300">MFAPI.in Matched Fund</th>
              <th class="p-3 font-semibold text-neutral-700 dark:text-neutral-300 text-right">Units Check</th>
              <th class="p-3 font-semibold text-neutral-700 dark:text-neutral-300 text-center">Txns</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-200 dark:divide-neutral-800">
            <tr
              v-for="s in schemes"
              :key="s.schemeKey"
              class="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 cursor-pointer transition-colors"
              :class="!s.selected ? 'opacity-50' : ''"
              @click="toggleScheme(s)"
            >
              <td class="p-3 text-center" @click.stop>
                <input
                  type="checkbox"
                  :checked="s.selected"
                  class="rounded-sm text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                  @change="toggleScheme(s)"
                />
              </td>
              <td class="p-3 space-y-0.5">
                <div class="font-semibold text-neutral-900 dark:text-white line-clamp-1">
                  {{ s.casSchemeName }}
                </div>
                <div class="flex items-center gap-1.5 text-[10px] text-neutral-400">
                  <span>Folio: {{ s.folioNumber }}</span>
                  <span>•</span>
                  <span class="font-mono">{{ s.isin }}</span>
                  <span>•</span>
                  <span class="px-1 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
                    {{ s.holdingMode }}
                  </span>
                </div>
              </td>
              <td class="p-3 space-y-0.5">
                <div v-if="s.matchedSchemeCode" class="flex items-center gap-1.5">
                  <span class="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-primary/10 text-primary">
                    #{{ s.matchedSchemeCode }}
                  </span>
                  <span class="font-medium text-neutral-800 dark:text-neutral-200 line-clamp-1">
                    {{ s.matchedSchemeName }}
                  </span>
                </div>
                <div v-else class="text-rose-500 font-semibold text-[11px] flex items-center gap-1">
                  <UIcon name="i-lucide-alert-triangle" class="h-3 w-3" />
                  Unmatched AMFI Code
                </div>
              </td>
              <td class="p-3 text-right">
                <div class="flex items-center justify-end gap-1.5">
                  <span class="font-mono font-medium">{{ s.closingUnitBalance }}</span>
                  <UIcon
                    v-if="s.unitsReconciled"
                    name="i-lucide-check-circle"
                    class="h-4 w-4 text-emerald-500"
                    title="Units matched with statement closing ledger"
                  />
                  <UIcon
                    v-else
                    name="i-lucide-alert-circle"
                    class="h-4 w-4 text-amber-500"
                    title="Calculated units slightly differ from CAS units"
                  />
                </div>
              </td>
              <td class="p-3 text-center font-mono font-medium text-neutral-600 dark:text-neutral-400">
                {{ s.transactionCount }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- STEP 3: GRANULAR TRANSACTIONS PREVIEW & DUPLICATE CHECKER -->
    <div v-else-if="currentStep === 3" class="space-y-4">
      <!-- Live Batch Progress Card -->
      <div v-if="isImporting" class="p-5 rounded-2xl bg-primary/5 dark:bg-primary/10 border border-primary/20 text-center space-y-3">
        <div class="flex items-center justify-center gap-2 text-primary font-bold text-sm">
          <UIcon name="i-lucide-loader-2" class="animate-spin h-5 w-5" />
          <span>Importing Batch {{ currentBatch }} of {{ totalBatches }}</span>
        </div>
        <p class="text-xs text-neutral-600 dark:text-neutral-300 font-mono">
          {{ importStatusText }}
        </p>
        <div class="w-full max-w-md mx-auto space-y-1">
          <div class="w-full h-2.5 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
            <div
              class="h-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-300 rounded-full"
              :style="{ width: `${importProgress}%` }"
            />
          </div>
          <div class="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
            <span>Chunk size: {{ BATCH_SIZE }} records/request</span>
            <span class="font-bold text-primary">{{ importProgress }}% Complete</span>
          </div>
        </div>
        <p class="text-[11px] text-neutral-400 italic">
          Chunked into multiple lightweight HTTP requests to guarantee zero 504 timeouts on Vercel.
        </p>
      </div>

      <!-- Toolbar & Metric Bar -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-50 dark:bg-neutral-800/40 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs">
        <div class="flex items-center gap-3">
          <div>
            <span class="text-neutral-400">Selected:</span>
            <span class="font-bold text-primary font-mono ml-1">{{ totalSelectedTxns }} txns</span>
          </div>
          <span>•</span>
          <div>
            <span class="text-neutral-400">Invested:</span>
            <span class="font-bold text-emerald-500 font-mono ml-1">{{ fmtCur(totalSelectedAmount) }}</span>
          </div>
          <span v-if="duplicateCount > 0">•</span>
          <div v-if="duplicateCount > 0" class="text-amber-500 font-semibold flex items-center gap-1">
            <UIcon name="i-lucide-copy" class="h-3.5 w-3.5" />
            {{ duplicateCount }} Duplicates Excluded
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="text-xs text-primary hover:underline font-semibold"
            @click="selectAllFilteredTxns(true)"
          >
            Select All
          </button>
          <span>•</span>
          <button
            type="button"
            class="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            @click="selectAllFilteredTxns(false)"
          >
            Deselect All
          </button>
          <span v-if="duplicateCount > 0">•</span>
          <button
            v-if="duplicateCount > 0"
            type="button"
            class="text-xs text-amber-500 hover:underline font-semibold"
            @click="deselectAllDuplicates"
          >
            Exclude Duplicates
          </button>
        </div>
      </div>

      <!-- Filters Strip -->
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
        <input
          v-model="txSearch"
          type="text"
          placeholder="Search by fund or note..."
          class="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
        />

        <select
          v-model="txSchemeFilter"
          class="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
        >
          <option value="ALL">All Schemes</option>
          <option v-for="s in schemes" :key="s.schemeKey" :value="s.isin">
            {{ s.casSchemeName.slice(0, 30) }}...
          </option>
        </select>

        <select
          v-model="txTypeFilter"
          class="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
        >
          <option value="ALL">All Types</option>
          <option value="BUY_SIP">SIPs Only</option>
          <option value="BUY_LUMPSUM">Lumpsum Only</option>
          <option value="REDEMPTION">Redemptions Only</option>
        </select>

        <label class="flex items-center gap-2 cursor-pointer select-none text-neutral-600 dark:text-neutral-400">
          <input
            v-model="hideReversals"
            type="checkbox"
            class="rounded-sm text-primary focus:ring-primary h-4 w-4"
          />
          <span>Exclude Failed / Reversals</span>
        </label>
      </div>

      <!-- Transactions Grid -->
      <div class="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
        <table class="w-full text-left text-xs border-collapse">
          <thead class="bg-neutral-100/75 dark:bg-neutral-800/75 sticky top-0 z-10 border-b border-neutral-200 dark:border-neutral-700">
            <tr>
              <th class="p-2.5 w-8 text-center">#</th>
              <th class="p-2.5 font-semibold text-neutral-700 dark:text-neutral-300">Date</th>
              <th class="p-2.5 font-semibold text-neutral-700 dark:text-neutral-300">Type</th>
              <th class="p-2.5 font-semibold text-neutral-700 dark:text-neutral-300">Scheme</th>
              <th class="p-2.5 font-semibold text-neutral-700 dark:text-neutral-300 text-right">Amount</th>
              <th class="p-2.5 font-semibold text-neutral-700 dark:text-neutral-300 text-right">Units</th>
              <th class="p-2.5 font-semibold text-neutral-700 dark:text-neutral-300 text-right">NAV</th>
              <th class="p-2.5 font-semibold text-neutral-700 dark:text-neutral-300 text-center">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-200 dark:divide-neutral-800">
            <tr
              v-for="t in paginatedTransactions"
              :key="t.tempId"
              class="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 cursor-pointer"
              :class="!t.selected ? 'opacity-40' : ''"
              @click="t.selected = !t.selected"
            >
              <td class="p-2.5 text-center" @click.stop>
                <input
                  v-model="t.selected"
                  type="checkbox"
                  class="rounded-sm text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                />
              </td>
              <td class="p-2.5 font-mono text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                {{ t.transactionDate }}
              </td>
              <td class="p-2.5">
                <span
                  class="px-1.5 py-0.5 rounded text-[10px] font-bold"
                  :class="t.transactionType === 'REDEMPTION'
                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    : t.transactionType === 'BUY_SIP'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'"
                >
                  {{ t.transactionType === 'BUY_SIP' ? 'SIP' : t.transactionType === 'BUY_LUMPSUM' ? 'Lumpsum' : 'Redemption' }}
                </span>
              </td>
              <td class="p-2.5 max-w-xs">
                <div class="font-medium text-neutral-900 dark:text-white truncate" :title="t.schemeName">
                  {{ t.schemeName }}
                </div>
                <div class="text-[10px] text-neutral-400 truncate">
                  Folio: {{ t.folioNumber }}
                </div>
              </td>
              <td class="p-2.5 text-right font-mono font-medium text-neutral-900 dark:text-white whitespace-nowrap">
                {{ fmtCur(t.amount) }}
              </td>
              <td class="p-2.5 text-right font-mono font-semibold text-neutral-900 dark:text-white whitespace-nowrap">
                {{ t.units.toFixed(3) }}
              </td>
              <td class="p-2.5 text-right font-mono text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                ₹{{ t.nav.toFixed(2) }}
              </td>
              <td class="p-2.5 text-center whitespace-nowrap">
                <span
                  v-if="t.isDuplicate"
                  class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400"
                >
                  Duplicate
                </span>
                <span
                  v-else-if="t.isReversal"
                  class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400"
                >
                  Reversal
                </span>
                <span
                  v-else
                  class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                >
                  Ready
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination Controls -->
      <div class="flex items-center justify-between text-xs text-neutral-500">
        <div>
          Showing {{ ((currentPage - 1) * pageSize) + 1 }} - {{ Math.min(currentPage * pageSize, filteredTransactions.length) }} of {{ filteredTransactions.length }} transactions
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            :disabled="currentPage <= 1"
            class="px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 disabled:opacity-30 cursor-pointer"
            @click="currentPage--"
          >
            Prev
          </button>
          <span class="px-2 font-mono font-bold">{{ currentPage }} / {{ totalPages }}</span>
          <button
            type="button"
            :disabled="currentPage >= totalPages"
            class="px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 disabled:opacity-30 cursor-pointer"
            @click="currentPage++"
          >
            Next
          </button>
        </div>
      </div>
    </div>

    <!-- STEP 4: IMPORT SUCCESS -->
    <div v-else-if="currentStep === 4" class="py-10 text-center space-y-4">
      <div class="h-16 w-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto shadow-sm">
        <UIcon name="i-lucide-check-check" class="h-8 w-8" />
      </div>
      <div class="space-y-1">
        <h3 class="text-lg font-bold text-neutral-900 dark:text-white">Import Successfully Completed!</h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">
          {{ importSuccessMsg }}
        </p>
      </div>
      <div class="pt-2">
        <UButton
          color="primary"
          size="md"
          class="cursor-pointer font-bold px-6"
          @click="isOpen = false"
        >
          View Portfolio Dashboard
        </UButton>
      </div>
    </div>
    </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between w-full">
        <!-- Back buttons -->
        <div>
          <UButton
            v-if="currentStep === 2"
            color="neutral"
            variant="ghost"
            size="sm"
            class="cursor-pointer"
            @click="currentStep = 1"
          >
            ← Upload Other File
          </UButton>
          <UButton
            v-else-if="currentStep === 3"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="isImporting"
            class="cursor-pointer"
            @click="currentStep = 2"
          >
            ← Back to Schemes
          </UButton>
        </div>

        <!-- Forward action buttons -->
        <div class="flex items-center gap-2">
          <UButton
            v-if="currentStep !== 4"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="isImporting"
            class="cursor-pointer"
            @click="isOpen = false"
          >
            Cancel
          </UButton>

          <!-- Step 1 Button -->
          <UButton
            v-if="currentStep === 1"
            color="primary"
            size="sm"
            icon="i-lucide-sparkles"
            :loading="isParsing"
            :disabled="!selectedFile"
            class="cursor-pointer font-bold"
            @click="handleParsePDF"
          >
            Parse & Preview Statement
          </UButton>

          <!-- Step 2 Button -->
          <UButton
            v-else-if="currentStep === 2"
            color="primary"
            size="sm"
            icon="i-lucide-arrow-right"
            :disabled="totalSchemesSelectedCount === 0"
            class="cursor-pointer font-bold"
            @click="currentStep = 3"
          >
            Review Transactions ({{ totalSelectedTxns }}) →
          </UButton>

          <!-- Step 3 Button -->
          <UButton
            v-else-if="currentStep === 3"
            color="primary"
            size="sm"
            :icon="isImporting ? 'i-lucide-loader-2' : 'i-lucide-download'"
            :loading="isImporting"
            :disabled="totalSelectedTxns === 0 || isImporting"
            class="cursor-pointer font-bold"
            @click="handleCommitImport"
          >
            <span v-if="isImporting">Importing Batch {{ currentBatch }} of {{ totalBatches }}...</span>
            <span v-else>Confirm & Import ({{ totalSelectedTxns }} Transactions)</span>
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
