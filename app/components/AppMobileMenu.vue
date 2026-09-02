<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const props = defineProps<{
  showBottomBar?: boolean
}>()

const route = useRoute()
const { user, isAuthenticated, isAdmin, logout } = useAuth()

const isOpen = ref(false)

// Close drawer automatically on route navigation
watch(() => route.path, () => {
  isOpen.value = false
})

const navItems = computed(() => {
  const items = [
    {
      to: '/dashboard',
      label: 'Dashboard',
      description: 'System overview & security metrics',
      icon: 'i-lucide-layout-dashboard'
    },
    {
      to: '/market',
      label: 'Market Intelligence',
      description: 'Live OHLCV views & stock screener',
      icon: 'i-lucide-trending-up'
    },
    {
      to: '/portfolio',
      label: 'Portfolio Intelligence',
      description: 'Live holdings, risk metrics & rebalancing',
      icon: 'i-lucide-briefcase'
    },
    {
      to: '/weather',
      label: 'Weather & AQI',
      description: 'National air quality & 51-city matrix',
      icon: 'i-lucide-cloud-sun'
    },
    {
      to: '/analytics/stocks',
      label: 'Stock Analytics',
      description: 'Technical radar & historical data',
      icon: 'i-lucide-line-chart'
    }
  ]

  if (isAdmin.value) {
    items.push({
      to: '/admin/security',
      label: 'System Administration',
      description: 'Audit logs, blacklist & user control',
      icon: 'i-lucide-shield-alert'
    })
  }

  return items
})

const bottomBarItems = computed(() => {
  const items = [
    {
      to: '/dashboard',
      label: 'Dashboard',
      icon: 'i-lucide-layout-dashboard'
    },
    {
      to: '/market',
      label: 'Market',
      icon: 'i-lucide-trending-up'
    },
    {
      to: '/weather',
      label: 'Weather',
      icon: 'i-lucide-cloud-sun'
    }
  ]

  if (isAdmin.value) {
    items.push({
      to: '/admin/security',
      label: 'Admin',
      icon: 'i-lucide-shield-alert'
    })
  }

  return items
})

