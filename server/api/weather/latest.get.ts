import { defineEventHandler, getQuery } from 'h3'
import { getLatestWeatherSnapshots } from '../../utils/weather'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const force = query.refresh === 'true'

    const data = await getLatestWeatherSnapshots(force)
    return {
      success: true,
      data
    }
  } catch (err: unknown) {
    const error = err as Error
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to fetch weather snapshots'
    })
  }
})
