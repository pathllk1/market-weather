import { defineEventHandler, getQuery } from 'h3'
import { getNationalHourlyTrends } from '../../utils/weather'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const hours = query.hours ? Number(query.hours) : 24

    const data = await getNationalHourlyTrends(hours)
    return {
      success: true,
      data
    }
  } catch (err: unknown) {
    const error = err as Error
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to fetch national weather trends'
    })
  }
})
