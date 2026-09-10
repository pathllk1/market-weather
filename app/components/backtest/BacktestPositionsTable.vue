<script setup lang="ts">
import type { BacktestPosition } from '~/types/backtest'

const props = defineProps<{
  positions: BacktestPosition[]
  portfolioId: string
}>()

const emit = defineEmits<{
  (e: 'position-closed'): void
  (e: 'trade-more', symbol: string): void
}>()

const filterQuery = ref('')
const closingSymbol = ref<string | null>(null)
const errorAlert = ref('')

const filteredPositions = computed(() => {
  const q = filterQuery.value.trim().toLowerCase()
  if (!q) return props.positions
  return props.positions.filter(p =>
    p.symbol.toLowerCase().includes(q)
    || p.companyName.toLowerCase().includes(q)
  )
})

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(val)
}

async function handleClosePosition(pos: BacktestPosition) {
  if (!confirm(`Are you sure you want to close entire position in ${pos.symbol} (${pos.quantity} shares) at live market price ₹${pos.currentPrice.toFixed(2)}?`)) {
    return
  }

  closingSymbol.value = pos.symbol
  errorAlert.value = ''

  try {
    await $fetch(`/api/backtest/portfolios/${props.portfolioId}/close`, {
      method: 'POST',
      body: { symbol: pos.symbol }
    })
    emit('position-closed')
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }, message?: string }
    errorAlert.value = e.data?.statusMessage || e.message || 'Failed to close position at market'
  } finally {
    closingSymbol.value = null
  }
}
</script>

<template>
  <div class="space-y-3">
    <!-- Action / Filter Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <h4 class="text-sm font-bold text-neutral-900 dark:text-white">
          Active Open Positions
        </h4>
        <span class="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-xs font-semibold text-neutral-600 dark:text-neutral-400">
          {{ positions.length }}
        </span>
      </div>

      <div class="w-full sm:w-64">
        <UInput
          v-model="filterQuery"
          icon="i-lucide-search"
          placeholder="Filter open positions..."
          size="xs"
          class="w-full"
        />
      </div>
    </div>

    <!-- Error Alert if close fails -->
    <div
      v-if="errorAlert"
      class="p-3 text-xs rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 flex items-center justify-between"
    >
      <div class="flex items-center gap-2">
        <UIcon
          name="i-lucide-alert-triangle"
          class="h-4 w-4"
        />
        <span>{{ errorAlert }}</span>
      </div>
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        size="xs"
        @click="errorAlert = ''"
      />
    </div>

    <!-- Table Container -->
    <div class="overflow-x-auto rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white dark:bg-neutral-900 shadow-xs">
      <table class="w-full text-left text-xs">
        <thead class="bg-neutral-50/80 dark:bg-neutral-800/50 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200/80 dark:border-neutral-800/80">
          <tr>
            <th class="py-3 px-4">
              Instrument
            </th>
            <th class="py-3 px-3 text-right">
              Shares
            </th>
            <th class="py-3 px-3 text-right">
              Avg Price
            </th>
            <th class="py-3 px-3 text-right">
              Live Price
            </th>
            <th class="py-3 px-3 text-right">
              Day Chg
            </th>
            <th class="py-3 px-3 text-right">
              Market Value
            </th>
            <th class="py-3 px-3 text-right">
              Unrealized P&L
            </th>
            <th class="py-3 px-3 text-right">
              Weight
            </th>
            <th class="py-3 px-4 text-center">
              Action
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-neutral-200/60 dark:divide-neutral-800/60">
          <tr v-if="filteredPositions.length === 0">
            <td
              colspan="9"
              class="py-8 text-center text-neutral-400"
            >
              <div class="flex flex-col items-center justify-center gap-1.5">
                <UIcon
                  name="i-lucide-inbox"
                  class="h-6 w-6 text-neutral-400"
                />
                <span class="text-xs">No active open positions. Execute a BUY trade to begin.</span>
              </div>
            </td>
          </tr>

          <tr
            v-for="pos in filteredPositions"
            :key="pos.symbol"
            class="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors"
          >
            <!-- Instrument -->
            <td class="py-3 px-4">
              <div class="flex items-center gap-2">
                <div
                  class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"
                  title="Live streaming price"
                />
                <div>
                  <div class="font-bold text-neutral-900 dark:text-white font-mono">
                    {{ pos.symbol }}
                  </div>
                  <div
                    class="text-[10px] text-neutral-500 dark:text-neutral-400 truncate max-w-[140px]"
                    :title="pos.companyName"
                  >
                    {{ pos.companyName }}
                  </div>
                </div>
              </div>
            </td>

            <!-- Shares -->
            <td class="py-3 px-3 text-right font-mono font-semibold text-neutral-800 dark:text-neutral-200">
              {{ pos.quantity }}
            </td>

            <!-- Avg Price -->
            <td class="py-3 px-3 text-right font-mono text-neutral-700 dark:text-neutral-300">
              ₹{{ pos.avgPrice.toFixed(2) }}
            </td>

            <!-- Live Price -->
            <td class="py-3 px-3 text-right font-mono font-bold text-primary">
              ₹{{ pos.currentPrice.toFixed(2) }}
            </td>

            <!-- Day Change -->
            <td
              class="py-3 px-3 text-right font-mono text-[11px]"
              :class="pos.dayChange >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
            >
              {{ pos.dayChange >= 0 ? '+' : '' }}{{ pos.dayChangePercent.toFixed(2) }}%
            </td>

            <!-- Market Value -->
            <td class="py-3 px-3 text-right font-mono font-semibold text-neutral-900 dark:text-white">
              {{ formatCurrency(pos.currentValue) }}
            </td>

            <!-- Unrealized P&L -->
            <td class="py-3 px-3 text-right">
              <div
                class="font-mono font-bold"
                :class="pos.unrealizedPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
              >
                {{ pos.unrealizedPnL >= 0 ? '+' : '' }}{{ formatCurrency(pos.unrealizedPnL) }}
              </div>
              <div
                class="text-[10px] font-medium"
                :class="pos.unrealizedPnLPercent >= 0 ? 'text-emerald-600/80 dark:text-emerald-400/80' : 'text-rose-600/80 dark:text-rose-400/80'"
              >
                {{ pos.unrealizedPnLPercent >= 0 ? '+' : '' }}{{ pos.unrealizedPnLPercent.toFixed(2) }}%
              </div>
            </td>

            <!-- Weight -->
            <td class="py-3 px-3 text-right font-mono text-neutral-500 dark:text-neutral-400 text-[11px]">
              {{ pos.portfolioWeightPercent }}%
            </td>

            <!-- Action: 1-Click Close Market Exit -->
            <td class="py-3 px-4 text-center">
              <div class="flex items-center justify-center gap-1.5">
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  title="Execute more trades for this symbol"
                  @click="$emit('trade-more', pos.symbol)"
                >
                  Trade
                </UButton>
                <UButton
                  color="error"
                  variant="soft"
                  size="xs"
                  :loading="closingSymbol === pos.symbol"
                  title="Close entire position at live market price"
                  @click="handleClosePosition(pos)"
                >
                  Close
                </UButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
