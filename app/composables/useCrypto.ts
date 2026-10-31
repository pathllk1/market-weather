import { ref, computed, reactive, onMounted, onUnmounted } from 'vue'

export interface CryptoAsset {
  symbol: string
  baseAsset: string
  quoteAsset: string
  name: string
  priceUsdt: number
  priceInr: number
  change24h: number
  priceChangeUsdt: number
  priceChangeInr: number
  high24hUsdt: number
  high24hInr: number
  low24hUsdt: number
  low24hInr: number
  volume24h: number
  quoteVolumeUsdt: number
  quoteVolumeInr: number
  category: 'l1-l2' | 'defi' | 'ai-data' | 'meme' | 'infrastructure' | 'other'
}

export interface InrRateData {
  domesticRate: number
  forexRate: number
  activeRate: number
  spreadPercent: number
  lastUpdated: number
  source: string
}

export interface PaperPosition {
  symbol: string
  baseAsset: string
  qty: number
  avgPriceInr: number
  totalCostInr: number
}

export interface PaperTradeLog {
  id: string
  timestamp: number
  symbol: string
  side: 'BUY' | 'SELL'
  priceInr: number
  qty: number
  grossTotalInr: number
  tdsInr: number
  netTotalInr: number
}

export interface PriceAlert {
  id: string
  symbol: string
  targetPriceInr: number
  direction: 'above' | 'below'
  createdPriceInr: number
  createdAt: number
  triggered: boolean
}

interface MiniTickerMessage {
  e: string // Event type
  E: number // Event time
  s: string // Symbol
  c: string // Close price
  o: string // Open price
  h: string // High price
  l: string // Low price
  v: string // Total traded base asset volume
  q: string // Total traded quote asset volume
}