function isRouteActive(path: string): boolean {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

function handleSignOut() {
  isOpen.value = false
  logout()
}

// Expose open method for header buttons
defineExpose({
  open: () => { isOpen.value = true },
  close: () => { isOpen.value = false },
  toggle: () => { isOpen.value = !isOpen.value }
})
</script>

<template>
  <div>
    <!-- Hamburger Button for Mobile Top Header -->
    <slot
      name="trigger"
      :open="() => isOpen = true"
      :toggle="() => isOpen = !isOpen"
    >
      <UButton
        variant="ghost"
        color="neutral"
        size="xs"
        icon="i-lucide-menu"
        class="md:hidden"
        aria-label="Open Navigation Menu"
        @click="isOpen = true"
      />
    </slot>

    <!-- Slideover Drawer for Mobile Navigation -->
    <USlideover
      v-model:open="isOpen"
      title="Navigation Menu"
      side="right"
      :ui="{
        overlay: 'fixed inset-0 bg-neutral-950/60 backdrop-blur-xs z-50',
        content: 'fixed inset-y-0 right-0 z-50 w-full max-w-xs sm:max-w-sm bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col focus:outline-none',
        header: 'px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between min-h-14 bg-white dark:bg-neutral-900',
        body: 'flex-1 overflow-y-auto p-5 space-y-5 bg-white dark:bg-neutral-900',
        footer: 'p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950'
      }"
    >
      <template #header>
        <div class="flex items-center justify-between w-full">
          <NuxtLink
            to="/"
            class="flex items-center gap-2 font-bold text-sm tracking-tight text-primary"
            @click="isOpen = false"
          >
            <UIcon
              name="i-lucide-layout-grid"
              class="text-lg text-primary"
            />
            <span class="font-extrabold text-neutral-900 dark:text-white">ENTERPRISE ERP</span>
          </NuxtLink>

          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="sm"
            class="rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
            aria-label="Close Navigation Menu"
            @click="isOpen = false"
          />
        </div>
      </template>

      <template #body>
        <div class="space-y-6 bg-white dark:bg-neutral-900">
          <!-- User Profile Card (if authenticated) -->
          <div
            v-if="isAuthenticated"
            class="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700/70 bg-neutral-50 dark:bg-neutral-800/80 space-y-2.5 shadow-xs"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-primary/10 dark:bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                {{ user?.email?.charAt(0).toUpperCase() || 'U' }}
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-xs font-bold text-neutral-900 dark:text-white truncate">
                  {{ user?.email }}
                </div>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <UBadge
                    :color="isAdmin ? 'error' : 'primary'"
                    variant="subtle"
                    size="xs"
                    class="font-mono text-[9px] px-1.5 py-0 font-bold"
                  >
                    {{ user?.role?.toUpperCase() }}
                  </UBadge>
                  <span class="text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    Active
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Guest Action Banner (if not logged in) -->
          <div
            v-else
            class="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/80 space-y-3"
          >
            <p class="text-xs text-neutral-600 dark:text-neutral-400">
              Sign in to access real-time market views, customized watchlists, and analytics.
            </p>
            <div class="grid grid-cols-2 gap-2">
              <UButton
                to="/login"
                size="xs"
                variant="outline"
                icon="i-lucide-log-in"
                class="justify-center font-semibold"
                @click="isOpen = false"
              >
                Sign In
              </UButton>
              <UButton
                to="/register"
                size="xs"
                color="primary"
                variant="solid"
                icon="i-lucide-user-plus"
                class="justify-center font-semibold"
                @click="isOpen = false"
              >
                Register
              </UButton>
            </div>
          </div>

          <!-- Navigation Links -->
          <div class="space-y-1.5">
            <span class="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 px-2 block mb-1">
              Application Pages
            </span>

            <NuxtLink
              v-for="item in navItems"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group"
              :class="isRouteActive(item.to)
                ? 'bg-primary text-white shadow-sm'
                : 'text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/70'"
              @click="isOpen = false"
            >
              <UIcon
                :name="item.icon"
                class="text-base shrink-0"
                :class="isRouteActive(item.to) ? 'text-white' : 'text-primary'"
              />
              <div class="min-w-0 flex-1">
                <div class="truncate font-bold">
                  {{ item.label }}
                </div>
                <div
                  class="text-[10px] truncate"
                  :class="isRouteActive(item.to) ? 'text-white/80' : 'text-neutral-500 dark:text-neutral-400'"
                >
                  {{ item.description }}
                </div>
              </div>
              <UIcon
                name="i-lucide-chevron-right"
                class="text-xs shrink-0 transition-transform group-hover:translate-x-0.5"
                :class="isRouteActive(item.to) ? 'text-white/80' : 'text-neutral-400'"
              />
            </NuxtLink>
          </div>

          <!-- Preferences & Tools Section -->
          <div class="space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <span class="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 px-2 block">
              Preferences & System
            </span>

            <div class="flex items-center justify-between px-3 py-2 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700/60">
              <span class="text-xs font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                <UIcon
                  name="i-lucide-sun-moon"
                  class="text-sm text-primary"
                />
                Appearance Theme
              </span>
              <UColorModeButton size="xs" />
            </div>

            <NuxtLink
              to="/"
              class="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/50 transition-all font-medium"
              @click="isOpen = false"
            >
              <UIcon
                name="i-lucide-home"
                class="text-sm text-primary"
              />
              <span>Return to Portal Home</span>
            </NuxtLink>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="w-full">
          <UButton
            v-if="isAuthenticated"
            color="error"
            variant="subtle"
            size="sm"
            icon="i-lucide-log-out"
            block
            class="w-full justify-center font-bold"
            @click="handleSignOut"
          >
            Sign Out Account
          </UButton>

          <p
            v-else
            class="text-[11px] text-neutral-400 text-center py-1 font-mono"
          >
            Encrypted Enterprise Architecture
          </p>
        </div>
      </template>
    </USlideover>

    <!-- Mobile Bottom Navigation Bar (1-Thumb Easy Access) -->
    <nav
      v-if="props.showBottomBar !== false"
      class="md:hidden fixed bottom-0 inset-x-0 z-40 h-14 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-lg border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-around px-2 shadow-lg"
    >
      <NuxtLink
        v-for="tab in bottomBarItems"
        :key="tab.to"
        :to="tab.to"
        class="flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-colors"
        :class="isRouteActive(tab.to) ? 'text-primary font-bold' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'"
      >
        <UIcon
          :name="tab.icon"
          class="text-lg transition-transform"
          :class="{ 'scale-110': isRouteActive(tab.to) }"
        />
        <span class="text-[10px] mt-0.5 tracking-tight font-medium">
          {{ tab.label }}
        </span>
      </NuxtLink>

      <!-- More / Menu Drawer Toggle -->
      <button
        type="button"
        class="flex flex-col items-center justify-center flex-1 h-full py-1 text-center text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
        :class="{ 'text-primary font-bold': isOpen }"
        aria-label="Open Full Menu"
        @click="isOpen = !isOpen"
      >
        <UIcon
          name="i-lucide-menu"
          class="text-lg"
        />
        <span class="text-[10px] mt-0.5 tracking-tight font-medium">
          Menu
        </span>
      </button>
    </nav>
  </div>
</template>
