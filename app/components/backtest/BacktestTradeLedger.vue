<script setup lang="ts">
import type { BacktestTrade, ClosedTradeRecord } from '~/types/backtest'

const props = defineProps<{
  trades: BacktestTrade[]
  closedTrades: ClosedTradeRecord[]
  portfolioId: string
}>()

const emit = defineEmits<{
  (e: 'trade-deleted'): void
}>()

const activeView = ref<'closed' | 'all'>('closed')
const filterSymbol = ref('')
const deletingTradeId = ref<string | null>(null)

const filteredClosedTrades = computed(() => {
  const q = filterSymbol.value.trim().toLowerCase()
  if (!q) return props.closedTrades
  return props.closedTrades.filter(t =>
    t.symbol.toLowerCase().includes(q)
    || (t.strategyTag && t.strategyTag.toLowerCase().includes(q))
  )
})

const filteredAllTrades = computed(() => {
  const q = filterSymbol.value.trim().toLowerCase()
  if (!q) return props.trades
  return props.trades.filter(t =>
    t.symbol.toLowerCase().includes(q)
    || (t.strategyTag && t.strategyTag.toLowerCase().includes(q))
  )
})

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(val)
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

async function handleDeleteTrade(tradeId: string) {
  if (!confirm('Are you sure you want to delete this trade execution? Its cash impact will be reversed.')) {
    return
  }

  deletingTradeId.value = tradeId
  try {
    await $fetch(`/api/backtest/portfolios/${props.portfolioId}/trades/${tradeId}`, {
      method: 'DELETE'
    })
    emit('trade-deleted')
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }, message?: string }
    alert(e.data?.statusMessage || e.message || 'Failed to delete trade')
  } finally {
    deletingTradeId.value = null
  }
}
</script>

