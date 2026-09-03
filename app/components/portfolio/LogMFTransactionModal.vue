<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useMutualFunds } from '../../composables/useMutualFunds'
import type { DematAccount } from '../../types/portfolio'
import type { MFSchemeSearchItem } from '../../types/mutualFunds'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    portfolioId: string
    dematAccounts?: DematAccount[]
    defaultScheme?: { schemeCode: number; schemeName: string; nav?: number } | null
  }>(),
  {
    dematAccounts: () => [],
    defaultScheme: null
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'saved'): void
}>()

const isOpen = ref(props.modelValue)
watch(() => props.modelValue, (val) => { isOpen.value = val })
watch(isOpen, (val) => { emit('update:modelValue', val) })

const { searchFunds, logMFTransaction, isActionLoading } = useMutualFunds()

// Form state
const searchQuery = ref('')
const searchResults = ref<MFSchemeSearchItem[]>([])
const isSearching = ref(false)
const selectedScheme = ref<MFSchemeSearchItem | null>(null)

const transactionType = ref<'BUY_SIP' | 'BUY_LUMPSUM' | 'REDEMPTION'>('BUY_SIP')
const transactionDate = ref(new Date().toISOString().split('T')[0])
const amount = ref<number | null>(5000)
const units = ref<number | null>(null)
const nav = ref<number | null>(null)
const isLoadingNav = ref(false)

const holdingMode = ref<'DEMAT' | 'PHYSICAL'>('DEMAT')
const selectedDematId = ref<string>('')
const folioNumber = ref('')
const notes = ref('')

// Demat Accounts Auto-Resolution
const localDematAccounts = ref<DematAccount[]>([])

const availableDemats = computed(() => {
  if (props.dematAccounts && props.dematAccounts.length > 0) {
    return props.dematAccounts
  }
  return localDematAccounts.value
})

async function fetchLocalDemats() {
  try {
    const res = await $fetch<{ dematAccounts: DematAccount[] }>('/api/demat')
    localDematAccounts.value = res.dematAccounts || []
    if (localDematAccounts.value.length > 0 && !selectedDematId.value) {
      selectedDematId.value = localDematAccounts.value[0]!.id
    }
  } catch (err) {
    console.error('Failed to load demat accounts in modal:', err)
  }
}

watch(isOpen, (val) => {
  if (val) {
    if (!props.dematAccounts || props.dematAccounts.length === 0) {
      fetchLocalDemats()
    } else if (!selectedDematId.value && props.dematAccounts.length > 0) {
      selectedDematId.value = props.dematAccounts[0]!.id
    }
  }
}, { immediate: true })

watch(availableDemats, (accs) => {
  if (accs && accs.length > 0 && !selectedDematId.value) {
    selectedDematId.value = accs[0]!.id
  }
}, { immediate: true })

watch(() => props.defaultScheme, (val) => {
  if (val) {
    selectScheme({ schemeCode: val.schemeCode, schemeName: val.schemeName })
    if (val.nav) nav.value = val.nav
  }
}, { immediate: true })

// Search debouncing
let debounceTimer: any = null
function onSearchInput() {
  clearTimeout(debounceTimer)
  if (searchQuery.value.trim().length < 2) {
    searchResults.value = []
    return
  }
  isSearching.value = true
  debounceTimer = setTimeout(async () => {
    searchResults.value = await searchFunds(searchQuery.value)
    isSearching.value = false
  }, 350)
}

async function fetchNavForDate() {
  if (!selectedScheme.value) return
  isLoadingNav.value = true
  try {
    const dParam = transactionDate.value ? `?date=${encodeURIComponent(transactionDate.value)}` : ''
    const res = await $fetch<any>(`/api/mf/${selectedScheme.value.schemeCode}${dParam}`)
    if (res && res.navOnDate) {
      nav.value = res.navOnDate
      recalcUnits()
    } else if (res && res.latestNAV) {
      nav.value = res.latestNAV
      recalcUnits()
    }
  } catch (err) {
    console.error('Failed to fetch NAV for date:', err)
  } finally {
    isLoadingNav.value = false
  }
}

watch(transactionDate, () => {
  fetchNavForDate()
})

async function selectScheme(item: MFSchemeSearchItem) {
  selectedScheme.value = item
  searchQuery.value = item.schemeName
  searchResults.value = []
  await fetchNavForDate()
}

function recalcUnits() {
  if (nav.value && nav.value > 0 && amount.value && amount.value > 0) {
    units.value = Number((amount.value / nav.value).toFixed(4))
  }
}

