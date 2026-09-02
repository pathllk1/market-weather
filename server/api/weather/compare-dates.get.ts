import { defineEventHandler, getQuery, createError } from 'h3'
import { getTursoClient } from '../../utils/turso'
import { getAqiCategoryInfo } from '../../utils/weather'
import type { AqiCategoryInfo } from '~/types/weather'

export interface DayWeatherSummary {
  city: string
  date: string
  readingsCount: number
  avgTemp: number
  minTemp: number
  maxTemp: number
  avgFeelsLike: number
  avgAqi: number
  minAqi: number
  maxAqi: number
  aqiCategory: AqiCategoryInfo
  avgHumidity: number
  totalRain: number
  avgWind: number
  avgPm25: number
  avgPm10: number
}

export interface HourlyPoint {
  city: string
  timestampUtc: string
  timestampLocal: string
  hourLocal: string
  temperature: number
  apparentTemperature: number
  relativeHumidity: number
  precipitation: number
  windSpeed: number
  usAqi: number
  pm25: number
  pm10: number
}

export interface CityDateData {
  city: string
  summaryA: DayWeatherSummary | null
  summaryB: DayWeatherSummary | null
  pointsA: HourlyPoint[]
  pointsB: HourlyPoint[]
}

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const rawCities = String(query.cities || query.city || '').trim()

    if (!rawCities) {
      throw createError({
        statusCode: 400,
        statusMessage: 'City or cities parameter is required.'
      })
    }

    const cityList = rawCities
      .split(',')
      .map(c => c.trim())
      .filter(Boolean)
      .slice(0, 4)

    if (cityList.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'At least one valid city must be specified.'
      })
    }

    const db = getTursoClient()

    // 1. Fetch available distinct dates for the primary city (last 60 days)
    const primaryCity = cityList[0]!
    const datesRes = await db.execute({
      sql: `SELECT DISTINCT DATE(timestamp_utc) as d
            FROM weather_aqi
            WHERE city = ?
            ORDER BY d DESC
            LIMIT 60;`,
      args: [primaryCity]
    })

    const availableDates: string[] = datesRes.rows.map(r => String(r.d))

    if (availableDates.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: `No historical weather readings found for city "${primaryCity}".`
      })
    }

    // Default dates if not provided
    const dateA = String(query.dateA || availableDates[0] || '').trim()
    let dateB = String(query.dateB || '').trim()
    if (!dateB) {
      dateB = availableDates[7] || availableDates[1] || availableDates[0]!
    }

    // 2. Fetch daily aggregate statistics for all selected cities across dateA and dateB
    const cityPlaceholders = cityList.map(() => '?').join(', ')
    const summaryRes = await db.execute({
      sql: `SELECT city,
                   DATE(timestamp_utc) as date,
                   COUNT(*) as readingsCount,
                   AVG(temperature) as avgTemp,
                   MIN(temperature) as minTemp,
                   MAX(temperature) as maxTemp,
                   AVG(apparent_temperature) as avgFeelsLike,
                   AVG(us_aqi) as avgAqi,
                   MIN(us_aqi) as minAqi,
                   MAX(us_aqi) as maxAqi,
                   AVG(relative_humidity) as avgHumidity,
                   SUM(precipitation) as totalRain,
                   AVG(wind_speed) as avgWind,
                   AVG(pm2_5) as avgPm25,
                   AVG(pm10) as avgPm10
            FROM weather_aqi
            WHERE city IN (${cityPlaceholders}) AND DATE(timestamp_utc) IN (?, ?)
            GROUP BY city, date
            ORDER BY city, date DESC;`,
      args: [...cityList, dateA, dateB]
    })

    // Map: city -> date -> summary
    const summariesMap: Record<string, Record<string, DayWeatherSummary>> = {}
    for (const c of cityList) {
      summariesMap[c] = {}
    }

    for (const r of summaryRes.rows) {
      const c = String(r.city)
      const d = String(r.date)
      const avgAqi = Math.round(Number(r.avgAqi || 0))
      const summary: DayWeatherSummary = {
        city: c,
        date: d,
        readingsCount: Number(r.readingsCount || 0),
        avgTemp: Number((Number(r.avgTemp || 0)).toFixed(1)),
        minTemp: Number((Number(r.minTemp || 0)).toFixed(1)),
        maxTemp: Number((Number(r.maxTemp || 0)).toFixed(1)),
        avgFeelsLike: Number((Number(r.avgFeelsLike || 0)).toFixed(1)),
        avgAqi,
        minAqi: Math.round(Number(r.minAqi || 0)),
        maxAqi: Math.round(Number(r.maxAqi || 0)),
        aqiCategory: getAqiCategoryInfo(avgAqi),
        avgHumidity: Math.round(Number(r.avgHumidity || 0)),
        totalRain: Number((Number(r.totalRain || 0)).toFixed(1)),
        avgWind: Number((Number(r.avgWind || 0)).toFixed(1)),
        avgPm25: Number((Number(r.avgPm25 || 0)).toFixed(1)),
        avgPm10: Number((Number(r.avgPm10 || 0)).toFixed(1))
      }
      if (!summariesMap[c]) summariesMap[c] = {}
      summariesMap[c]![d] = summary
    }

    // 3. Fetch hourly readings for diurnal curves for all cities across dateA and dateB
    const hourlyRes = await db.execute({
      sql: `SELECT city,
                   timestamp_utc,
                   timestamp_local,
                   DATE(timestamp_utc) as date_utc,
                   temperature,
                   apparent_temperature,
                   relative_humidity,
                   precipitation,
                   wind_speed,
                   us_aqi,
                   pm2_5,
                   pm10
            FROM weather_aqi
            WHERE city IN (${cityPlaceholders}) AND DATE(timestamp_utc) IN (?, ?)
            ORDER BY city, timestamp_utc ASC;`,
      args: [...cityList, dateA, dateB]
    })

    // Map: city -> date -> points
    const pointsMap: Record<string, Record<string, HourlyPoint[]>> = {}
    for (const c of cityList) {
      pointsMap[c] = { [dateA]: [], [dateB]: [] }
    }

    for (const r of hourlyRes.rows) {
      const c = String(r.city)
      const dateUtc = String(r.date_utc)
      const localStr = String(r.timestamp_local || '')
      const timePart = localStr.includes(',') ? localStr.split(',')[1]?.trim() || '' : localStr

      const point: HourlyPoint = {
        city: c,
        timestampUtc: String(r.timestamp_utc),
        timestampLocal: localStr,
        hourLocal: timePart,
        temperature: Number(r.temperature || 0),
        apparentTemperature: Number(r.apparent_temperature || 0),
        relativeHumidity: Number(r.relative_humidity || 0),
        precipitation: Number(r.precipitation || 0),
        windSpeed: Number(r.wind_speed || 0),
        usAqi: Math.round(Number(r.us_aqi || 0)),
        pm25: Number(r.pm2_5 || 0),
        pm10: Number(r.pm10 || 0)
      }

      if (pointsMap[c] && pointsMap[c]![dateUtc]) {
        pointsMap[c]![dateUtc]!.push(point)
      }
    }

    // Build 2x2 matrix dictionary
    const matrix: Record<string, CityDateData> = {}
    for (const c of cityList) {
      matrix[c] = {
        city: c,
        summaryA: summariesMap[c]?.[dateA] || null,
        summaryB: summariesMap[c]?.[dateB] || null,
        pointsA: pointsMap[c]?.[dateA] || [],
        pointsB: pointsMap[c]?.[dateB] || []
      }
    }

    // Primary city backward-compatible payload
    const primaryData = matrix[primaryCity]!

    return {
      success: true,
      data: {
        city: primaryCity,
        cities: cityList,
        dateA,
        dateB,
        availableDates,
        summaryA: primaryData.summaryA,
        summaryB: primaryData.summaryB,
        pointsA: primaryData.pointsA,
        pointsB: primaryData.pointsB,
        matrix
      }
    }
  } catch (err: unknown) {
    const error = err as { statusCode?: number; message?: string }
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.message || 'Failed to compare city weather dates'
    })
  }
})
