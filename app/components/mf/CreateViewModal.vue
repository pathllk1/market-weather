<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useMutualFunds } from '../../composables/useMutualFunds'
import type { MFSchemeSearchItem } from '../../types/mutualFunds'

export interface MFUserView {
  id: string
  name: string
  description?: string
  scheme_codes: number[]
  is_default: boolean
}

const props = defineProps<{
  modelValue: boolean
  viewToEdit: MFUserView | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'saved'): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val)
})

const isEditing = computed(() => !!props.viewToEdit)

const form = reactive({
  name: '',
  description: '',
  is_default: false,
  selectedSchemes: [] as MFSchemeSearchItem[]
})

const { searchFunds, isSearching } = useMutualFunds()
const schemeSearch = ref('')
const searchResults = ref<MFSchemeSearchItem[]>([])
const isSaving = ref(false)
const errorMessage = ref('')

watch(
  () => props.viewToEdit,
  async (v) => {
    if (v) {
      form.name = v.name
      form.description = v.description || ''
      form.is_default = Boolean(v.is_default)
      // Pre-populate with scheme codes
      form.selectedSchemes = (v.scheme_codes || []).map(code => ({
        schemeCode: code,
        schemeName: `Scheme #${code}`
      }))
    } else {
      form.name = ''
      form.description = ''
      form.is_default = false
      form.selectedSchemes = []
    }
    errorMessage.value = ''
    schemeSearch.value = ''
    searchResults.value = []
  },
  { immediate: true }
)

let searchTimer: any = null
function handleSearchInput() {
  clearTimeout(searchTimer)
  if (schemeSearch.value.trim().length < 2) {
    searchResults.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    searchResults.value = await searchFunds(schemeSearch.value)
  }, 300)
}

function addScheme(item: MFSchemeSearchItem) {
  if (!form.selectedSchemes.some(s => s.schemeCode === item.schemeCode)) {
    form.selectedSchemes.push(item)
  }
  schemeSearch.value = ''
  searchResults.value = []
}

function removeScheme(code: number) {
  form.selectedSchemes = form.selectedSchemes.filter(s => s.schemeCode !== code)
}

async function handleSave() {
  if (!form.name.trim()) {
    errorMessage.value = 'Please enter a view name.'
    return
  }

  isSaving.value = true
  errorMessage.value = ''

  try {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      is_default: form.is_default,
      scheme_codes: form.selectedSchemes.map(s => s.schemeCode)
    }

    if (isEditing.value && props.viewToEdit) {
      await $fetch(`/api/mf/views/${props.viewToEdit.id}`, {
        method: 'PUT',
        body: payload
      })
    } else {
      await $fetch('/api/mf/views', {
        method: 'POST',
        body: payload
      })
    }

    emit('saved')
    isOpen.value = false
  } catch (err: any) {
    errorMessage.value = err.data?.message || err.message || 'Failed to save view.'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'max-w-xl' }">
    <template #header>
      <div class="flex items-start justify-between w-full">
        <div class="flex items-center gap-3">
          <div class="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <UIcon :name="isEditing ? 'i-lucide-edit-3' : 'i-lucide-folder-plus'" class="h-5 w-5" />
          </div>
          <div>
            <h3 class="text-base font-bold text-neutral-900 dark:text-white">
              {{ isEditing ? 'Edit Mutual Fund View' : 'Create Custom Mutual Fund View' }}
            </h3>
            <p class="text-xs text-neutral-400">
              Save custom baskets of Indian mutual fund schemes for tracking and screening
            </p>
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
      <form class="space-y-4" @submit.prevent="handleSave">
        <!-- Name -->
        <UFormField label="View Name" required>
          <UInput
            v-model="form.name"
            placeholder="e.g. My 2026 Core SIPs, High-Alpha Small Caps, Tax Savers"
            class="w-full"
          />
        </UFormField>

        <!-- Description -->
        <UFormField label="Description (Optional)">
          <UTextarea
            v-model="form.description"
            placeholder="Short description of this scheme watchlist..."
            :rows="2"
            class="w-full"
          />
        </UFormField>

        <!-- Search & Add Schemes -->
        <div class="space-y-2">
          <label class="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            Add Schemes to this View (45,000+ available)
          </label>
          <div class="relative">
            <UInput
              v-model="schemeSearch"
              placeholder="Search by fund name (e.g. Parag Parikh, Quant Small, HDFC Top 100)..."
              icon="i-lucide-search"
              class="w-full"
              @input="handleSearchInput"
            />
            <UIcon
              v-if="isSearching"
              name="i-lucide-loader-2"
              class="animate-spin absolute right-3 top-2.5 h-4 w-4 text-primary"
            />

            <!-- Dropdown -->
            <div
              v-if="searchResults.length > 0"
              class="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800 text-xs"
            >
              <button
                v-for="item in searchResults"
                :key="item.schemeCode"
                type="button"
                class="w-full text-left p-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                @click="addScheme(item)"
              >
                <span class="font-medium line-clamp-1">{{ item.schemeName }}</span>
                <span class="text-[10px] font-mono text-neutral-400 shrink-0">#{{ item.schemeCode }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Selected Schemes Chips -->
        <div class="space-y-1.5">
          <span class="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
            Included Schemes ({{ form.selectedSchemes.length }})
          </span>
          <div v-if="form.selectedSchemes.length === 0" class="p-4 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 text-center text-xs text-neutral-400">
            No schemes added yet. Use the search box above to add funds.
          </div>
          <div v-else class="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
            <div
              v-for="s in form.selectedSchemes"
              :key="s.schemeCode"
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300 text-xs"
            >
              <span class="font-medium line-clamp-1 max-w-[280px]">{{ s.schemeName }}</span>
              <button
                type="button"
                class="hover:text-rose-500 transition-colors cursor-pointer"
                @click="removeScheme(s.schemeCode)"
              >
                <UIcon name="i-lucide-x" class="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>

        <!-- Set Default Checkbox -->
        <div class="pt-2">
          <label class="flex items-center gap-2 cursor-pointer text-xs">
            <input
              v-model="form.is_default"
              type="checkbox"
              class="rounded border-neutral-300 text-primary focus:ring-primary h-4 w-4"
            >
            <span class="text-neutral-700 dark:text-neutral-300 font-medium">Set as Default View on Mutual Funds page</span>
          </label>
        </div>

        <div v-if="errorMessage" class="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs">
          {{ errorMessage }}
        </div>
      </form>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="isOpen = false">
          Cancel
        </UButton>
        <UButton
          color="primary"
          :loading="isSaving"
          @click="handleSave"
        >
          {{ isEditing ? 'Save Changes' : 'Create View' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