<template>
  <div class="space-y-3">
    <!-- Sub-tab Navigation & Filter -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex gap-1.5 p-1 bg-neutral-100 dark:bg-neutral-800/60 rounded-xl">
        <button
          type="button"
          class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5"
          :class="activeView === 'closed' ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-xs' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'"
          @click="activeView = 'closed'"
        >
          <UIcon
            name="i-lucide-check-circle"
            class="h-3.5 w-3.5 text-indigo-500"
          />
          Closed Trades (P&L)
          <span class="rounded-full bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.2 text-[10px]">
            {{ closedTrades.length }}
          </span>
        </button>

        <button
          type="button"
          class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5"
          :class="activeView === 'all' ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-xs' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'"
          @click="activeView = 'all'"
        >
          <UIcon
            name="i-lucide-list"
            class="h-3.5 w-3.5 text-neutral-500"
          />
          All Executions (Ledger)
          <span class="rounded-full bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.2 text-[10px]">
            {{ trades.length }}
          </span>
        </button>
      </div>

      <div class="w-full sm:w-60">
        <UInput
          v-model="filterSymbol"
          icon="i-lucide-search"
          placeholder="Filter symbol or strategy..."
          size="xs"
          class="w-full"
        />
      </div>
    </div>

    <!-- VIEW 1: CLOSED TRADES (P&L) -->
    <div
      v-if="activeView === 'closed'"
      class="overflow-x-auto rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white dark:bg-neutral-900 shadow-xs"
    >
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
              Entry Price
            </th>
            <th class="py-3 px-3 text-right">
              Exit Price
            </th>
            <th class="py-3 px-3 text-right">
              Net P&L
            </th>
            <th class="py-3 px-3 text-right">
              Return %
            </th>
            <th class="py-3 px-3 text-right">
              Holding Time
            </th>
            <th class="py-3 px-4">
              Strategy Setup
            </th>
            <th class="py-3 px-4 text-right">
              Closed At
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-neutral-200/60 dark:divide-neutral-800/60">
          <tr v-if="filteredClosedTrades.length === 0">
            <td
              colspan="9"
              class="py-8 text-center text-neutral-400"
            >
              <div class="flex flex-col items-center justify-center gap-1.5">
                <UIcon
                  name="i-lucide-inbox"
                  class="h-6 w-6 text-neutral-400"
                />
                <span class="text-xs">No closed positions yet. Sell shares to book realized profits/losses.</span>
              </div>
            </td>
          </tr>

          <tr
            v-for="ct in filteredClosedTrades"
            :key="ct.id"
            class="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors"
          >
            <!-- Instrument -->
            <td class="py-3 px-4">
              <div class="font-bold text-neutral-900 dark:text-white font-mono">
                {{ ct.symbol }}
              </div>
              <div class="text-[10px] text-neutral-500 dark:text-neutral-400 truncate max-w-[130px]">
                {{ ct.companyName }}
              </div>
            </td>

            <!-- Shares -->
            <td class="py-3 px-3 text-right font-mono font-semibold text-neutral-800 dark:text-neutral-200">
              {{ ct.quantity }}
            </td>

            <!-- Entry Price -->
            <td class="py-3 px-3 text-right font-mono text-neutral-600 dark:text-neutral-400">
              ₹{{ ct.buyPrice.toFixed(2) }}
            </td>

            <!-- Exit Price -->
            <td class="py-3 px-3 text-right font-mono font-bold text-neutral-900 dark:text-white">
              ₹{{ ct.sellPrice.toFixed(2) }}
            </td>

            <!-- Net P&L -->
            <td
              class="py-3 px-3 text-right font-mono font-bold"
              :class="ct.netPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
            >
              {{ ct.netPnL >= 0 ? '+' : '' }}{{ formatCurrency(ct.netPnL) }}
            </td>

            <!-- Return % -->
            <td
              class="py-3 px-3 text-right font-mono font-semibold"
              :class="ct.netPnLPercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
            >
              {{ ct.netPnLPercent >= 0 ? '+' : '' }}{{ ct.netPnLPercent.toFixed(2) }}%
            </td>

            <!-- Holding Time -->
            <td class="py-3 px-3 text-right text-neutral-500 dark:text-neutral-400 text-[11px]">
              {{ ct.holdingDays }} {{ ct.holdingDays === 1 ? 'day' : 'days' }}
            </td>

            <!-- Strategy -->
            <td class="py-3 px-4">
              <span class="inline-block rounded-md bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-700 dark:text-neutral-300">
                {{ ct.strategyTag || 'Manual' }}
              </span>
            </td>

            <!-- Closed At -->
            <td class="py-3 px-4 text-right text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
              {{ formatDate(ct.executedAt) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- VIEW 2: ALL EXECUTIONS (LEDGER) -->
    <div
      v-else
      class="overflow-x-auto rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white dark:bg-neutral-900 shadow-xs"
    >
      <table class="w-full text-left text-xs">
        <thead class="bg-neutral-50/80 dark:bg-neutral-800/50 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200/80 dark:border-neutral-800/80">
          <tr>
            <th class="py-3 px-4">
              Date / Time
            </th>
            <th class="py-3 px-3">
              Type
            </th>
            <th class="py-3 px-3">
              Instrument
            </th>
            <th class="py-3 px-3 text-right">
              Shares
            </th>
            <th class="py-3 px-3 text-right">
              Exec Price
            </th>
            <th class="py-3 px-3 text-right">
              Fees
            </th>
            <th class="py-3 px-3 text-right">
              Total Amount
            </th>
            <th class="py-3 px-3">
              Strategy Tag
            </th>
            <th class="py-3 px-4 text-center">
              Action
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-neutral-200/60 dark:divide-neutral-800/60">
          <tr v-if="filteredAllTrades.length === 0">
            <td
              colspan="9"
              class="py-8 text-center text-neutral-400"
            >
              <div class="flex flex-col items-center justify-center gap-1.5">
                <UIcon
                  name="i-lucide-inbox"
                  class="h-6 w-6 text-neutral-400"
                />
                <span class="text-xs">No executed trades logged in this portfolio.</span>
              </div>
            </td>
          </tr>

          <tr
            v-for="trade in filteredAllTrades"
            :key="trade.id"
            class="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors"
          >
            <!-- Date -->
            <td class="py-3 px-4 text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
              {{ formatDate(trade.executedAt) }}
            </td>

            <!-- Type -->
            <td class="py-3 px-3">
              <span
                class="px-2 py-0.5 rounded text-[10px] font-bold"
                :class="trade.tradeType === 'BUY' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'"
              >
                {{ trade.tradeType }}
              </span>
            </td>

            <!-- Instrument -->
            <td class="py-3 px-3">
              <div class="font-bold text-neutral-900 dark:text-white font-mono">
                {{ trade.symbol }}
              </div>
            </td>

            <!-- Shares -->
            <td class="py-3 px-3 text-right font-mono font-semibold text-neutral-800 dark:text-neutral-200">
              {{ trade.quantity }}
            </td>

            <!-- Exec Price -->
            <td class="py-3 px-3 text-right font-mono text-neutral-900 dark:text-white">
              ₹{{ trade.price.toFixed(2) }}
            </td>

            <!-- Fees -->
            <td class="py-3 px-3 text-right font-mono text-neutral-500 dark:text-neutral-400 text-[11px]">
              ₹{{ trade.fees.toFixed(2) }}
            </td>

            <!-- Total Amount -->
            <td class="py-3 px-3 text-right font-mono font-semibold text-neutral-900 dark:text-white">
              {{ formatCurrency((trade.quantity * trade.price) + trade.fees) }}
            </td>

            <!-- Strategy -->
            <td class="py-3 px-3">
              <span
                v-if="trade.strategyTag"
                class="inline-block rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:text-neutral-400"
              >
                {{ trade.strategyTag }}
              </span>
              <span
                v-else
                class="text-neutral-400 text-[10px]"
              >-</span>
            </td>

            <!-- Action -->
            <td class="py-3 px-4 text-center">
              <UButton
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                size="xs"
                :loading="deletingTradeId === trade.id"
                title="Delete trade & reverse balance"
                @click="handleDeleteTrade(trade.id)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
