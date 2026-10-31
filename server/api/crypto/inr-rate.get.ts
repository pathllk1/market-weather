import { defineEventHandler, createError } from 'h3'
import { getLiveInrRates } from '../../utils/crypto-service'

export default defineEventHandler(async () => {
  try {
    const data = await getLiveInrRates()
    return {
      success: true,
      data
    }
  } catch (err: unknown) {
    const error = err as Error
    throw createError({
      statusCode: 502,
      statusMessage: error.message || 'Failed to fetch INR exchange rates'
    })
  }
})
