<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { DematAccount } from '~/types/portfolio'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'updated'): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const accounts = ref<DematAccount[]>([])
const isLoading = ref(false)

// Form State
const showAddForm = ref(false)
const brokerName = ref('Zerodha')
const accountName = ref('')
const clientId = ref('')
const depository = ref<'CDSL' | 'NSDL'>('CDSL')
const isDefault = ref(false)
const isSubmitting = ref(false)
const errorMessage = ref('')

const POPULAR_BROKERS = [
  'Zerodha',
  'Groww',
  'Upstox',
  'Angel One',
  'ICICI Direct',
  'HDFC Sky',
  'Dhan',
  'Kotak Neo',
  'Motilal Oswal',
  'Paytm Money',
  'Sharekhan',
  '5paisa'
]

async function loadAccounts() {
  isLoading.value = true
  try {
    const res = await $fetch<{ dematAccounts: DematAccount[] }>('/api/demat')
    accounts.value = res.dematAccounts || []
  } catch (err) {
    console.error('Failed to fetch Demat accounts:', err)
  } finally {
    isLoading.value = false
  }
}

watch(() => props.modelValue, (val) => {
  if (val) {
    loadAccounts()
    showAddForm.value = false
  }
})

async function handleAddAccount() {
  if (!accountName.value.trim()) {
    errorMessage.value = 'Please enter an account nickname.'
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''

  try {
    await $fetch('/api/demat', {
      method: 'POST',
      body: {
        brokerName: brokerName.value,
        accountName: accountName.value.trim(),
        clientId: clientId.value.trim() || undefined,
        depository: depository.value,
        isDefault: isDefault.value
      }
    })

    accountName.value = ''
    clientId.value = ''
    showAddForm.value = false
    await loadAccounts()
    emit('updated')
  } catch (err: any) {
    errorMessage.value = err?.data?.statusMessage || 'Failed to link Demat account'
  } finally {
    isSubmitting.value = false
  }
}

async function handleDelete(id: string) {
  if (!confirm('Are you sure you want to remove this Demat account? Associated trades will become unassigned.')) return
  try {
    await $fetch(`/api/demat/${id}`, { method: 'DELETE' })
    await loadAccounts()
    emit('updated')
  } catch (err) {
    alert('Failed to delete Demat account')
  }
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :ui="{ content: 'sm:max-w-xl' }"
  >
    <template #header>
      <div class="flex items-start justify-between w-full">
        <div>
          <h3 class="font-bold text-base text-neutral-900 dark:text-white">Multi-Demat Accounts Manager</h3>
          <p class="text-xs text-neutral-400">Link Zerodha, Groww, Upstox, Angel One, and banking brokers</p>
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
      <div class="space-y-4">

      <!-- Linked Accounts List -->
      <div class="space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-neutral-500 uppercase tracking-wider">Linked Demat Accounts ({{ accounts.length }})</span>
          <button
            v-if="!showAddForm"
            type="button"
            class="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
            @click="showAddForm = true"
          >
            <UIcon name="i-lucide-plus" class="h-3.5 w-3.5" />
            <span>Link Another Account</span>
          </button>
        </div>

        <div class="space-y-2">
          <div
            v-for="acc in accounts"
            :key="acc.id"
            class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/70 p-3 flex items-center justify-between shadow-2xs hover:border-primary/40 transition-colors"
          >
            <div class="flex items-center gap-3">
              <div class="h-9 w-9 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center font-bold text-primary text-xs">
                {{ acc.brokerName.slice(0, 2).toUpperCase() }}
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <strong class="font-bold text-xs text-neutral-900 dark:text-white">{{ acc.accountName }}</strong>
                  <UBadge v-if="acc.isDefault" color="primary" variant="subtle" size="xs">Default</UBadge>
                </div>
                <div class="text-[11px] text-neutral-500 font-mono mt-0.5 flex items-center gap-2">
                  <span>{{ acc.brokerName }}</span>
                  <span>•</span>
                  <span>{{ acc.depository }}</span>
                  <span v-if="acc.clientId">• BOID: {{ acc.clientId }}</span>
                </div>
              </div>
            </div>

            <button
              v-if="accounts.length > 1"
              type="button"
              class="p-1.5 rounded-lg text-neutral-400 hover:text-rose-500 transition-colors"
              title="Remove account"
              @click="handleDelete(acc.id)"
            >
              <UIcon name="i-lucide-trash-2" class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <!-- Add Account Form Drawer -->
      <div
        v-if="showAddForm"
        class="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3"
      >
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-bold text-primary flex items-center gap-1.5">
            <UIcon name="i-lucide-plus-circle" class="h-4 w-4" />
            <span>Link New Demat Account</span>
          </h4>
          <button type="button" class="text-xs text-neutral-400 hover:text-neutral-600" @click="showAddForm = false">Cancel</button>
        </div>

        <form class="space-y-3" @submit.prevent="handleAddAccount">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Broker / DP Name</label>
              <select
                v-model="brokerName"
                class="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:outline-hidden focus:border-primary"
              >
                <option v-for="b in POPULAR_BROKERS" :key="b" :value="b">{{ b }}</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Depository</label>
              <select
                v-model="depository"
                class="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:outline-hidden focus:border-primary"
              >
                <option value="CDSL">CDSL (Central Depository)</option>
                <option value="NSDL">NSDL (National Securities)</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Account Nickname</label>
            <input
              v-model="accountName"
              type="text"
              placeholder="e.g. Zerodha Primary, Groww Wealth, Upstox Swing..."
              class="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:outline-hidden focus:border-primary"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Client ID / BOID (Optional)</label>
            <input
              v-model="clientId"
              type="text"
              placeholder="e.g. 1208160012345678 or DP ID"
              class="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs font-mono text-neutral-900 dark:text-white focus:outline-hidden focus:border-primary"
            />
          </div>

          <div class="flex items-center justify-between pt-1">
            <label class="flex items-center gap-2 cursor-pointer text-xs">
              <input v-model="isDefault" type="checkbox" class="rounded text-primary h-3.5 w-3.5" />
              <span>Set as default account for future orders</span>
            </label>

            <button
              type="submit"
              :disabled="isSubmitting"
              class="px-4 py-1.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-dark"
            >
              Link Account
            </button>
          </div>

          <p v-if="errorMessage" class="text-xs text-rose-500 font-medium">{{ errorMessage }}</p>
        </form>
      </div>

      <div class="flex items-center justify-end pt-3 border-t border-neutral-200 dark:border-neutral-800">
        <button
          type="button"
          class="px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
          @click="isOpen = false"
        >
          Close
        </button>
      </div>
    </div>
  </template>
</UModal>
</template>
