<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminService, type AuditLog } from '../services/admin.service'

const logs = ref<AuditLog[]>([])
const isLoading = ref(false)
const filterType = ref<string>('')
const unlockEmail = ref('')
const unlockMessage = ref<string | null>(null)
const unlockError = ref<string | null>(null)

const eventTypes = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGIN_LOCKED_OUT',
  'TOKEN_REFRESH',
  'TOKEN_THEFT_DETECTED',
  'SESSION_REVOKED',
  'BLACKLIST_TRIGGERED',
  'BLACKLIST_ADDED',
  'BLACKLIST_REMOVED',
  'USER_UNLOCKED'
]

async function loadLogs() {
  try {
    isLoading.value = true
    const res = await adminService.getAuditLogs({
      limit: 50,
      type: filterType.value || undefined
    })
    logs.value = res.logs
  } catch (err: any) {
    console.error('Failed to load audit logs:', err)
  } finally {
    isLoading.value = false
  }
}

async function handleUnlockUser() {
  if (!unlockEmail.value) return

  try {
    isLoading.value = true
    unlockMessage.value = null
    unlockError.value = null
    const res = await adminService.unlockUser(unlockEmail.value)
    unlockMessage.value = res.message
    unlockEmail.value = ''
    await loadLogs()
  } catch (err: any) {
    unlockError.value = err?.data?.statusMessage || 'Failed to unlock user.'
  } finally {
    isLoading.value = false
  }
}

function getStatusColor(status: string) {
  if (status === 'ALERT') return 'error'
  if (status === 'WARNING') return 'warning'
  return 'success'
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString()
}

onMounted(() => {
  loadLogs()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Admin Unlock Account Tool -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-key-round" class="text-primary" />
          <h3 class="text-sm font-semibold">Admin Account Unlock Tool</h3>
        </div>
      </template>

      <div class="space-y-3">
        <p class="text-xs text-muted">
          Manually unlock an account that was blocked after 5 continuous failed login attempts.
        </p>

        <UAlert
          v-if="unlockMessage"
          color="success"
          variant="subtle"
          icon="i-lucide-circle-check"
          :title="unlockMessage"
          close
          @update:open="unlockMessage = null"
        />

        <UAlert
          v-if="unlockError"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="unlockError"
          close
          @update:open="unlockError = null"
        />

        <div class="flex flex-col sm:flex-row items-center gap-2">
          <UInput
            v-model="unlockEmail"
            placeholder="user@enterprise.com"
            size="sm"
            class="w-full sm:max-w-md"
          />
          <UButton
            color="primary"
            size="sm"
            icon="i-lucide-unlock"
            :loading="isLoading"
            @click="handleUnlockUser"
          >
            Unlock Account
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Audit Log Viewer -->
    <UCard>
      <template #header>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 class="text-base font-semibold">System Audit Trail</h3>
            <p class="text-xs text-muted">
              Complete record of user logins, access events, and administrative actions
            </p>
          </div>

          <div class="flex items-center gap-2">
            <select
              v-model="filterType"
              class="text-xs rounded border border-default bg-transparent px-2 py-1"
              @change="loadLogs"
            >
              <option value="">All Security Events</option>
              <option v-for="t in eventTypes" :key="t" :value="t">{{ t }}</option>
            </select>

            <UButton
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="ghost"
              size="xs"
              :loading="isLoading"
              @click="loadLogs"
            >
              Refresh
            </UButton>
          </div>
        </div>
      </template>

      <div class="space-y-4">
        <div v-if="isLoading && logs.length === 0" class="flex justify-center py-6">
          <UIcon name="i-lucide-loader-2" class="animate-spin text-2xl text-muted" />
        </div>

        <div v-else-if="logs.length === 0" class="text-xs text-muted py-6 text-center">
          No audit logs recorded matching this filter.
        </div>

        <div v-else class="divide-y divide-default border border-default rounded-md overflow-hidden">
          <div
            v-for="log in logs"
            :key="log.id"
            class="p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
          >
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <UBadge :color="getStatusColor(log.status)" variant="subtle" size="xs">
                  {{ log.status }}
                </UBadge>
                <span class="font-semibold text-default">{{ log.eventType }}</span>
                <span class="text-muted">• {{ formatDate(log.createdAt) }}</span>
              </div>
              <div class="flex flex-wrap items-center gap-2 text-muted">
                <span>IP: {{ log.ipAddress }}</span>
                <span>•</span>
                <span>User: {{ log.userId || 'Anonymous' }}</span>
              </div>
              <div v-if="log.details" class="font-mono text-[11px] text-muted truncate max-w-xl">
                Details: {{ JSON.stringify(log.details) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