export function useCrypto() {
  const tickers = ref<CryptoAsset[]>([])
  const inrRates = ref<InrRateData>({
    domesticRate: 101.7,
    forexRate: 95.0,
    activeRate: 101.7,
    spreadPercent: 7.0,
    lastUpdated: Date.now(),
    source: 'CoinDCX + Forex'
  })

  const rateMode = ref<'domestic' | 'forex'>('domestic')
  const connectionStatus = ref<'connected' | 'connecting' | 'polling' | 'offline'>('connecting')
  const isPaused = ref(false)
  const lastTickTime = ref<Date>(new Date())

  // Navigation & Filtering State
  const searchQuery = ref('')
  const activeCategory = ref<string>('all')
  const sortBy = ref<'volume' | 'price' | 'change' | 'name'>('volume')
  const sortDirection = ref<'asc' | 'desc'>('desc')
  const displayMode = ref<'table' | 'grid'>('table')

  // Modals state
  const selectedAsset = ref<CryptoAsset | null>(null)
  const isDetailOpen = ref(false)
  const isCalcOpen = ref(false)
  const isHistoryOpen = ref(false)
  const isTradeOpen = ref(false)
  const isSignalsOpen = ref(false)
  const isArbitrageOpen = ref(false)
  const isAlertOpen = ref(false)
  const calcPresetSymbol = ref('BTCUSDT')

  // Starred / Watchlist items stored in localStorage
  const watchlist = ref<string[]>([])

  // Paper Trading virtual portfolio state
  const paperWallet = reactive<{
    cashInr: number
    positions: Record<string, PaperPosition>
    history: PaperTradeLog[]
  }>({
    cashInr: 1000000, // ₹ 10 Lakh initial paper capital
    positions: {},
    history: []
  })

  // Price Alerts
  const priceAlerts = ref<PriceAlert[]>([])

  // Real-time tick animations map (up / down)
  const tickFlashes = reactive<Record<string, 'up' | 'down' | undefined>>({})

  // WebSocket & Polling refs
  let socket: WebSocket | null = null
  let pollingTimer: ReturnType<typeof setInterval> | null = null
  let isUnmounted = false

  // Current active conversion rate
  const activeRate = computed(() => {
    return rateMode.value === 'forex' ? inrRates.value.forexRate : inrRates.value.domesticRate
  })

  // Format INR according to Indian numbering standards
  function formatInr(val: number, options?: { compact?: boolean, decimals?: number }) {
    if (isNaN(val) || val === null || val === undefined) return '₹ 0.00'

    const decimals = options?.decimals !== undefined
      ? options.decimals
      : val < 1
        ? 4
        : val < 100
          ? 2
          : 2

    if (options?.compact) {
      if (val >= 10000000) {
        return `₹ ${(val / 10000000).toFixed(2)} Cr`
      }
      if (val >= 100000) {
        return `₹ ${(val / 100000).toFixed(2)} L`
      }
    }

    // Format with Indian currency symbol and locale
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: decimals,
      minimumFractionDigits: Math.min(decimals, 2)
    }).format(val)
  }

  // Format USD
  function formatUsd(val: number, decimals?: number) {
    if (isNaN(val)) return '$0.00'
    const d = decimals !== undefined ? decimals : val < 1 ? 4 : 2
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: d,
      minimumFractionDigits: Math.min(d, 2)
    }).format(val)
  }

  // Load initial snapshot from server
  async function fetchInitialData() {
    try {
      connectionStatus.value = 'connecting'
      const res = await $fetch<{
        success: boolean
        data: CryptoAsset[]
        inrRates: InrRateData
        totalCount: number
      }>('/api/crypto/tickers')

      if (res?.success) {
        tickers.value = res.data
        if (res.inrRates) {
          inrRates.value = res.inrRates
        }
        const firstAsset = res.data[0]
        if (!selectedAsset.value && firstAsset) {
          selectedAsset.value = firstAsset
        }
        lastTickTime.value = new Date()
      }
    } catch (err) {
      console.error('Failed to load initial crypto snapshot:', err)
      connectionStatus.value = 'offline'
    }
  }

  // Connect directly to Binance WebSocket (Client-side, 0 Render load)
  function setupDirectBinanceStream() {
    if (typeof window === 'undefined') return

    try {
      // Connect to the all mini-tickers array stream
      socket = new WebSocket('wss://stream.binance.com:9443/ws/!miniTicker@arr')

      socket.onopen = () => {
        if (isUnmounted) return
        connectionStatus.value = 'connected'
        stopPolling()
      }

      socket.onmessage = (event) => {
        if (isUnmounted || isPaused.value) return
        try {
          const raw = JSON.parse(event.data) as MiniTickerMessage[]
          if (!Array.isArray(raw)) return

          const rate = activeRate.value
          const now = new Date()
          lastTickTime.value = now

          // Create a quick lookup map of incoming updates
          const updateMap = new Map<string, MiniTickerMessage>()
          for (const item of raw) {
            if (item.s.endsWith('USDT')) {
              updateMap.set(item.s, item)
            }
          }

          // Mutate existing tickers in-place for fast Vue reactivity
          for (const asset of tickers.value) {
            const upd = updateMap.get(asset.symbol)
            if (upd) {
              const newPrice = parseFloat(upd.c)
              const oldPrice = asset.priceUsdt

              if (newPrice !== oldPrice) {
                // Flash animation trigger
                const flashType = newPrice > oldPrice ? 'up' : 'down'
                tickFlashes[asset.symbol] = flashType
                setTimeout(() => {
                  tickFlashes[asset.symbol] = undefined
                }, 800)

                asset.priceUsdt = newPrice
                asset.priceInr = newPrice * rate

                const open = parseFloat(upd.o)
                if (open > 0) {
                  asset.change24h = Number((((newPrice - open) / open) * 100).toFixed(2))
                  asset.priceChangeUsdt = newPrice - open
                  asset.priceChangeInr = (newPrice - open) * rate
                }

                asset.high24hUsdt = parseFloat(upd.h)
                asset.high24hInr = asset.high24hUsdt * rate
                asset.low24hUsdt = parseFloat(upd.l)
                asset.low24hInr = asset.low24hUsdt * rate
                asset.volume24h = parseFloat(upd.v)
                asset.quoteVolumeUsdt = parseFloat(upd.q)
                asset.quoteVolumeInr = asset.quoteVolumeUsdt * rate
              }
            }
          }
        } catch {
          // ignore stream parse errors
        }
      }

      socket.onerror = () => {
        console.warn('Direct WebSocket error. Falling back to smart polling...')
        startPolling()
      }

      socket.onclose = () => {
        if (!isUnmounted) {
          startPolling()
        }
      }
    } catch {
      startPolling()
    }
  }

  // Fallback Polling (if WebSocket is blocked or offline)
  function startPolling() {
    connectionStatus.value = 'polling'
    if (pollingTimer) return

    pollingTimer = setInterval(async () => {
      if (isPaused.value || isUnmounted) return
      try {
        const res = await $fetch<{
          success: boolean
          data: CryptoAsset[]
          inrRates: InrRateData
        }>('/api/crypto/tickers')
        if (res?.success) {
          tickers.value = res.data
          if (res.inrRates) inrRates.value = res.inrRates
          lastTickTime.value = new Date()
        }
      } catch {
        connectionStatus.value = 'offline'
      }
    }, 4000)
  }

  function stopPolling() {
    if (pollingTimer) {
      clearInterval(pollingTimer)
      pollingTimer = null
    }
  }

  // Toggle Pause/Play
  function togglePause() {
    isPaused.value = !isPaused.value
  }

  // Modal Triggers
  function openDetailModal(asset: CryptoAsset) {
    selectedAsset.value = asset
    isDetailOpen.value = true
  }

  function openCalculatorModal(symbol = 'BTCUSDT') {
    calcPresetSymbol.value = symbol
    isCalcOpen.value = true
  }

  function openHistoryModal(asset?: CryptoAsset) {
    if (asset) selectedAsset.value = asset
    isHistoryOpen.value = true
  }

  function openTradeModal(asset?: CryptoAsset) {
    if (asset) selectedAsset.value = asset
    isTradeOpen.value = true
  }

  function openSignalsModal(asset?: CryptoAsset) {
    if (asset) selectedAsset.value = asset
    isSignalsOpen.value = true
  }

  function openArbitrageModal(asset?: CryptoAsset) {
    if (asset) selectedAsset.value = asset
    isArbitrageOpen.value = true
  }

  function openAlertModal(asset?: CryptoAsset) {
    if (asset) selectedAsset.value = asset
    isAlertOpen.value = true
  }

  // Watchlist methods
  function toggleWatchlist(symbol: string) {
    const idx = watchlist.value.indexOf(symbol)
    if (idx >= 0) {
      watchlist.value.splice(idx, 1)
    } else {
      watchlist.value.push(symbol)
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('crypto_inr_watchlist', JSON.stringify(watchlist.value))
    }
  }

  function isInWatchlist(symbol: string) {
    return watchlist.value.includes(symbol)
  }

  // Paper Trading Operations
  function executePaperTrade(params: {
    symbol: string
    baseAsset: string
    side: 'BUY' | 'SELL'
    qty: number
    priceInr: number
  }) {
    const gross = params.qty * params.priceInr
    const tds = params.side === 'SELL' ? gross * 0.01 : 0
    const net = params.side === 'BUY' ? gross : gross - tds

    if (params.side === 'BUY') {
      if (paperWallet.cashInr < gross) {
        return { success: false, message: 'Insufficient virtual cash balance' }
      }
      paperWallet.cashInr -= gross
      const pos = paperWallet.positions[params.symbol] || {
        symbol: params.symbol,
        baseAsset: params.baseAsset,
        qty: 0,
        avgPriceInr: 0,
        totalCostInr: 0
      }
      pos.qty += params.qty
      pos.totalCostInr += gross
      pos.avgPriceInr = pos.totalCostInr / pos.qty
      paperWallet.positions[params.symbol] = pos
    } else {
      const pos = paperWallet.positions[params.symbol]
      if (!pos || pos.qty < params.qty) {
        return { success: false, message: 'Insufficient coin holdings to sell' }
      }
      paperWallet.cashInr += net
      pos.qty -= params.qty
      if (pos.qty <= 0.000001) {
        Reflect.deleteProperty(paperWallet.positions, params.symbol)
      } else {
        pos.totalCostInr = pos.qty * pos.avgPriceInr
      }
    }

    paperWallet.history.unshift({
      id: Math.random().toString(36).slice(2, 9),
      timestamp: Date.now(),
      symbol: params.symbol,
      side: params.side,
      priceInr: params.priceInr,
      qty: params.qty,
      grossTotalInr: gross,
      tdsInr: tds,
      netTotalInr: net
    })

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('crypto_paper_wallet', JSON.stringify(paperWallet))
    }
    return { success: true, message: `Successfully executed paper ${params.side}` }
  }

  function resetPaperWallet() {
    paperWallet.cashInr = 1000000
    paperWallet.positions = {}
    paperWallet.history = []
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('crypto_paper_wallet')
    }
  }

  // Price Alert Methods
  function addPriceAlert(symbol: string, targetPriceInr: number, direction: 'above' | 'below') {
    const current = tickers.value.find(t => t.symbol === symbol)?.priceInr || 0
    const item: PriceAlert = {
      id: Math.random().toString(36).slice(2, 9),
      symbol,
      targetPriceInr,
      direction,
      createdPriceInr: current,
      createdAt: Date.now(),
      triggered: false
    }
    priceAlerts.value.unshift(item)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('crypto_price_alerts', JSON.stringify(priceAlerts.value))
    }
  }

  function removePriceAlert(id: string) {
    priceAlerts.value = priceAlerts.value.filter(a => a.id !== id)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('crypto_price_alerts', JSON.stringify(priceAlerts.value))
    }
  }

  // Recalculate all INR values when currency mode changes
  function setRateMode(mode: 'domestic' | 'forex') {
    rateMode.value = mode
    const rate = mode === 'forex' ? inrRates.value.forexRate : inrRates.value.domesticRate

    for (const a of tickers.value) {
      a.priceInr = a.priceUsdt * rate
      a.high24hInr = a.high24hUsdt * rate
      a.low24hInr = a.low24hUsdt * rate
      a.priceChangeInr = a.priceChangeUsdt * rate
      a.quoteVolumeInr = a.quoteVolumeUsdt * rate
    }
  }

  // Market Breadth & Aggregates
  const totalTurnoverInr = computed(() => {
    return tickers.value.reduce((acc, curr) => acc + (curr.quoteVolumeInr || 0), 0)
  })

  const topGainer = computed<CryptoAsset | null>(() => {
    if (!tickers.value.length) return null
    return [...tickers.value].sort((a, b) => b.change24h - a.change24h)[0] ?? null
  })

  const topLoser = computed<CryptoAsset | null>(() => {
    if (!tickers.value.length) return null
    return [...tickers.value].sort((a, b) => a.change24h - b.change24h)[0] ?? null
  })

  const marketSentiment = computed(() => {
    if (!tickers.value.length) return { gainers: 0, losers: 0, ratio: 50, label: 'Neutral' }
    const gainers = tickers.value.filter(t => t.change24h > 0).length
    const losers = tickers.value.filter(t => t.change24h < 0).length
    const ratio = Math.round((gainers / (gainers + losers || 1)) * 100)
    const label = ratio > 60 ? 'Strong Bullish' : ratio > 50 ? 'Mild Bullish' : ratio < 40 ? 'Strong Bearish' : 'Neutral'
    return { gainers, losers, ratio, label }
  })

  // Filtered and Sorted Tickers
  const filteredTickers = computed(() => {
    let list = tickers.value

    // 1. Category Filter
    if (activeCategory.value === 'watchlist') {
      const set = new Set(watchlist.value)
      list = list.filter(t => set.has(t.symbol))
    } else if (activeCategory.value === 'top50') {
      list = list.slice(0, 50)
    } else if (activeCategory.value === 'gainers') {
      list = list.filter(t => t.change24h > 0).sort((a, b) => b.change24h - a.change24h)
    } else if (activeCategory.value === 'losers') {
      list = list.filter(t => t.change24h < 0).sort((a, b) => a.change24h - b.change24h)
    } else if (activeCategory.value !== 'all') {
      list = list.filter(t => t.category === activeCategory.value)
    }

    // 2. Search Filter
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.trim().toLowerCase()
      list = list.filter(
        t => t.symbol.toLowerCase().includes(q)
          || t.baseAsset.toLowerCase().includes(q)
          || t.name.toLowerCase().includes(q)
      )
    }

    // 3. Sorting
    return [...list].sort((a, b) => {
      let comparison = 0
      if (sortBy.value === 'volume') {
        comparison = b.quoteVolumeInr - a.quoteVolumeInr
      } else if (sortBy.value === 'price') {
        comparison = b.priceInr - a.priceInr
      } else if (sortBy.value === 'change') {
        comparison = b.change24h - a.change24h
      } else if (sortBy.value === 'name') {
        comparison = a.baseAsset.localeCompare(b.baseAsset)
      }
      return sortDirection.value === 'asc' ? -comparison : comparison
    })
  })

  onMounted(async () => {
    // Restore persistent watchlist, paper trading, and price alerts
    if (typeof localStorage !== 'undefined') {
      try {
        const savedWatchlist = localStorage.getItem('crypto_inr_watchlist')
        if (savedWatchlist) watchlist.value = JSON.parse(savedWatchlist)

        const savedWallet = localStorage.getItem('crypto_paper_wallet')
        if (savedWallet) {
          const parsed = JSON.parse(savedWallet)
          paperWallet.cashInr = parsed.cashInr ?? 1000000
          paperWallet.positions = parsed.positions ?? {}
          paperWallet.history = parsed.history ?? []
        }

        const savedAlerts = localStorage.getItem('crypto_price_alerts')
        if (savedAlerts) priceAlerts.value = JSON.parse(savedAlerts)
      } catch {
        // ignore parse error
      }
    }

    await fetchInitialData()
    setupDirectBinanceStream()
  })

  onUnmounted(() => {
    isUnmounted = true
    stopPolling()
    if (socket) {
      socket.close()
      socket = null
    }
  })

  return {
    tickers,
    inrRates,
    rateMode,
    activeRate,
    connectionStatus,
    isPaused,
    lastTickTime,
    searchQuery,
    activeCategory,
    sortBy,
    sortDirection,
    displayMode,
    selectedAsset,
    isDetailOpen,
    isCalcOpen,
    isHistoryOpen,
    isTradeOpen,
    isSignalsOpen,
    isArbitrageOpen,
    isAlertOpen,
    calcPresetSymbol,
    tickFlashes,
    filteredTickers,
    totalTurnoverInr,
    topGainer,
    topLoser,
    marketSentiment,
    watchlist,
    paperWallet,
    priceAlerts,
    formatInr,
    formatUsd,
    setRateMode,
    togglePause,
    openDetailModal,
    openCalculatorModal,
    openHistoryModal,
    openTradeModal,
    openSignalsModal,
    openArbitrageModal,
    openAlertModal,
    toggleWatchlist,
    isInWatchlist,
    executePaperTrade,
    resetPaperWallet,
    addPriceAlert,
    removePriceAlert
  }
}
