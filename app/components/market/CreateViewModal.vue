<script setup lang="ts">
import type { UserMarketView } from '~/types/market'

const props = defineProps<{
  modelValue: boolean
  viewToEdit: UserMarketView | null
  availableSymbols: { symbol: string, company_name: string }[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'saved', view: UserMarketView): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val)
})

const isEditing = computed(() => !!props.viewToEdit)

const form = reactive({
  name: '',
  description: '',
  layout: 'ohlcv' as 'ohlcv' | 'table' | 'cards',
  selectedSymbols: [] as string[]
})

const symbolSearch = ref('')
const isSaving = ref(false)
const errorMessage = ref('')

watch(
  () => props.viewToEdit,
  (v) => {
    if (v) {
      form.name = v.name
      form.description = v.description || ''
      form.layout = v.layout
      form.selectedSymbols = [...v.symbols]
    } else {
      form.name = ''
      form.description = ''
      form.layout = 'ohlcv'
      form.selectedSymbols = []
    }
    errorMessage.value = ''
    symbolSearch.value = ''
  },
  { immediate: true }
)

interface SearchItem {
  symbol: string
  cleanSymbol: string
  companyName: string
  price: number
}

const searchResults = ref<SearchItem[]>([])
const isSearching = ref(false)

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
watch(symbolSearch, (q) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(async () => {
    isSearching.value = true
    try {
      const res = await $fetch<{ results: SearchItem[] }>('/api/market/search', {
        query: { q: q.trim() }
      })
      searchResults.value = res.results || []
    } catch {
      searchResults.value = []
    } finally {
      isSearching.value = false
    }
  }, 200)
}, { immediate: true })

function toggleSymbol(sym: string) {
  const s = sym.toUpperCase()
  if (form.selectedSymbols.includes(s)) {
    form.selectedSymbols = form.selectedSymbols.filter(item => item !== s)
  } else {
    if (form.selectedSymbols.length >= 50) {
      errorMessage.value = 'A view can contain a maximum of 50 equities.'
      return
    }
    form.selectedSymbols.push(s)
  }
}

