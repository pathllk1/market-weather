<script setup lang="ts">
import { ref, computed } from 'vue'
import type { CryptoAsset, PriceAlert } from '../../composables/useCrypto'

const props = defineProps<{
  isOpen: boolean
  asset: CryptoAsset | null
  priceAlerts: PriceAlert[]
  formatInr: (val: number, options?: { compact?: boolean, decimals?: number }) => string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'addAlert', payload: { symbol: string, targetPriceInr: number, direction: 'above' | 'below' }): void
  (e: 'removeAlert', id: string): void
}>()

const targetPrice = ref<number | null>(null)
const direction = ref<'above' | 'below'>('above')
const notificationStatus = ref<string>(
  typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
)

const currentPriceInr = computed(() => props.asset?.priceInr || 0)

// Initialize target price to +3% above current price by default
function initDefaultTarget() {
  if (currentPriceInr.value > 0 && (!targetPrice.value || targetPrice.value === 0)) {
    targetPrice.value = Math.round(currentPriceInr.value * 1.03)
  }
}

const activeAssetAlerts = computed(() => {
  if (!props.asset) return []
  return props.priceAlerts.filter(a => a.symbol === props.asset?.symbol)
})

function setPercentageOffset(pct: number) {
  if (currentPriceInr.value <= 0) return
  targetPrice.value = Math.round(currentPriceInr.value * (1 + pct / 100))
  direction.value = pct >= 0 ? 'above' : 'below'
}

async function requestNotificationPermission() {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    const res = await Notification.requestPermission()
    notificationStatus.value = res
  }
}

function handleAddAlert() {
  if (!props.asset || !targetPrice.value || targetPrice.value <= 0) return
  emit('addAlert', {
    symbol: props.asset.symbol,
    targetPriceInr: targetPrice.value,
    direction: direction.value
  })
}
</script>

<template>
  <div
    v-if="isOpen && asset"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
  >
    <div
      class="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full p-5 sm:p-6 relative my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      <!-- Close button -->
      <button
        class="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
        @click="emit('close')"
      >
        <UIcon
          name="i-lucide-x"
          class="w-5 h-5"
        />
      </button>

      <!-- Modal Header -->
      <div class="flex items-center gap-3 pb-4 border-b border-slate-100 mb-5">
        <div class="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
          <UIcon
            name="i-lucide-bell"
            class="w-6 h-6"
          />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-black text-slate-900">
              Live Price & Volatility Alerts
            </h3>
            <span class="text-xs font-mono font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
              {{ asset.symbol }}
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-0.5">
            Monitors real-time WebSocket ticks and triggers alerts the second your target is touched.
          </p>
        </div>
      </div>

      <!-- Current Price Banner -->
      <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between mb-5">
        <div>
          <span class="text-[10px] text-slate-400 uppercase font-bold block mb-0.5">Live Price</span>
          <span class="text-xl font-black text-slate-900 font-mono">{{ formatInr(currentPriceInr) }}</span>
        </div>
        <div>
          <!-- Browser push permission prompt -->
          <button
            v-if="notificationStatus !== 'granted'"
            class="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors flex items-center gap-1 cursor-pointer"
            @click="requestNotificationPermission"
          >
            <UIcon
              name="i-lucide-bell-ring"
              class="w-3.5 h-3.5"
            />
            Enable Browser Push
          </button>
          <span
            v-else
            class="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 flex items-center gap-1"
          >
            <UIcon
              name="i-lucide-check-circle"
              class="w-3.5 h-3.5 text-emerald-600"
            />
            Push Active
          </span>
        </div>
      </div>

      <!-- Add Alert Form -->
      <div class="space-y-3 mb-5">
        <label class="block text-xs font-bold text-slate-700">Set Target Price in INR (₹)</label>

        <!-- Condition Toggle -->
        <div class="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg text-xs font-bold">
          <button
            class="py-1.5 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1"
            :class="direction === 'above' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'"
            @click="direction = 'above'"
          >
            <UIcon
              name="i-lucide-trending-up"
              class="w-3.5 h-3.5 text-emerald-600"
            />
            Crosses Above Target
          </button>
          <button
            class="py-1.5 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1"
            :class="direction === 'below' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'"
            @click="direction = 'below'"
          >
            <UIcon
              name="i-lucide-trending-down"
              class="w-3.5 h-3.5 text-rose-600"
            />
            Drops Below Target
          </button>
        </div>

        <div class="relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
          <input
            v-model.number="targetPrice"
            type="number"
            step="any"
            placeholder="Enter target price in INR"
            class="w-full pl-7 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            @focus="initDefaultTarget"
          >
        </div>

        <!-- Quick Offset Chips -->
        <div class="flex items-center gap-1.5 text-xs">
          <span class="text-[10px] text-slate-400 font-semibold uppercase">Presets:</span>
          <button
            v-for="p in [2, 5, 10]"
            :key="p"
            class="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold cursor-pointer hover:bg-emerald-100"
            @click="setPercentageOffset(p)"
          >
            +{{ p }}%
          </button>
          <button
            v-for="p in [-2, -5, -10]"
            :key="p"
            class="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold cursor-pointer hover:bg-rose-100"
            @click="setPercentageOffset(p)"
          >
            {{ p }}%
          </button>
        </div>

        <button
          class="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
          @click="handleAddAlert"
        >
          <UIcon
            name="i-lucide-bell-plus"
            class="w-4 h-4 text-amber-400"
          />
          Create Active Alert
        </button>
      </div>

      <!-- Active Alerts for this Asset -->
      <div class="border-t border-slate-100 pt-4 mb-4">
        <h4 class="text-xs font-bold text-slate-700 mb-2 flex items-center justify-between">
          <span>Active Alerts for {{ asset.baseAsset }} ({{ activeAssetAlerts.length }})</span>
        </h4>

        <div
          v-if="!activeAssetAlerts.length"
          class="text-xs text-slate-400 py-3 text-center italic"
        >
          No active alerts set for {{ asset.baseAsset }}.
        </div>

        <div
          v-else
          class="space-y-2 max-h-36 overflow-y-auto"
        >
          <div
            v-for="alert in activeAssetAlerts"
            :key="alert.id"
            class="p-2.5 rounded-lg border text-xs flex items-center justify-between"
            :class="alert.triggered ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-slate-200 shadow-2xs'"
          >
            <div class="flex items-center gap-2">
              <UIcon
                :name="alert.direction === 'above' ? 'i-lucide-arrow-up-right' : 'i-lucide-arrow-down-right'"
                class="w-4 h-4"
                :class="alert.direction === 'above' ? 'text-emerald-600' : 'text-rose-600'"
              />
              <div>
                <span class="font-bold text-slate-900 font-mono">{{ formatInr(alert.targetPriceInr) }}</span>
                <span class="text-[10px] text-slate-400 ml-1.5 font-sans">
                  ({{ alert.direction === 'above' ? 'Crosses Above' : 'Drops Below' }})
                </span>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <span
                class="text-[10px] font-bold px-1.5 py-0.5 rounded"
                :class="alert.triggered ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'"
              >
                {{ alert.triggered ? 'Triggered' : 'Watching Live' }}
              </span>
              <button
                class="text-slate-400 hover:text-rose-600 p-1"
                title="Remove alert"
                @click="emit('removeAlert', alert.id)"
              >
                <UIcon
                  name="i-lucide-trash-2"
                  class="w-3.5 h-3.5"
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="flex justify-end pt-2 border-t border-slate-100">
        <button
          class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
          @click="emit('close')"
        >
          Close Drawer
        </button>
      </div>
    </div>
  </div>
</template>

