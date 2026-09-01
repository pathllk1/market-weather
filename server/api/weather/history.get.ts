import { defineEventHandler, getQuery } from 'h3'
import { getCityWeatherHistory } from '../../utils/weather'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const city = String(query.city || '').trim()
    const range = String(query.range || '7d').toLowerCase()

    if (!city) {
      throw createError({
        statusCode: 400,
        statusMessage: 'City parameter is required.'
      })
    }

    const data = await getCityWeatherHistory(city, range)
    return {
      success: true,
      data
    }
  } catch (err: unknown) {
    const error = err as { statusCode?: number, message?: string }
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.message || 'Failed to fetch weather history'
    })
  }
})
