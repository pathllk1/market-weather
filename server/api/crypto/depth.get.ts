import { defineEventHandler, getQuery } from 'h3'
import { getCryptoDepth, getLiveInrRates } from '../../utils/crypto-service'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const symbol = (query.symbol as string) || 'BTCUSDT'
    const limit = query.limit ? parseInt(String(query.limit), 10) : 10

    const [depth, rates] = await Promise.all([
      getCryptoDepth(symbol, limit).catch(() => ({ lastUpdateId: Date.now(), bids: [], asks: [] })),
      getLiveInrRates().catch(() => ({
        domesticRate: 101.25,
        forexRate: 95.00,
        activeRate: 101.25,
        spreadPercent: 6.58,
        lastUpdated: Date.now(),
        source: 'Safe Fallback'
      }))
    ])

    const rate = rates.domesticRate

    // Convert bid and ask prices to INR
    const bids = (depth.bids || []).map(([price, qty]: [string, string]) => {
      const p = parseFloat(price)
      return {
        priceUsdt: p,
        priceInr: Number((p * rate).toFixed(2)),
        qty: parseFloat(qty),
        totalInr: Number((p * parseFloat(qty) * rate).toFixed(2))
      }
    })

    const asks = (depth.asks || []).map(([price, qty]: [string, string]) => {
      const p = parseFloat(price)
      return {
        priceUsdt: p,
        priceInr: Number((p * rate).toFixed(2)),
        qty: parseFloat(qty),
        totalInr: Number((p * parseFloat(qty) * rate).toFixed(2))
      }
    })

    return {
      success: true,
      symbol,
      rate,
      lastUpdateId: depth.lastUpdateId,
      bids,
      asks
    }
  } catch (err: unknown) {
    console.error('Depth handler fallback:', err)
    return {
      success: true,
      symbol: 'BTCUSDT',
      rate: 101.25,
      lastUpdateId: Date.now(),
      bids: [],
      asks: []
    }
  }
})
