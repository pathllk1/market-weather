import { defineEventHandler } from 'h3'
import { getWeatherMarketCorrelations } from '../../utils/weather'

export default defineEventHandler(async () => {
  try {
    const data = await getWeatherMarketCorrelations()
    return {
      success: true,
      data
    }
  } catch (err: unknown) {
    const error = err as Error
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to fetch correlations'
    })
  }
})
