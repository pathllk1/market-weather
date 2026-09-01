<script setup lang="ts">
import { useAuth } from '../composables/useAuth'

definePageMeta({
  layout: 'default',
  middleware: 'auth'
})

const { user, session, isAdmin, logout } = useAuth()

function formatDate(ts?: number) {
  if (!ts) return 'N/A'
  return new Date(ts).toLocaleString()
}
</script>

<template>
  <div class="w-full px-4 sm:px-8 py-6 space-y-6">
    <!-- Status Banner (Full Width) -->
    <SecurityBadge />

    <!-- User Profile Overview (Full Width) -->
    <UCard class="w-full">
      <template #header>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <UIcon
              name="i-lucide-user"
              class="text-primary text-2xl"
            />
            <div>
              <h2 class="text-lg font-bold">
                ERP Operations Dashboard
              </h2>
              <p class="text-xs text-muted">
                Authenticated enterprise user session
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <UButton
              v-if="isAdmin"
              to="/admin/security"
              color="error"
              variant="subtle"
              size="sm"
              icon="i-lucide-settings-2"
            >
              System Administration
            </UButton>

            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              icon="i-lucide-log-out"
              @click="logout"
            >
              Sign Out
            </UButton>
          </div>
        </div>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="p-3 border border-default rounded-md space-y-1">
          <span class="text-xs text-muted">Account Email</span>
          <div class="font-semibold text-sm truncate">
            {{ user?.email }}
          </div>
          <UBadge
            :color="isAdmin ? 'error' : 'primary'"
            variant="subtle"
            size="xs"
          >
            Role: {{ user?.role.toUpperCase() }}
          </UBadge>
        </div>

        <div class="p-3 border border-default rounded-md space-y-1">
          <span class="text-xs text-muted">Active Device Session</span>
          <div class="font-semibold text-sm truncate">
            {{ session?.deviceName || 'Current Device' }}
          </div>
          <div class="text-xs text-muted font-mono">
            IP: {{ session?.ipAddress || '127.0.0.1' }}
          </div>
        </div>

        <div class="p-3 border border-default rounded-md space-y-1">
          <span class="text-xs text-muted">Session Validity</span>
          <div class="font-semibold text-sm">
            30 Days (Continuous Sliding)
          </div>
          <div class="text-xs text-muted">
            Expires: {{ formatDate(session?.expiresAt) }}
          </div>
        </div>
      </div>
    </UCard>

    <!-- Market Intelligence Pulse (Full Width) -->
    <div class="w-full">
      <MarketWatchWidget />
    </div>

    <!-- Active Sessions Management (Full Width) -->
    <div class="w-full">
      <SessionList />
    </div>
  </div>
</template>
