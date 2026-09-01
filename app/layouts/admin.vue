<script setup lang="ts">
import { useAuth } from '../composables/useAuth'

const { user, logout } = useAuth()
</script>

<template>
  <div class="w-full min-h-screen flex flex-col bg-background text-foreground">
    <!-- Fixed Minimal Header -->
    <header class="fixed top-0 inset-x-0 z-50 h-12 border-b border-default bg-background/90 backdrop-blur flex items-center px-4 justify-between">
      <div class="flex items-center gap-6">
        <NuxtLink to="/admin/security" class="flex items-center gap-2 font-bold text-sm tracking-tight text-primary">
          <UIcon name="i-lucide-shield-alert" class="text-lg text-primary" />
          <span>SYSTEM ADMINISTRATION</span>
        </NuxtLink>

        <nav class="hidden md:flex items-center gap-1">
          <UButton
            to="/dashboard"
            variant="ghost"
            size="xs"
            color="neutral"
            icon="i-lucide-layout-dashboard"
          >
            User Area
          </UButton>
          <UButton
            to="/admin/security"
            variant="ghost"
            size="xs"
            color="primary"
            icon="i-lucide-sliders"
          >
            Access Control
          </UButton>
        </nav>
      </div>

      <div class="flex items-center gap-2">
        <UColorModeButton size="xs" />

        <span class="text-xs text-muted hidden sm:inline-block truncate max-w-[200px]">
          {{ user?.email }}
        </span>

        <UBadge color="error" variant="subtle" size="xs" class="hidden sm:inline-flex">
          ADMIN
        </UBadge>

        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-log-out"
          class="hidden md:inline-flex"
          @click="logout"
        >
          Sign Out
        </UButton>

        <!-- Mobile Menu Trigger & Bottom Bar -->
        <AppMobileMenu />
      </div>
    </header>

    <!-- Main Content (Full Width, padded for mobile bottom bar) -->
    <main class="w-full flex-1 pt-12 pb-20 md:pb-8 p-4 sm:p-6">
      <slot />
    </main>

    <!-- Desktop Minimal Footer -->
    <footer class="hidden md:flex fixed bottom-0 inset-x-0 z-30 h-8 border-t border-default bg-background/90 backdrop-blur items-center justify-between px-4 text-[11px] text-muted">
      <div class="flex items-center gap-2">
        <span>Admin Operations Console</span>
        <span>•</span>
        <span>Privileged Mode</span>
      </div>

      <div class="flex items-center gap-2">
        <span class="inline-block w-1.5 h-1.5 rounded-full bg-success"></span>
        <span>Audit Trail Active</span>
      </div>
    </footer>
  </div>
</template>
