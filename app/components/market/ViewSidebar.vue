<script setup lang="ts">
import type { UserMarketView } from '~/types/market'

defineProps<{
  views: UserMarketView[]
  selectedViewId: string | null
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'select' | 'delete' | 'setDefault', viewId: string): void
  (e: 'create'): void
  (e: 'edit', view: UserMarketView): void
}>()

const isCollapsed = ref(false)

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <aside
    class="relative flex flex-col rounded-2xl border border-default/70 bg-surface/70 shadow-sm backdrop-blur-md transition-all duration-300"
    :class="isCollapsed ? 'w-16 p-2' : 'w-72 p-4'"
  >
    <!-- Header with View Count & Collapse Toggle -->
    <div class="flex items-center justify-between pb-3 border-b border-default/40">
      <div
        v-if="!isCollapsed"
        class="flex items-center gap-2"
      >
        <UIcon
          name="i-lucide-layout-grid"
          class="h-5 w-5 text-primary"
        />
        <h2 class="text-sm font-bold text-highlight">
          My Views
        </h2>
        <UBadge
          variant="subtle"
          :color="views.length >= 20 ? 'error' : 'primary'"
          size="xs"
        >
          {{ views.length }} / 20
        </UBadge>
      </div>

      <button
        type="button"
        class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        :title="isCollapsed ? 'Expand Views Sidebar' : 'Collapse Views Sidebar'"
        @click="toggleCollapse"
      >
        <UIcon
          :name="isCollapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'"
          class="h-4 w-4"
        />
      </button>
    </div>

    <!-- Create View Button -->
    <div class="mt-3">
      <UButton
        v-if="!isCollapsed"
        block
        color="primary"
        variant="solid"
        icon="i-lucide-plus"
        size="sm"
        :disabled="views.length >= 20"
        @click="emit('create')"
      >
        Create View
      </UButton>
      <UButton
        v-else
        icon="i-lucide-plus"
        color="primary"
        variant="solid"
        size="sm"
        class="w-full justify-center"
        :disabled="views.length >= 20"
        title="Create View"
        @click="emit('create')"
      />
    </div>

    <!-- Views List -->
    <div class="mt-3 flex-1 space-y-1.5 overflow-y-auto">
      <div
        v-for="v in views"
        :key="v.id"
        class="group relative flex cursor-pointer items-center rounded-xl border transition-all"
        :class="[
          selectedViewId === v.id
            ? 'border-primary/50 bg-primary/10 text-primary shadow-sm'
            : 'border-transparent hover:border-default/70 hover:bg-muted/40 text-foreground',
          isCollapsed ? 'justify-center p-2' : 'p-2.5'
        ]"
        @click="emit('select', v.id)"
      >
        <!-- Collapsed Icon Mode -->
        <div
          v-if="isCollapsed"
          class="flex flex-col items-center"
          :title="v.name + ` (${v.stockCount} equities)`"
        >
          <UIcon
            name="i-lucide-layers"
            class="h-4 w-4"
            :class="selectedViewId === v.id ? 'text-primary' : 'text-muted-foreground'"
          />
          <span class="mt-1 text-[9px] font-bold">{{ v.stockCount }}</span>
        </div>

        <!-- Expanded Full Card Mode -->
        <div
          v-else
          class="flex w-full items-center justify-between gap-2"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="truncate text-xs font-bold">{{ v.name }}</span>
              <UIcon
                v-if="v.isDefault"
                name="i-lucide-star"
                class="h-3 w-3 fill-amber-400 text-amber-400"
                title="Default View"
              />
            </div>
            <p
              v-if="v.description"
              class="truncate text-[10px] text-muted-foreground"
            >
              {{ v.description }}
            </p>
            <div class="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span class="font-medium">{{ v.stockCount }} Equities</span>
              <span>•</span>
              <span class="capitalize">{{ v.layout }}</span>
            </div>
          </div>

          <!-- Quick Action Buttons -->
          <div class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Edit View"
              @click.stop="emit('edit', v)"
            >
              <UIcon
                name="i-lucide-settings-2"
                class="h-3.5 w-3.5"
              />
            </button>
            <button
              v-if="views.length > 1"
              type="button"
              class="rounded p-1 text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-500"
              title="Delete View"
              @click.stop="emit('delete', v.id)"
            >
              <UIcon
                name="i-lucide-trash-2"
                class="h-3.5 w-3.5"
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>
