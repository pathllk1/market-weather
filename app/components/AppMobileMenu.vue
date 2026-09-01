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
      to: '/analytics/stocks',
      label: 'Analytics',
      icon: 'i-lucide-line-chart'
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
        content: 'max-w-xs sm:max-w-sm w-full bg-background'
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
              class="text-lg"
            />
            <span>ENTERPRISE ERP</span>
          </NuxtLink>

          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Close Navigation Menu"
            @click="isOpen = false"
          />
        </div>
      </template>

      <template #body>
        <div class="space-y-6">
          <!-- User Profile Card (if authenticated) -->
          <div
            v-if="isAuthenticated"
            class="p-3.5 rounded-xl border border-default bg-muted/20 space-y-2.5"
          >
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                {{ user?.email?.charAt(0).toUpperCase() || 'U' }}
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-xs font-bold text-highlight truncate">
                  {{ user?.email }}
                </div>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <UBadge
                    :color="isAdmin ? 'error' : 'primary'"
                    variant="subtle"
                    size="xs"
                    class="font-mono text-[9px] px-1.5 py-0"
                  >
                    {{ user?.role?.toUpperCase() }}
                  </UBadge>
                  <span class="text-[10px] text-muted flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-success inline-block" />
                    Active
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Guest Action Banner (if not logged in) -->
          <div
            v-else
            class="p-3.5 rounded-xl border border-default bg-muted/20 space-y-2.5"
          >
            <p class="text-xs text-muted">
              Sign in to access real-time market views, customized watchlists, and analytics.
            </p>
            <div class="grid grid-cols-2 gap-2">
              <UButton
                to="/login"
                size="xs"
                variant="ghost"
                icon="i-lucide-log-in"
                class="justify-center"
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
                class="justify-center"
                @click="isOpen = false"
              >
                Register
              </UButton>
            </div>
          </div>

          <!-- Navigation Links -->
          <div class="space-y-1">
            <span class="text-[10px] font-bold uppercase tracking-wider text-muted px-2 block mb-1">
              Application Pages
            </span>

            <NuxtLink
              v-for="item in navItems"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group"
              :class="isRouteActive(item.to)
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted hover:text-highlight hover:bg-muted/30'"
              @click="isOpen = false"
            >
              <UIcon
                :name="item.icon"
                class="text-base shrink-0"
                :class="isRouteActive(item.to) ? 'text-white' : 'text-primary'"
              />
              <div class="min-w-0 flex-1">
                <div class="truncate">
                  {{ item.label }}
                </div>
                <div
                  class="text-[10px] truncate"
                  :class="isRouteActive(item.to) ? 'text-white/80' : 'text-muted'"
                >
                  {{ item.description }}
                </div>
              </div>
              <UIcon
                name="i-lucide-chevron-right"
                class="text-xs shrink-0 transition-transform group-hover:translate-x-0.5"
                :class="isRouteActive(item.to) ? 'text-white/80' : 'text-muted'"
              />
            </NuxtLink>
          </div>

          <!-- Preferences & Tools Section -->
          <div class="space-y-2 pt-2 border-t border-default/50">
            <span class="text-[10px] font-bold uppercase tracking-wider text-muted px-2 block">
              Preferences & System
            </span>

            <div class="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/15 border border-default/40">
              <span class="text-xs font-medium text-highlight flex items-center gap-2">
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
              class="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-muted hover:text-highlight hover:bg-muted/20 transition-all"
              @click="isOpen = false"
            >
              <UIcon
                name="i-lucide-home"
                class="text-sm"
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
            class="w-full justify-center font-semibold"
            @click="handleSignOut"
          >
            Sign Out Account
          </UButton>

          <p
            v-else
            class="text-[11px] text-muted text-center py-1"
          >
            Encrypted Enterprise Architecture
          </p>
        </div>
      </template>
    </USlideover>

    <!-- Mobile Bottom Navigation Bar (1-Thumb Easy Access) -->
    <nav
      v-if="props.showBottomBar !== false"
      class="md:hidden fixed bottom-0 inset-x-0 z-40 h-14 bg-background/95 backdrop-blur-lg border-t border-default flex items-center justify-around px-2 shadow-lg"
    >
      <NuxtLink
        v-for="tab in bottomBarItems"
        :key="tab.to"
        :to="tab.to"
        class="flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-colors"
        :class="isRouteActive(tab.to) ? 'text-primary font-bold' : 'text-muted hover:text-highlight'"
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
        class="flex flex-col items-center justify-center flex-1 h-full py-1 text-center text-muted hover:text-highlight transition-colors"
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
