<script setup lang="ts">
import { useAuth } from '../composables/useAuth'

definePageMeta({
  layout: 'default'
})

const { user, session, isAdmin, logout } = useAuth()

function formatDate(ts?: number) {
  if (!ts) return 'N/A'
  return new Date(ts).toLocaleString()
}
</script>

<template>
  <div class="space-y-6">
    <!-- Top Welcome Banner -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900">
          Executive Dashboard
        </h1>
        <p class="text-sm text-slate-500 mt-1">
          Welcome back, <span class="font-semibold text-slate-700">{{ user?.email }}</span>
        </p>
      </div>

      <div class="flex items-center gap-3">
        <span
          class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize tracking-wide"
          :class="isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'"
        >
          {{ user?.role }} clearance
        </span>
        <UButton
          color="error"
          variant="soft"
          size="sm"
          icon="i-lucide-log-out"
          @click="logout"
        >
          Sign Out
        </UButton>
      </div>
    </div>

    <!-- Active Session Security Card -->
    <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
      <div class="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h2 class="text-base font-semibold text-slate-800">
            Active Enterprise Session
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">
            Cryptographically signed session context stored via HttpOnly token binding
          </p>
        </div>
        <UIcon
          name="i-lucide-shield-check"
          class="w-6 h-6 text-emerald-500"
        />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        <div class="p-3 bg-slate-50 rounded-lg border border-slate-100">
          <div class="text-xs text-slate-400 font-medium uppercase tracking-wider">
            Connected IP
          </div>
          <div class="text-sm font-semibold text-slate-700 mt-1 font-mono">
            {{ session?.ipAddress || 'Internal' }}
          </div>
        </div>

        <div class="p-3 bg-slate-50 rounded-lg border border-slate-100">
          <div class="text-xs text-slate-400 font-medium uppercase tracking-wider">
            Device Fingerprint
          </div>
          <div class="text-sm font-semibold text-slate-700 mt-1 truncate">
            {{ session?.deviceName || 'Authorized Workstation' }}
          </div>
        </div>

        <div class="p-3 bg-slate-50 rounded-lg border border-slate-100">
          <div class="text-xs text-slate-400 font-medium uppercase tracking-wider">
            Session Established
          </div>
          <div class="text-sm font-semibold text-slate-700 mt-1">
            {{ formatDate(session?.createdAt) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Active Session Manager Component -->
    <SessionList />
  </div>
</template>
