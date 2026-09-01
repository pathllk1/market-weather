<script setup lang="ts">
import { useAuth } from '../composables/useAuth'

const { user, isAuthenticated, isAdmin, logout } = useAuth()
</script>

<template>
  <div class="w-full min-h-screen flex flex-col bg-neutral-50/50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
    <!-- Fixed Minimal Header -->
    <header class="fixed top-0 inset-x-0 z-40 h-12 border-b border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 backdrop-blur flex items-center px-4 justify-between">
      <div class="flex items-center gap-6">
        <NuxtLink
          to="/"
          class="flex items-center gap-2 font-bold text-sm tracking-tight text-primary"
        >
          <UIcon
            name="i-lucide-layout-grid"
            class="text-lg"
          />
          <span>ENTERPRISE ERP</span>
        </NuxtLink>

        <ClientOnly>
          <nav
            v-if="isAuthenticated"
            class="hidden md:flex items-center gap-1"
          >
            <UButton
              to="/dashboard"
              variant="ghost"
              size="xs"
              color="neutral"
              icon="i-lucide-layout-dashboard"
            >
              Dashboard
            </UButton>

            <UButton
              to="/market"
              variant="ghost"
              size="xs"
              color="neutral"
              icon="i-lucide-trending-up"
            >
              Market Intelligence
            </UButton>

            <UButton
              to="/weather"
              variant="ghost"
              size="xs"
              color="neutral"
              icon="i-lucide-cloud-sun"
            >
              Weather & AQI
            </UButton>

            <UButton
              v-if="isAdmin"
              to="/admin/security"
              variant="ghost"
              size="xs"
              color="neutral"
              icon="i-lucide-settings-2"
            >
              System Control
            </UButton>
          </nav>
        </ClientOnly>
      </div>

      <div class="flex items-center gap-2">
        <UColorModeButton size="xs" />

        <ClientOnly>
          <template v-if="isAuthenticated">
            <span class="text-xs text-muted hidden sm:inline-block truncate max-w-[200px]">
              {{ user?.email }}
            </span>

            <UBadge
              :color="isAdmin ? 'error' : 'primary'"
              variant="subtle"
              size="xs"
              class="hidden sm:inline-flex"
            >
              {{ user?.role?.toUpperCase() }}
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
          </template>

          <template v-else>
            <UButton
              to="/login"
              variant="ghost"
              size="xs"
              icon="i-lucide-log-in"
              class="hidden sm:inline-flex"
            >
              Sign In
            </UButton>

            <UButton
              to="/register"
              color="primary"
              variant="solid"
              size="xs"
              icon="i-lucide-user-plus"
              class="hidden sm:inline-flex"
            >
              Create Account
            </UButton>
          </template>

          <!-- Mobile Hamburger Trigger & Slideover + Bottom Nav -->
          <AppMobileMenu />
        </ClientOnly>
      </div>
    </header>

    <!-- Main Content (Padded to clear fixed header and mobile bottom bar) -->
    <main class="w-full flex-1 pt-12 pb-20 md:pb-8">
      <slot />
    </main>

    <!-- Desktop Minimal Footer -->
    <footer class="hidden md:flex fixed bottom-0 inset-x-0 z-30 h-8 border-t border-default bg-background/90 backdrop-blur items-center justify-between px-4 text-[11px] text-muted">
      <div class="flex items-center gap-2">
        <span>Enterprise Operations System</span>
        <span>•</span>
        <span>© {{ new Date().getFullYear() }}</span>
      </div>

      <div class="flex items-center gap-3">
        <span class="flex items-center gap-1.5">
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-success" />
          System Active
        </span>
        <span>•</span>
        <span>Encrypted Sessions</span>
      </div>
    </footer>
  </div>
</template>
