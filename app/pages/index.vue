<script setup lang="ts">
import { useAuth } from '../composables/useAuth'

definePageMeta({
  layout: 'default'
})

const { isAuthenticated, isAdmin, user } = useAuth()
</script>

<template>
  <div class="w-full px-4 sm:px-8 py-8 space-y-8">
    <!-- Top Hero Banner (Full Width) -->
    <div class="w-full rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-default p-6 sm:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
      <div class="space-y-2 max-w-3xl">
        <div class="flex items-center gap-2">
          <UBadge color="primary" variant="subtle" size="sm">
            Enterprise ERP Operations
          </UBadge>
          <span class="text-xs text-muted">Version 4.0 Platform</span>
        </div>

        <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight">
          Enterprise Resource Planning & Operations
        </h1>

        <p class="text-sm text-muted">
          Unified business operations platform with secure multi-device session continuity, granular access controls, automated account lockout protection, and end-to-end activity auditing.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-3 shrink-0">
        <template v-if="isAuthenticated">
          <UButton
            to="/dashboard"
            color="primary"
            variant="solid"
            size="md"
            icon="i-lucide-layout-dashboard"
          >
            Go to Dashboard
          </UButton>

          <UButton
            v-if="isAdmin"
            to="/admin/security"
            color="neutral"
            variant="outline"
            size="md"
            icon="i-lucide-settings-2"
          >
            System Control
          </UButton>
        </template>

        <template v-else>
          <UButton
            to="/login"
            color="primary"
            variant="solid"
            size="md"
            icon="i-lucide-log-in"
          >
            Sign In
          </UButton>

          <UButton
            to="/register"
            color="neutral"
            variant="outline"
            size="md"
            icon="i-lucide-user-plus"
          >
            Enroll Account
          </UButton>
        </template>
      </div>
    </div>

    <!-- System Status Badge (Full Width) -->
    <SecurityBadge />

    <!-- Platform Modules Grid (Full Width) -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
      <UCard class="w-full">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-users" class="text-primary text-xl" />
            <h3 class="font-bold text-sm">Identity & Sessions</h3>
          </div>
        </template>
        <p class="text-xs text-muted mb-3">
          Robust user authentication with persistent session continuity, background silent refreshing, and instant remote device revocation.
        </p>
        <div class="flex items-center gap-1.5 text-xs text-primary font-medium">
          <UIcon name="i-lucide-circle-check" />
          <span>Active Device Management</span>
        </div>
      </UCard>

      <UCard class="w-full">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-shield-alert" class="text-primary text-xl" />
            <h3 class="font-bold text-sm">Account Protection</h3>
          </div>
        </template>
        <p class="text-xs text-muted mb-3">
          Automatic 15-minute account lockouts triggered after 5 continuous failed attempts to prevent credential brute-forcing.
        </p>
        <div class="flex items-center gap-1.5 text-xs text-primary font-medium">
          <UIcon name="i-lucide-circle-check" />
          <span>Brute-Force Guard</span>
        </div>
      </UCard>

      <UCard class="w-full">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-ban" class="text-primary text-xl" />
            <h3 class="font-bold text-sm">Access Control</h3>
          </div>
        </template>
        <p class="text-xs text-muted mb-3">
          Network boundary enforcement dropping unauthorized IP addresses and suspicious device fingerprints before processing requests.
        </p>
        <div class="flex items-center gap-1.5 text-xs text-primary font-medium">
          <UIcon name="i-lucide-circle-check" />
          <span>Boundary Filtering</span>
        </div>
      </UCard>

      <UCard class="w-full">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-file-text" class="text-primary text-xl" />
            <h3 class="font-bold text-sm">Activity Audit Trail</h3>
          </div>
        </template>
        <p class="text-xs text-muted mb-3">
          Comprehensive, structured event recording tracking all user logins, failed attempts, and administrative security actions.
        </p>
        <div class="flex items-center gap-1.5 text-xs text-primary font-medium">
          <UIcon name="i-lucide-circle-check" />
          <span>Complete Event History</span>
        </div>
      </UCard>
    </div>

    <!-- Quick Navigation / System Overview (Full Width) -->
    <UCard class="w-full">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-cpu" class="text-primary text-lg" />
            <h3 class="text-sm font-semibold">ERP System Architecture</h3>
          </div>
          <UBadge color="success" variant="subtle" size="xs">
            Operational
          </UBadge>
        </div>
      </template>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div class="p-3 rounded-lg border border-default space-y-1">
          <span class="text-muted block">Session Lifecycle</span>
          <span class="font-semibold text-foreground block">Sliding 30-Day Continuity</span>
          <p class="text-muted">
            Seamless token renewal via HttpOnly SameSite=Strict cookies without disrupting user workflow.
          </p>
        </div>

        <div class="p-3 rounded-lg border border-default space-y-1">
          <span class="text-muted block">Protection Mechanism</span>
          <span class="font-semibold text-foreground block">Token Reuse Detection</span>
          <p class="text-muted">
            Automated invalidation of token families upon detection of intercepted or duplicated tokens.
          </p>
        </div>

        <div class="p-3 rounded-lg border border-default space-y-1">
          <span class="text-muted block">Database Replication</span>
          <span class="font-semibold text-foreground block">Distributed Edge Storage</span>
          <p class="text-muted">
            Resilient SQL database engine with fast response times and encrypted credentials storage.
          </p>
        </div>
      </div>
    </UCard>
  </div>
</template>
