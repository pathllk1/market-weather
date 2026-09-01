<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { authService, type SessionInfo } from '../services/auth.service'
import { useAuth } from '../composables/useAuth'

const { logout } = useAuth()

const sessions = ref<SessionInfo[]>([])
const isLoading = ref(false)
const actionMessage = ref<string | null>(null)
const errorMessage = ref<string | null>(null)

async function loadSessions() {
  try {
    isLoading.value = true
    errorMessage.value = null
    const res = await authService.getSessions()
    sessions.value = res.sessions
  } catch (err: any) {
    errorMessage.value = err?.data?.statusMessage || 'Failed to load active sessions.'
  } finally {
    isLoading.value = false
  }
}

async function handleRevoke(sessionId: string, isCurrent = false) {
  try {
    isLoading.value = true
    errorMessage.value = null
    const res = await authService.revokeSession(sessionId)
    actionMessage.value = res.message

    if (isCurrent) {
      await logout()
      return
    }

    await loadSessions()
  } catch (err: any) {
    errorMessage.value = err?.data?.statusMessage || 'Failed to revoke session.'
  } finally {
    isLoading.value = false
  }
}

async function handleRevokeAllOthers() {
  try {
    isLoading.value = true
    errorMessage.value = null
    const res = await authService.revokeSession(undefined, true)
    actionMessage.value = res.message
    await loadSessions()
  } catch (err: any) {
    errorMessage.value = err?.data?.statusMessage || 'Failed to revoke other sessions.'
  } finally {
    isLoading.value = false
  }
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString()
}

onMounted(() => {
  loadSessions()
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-base font-semibold">Active Sessions & Devices</h3>
          <p class="text-xs text-muted">
            All devices currently authenticated and active on your account
          </p>
        </div>

        <div class="flex items-center gap-2">
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="xs"
            :loading="isLoading"
            @click="loadSessions"
          >
            Refresh
          </UButton>
          <UButton
            v-if="sessions.length > 1"
            icon="i-lucide-shield-alert"
            color="error"
            variant="subtle"
            size="xs"
            :loading="isLoading"
            @click="handleRevokeAllOthers"
          >
            Revoke All Others
          </UButton>
        </div>
      </div>
    </template>

    <div class="space-y-4">
      <UAlert
        v-if="actionMessage"
        color="success"
        variant="subtle"
        icon="i-lucide-circle-check"
        :title="actionMessage"
        close
        @update:open="actionMessage = null"
      />

      <UAlert
        v-if="errorMessage"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="errorMessage"
        close
        @update:open="errorMessage = null"
      />

      <div v-if="isLoading && sessions.length === 0" class="flex justify-center py-6">
        <UIcon name="i-lucide-loader-2" class="animate-spin text-2xl text-muted" />
      </div>

      <div v-else class="divide-y divide-default">
        <div
          v-for="s in sessions"
          :key="s.id"
          class="py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
        >
          <div class="flex items-start gap-3">
            <UIcon
              :name="s.isCurrent ? 'i-lucide-laptop' : 'i-lucide-smartphone'"
              class="text-xl text-primary mt-0.5"
            />
            <div>
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium">{{ s.deviceName }}</span>
                <UBadge v-if="s.isCurrent" color="primary" variant="solid" size="xs">
                  Current Device
                </UBadge>
              </div>
              <div class="flex flex-wrap items-center gap-2 text-xs text-muted mt-1">
                <span>IP: {{ s.ipAddress }}</span>
                <span>•</span>
                <span>Active: {{ formatDate(s.lastActiveAt) }}</span>
                <span>•</span>
                <span>Started: {{ formatDate(s.createdAt) }}</span>
              </div>
            </div>
          </div>

          <UButton
            :color="s.isCurrent ? 'error' : 'neutral'"
            :variant="s.isCurrent ? 'outline' : 'ghost'"
            size="xs"
            icon="i-lucide-log-out"
            :loading="isLoading"
            @click="handleRevoke(s.id, s.isCurrent)"
          >
            {{ s.isCurrent ? 'Logout Session' : 'Revoke' }}
          </UButton>
        </div>
      </div>
    </div>
  </UCard>
</template>
