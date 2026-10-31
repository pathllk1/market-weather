import { defineEventHandler, getQuery, createError } from 'h3'
import { getLiveCryptoTickers } from '../../utils/crypto-service'

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
    const error = err as Error
    throw createError({
      statusCode: 502,
      statusMessage: error.message || 'Failed to fetch live crypto tickers'
    })
  }
})