async function handleSave() {
  if (!form.name.trim()) {
    errorMessage.value = 'Please provide a name for this view.'
    return
  }

  isSaving.value = true
  errorMessage.value = ''

  try {
    if (isEditing.value && props.viewToEdit) {
      // Update existing view
      const res = await $fetch<{ success: boolean, view: UserMarketView }>(`/api/market/views/${props.viewToEdit.id}`, {
        method: 'PUT',
        body: {
          name: form.name.trim(),
          description: form.description.trim(),
          layout: form.layout,
          symbols: form.selectedSymbols
        }
      })
      emit('saved', res.view)
    } else {
      // Create new view
      const res = await $fetch<{ success: boolean, view: UserMarketView }>('/api/market/views', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          description: form.description.trim(),
          layout: form.layout,
          symbols: form.selectedSymbols
        }
      })
      emit('saved', res.view)
    }
    isOpen.value = false
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errorMessage.value = (err as any)?.data?.statusMessage || (err as Error).message || 'Failed to save view.'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="isEditing ? 'Edit Market View' : 'Create Preferred View'"
  >
    <template #body>
      <div class="space-y-4">
        <!-- Error Alert -->
        <div
          v-if="errorMessage"
          class="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs font-semibold text-rose-500"
        >
          {{ errorMessage }}
        </div>

        <!-- View Name -->
        <div>
          <label class="mb-1 block text-xs font-semibold text-highlight">View Name</label>
          <UInput
            v-model="form.name"
            placeholder="e.g. Banking & Financials, High Momentum Breakouts..."
            maxlength="50"
          />
        </div>

        <!-- Description -->
        <div>
          <label class="mb-1 block text-xs font-semibold text-highlight">Description (Optional)</label>
          <UInput
            v-model="form.description"
            placeholder="e.g. Daily tracking of banking majors with high RSI..."
            maxlength="200"
          />
        </div>

        <!-- Layout Selector -->
        <div>
          <label class="mb-1 block text-xs font-semibold text-highlight">Display Mode</label>
          <div class="grid grid-cols-3 gap-2">
            <button
              type="button"
              class="flex flex-col items-center rounded-xl border p-2.5 text-center text-xs transition-all"
              :class="form.layout === 'ohlcv' ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-default/60 hover:bg-muted/40 text-muted-foreground'"
              @click="form.layout = 'ohlcv'"
            >
              <UIcon
                name="i-lucide-candlestick-chart"
                class="mb-1 h-4 w-4"
              />
              <span>OHLCV Cards</span>
            </button>

            <button
              type="button"
              class="flex flex-col items-center rounded-xl border p-2.5 text-center text-xs transition-all"
              :class="form.layout === 'table' ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-default/60 hover:bg-muted/40 text-muted-foreground'"
              @click="form.layout = 'table'"
            >
              <UIcon
                name="i-lucide-table-properties"
                class="mb-1 h-4 w-4"
              />
              <span>Table Matrix</span>
            </button>

            <button
              type="button"
              class="flex flex-col items-center rounded-xl border p-2.5 text-center text-xs transition-all"
              :class="form.layout === 'cards' ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-default/60 hover:bg-muted/40 text-muted-foreground'"
              @click="form.layout = 'cards'"
            >
              <UIcon
                name="i-lucide-layout-grid"
                class="mb-1 h-4 w-4"
              />
              <span>Compact Cards</span>
            </button>
          </div>
        </div>

        <!-- Equities Selector -->
        <div>
          <div class="mb-1.5 flex items-center justify-between">
            <label class="text-xs font-semibold text-highlight">
              Included Equities ({{ form.selectedSymbols.length }} / 50)
            </label>
            <span
              v-if="form.selectedSymbols.length > 0"
              class="text-[10px] text-muted-foreground"
            >
              Click symbol to remove
            </span>
          </div>

          <!-- Selected Symbols Chips -->
          <div
            v-if="form.selectedSymbols.length > 0"
            class="mb-2 flex flex-wrap gap-1.5 rounded-lg border border-default/50 bg-muted/20 p-2"
          >
            <span
              v-for="sym in form.selectedSymbols"
              :key="sym"
              class="inline-flex cursor-pointer items-center gap-1 rounded bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-rose-500/20 hover:text-rose-500"
              title="Click to remove"
              @click="toggleSymbol(sym)"
            >
              {{ sym }}
              <UIcon
                name="i-lucide-x"
                class="h-3 w-3"
              />
            </span>
          </div>

          <!-- Search to add symbols -->
          <UInput
            v-model="symbolSearch"
            icon="i-lucide-search"
            placeholder="Type symbol or company name to add..."
            size="sm"
          />

          <!-- Filtered Symbol Quick Picker List -->
          <div class="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-1.5 text-xs divide-y divide-neutral-100 dark:divide-neutral-800">
            <div
              v-if="isSearching"
              class="flex items-center justify-center p-3 text-neutral-500 dark:text-neutral-400"
            >
              <UIcon
                name="i-lucide-loader-2"
                class="mr-1.5 h-4 w-4 animate-spin text-primary"
              />
              <span>Searching equities...</span>
            </div>

            <div
              v-else-if="searchResults.length === 0"
              class="p-3 text-center text-neutral-500 dark:text-neutral-400"
            >
              No matching equities found
            </div>

            <div
              v-for="item in searchResults"
              :key="item.symbol"
              class="flex cursor-pointer items-center justify-between rounded px-2.5 py-1.5 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
              :class="form.selectedSymbols.includes(item.symbol) ? 'bg-primary/10 font-bold text-primary' : 'text-neutral-900 dark:text-white'"
              @click="toggleSymbol(item.symbol)"
            >
              <div class="flex items-center gap-2">
                <span class="font-extrabold text-neutral-900 dark:text-white">{{ item.cleanSymbol }}</span>
                <span class="rounded bg-neutral-100 dark:bg-neutral-800 px-1 py-0.2 font-mono text-[9px] text-neutral-600 dark:text-neutral-400">NSE</span>
                <span class="truncate text-[11px] text-neutral-500 dark:text-neutral-400 max-w-[200px]">{{ item.companyName }}</span>
              </div>

              <div class="flex items-center gap-2">
                <span
                  v-if="item.price"
                  class="font-mono text-xs font-bold text-neutral-800 dark:text-neutral-200"
                >₹{{ item.price }}</span>
                <UIcon
                  :name="form.selectedSymbols.includes(item.symbol) ? 'i-lucide-check' : 'i-lucide-plus'"
                  class="h-3.5 w-3.5"
                  :class="form.selectedSymbols.includes(item.symbol) ? 'text-primary' : 'text-neutral-400 dark:text-neutral-500'"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="flex items-center justify-end gap-2 border-t border-default/40 pt-3">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            @click="isOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            color="primary"
            variant="solid"
            size="sm"
            :loading="isSaving"
            @click="handleSave"
          >
            {{ isEditing ? 'Save Changes' : 'Create View' }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