watch([amount, nav], () => {
  recalcUnits()
})

function onAmountChange() {
  recalcUnits()
}

function onUnitsChange() {
  if (nav.value && nav.value > 0 && units.value && units.value > 0) {
    amount.value = Number((units.value * nav.value).toFixed(2))
  }
}

// Regulatory stamp duty (0.005%)
const stampDuty = computed(() => {
  if (transactionType.value === 'REDEMPTION' || !amount.value) return 0
  return Number((amount.value * 0.00005).toFixed(2))
})

async function handleSubmit() {
  if (!selectedScheme.value) {
    alert('Please search and select a mutual fund scheme')
    return
  }
  if (!nav.value || nav.value <= 0) {
    alert('Valid Net Asset Value (NAV) is required')
    return
  }
  if (!amount.value || amount.value <= 0) {
    alert('Please enter a valid investment amount')
    return
  }

  const payload = {
    scheme_code: selectedScheme.value.schemeCode,
    scheme_name: selectedScheme.value.schemeName,
    transaction_type: transactionType.value,
    transaction_date: transactionDate.value,
    nav: nav.value,
    units: units.value || Number((amount.value / nav.value).toFixed(4)),
    amount: amount.value,
    holding_mode: holdingMode.value,
    demat_account_id: holdingMode.value === 'DEMAT' ? selectedDematId.value : null,
    folio_number: folioNumber.value || null,
    notes: notes.value || null
  }

  const ok = await logMFTransaction(props.portfolioId, payload)
  if (ok) {
    emit('saved')
    isOpen.value = false
    // Reset
    selectedScheme.value = null
    searchQuery.value = ''
    amount.value = 5000
    units.value = null
    notes.value = ''
  }
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :ui="{
      content: 'sm:max-w-xl w-[calc(100vw-2rem)] flex flex-col',
      body: 'p-5 sm:p-6 space-y-4'
    }"
  >
    <template #header>
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-2.5">
          <div class="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <UIcon name="i-lucide-pie-chart" class="h-5 w-5" />
          </div>
          <div>
            <h3 class="font-bold text-base text-neutral-900 dark:text-white">Record Mutual Fund Investment</h3>
            <p class="text-xs text-neutral-400">AMFI Live NAV tracked via MFAPI.in</p>
          </div>
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          size="sm"
          class="cursor-pointer -mr-2 text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
          aria-label="Close"
          @click="isOpen = false"
        />
      </div>
    </template>

    <template #body>
      <form class="space-y-4" @submit.prevent="handleSubmit">
        <!-- 1. Transaction Type Toggle -->
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Investment Action</label>
          <div class="grid grid-cols-3 gap-2">
            <button
              type="button"
              class="py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-1.5"
              :class="transactionType === 'BUY_SIP'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100'"
              @click="transactionType = 'BUY_SIP'"
            >
              <UIcon name="i-lucide-repeat" class="h-3.5 w-3.5" />
              <span>SIP Installment</span>
            </button>
            <button
              type="button"
              class="py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-1.5"
              :class="transactionType === 'BUY_LUMPSUM'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100'"
              @click="transactionType = 'BUY_LUMPSUM'"
            >
              <UIcon name="i-lucide-plus" class="h-3.5 w-3.5" />
              <span>Lumpsum</span>
            </button>
            <button
              type="button"
              class="py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-1.5"
              :class="transactionType === 'REDEMPTION'
                ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100'"
              @click="transactionType = 'REDEMPTION'"
            >
              <UIcon name="i-lucide-arrow-down-right" class="h-3.5 w-3.5" />
              <span>Redemption</span>
            </button>
          </div>
        </div>

        <!-- 2. Scheme Search Bar -->
        <div class="space-y-1.5 relative">
          <label class="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            Search Mutual Fund Scheme (45,000+ Direct & Regular Plans)
          </label>
          <div class="relative">
            <UInput
              v-model="searchQuery"
              placeholder="e.g. Parag Parikh Flexi Cap, Quant Small Cap, HDFC Top 100..."
              icon="i-lucide-search"
              class="w-full"
              @input="onSearchInput"
            />
            <UIcon
              v-if="isSearching"
              name="i-lucide-loader-2"
              class="animate-spin absolute right-3 top-2.5 h-4 w-4 text-primary"
            />
          </div>

          <!-- Autocomplete Dropdown -->
          <div
            v-if="searchResults.length > 0"
            class="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800"
          >
            <button
              v-for="item in searchResults"
              :key="item.schemeCode"
              type="button"
              class="w-full text-left p-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs transition-colors flex items-start justify-between gap-2"
              @click="selectScheme(item)"
            >
              <span class="font-medium text-neutral-900 dark:text-white line-clamp-1">{{ item.schemeName }}</span>
              <span class="font-mono text-[10px] text-neutral-400 shrink-0">#{{ item.schemeCode }}</span>
            </button>
          </div>

          <div v-if="selectedScheme" class="p-2.5 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between text-xs mt-1">
            <div class="space-y-0.5">
              <span class="font-bold text-primary">{{ selectedScheme.schemeName }}</span>
              <div class="text-[10px] text-neutral-500 font-mono">AMFI Code: {{ selectedScheme.schemeCode }}</div>
            </div>
            <UBadge color="primary" variant="subtle" size="xs">Selected</UBadge>
          </div>
        </div>

        <!-- 3. Financial Inputs (Date, Amount, NAV, Units) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Transaction Date</label>
            <UInput v-model="transactionDate" type="date" class="w-full font-mono" />
          </div>

          <div class="space-y-1">
            <label class="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              NAV on Date (₹)
              <span v-if="isLoadingNav" class="text-[10px] text-primary animate-pulse ml-1">Fetching...</span>
            </label>
            <UInput
              v-model.number="nav"
              type="number"
              step="0.0001"
              placeholder="e.g. 78.4520"
              class="w-full font-mono"
              @input="recalcUnits"
            />
          </div>

          <div class="space-y-1">
            <label class="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Amount (₹)</label>
            <UInput
              v-model.number="amount"
              type="number"
              step="100"
              placeholder="e.g. 5000"
              class="w-full font-mono"
              @input="onAmountChange"
            />
          </div>

          <div class="space-y-1">
            <label class="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Allotted Units</label>
            <UInput
              v-model.number="units"
              type="number"
              step="0.0001"
              placeholder="e.g. 63.7321"
              class="w-full font-mono"
              @input="onUnitsChange"
            />
          </div>
        </div>

        <!-- 4. Demat Account / Folio Details -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div class="space-y-1">
            <label class="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Holding Platform</label>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer text-center"
                :class="holdingMode === 'DEMAT' ? 'bg-primary text-white border-primary' : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-500 border-neutral-200 dark:border-neutral-700'"
                @click="holdingMode = 'DEMAT'"
              >
                Demat Account
              </button>
              <button
                type="button"
                class="flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer text-center"
                :class="holdingMode === 'PHYSICAL' ? 'bg-primary text-white border-primary' : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-500 border-neutral-200 dark:border-neutral-700'"
                @click="holdingMode = 'PHYSICAL'"
              >
                Physical / Folio
              </button>
            </div>
          </div>

          <div v-if="holdingMode === 'DEMAT'" class="space-y-1">
            <label class="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Demat Broker</label>
            <select
              v-model="selectedDematId"
              class="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-900 dark:text-white"
            >
              <option v-for="d in availableDemats" :key="d.id" :value="d.id">
                {{ d.brokerName }} — {{ d.accountName }}
              </option>
              <option v-if="availableDemats.length === 0" value="">
                Default Demat Account (Zerodha / Groww)
              </option>
            </select>
          </div>

          <div v-else class="space-y-1">
            <label class="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Folio Number (Optional)</label>
            <UInput v-model="folioNumber" placeholder="e.g. 10482910/22" class="w-full font-mono text-xs" />
          </div>
        </div>

        <!-- 5. Investment Summary Strip -->
        <div class="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800 space-y-1 font-mono text-xs">
          <div class="flex items-center justify-between text-neutral-500">
            <span>Stamp Duty (0.005%)</span>
            <span>₹{{ stampDuty.toFixed(2) }}</span>
          </div>
          <div class="flex items-center justify-between font-bold text-neutral-900 dark:text-white pt-1 border-t border-neutral-200 dark:border-neutral-700">
            <span>Net Investment Outflow</span>
            <span class="text-emerald-500">₹{{ ((amount || 0) + stampDuty).toLocaleString('en-IN', { minimumFractionDigits: 2 }) }}</span>
          </div>
        </div>

        <!-- Submit Buttons -->
        <div class="flex items-center justify-end gap-2 pt-2">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            @click="isOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            type="submit"
            color="primary"
            size="sm"
            :loading="isActionLoading"
            icon="i-lucide-check"
          >
            Confirm Investment
          </UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>
