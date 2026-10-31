import { defineEventHandler, getQuery } from 'h3'
import { getLiveCryptoTickers, getFallbackSeedTickers, getLiveInrRates } from '../../utils/crypto-service'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const force = query.refresh === 'true'

    const result = await getLiveCryptoTickers(force)
    return {
      success: true,
      data: result.tickers,
      inrRates: result.inrRates,
      totalCount: result.totalCount,
      timestamp: Date.now()
    }
  } catch (err: unknown) {
    console.error('Crypto tickers endpoint graceful fallback triggered:', err)
    const inrRates = await getLiveInrRates().catch(() => ({
      domesticRate: 101.25,
      forexRate: 95.00,
      activeRate: 101.25,
      spreadPercent: 6.58,
      lastUpdated: Date.now(),
      source: 'Safe Fallback'
    }))

    const fallbackData = getFallbackSeedTickers(inrRates.domesticRate)
    return {
      success: true,
      data: fallbackData,
      inrRates,
      totalCount: fallbackData.length,
      timestamp: Date.now(),
      fallback: true
    }
  }
})
