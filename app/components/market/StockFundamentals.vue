<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { StockFundamentalDetails } from '~/types/market'

const props = defineProps<{
  symbol: string
  currentPrice?: number
}>()

const isLoading = ref(false)
const error = ref<string | null>(null)
const data = ref<StockFundamentalDetails | null>(null)
const isSummaryExpanded = ref(false)

async function fetchFundamentals() {
  if (!props.symbol) return
  try {
    isLoading.value = true
    error.value = null
    const res = await $fetch<StockFundamentalDetails>(`/api/market/fundamentals`, {
      query: { symbol: props.symbol }
    })
    data.value = res
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to load fundamentals'
    error.value = msg
  } finally {
    isLoading.value = false
  }
}

watch(() => props.symbol, () => {
  fetchFundamentals()
}, { immediate: true })

// Currency symbol helper
const currencyPrefix = computed(() => {
  if (data.value?.currency === 'INR') return '₹'
  if (data.value?.currency === 'USD') return '$'
  return data.value?.currency ? `${data.value.currency} ` : '₹'
})

// Number formatting helpers
function formatCurrency(val?: number): string {
  if (val === undefined || val === null) return 'N/A'
  const isINR = data.value?.currency === 'INR' || !data.value?.currency
  const prefix = currencyPrefix.value

  if (isINR) {
    if (Math.abs(val) >= 1e12) {
      return `${prefix}${(val / 1e12).toFixed(2)} Lakh Cr`
    }
    if (Math.abs(val) >= 1e7) {
      return `${prefix}${(val / 1e7).toFixed(2)} Cr`
    }
  } else {
    if (Math.abs(val) >= 1e12) return `${prefix}${(val / 1e12).toFixed(2)}T`
    if (Math.abs(val) >= 1e9) return `${prefix}${(val / 1e9).toFixed(2)}B`
    if (Math.abs(val) >= 1e6) return `${prefix}${(val / 1e6).toFixed(2)}M`
  }

  return `${prefix}${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function formatPercent(val?: number): string {
  if (val === undefined || val === null) return 'N/A'
  // If value is a fraction (e.g. 0.052 -> 5.2%)
  const pct = Math.abs(val) <= 1 && val !== 0 ? val * 100 : val
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
}

function formatRatio(val?: number, suffix = 'x'): string {
  if (val === undefined || val === null) return 'N/A'
  return `${val.toFixed(2)}${suffix}`
}

function formatNumber(val?: number): string {
  if (val === undefined || val === null) return 'N/A'
  if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(2)}B`
  if (Math.abs(val) >= 1e7) return `${(val / 1e7).toFixed(2)} Cr`
  if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(2)}M`
  return val.toLocaleString()
}

// Analyst target upside calculation
const targetUpside = computed(() => {
  const current = props.currentPrice || data.value?.currentPrice
  const target = data.value?.analystTargets?.targetMeanPrice
  if (!current || !target) return null
  return ((target - current) / current) * 100
})

// Total analyst recommendation count for progress bar
const totalRecs = computed(() => {
  const t = data.value?.analystTargets?.recommendationTrend
  if (!t) return 0
  return (t.strongBuy || 0) + (t.buy || 0) + (t.hold || 0) + (t.sell || 0) + (t.strongSell || 0)
})

function getRecommendationColor(key?: string) {
  if (!key) return 'neutral'
  const k = key.toLowerCase()
  if (k.includes('strong_buy') || k.includes('strong buy')) return 'success'
  if (k.includes('buy')) return 'primary'
  if (k.includes('hold')) return 'warning'
  return 'error'
}
</script>

<template>
  <div class="space-y-6">
    <!-- Loading State -->
    <div
      v-if="isLoading"
      class="flex flex-col items-center justify-center py-20 space-y-3"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="animate-spin text-3xl text-primary"
      />
      <p class="text-xs text-muted font-medium">
        Extracting comprehensive fundamentals & financial telemetry via Yahoo Finance...
      </p>
    </div>

    <!-- Error State -->
    <div
      v-else-if="error"
      class="p-6 rounded-xl border border-rose-500/20 bg-rose-500/10 text-center space-y-3"
    >
      <UIcon
        name="i-lucide-alert-circle"
        class="text-3xl text-rose-500 mx-auto"
      />
      <h4 class="text-sm font-semibold text-rose-400">
        Unable to Load Fundamental Intelligence
      </h4>
      <p class="text-xs text-muted max-w-md mx-auto">
        {{ error }}
      </p>
      <UButton
        size="xs"
        color="error"
        variant="subtle"
        icon="i-lucide-refresh-cw"
        @click="fetchFundamentals"
      >
        Retry
      </UButton>
    </div>

    <!-- Content Loaded -->
    <div
      v-else-if="data"
      class="space-y-6"
    >
      <!-- Top 4 Executive Stat Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <!-- Market Cap -->
        <div class="p-4 rounded-xl border border-default bg-muted/15 backdrop-blur-sm space-y-1">
          <div class="flex items-center justify-between text-muted text-xs">
            <span>Market Capitalization</span>
            <UIcon
              name="i-lucide-landmark"
              class="text-muted text-sm"
            />
          </div>
          <div class="text-lg font-bold font-mono text-highlight">
            {{ formatCurrency(data.valuation.marketCap) }}
          </div>
          <div class="text-[11px] text-muted flex items-center gap-1">
            <span>Enterprise Value:</span>
            <span class="font-mono text-highlight font-semibold">{{ formatCurrency(data.valuation.enterpriseValue) }}</span>
          </div>
        </div>

        <!-- Valuation P/E -->
        <div class="p-4 rounded-xl border border-default bg-muted/15 backdrop-blur-sm space-y-1">
          <div class="flex items-center justify-between text-muted text-xs">
            <span>Valuation Multiples</span>
            <UIcon
              name="i-lucide-scale"
              class="text-muted text-sm"
            />
          </div>
          <div class="text-lg font-bold font-mono text-highlight">
            P/E {{ formatRatio(data.valuation.trailingPE) }}
          </div>
          <div class="text-[11px] text-muted flex items-center gap-1">
            <span>Forward:</span>
            <span class="font-mono text-highlight font-semibold">{{ formatRatio(data.valuation.forwardPE) }}</span>
            <span class="mx-1">•</span>
            <span>P/B:</span>
            <span class="font-mono text-highlight font-semibold">{{ formatRatio(data.valuation.priceToBook) }}</span>
          </div>
        </div>

        <!-- Profitability & Margins -->
        <div class="p-4 rounded-xl border border-default bg-muted/15 backdrop-blur-sm space-y-1">
          <div class="flex items-center justify-between text-muted text-xs">
            <span>Profit Margin & ROE</span>
            <UIcon
              name="i-lucide-trending-up"
              class="text-muted text-sm"
            />
          </div>
          <div class="text-lg font-bold font-mono text-highlight">
            {{ formatPercent(data.financials.profitMargins) }}
          </div>
          <div class="text-[11px] text-muted flex items-center gap-1">
            <span>ROE:</span>
            <span
              class="font-mono font-semibold"
              :class="(data.financials.returnOnEquity ?? 0) >= 0 ? 'text-success' : 'text-error'"
            >
              {{ formatPercent(data.financials.returnOnEquity) }}
            </span>
            <span class="mx-1">•</span>
            <span>ROA:</span>
            <span
              class="font-mono font-semibold"
              :class="(data.financials.returnOnAssets ?? 0) >= 0 ? 'text-success' : 'text-error'"
            >
              {{ formatPercent(data.financials.returnOnAssets) }}
            </span>
          </div>
        </div>

        <!-- Wall St Analyst Target -->
        <div class="p-4 rounded-xl border border-default bg-muted/15 backdrop-blur-sm space-y-1">
          <div class="flex items-center justify-between text-muted text-xs">
            <span>Analyst Consensus</span>
            <UBadge
              v-if="data.analystTargets.recommendationKey"
              :color="getRecommendationColor(data.analystTargets.recommendationKey)"
              variant="subtle"
              size="xs"
              class="uppercase font-mono text-[10px]"
            >
              {{ data.analystTargets.recommendationKey.replace('_', ' ') }}
            </UBadge>
          </div>
          <div class="text-lg font-bold font-mono text-highlight flex items-center gap-2">
            <span>{{ formatCurrency(data.analystTargets.targetMeanPrice) }}</span>
            <span
              v-if="targetUpside !== null"
              class="text-xs font-semibold"
              :class="targetUpside >= 0 ? 'text-success' : 'text-error'"
            >
              ({{ targetUpside >= 0 ? '+' : '' }}{{ targetUpside.toFixed(1) }}%)
            </span>
          </div>
          <div class="text-[11px] text-muted">
            Based on {{ data.analystTargets.numberOfAnalystOpinions || 0 }} institutional analysts
          </div>
        </div>
      </div>

      <!-- Main Two-Column Layout: Left (Valuation & Financials) + Right (Profile & Consensus) -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left 2 Columns: Financial Statements & Key Metrics -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Section 1: Valuation Multiples & Share Stats -->
          <div class="p-5 rounded-xl border border-default bg-muted/10 space-y-4">
            <div class="flex items-center justify-between pb-2 border-b border-default">
              <h4 class="text-xs font-bold uppercase tracking-wider text-highlight flex items-center gap-2">
                <UIcon
                  name="i-lucide-calculator"
                  class="text-primary text-base"
                />
                Valuation Multiples & Share Metrics
              </h4>
              <span class="text-[10px] text-muted font-mono">TTM & Most Recent Quarter</span>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-6 text-xs">
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Trailing P/E</span>
                <span class="font-mono font-semibold text-highlight">{{ formatRatio(data.valuation.trailingPE) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Forward P/E</span>
                <span class="font-mono font-semibold text-highlight">{{ formatRatio(data.valuation.forwardPE) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">PEG Ratio</span>
                <span class="font-mono font-semibold text-highlight">{{ formatRatio(data.valuation.pegRatio) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Price to Book (P/B)</span>
                <span class="font-mono font-semibold text-highlight">{{ formatRatio(data.valuation.priceToBook) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Price to Sales (P/S)</span>
                <span class="font-mono font-semibold text-highlight">{{ formatRatio(data.valuation.priceToSales) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">EV / EBITDA</span>
                <span class="font-mono font-semibold text-highlight">{{ formatRatio(data.valuation.enterpriseToEbitda) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Beta (Volatility)</span>
                <span class="font-mono font-semibold text-highlight">{{ data.valuation.beta?.toFixed(3) ?? 'N/A' }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Book Value / Share</span>
                <span class="font-mono font-semibold text-highlight">{{ formatCurrency(data.valuation.bookValue) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Shares Outstanding</span>
                <span class="font-mono font-semibold text-highlight">{{ formatNumber(data.valuation.sharesOutstanding) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Float Shares</span>
                <span class="font-mono font-semibold text-highlight">{{ formatNumber(data.valuation.floatShares) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Insider Ownership</span>
                <span class="font-mono font-semibold text-highlight">{{ formatPercent(data.valuation.heldPercentInsiders) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Institutional Ownership</span>
                <span class="font-mono font-semibold text-highlight">{{ formatPercent(data.valuation.heldPercentInstitutions) }}</span>
              </div>
            </div>
          </div>

          <!-- Section 2: Income & Profitability -->
          <div class="p-5 rounded-xl border border-default bg-muted/10 space-y-4">
            <div class="flex items-center justify-between pb-2 border-b border-default">
              <h4 class="text-xs font-bold uppercase tracking-wider text-highlight flex items-center gap-2">
                <UIcon
                  name="i-lucide-badge-percent"
                  class="text-primary text-base"
                />
                Income, Profitability & Margins
              </h4>
              <span class="text-[10px] text-muted font-mono">Currency: {{ data.currency }}</span>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-6 text-xs">
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Total Revenue</span>
                <span class="font-mono font-semibold text-highlight">{{ formatCurrency(data.financials.totalRevenue) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Revenue Growth (YoY)</span>
                <span
                  class="font-mono font-semibold"
                  :class="(data.financials.revenueGrowth ?? 0) >= 0 ? 'text-success' : 'text-error'"
                >
                  {{ formatPercent(data.financials.revenueGrowth) }}
                </span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Gross Profits</span>
                <span class="font-mono font-semibold text-highlight">{{ formatCurrency(data.financials.grossProfits) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Gross Margin</span>
                <span class="font-mono font-semibold text-highlight">{{ formatPercent(data.financials.grossMargins) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">EBITDA</span>
                <span class="font-mono font-semibold text-highlight">{{ formatCurrency(data.financials.ebitda) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Operating Margin</span>
                <span class="font-mono font-semibold text-highlight">{{ formatPercent(data.financials.operatingMargins) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Net Income to Common</span>
                <span class="font-mono font-semibold text-highlight">{{ formatCurrency(data.financials.netIncome) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Trailing EPS</span>
                <span class="font-mono font-semibold text-highlight">{{ formatCurrency(data.financials.trailingEps) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Forward EPS</span>
                <span class="font-mono font-semibold text-highlight">{{ formatCurrency(data.financials.forwardEps) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Earnings Growth</span>
                <span
                  class="font-mono font-semibold"
                  :class="(data.financials.earningsGrowth ?? 0) >= 0 ? 'text-success' : 'text-error'"
                >
                  {{ formatPercent(data.financials.earningsGrowth) }}
                </span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Return on Equity (ROE)</span>
                <span class="font-mono font-semibold text-highlight">{{ formatPercent(data.financials.returnOnEquity) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Return on Assets (ROA)</span>
                <span class="font-mono font-semibold text-highlight">{{ formatPercent(data.financials.returnOnAssets) }}</span>
              </div>
            </div>
          </div>

          <!-- Section 3: Balance Sheet & Liquidity -->
          <div class="p-5 rounded-xl border border-default bg-muted/10 space-y-4">
            <div class="flex items-center justify-between pb-2 border-b border-default">
              <h4 class="text-xs font-bold uppercase tracking-wider text-highlight flex items-center gap-2">
                <UIcon
                  name="i-lucide-shield-alert"
                  class="text-primary text-base"
                />
                Balance Sheet & Solvency Health
              </h4>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-6 text-xs">
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Total Cash Reserve</span>
                <span class="font-mono font-semibold text-success">{{ formatCurrency(data.balanceSheet.totalCash) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Total Outstanding Debt</span>
                <span class="font-mono font-semibold text-highlight">{{ formatCurrency(data.balanceSheet.totalDebt) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Debt to Equity Ratio</span>
                <span class="font-mono font-semibold text-highlight">{{ formatRatio(data.balanceSheet.debtToEquity, '%') }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Current Ratio</span>
                <div class="flex items-center gap-1.5">
                  <span class="font-mono font-semibold text-highlight">{{ formatRatio(data.balanceSheet.currentRatio, '') }}</span>
                  <UBadge
                    v-if="data.balanceSheet.currentRatio"
                    :color="data.balanceSheet.currentRatio >= 1.5 ? 'success' : data.balanceSheet.currentRatio >= 1 ? 'warning' : 'error'"
                    variant="subtle"
                    size="xs"
                    class="text-[9px] px-1 py-0"
                  >
                    {{ data.balanceSheet.currentRatio >= 1.5 ? 'Healthy' : data.balanceSheet.currentRatio >= 1 ? 'Fair' : 'Tight' }}
                  </UBadge>
                </div>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Quick Ratio (Acid Test)</span>
                <span class="font-mono font-semibold text-highlight">{{ formatRatio(data.balanceSheet.quickRatio, '') }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Cash Per Share</span>
                <span class="font-mono font-semibold text-highlight">{{ formatCurrency(data.balanceSheet.totalCashPerShare) }}</span>
              </div>
            </div>
          </div>

          <!-- Section 4: Dividends & Capital Returns -->
          <div class="p-5 rounded-xl border border-default bg-muted/10 space-y-4">
            <div class="flex items-center justify-between pb-2 border-b border-default">
              <h4 class="text-xs font-bold uppercase tracking-wider text-highlight flex items-center gap-2">
                <UIcon
                  name="i-lucide-coins"
                  class="text-primary text-base"
                />
                Dividends & Shareholder Returns
              </h4>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-6 text-xs">
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Dividend Yield</span>
                <span class="font-mono font-semibold text-success">{{ formatPercent(data.dividends.dividendYield) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Annual Dividend Rate</span>
                <span class="font-mono font-semibold text-highlight">{{ formatCurrency(data.dividends.dividendRate) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Dividend Payout Ratio</span>
                <span class="font-mono font-semibold text-highlight">{{ formatPercent(data.dividends.payoutRatio) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">5-Year Average Yield</span>
                <span class="font-mono font-semibold text-highlight">{{ formatPercent(data.dividends.fiveYearAvgDividendYield) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-muted text-[11px]">Ex-Dividend Date</span>
                <span class="font-mono font-semibold text-highlight">{{ data.dividends.exDividendDate || 'N/A' }}</span>
              </div>
            </div>
          </div>

          <!-- Section 5: Historical Yearly & Quarterly Revenue Trend -->
          <div
            v-if="data.earningsTrend && data.earningsTrend.length > 0"
            class="p-5 rounded-xl border border-default bg-muted/10 space-y-4"
          >
            <div class="flex items-center justify-between pb-2 border-b border-default">
              <h4 class="text-xs font-bold uppercase tracking-wider text-highlight flex items-center gap-2">
                <UIcon
                  name="i-lucide-bar-chart-3"
                  class="text-primary text-base"
                />
                Annual Revenue & Earnings History
              </h4>
              <span class="text-[10px] text-muted">Audited Financial History</span>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr class="text-muted border-b border-default/50 text-[11px]">
                    <th class="pb-2 font-medium">
                      Fiscal Year
                    </th>
                    <th class="pb-2 font-medium text-right">
                      Total Revenue
                    </th>
                    <th class="pb-2 font-medium text-right">
                      Net Earnings
                    </th>
                    <th class="pb-2 font-medium text-right">
                      Net Margin
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default/30 font-mono">
                  <tr
                    v-for="row in data.earningsTrend"
                    :key="row.date"
                    class="hover:bg-muted/20"
                  >
                    <td class="py-2.5 font-bold text-highlight">
                      {{ row.date }}
                    </td>
                    <td class="py-2.5 text-right font-semibold text-highlight">
                      {{ formatCurrency(row.revenue) }}
                    </td>
                    <td
                      class="py-2.5 text-right font-semibold"
                      :class="row.earnings >= 0 ? 'text-success' : 'text-error'"
                    >
                      {{ formatCurrency(row.earnings) }}
                    </td>
                    <td class="py-2.5 text-right text-muted">
                      {{ formatPercent(row.profitMargin) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Right 1 Column: Profile, Officers, Analyst Trend -->
        <div class="space-y-6">
          <!-- Analyst Consensus Radar & Breakdown -->
          <div class="p-5 rounded-xl border border-default bg-muted/10 space-y-4">
            <div class="flex items-center justify-between pb-2 border-b border-default">
              <h4 class="text-xs font-bold uppercase tracking-wider text-highlight flex items-center gap-2">
                <UIcon
                  name="i-lucide-users"
                  class="text-primary text-base"
                />
                Wall Street Opinions
              </h4>
              <span class="text-[10px] text-muted">{{ data.analystTargets.numberOfAnalystOpinions || 0 }} Analysts</span>
            </div>

            <!-- Price Target Targets Box -->
            <div class="space-y-2 p-3 bg-muted/20 border border-default rounded-lg">
              <div class="flex justify-between items-center text-xs">
                <span class="text-muted">Target Mean</span>
                <span class="font-mono font-bold text-highlight">{{ formatCurrency(data.analystTargets.targetMeanPrice) }}</span>
              </div>
              <div class="flex justify-between items-center text-xs">
                <span class="text-muted">Target High</span>
                <span class="font-mono font-semibold text-success">{{ formatCurrency(data.analystTargets.targetHighPrice) }}</span>
              </div>
              <div class="flex justify-between items-center text-xs">
                <span class="text-muted">Target Low</span>
                <span class="font-mono font-semibold text-error">{{ formatCurrency(data.analystTargets.targetLowPrice) }}</span>
              </div>
              <div class="flex justify-between items-center text-xs">
                <span class="text-muted">Target Median</span>
                <span class="font-mono font-semibold text-highlight">{{ formatCurrency(data.analystTargets.targetMedianPrice) }}</span>
              </div>
            </div>

            <!-- Recommendation Counts -->
            <div
              v-if="data.analystTargets.recommendationTrend && totalRecs > 0"
              class="space-y-3"
            >
              <span class="text-[11px] font-semibold text-muted block">Rating Distribution</span>

              <!-- Visual stacked progress bar -->
              <div class="h-2.5 w-full bg-muted/30 rounded-full flex overflow-hidden">
                <div
                  :style="{ width: `${((data.analystTargets.recommendationTrend.strongBuy || 0) / totalRecs) * 100}%` }"
                  class="bg-emerald-500"
                  title="Strong Buy"
                />
                <div
                  :style="{ width: `${((data.analystTargets.recommendationTrend.buy || 0) / totalRecs) * 100}%` }"
                  class="bg-emerald-400"
                  title="Buy"
                />
                <div
                  :style="{ width: `${((data.analystTargets.recommendationTrend.hold || 0) / totalRecs) * 100}%` }"
                  class="bg-amber-400"
                  title="Hold"
                />
                <div
                  :style="{ width: `${((data.analystTargets.recommendationTrend.sell || 0) / totalRecs) * 100}%` }"
                  class="bg-rose-400"
                  title="Sell"
                />
                <div
                  :style="{ width: `${((data.analystTargets.recommendationTrend.strongSell || 0) / totalRecs) * 100}%` }"
                  class="bg-rose-600"
                  title="Strong Sell"
                />
              </div>

              <div class="grid grid-cols-2 gap-2 text-xs font-mono">
                <div class="flex items-center justify-between p-1.5 rounded bg-muted/15">
                  <span class="text-emerald-500 font-medium">Strong Buy</span>
                  <span class="font-bold">{{ data.analystTargets.recommendationTrend.strongBuy }}</span>
                </div>
                <div class="flex items-center justify-between p-1.5 rounded bg-muted/15">
                  <span class="text-emerald-400 font-medium">Buy</span>
                  <span class="font-bold">{{ data.analystTargets.recommendationTrend.buy }}</span>
                </div>
                <div class="flex items-center justify-between p-1.5 rounded bg-muted/15">
                  <span class="text-amber-400 font-medium">Hold</span>
                  <span class="font-bold">{{ data.analystTargets.recommendationTrend.hold }}</span>
                </div>
                <div class="flex items-center justify-between p-1.5 rounded bg-muted/15">
                  <span class="text-rose-400 font-medium">Sell</span>
                  <span class="font-bold">{{ data.analystTargets.recommendationTrend.sell }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Company Profile & Key Facts -->
          <div class="p-5 rounded-xl border border-default bg-muted/10 space-y-4">
            <div class="flex items-center justify-between pb-2 border-b border-default">
              <h4 class="text-xs font-bold uppercase tracking-wider text-highlight flex items-center gap-2">
                <UIcon
                  name="i-lucide-building-2"
                  class="text-primary text-base"
                />
                Corporate Profile
              </h4>
            </div>

            <div class="space-y-3 text-xs">
              <div
                v-if="data.profile.sector"
                class="flex justify-between items-center"
              >
                <span class="text-muted">Sector</span>
                <UBadge
                  variant="subtle"
                  size="xs"
                >
                  {{ data.profile.sector }}
                </UBadge>
              </div>

              <div
                v-if="data.profile.industry"
                class="flex justify-between items-center"
              >
                <span class="text-muted">Industry</span>
                <span class="font-semibold text-highlight text-right truncate max-w-[180px]">{{ data.profile.industry }}</span>
              </div>

              <div
                v-if="data.profile.fullTimeEmployees"
                class="flex justify-between items-center"
              >
                <span class="text-muted">Full-Time Employees</span>
                <span class="font-mono font-semibold text-highlight">{{ data.profile.fullTimeEmployees.toLocaleString() }}</span>
              </div>

              <div
                v-if="data.profile.city || data.profile.country"
                class="flex justify-between items-center"
              >
                <span class="text-muted">Headquarters</span>
                <span class="font-semibold text-highlight">{{ [data.profile.city, data.profile.country].filter(Boolean).join(', ') }}</span>
              </div>

              <div
                v-if="data.profile.website"
                class="flex justify-between items-center pt-1"
              >
                <span class="text-muted">Website</span>
                <a
                  :href="data.profile.website"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 text-primary hover:underline font-mono text-[11px]"
                >
                  Visit Portal
                  <UIcon
                    name="i-lucide-external-link"
                    class="text-xs"
                  />
                </a>
              </div>
            </div>

            <!-- Business Summary -->
            <div
              v-if="data.profile.longBusinessSummary"
              class="pt-3 border-t border-default/50 space-y-1.5"
            >
              <span class="text-[11px] font-semibold text-muted block">Business Description</span>
              <p
                class="text-xs text-muted leading-relaxed"
                :class="{ 'line-clamp-4': !isSummaryExpanded }"
              >
                {{ data.profile.longBusinessSummary }}
              </p>
              <button
                type="button"
                class="text-[11px] text-primary hover:underline font-semibold"
                @click="isSummaryExpanded = !isSummaryExpanded"
              >
                {{ isSummaryExpanded ? 'Show Less' : 'Read Full Overview' }}
              </button>
            </div>
          </div>

          <!-- Key Company Officers / Executive Team -->
          <div
            v-if="data.profile.companyOfficers && data.profile.companyOfficers.length > 0"
            class="p-5 rounded-xl border border-default bg-muted/10 space-y-4"
          >
            <div class="flex items-center justify-between pb-2 border-b border-default">
              <h4 class="text-xs font-bold uppercase tracking-wider text-highlight flex items-center gap-2">
                <UIcon
                  name="i-lucide-award"
                  class="text-primary text-base"
                />
                Key Leadership
              </h4>
              <span class="text-[10px] text-muted">{{ data.profile.companyOfficers.length }} Officers</span>
            </div>

            <div class="divide-y divide-default/30 space-y-2">
              <div
                v-for="officer in data.profile.companyOfficers"
                :key="officer.name"
                class="pt-2 first:pt-0 flex flex-col text-xs"
              >
                <div class="flex items-center justify-between">
                  <span class="font-semibold text-highlight truncate">{{ officer.name }}</span>
                  <span
                    v-if="officer.age"
                    class="text-[10px] text-muted font-mono"
                  >Age: {{ officer.age }}</span>
                </div>
                <div class="flex items-center justify-between text-[11px] text-muted">
                  <span class="truncate max-w-[200px]">{{ officer.title }}</span>
                  <span
                    v-if="officer.totalPay"
                    class="font-mono text-highlight"
                  >{{ formatCurrency(officer.totalPay) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
