import { defineEventHandler } from 'h3'
import { getTursoClient } from '../../utils/turso'

export default defineEventHandler(async () => {
  try {
    const db = getTursoClient()
    const res = await db.execute(`
      SELECT DISTINCT city, state, latitude, longitude
      FROM weather_aqi
      ORDER BY state ASC, city ASC;
    `)

    return {
      success: true,
      data: res.rows.map(r => ({
        city: String(r.city),
        state: String(r.state),
        latitude: Number(r.latitude),
        longitude: Number(r.longitude)
      }))
    }
  } catch (err: unknown) {
    const error = err as Error
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to fetch cities list'
    })
  }
})
