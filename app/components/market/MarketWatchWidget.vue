<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { MarketStockSummary, MarketSummaryBreadth, ScreenerResponse } from '../../types/market'

const isLoading = ref(true)
const topGainers = ref<MarketStockSummary[]>([])
const topLosers = ref<MarketStockSummary[]>([])
const summary = ref<MarketSummaryBreadth | null>(null)

const selectedSymbol = ref<string | null>(null)
const isModalOpen = ref(false)

function openDetail(symbol: string) {
  selectedSymbol.value = symbol
  isModalOpen.value = true
}

async function loadWidgetData() {
  try {
    isLoading.value = true
    const [gainersRes, losersRes] = await Promise.all([
      $fetch<ScreenerResponse>('/api/market/screener', { query: { preset: 'gainers', limit: 3 } }),
      $fetch<ScreenerResponse>('/api/market/screener', { query: { preset: 'losers', limit: 3 } })
    ])
    topGainers.value = gainersRes.stocks || []
    topLosers.value = losersRes.stocks || []
    summary.value = gainersRes.summary || null
  } catch (err) {
    console.error('Failed to load market widget data:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadWidgetData()
})
</script>

<template>
  <UCard class="w-full">
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-trending-up"
            class="text-primary text-lg"
          />
          <div>
            <h3 class="text-sm font-semibold">
              Market Intelligence Pulse
            </h3>
            <p class="text-[11px] text-muted">
              {{ summary ? `${summary.totalStocks} equities monitored • Real-time breadth & momentum` : 'Real-time equity breadth & momentum' }}
            </p>
          </div>
        </div>

        <UButton
          to="/market"
          color="primary"
          variant="subtle"
          size="xs"
          icon="i-lucide-external-link"
        >
          Open Screener
        </UButton>
      </div>
    </template>

    <div
      v-if="isLoading"
      class="flex justify-center items-center py-8"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="animate-spin text-2xl text-muted"
      />
    </div>

    <div
      v-else
      class="space-y-4"
    >
      <!-- Market Breadth Overview -->
      <div
        v-if="summary"
        class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs"
      >
        <div class="p-2 border border-default rounded bg-muted/15 space-y-0.5">
          <span class="text-muted text-[10px]">Market Breadth</span>
          <div class="flex items-center gap-1.5 font-semibold">
            <span class="text-success">{{ summary.advancingCount }} Adv</span>
            <span>/</span>
            <span class="text-error">{{ summary.decliningCount }} Dec</span>
          </div>
        </div>

        <div class="p-2 border border-default rounded bg-muted/15 space-y-0.5">
          <span class="text-muted text-[10px]">Bullish Stocks (&ge;75)</span>
          <div class="font-semibold text-success">
            {{ summary.bullishCount }}
          </div>
        </div>

        <div class="p-2 border border-default rounded bg-muted/15 space-y-0.5">
          <span class="text-muted text-[10px]">Bearish Stocks (&le;35)</span>
          <div class="font-semibold text-error">
            {{ summary.bearishCount }}
          </div>
        </div>

        <div class="p-2 border border-default rounded bg-muted/15 space-y-0.5">
          <span class="text-muted text-[10px]">Composite Score</span>
          <div class="font-semibold text-primary">
            {{ summary.avgScore }}/100
          </div>
        </div>
      </div>

      <!-- Gainers & Losers Columns -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <!-- Top Gainers -->
        <div class="border border-default rounded-lg p-2.5 space-y-2">
          <div class="flex items-center justify-between text-success font-semibold text-[11px] uppercase tracking-wider">
            <span class="flex items-center gap-1">
              <UIcon name="i-lucide-arrow-up-right" />
              Top Daily Gainers
            </span>
          </div>

          <div class="divide-y divide-default">
            <div
              v-for="stock in topGainers"
              :key="stock.symbol"
              class="py-1.5 flex items-center justify-between cursor-pointer hover:bg-muted/30 px-1 rounded transition-colors"
              @click="openDetail(stock.symbol)"
            >
              <div class="truncate max-w-[150px]">
                <div class="font-bold text-foreground">
                  {{ stock.symbol }}
                </div>
                <div class="text-[10px] text-muted truncate">
                  {{ stock.company_name }}
                </div>
              </div>
              <div class="text-right">
                <div class="font-mono font-medium">
                  ₹{{ stock.current_price?.toFixed(2) }}
                </div>
                <UBadge
                  color="success"
                  variant="subtle"
                  size="xs"
                >
                  +{{ stock.percentage_change?.toFixed(2) }}%
                </UBadge>
              </div>
            </div>
          </div>
        </div>

        <!-- Top Losers -->
        <div class="border border-default rounded-lg p-2.5 space-y-2">
          <div class="flex items-center justify-between text-error font-semibold text-[11px] uppercase tracking-wider">
            <span class="flex items-center gap-1">
              <UIcon name="i-lucide-arrow-down-right" />
              Top Daily Decliners
            </span>
          </div>

          <div class="divide-y divide-default">
            <div
              v-for="stock in topLosers"
              :key="stock.symbol"
              class="py-1.5 flex items-center justify-between cursor-pointer hover:bg-muted/30 px-1 rounded transition-colors"
              @click="openDetail(stock.symbol)"
            >
              <div class="truncate max-w-[150px]">
                <div class="font-bold text-foreground">
                  {{ stock.symbol }}
                </div>
                <div class="text-[10px] text-muted truncate">
                  {{ stock.company_name }}
                </div>
              </div>
              <div class="text-right">
                <div class="font-mono font-medium">
                  ₹{{ stock.current_price?.toFixed(2) }}
                </div>
                <UBadge
                  color="error"
                  variant="subtle"
                  size="xs"
                >
                  {{ stock.percentage_change?.toFixed(2) }}%
                </UBadge>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Stock Detail Modal -->
    <MarketStockDetailModal
      v-model="isModalOpen"
      :symbol="selectedSymbol"
    />
  </UCard>
</template>
