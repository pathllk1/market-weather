import { defineEventHandler } from 'h3'
import { getWeatherRankings } from '../../utils/weather'

export default defineEventHandler(async () => {
  try {
    const data = await getWeatherRankings()
    return {
      success: true,
      data
    }
  } catch (err: unknown) {
    const error = err as Error
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to fetch weather rankings'
    })
  }
})
