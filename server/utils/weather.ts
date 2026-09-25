import type { Row } from '@libsql/client'
import { getTursoClient } from './turso'
import type {
  AqiCategoryInfo,
  WeatherConditionInfo,
  CityLatestWeather,
  NationalWeatherPulse,
  WeatherHistoryResponse,
  WeatherHistoryPoint,
  WeatherRankingsResponse,
  MarketWeatherSectorImpact,
  CityWeatherStats,
  PeriodAggregatedRow,
  StatMetric
} from '~/types/weather'

export function getAqiCategoryInfo(aqi: number): AqiCategoryInfo {
  if (aqi <= 50) {
    return {
      level: 'good',
      label: 'Good',
      color: 'success',
      badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      textClass: 'text-emerald-600 dark:text-emerald-400',
      bgClass: 'bg-emerald-500',
      description: 'Air quality is satisfactory and poses little or no risk.',
      healthAdvisory: 'Ideal conditions for outdoor exercise and recreation.'
    }
  }
  if (aqi <= 100) {
    return {
      level: 'moderate',
      label: 'Moderate',
      color: 'warning',
      badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
      textClass: 'text-amber-600 dark:text-amber-400',
      bgClass: 'bg-amber-500',
      description: 'Air quality is acceptable; unusually sensitive individuals should take care.',
      healthAdvisory: 'Unusually sensitive people should consider reducing prolonged outdoor exertion.'
    }
  }
  if (aqi <= 150) {
    return {
      level: 'unhealthy-sensitive',
      label: 'Sensitive Warning',
      color: 'warning',
      badgeClass: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',
      textClass: 'text-orange-600 dark:text-orange-400',
      bgClass: 'bg-orange-500',
      description: 'Members of sensitive groups may experience health effects.',
      healthAdvisory: 'Children, older adults, and those with respiratory issues should limit outdoor exertion.'
    }
  }
  if (aqi <= 200) {
    return {
      level: 'unhealthy',
      label: 'Unhealthy',
      color: 'error',
      badgeClass: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
      textClass: 'text-red-600 dark:text-red-400',
      bgClass: 'bg-red-500',
      description: 'Some members of the general public may experience health effects.',
      healthAdvisory: 'Everyone should wear N95/pollution masks and avoid strenuous outdoor exercise.'
    }
  }
  if (aqi <= 300) {
    return {
      level: 'very-unhealthy',
      label: 'Very Unhealthy',
      color: 'error',
      badgeClass: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
      textClass: 'text-purple-600 dark:text-purple-400',
      bgClass: 'bg-purple-500',
      description: 'Health alert: The risk of health effects is increased for everyone.',
      healthAdvisory: 'Stay indoors, keep windows closed, and use air purifiers.'
    }
  }
  return {
    level: 'hazardous',
    label: 'Hazardous',
    color: 'error',
    badgeClass: 'bg-rose-950/40 text-rose-500 dark:text-rose-400 border-rose-600/40',
    textClass: 'text-rose-600 dark:text-rose-400',
    bgClass: 'bg-rose-700',
    description: 'Health warning of emergency conditions. Entire population is likely affected.',
    healthAdvisory: 'Emergency health warning. Remain strictly indoors with high-grade air filtration.'
  }
}

export function getWeatherConditionInfo(code: number): WeatherConditionInfo {
  // WMO Weather Interpretation Codes (WW)
  switch (code) {
    case 0:
      return { code, description: 'Clear sky', icon: 'i-lucide-sun', category: 'clear' }
    case 1:
      return { code, description: 'Mainly clear', icon: 'i-lucide-sun-medium', category: 'clear' }
    case 2:
      return { code, description: 'Partly cloudy', icon: 'i-lucide-cloud-sun', category: 'cloudy' }
    case 3:
      return { code, description: 'Overcast', icon: 'i-lucide-cloud', category: 'cloudy' }
    case 45:
    case 48:
      return { code, description: 'Foggy / Hazy', icon: 'i-lucide-cloud-fog', category: 'fog' }
    case 51:
    case 53:
    case 55:
      return { code, description: 'Light Drizzle', icon: 'i-lucide-cloud-drizzle', category: 'rain' }
    case 56:
    case 57:
      return { code, description: 'Freezing Drizzle', icon: 'i-lucide-cloud-drizzle', category: 'rain' }
    case 61:
      return { code, description: 'Slight Rain', icon: 'i-lucide-cloud-rain', category: 'rain' }
    case 63:
      return { code, description: 'Moderate Rain', icon: 'i-lucide-cloud-rain', category: 'rain' }
    case 65:
      return { code, description: 'Heavy Rain', icon: 'i-lucide-cloud-rain-wind', category: 'rain' }
    case 66:
    case 67:
      return { code, description: 'Freezing Rain', icon: 'i-lucide-cloud-rain', category: 'rain' }
    case 71:
    case 73:
    case 75:
      return { code, description: 'Snow fall', icon: 'i-lucide-cloud-snow', category: 'snow' }
    case 77:
      return { code, description: 'Snow grains', icon: 'i-lucide-cloud-snow', category: 'snow' }
    case 80:
    case 81:
    case 82:
      return { code, description: 'Rain showers', icon: 'i-lucide-cloud-hail', category: 'rain' }
    case 85:
    case 86:
      return { code, description: 'Snow showers', icon: 'i-lucide-cloud-snow', category: 'snow' }
    case 95:
      return { code, description: 'Thunderstorm', icon: 'i-lucide-cloud-lightning', category: 'thunderstorm' }
    case 96:
    case 99:
      return { code, description: 'Severe Thunderstorm', icon: 'i-lucide-cloud-lightning', category: 'thunderstorm' }
    default:
      return { code, description: 'Cloudy', icon: 'i-lucide-cloud', category: 'cloudy' }
  }
}

function mapRowToCityWeather(r: Row): CityLatestWeather {
  const weatherCode = Number(r.weather_code ?? 0)
  const aqi = Math.round(Number(r.us_aqi ?? 0))

  return {
    id: r.id ? Number(r.id) : undefined,
    timestampUtc: String(r.timestamp_utc),
    timestampLocal: String(r.timestamp_local),
    city: String(r.city),
    state: String(r.state),
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    temperature: Number(Number(r.temperature).toFixed(1)),
    apparentTemperature: Number(Number(r.apparent_temperature).toFixed(1)),
    relativeHumidity: Number(Number(r.relative_humidity).toFixed(0)),
    precipitation: Number(Number(r.precipitation).toFixed(1)),
    windSpeed: Number(Number(r.wind_speed).toFixed(1)),
    weatherCode,
    usAqi: aqi,
    pm25: Number(Number(r.pm2_5).toFixed(1)),
    pm10: Number(Number(r.pm10).toFixed(1)),
    carbonMonoxide: Number(Number(r.carbon_monoxide).toFixed(0)),
    nitrogenDioxide: Number(Number(r.nitrogen_dioxide).toFixed(1)),
    sulphurDioxide: Number(Number(r.sulphur_dioxide).toFixed(1)),
    ozone: Number(Number(r.ozone).toFixed(0)),
    aqiCategory: getAqiCategoryInfo(aqi),
    weatherCondition: getWeatherConditionInfo(weatherCode)
  }
}

// In-memory cache for latest snapshots (60 seconds TTL)
let cachedSnapshot: {
  cities: CityLatestWeather[]
  pulse: NationalWeatherPulse
  cachedAt: number
} | null = null

const SNAPSHOT_CACHE_MS = 60 * 1000

export async function getLatestWeatherSnapshots(forceRefresh = false): Promise<{
  cities: CityLatestWeather[]
  pulse: NationalWeatherPulse
}> {
  const now = Date.now()
  if (!forceRefresh && cachedSnapshot && now - cachedSnapshot.cachedAt < SNAPSHOT_CACHE_MS) {
    return {
      cities: cachedSnapshot.cities,
      pulse: cachedSnapshot.pulse
    }
  }

  const db = getTursoClient()

  // 1. Fetch latest row dynamically for each city
  const rowsRes = await db.execute(`
    SELECT w.*
    FROM weather_aqi w
    INNER JOIN (
      SELECT city, MAX(timestamp_utc) as max_ts
      FROM weather_aqi
      GROUP BY city
    ) latest ON w.city = latest.city AND w.timestamp_utc = latest.max_ts
    ORDER BY w.us_aqi DESC;
  `)

  // 2. Fetch total count of records dynamically
  const countRes = await db.execute('SELECT COUNT(*) as total FROM weather_aqi;')
  const totalReadings = Number(countRes.rows[0]?.total ?? 0)

  const cities: CityLatestWeather[] = rowsRes.rows.map(mapRowToCityWeather)

  const firstCity = cities[0]
  if (!firstCity) {
    throw new Error('No weather telemetry found in database.')
  }

  // Compute National Pulse
  let sumAqi = 0
  let cleanest: CityLatestWeather = firstCity
  let mostPolluted: CityLatestWeather = firstCity
  let hottest: CityLatestWeather = firstCity
  let coldest: CityLatestWeather = firstCity
  let maxRainCity: CityLatestWeather = firstCity
  const rainCities: string[] = []

  for (const c of cities) {
    sumAqi += c.usAqi
    if (c.usAqi < cleanest.usAqi) cleanest = c
    if (c.usAqi > mostPolluted.usAqi) mostPolluted = c
    if (c.temperature > hottest.temperature) hottest = c
    if (c.temperature < coldest.temperature) coldest = c
    if (c.precipitation > 0) rainCities.push(c.city)
    if (c.precipitation > maxRainCity.precipitation) maxRainCity = c
  }

  const avgAqi = Math.round(sumAqi / cities.length)
  const latestTs = firstCity.timestampUtc
  const latestLocal = firstCity.timestampLocal

  const pulse: NationalWeatherPulse = {
    totalCities: cities.length,
    totalReadings,
    lastUpdatedUtc: latestTs,
    lastUpdatedLocal: latestLocal,
    nationalAvgAqi: avgAqi,
    nationalAqiCategory: getAqiCategoryInfo(avgAqi),
    cleanestCity: {
      city: cleanest.city,
      state: cleanest.state,
      aqi: cleanest.usAqi,
      temperature: cleanest.temperature
    },
    mostPollutedCity: {
      city: mostPolluted.city,
      state: mostPolluted.state,
      aqi: mostPolluted.usAqi,
      pm25: mostPolluted.pm25,
      primaryPollutant: mostPolluted.pm25 > 35 ? 'PM2.5' : mostPolluted.pm10 > 50 ? 'PM10' : 'NO₂'
    },
    hottestCity: {
      city: hottest.city,
      state: hottest.state,
      temperature: hottest.temperature,
      feelsLike: hottest.apparentTemperature
    },
    coldestCity: {
      city: coldest.city,
      state: coldest.state,
      temperature: coldest.temperature
    },
    activeRainCount: rainCities.length,
    activeRainCities: rainCities,
    highestRainCity: maxRainCity.precipitation > 0
      ? {
          city: maxRainCity.city,
          state: maxRainCity.state,
          precipitation: maxRainCity.precipitation
        }
      : undefined
  }

  cachedSnapshot = {
    cities,
    pulse,
    cachedAt: now
  }

  return { cities, pulse }
}

export async function getCityWeatherHistory(city: string, range = '7d'): Promise<WeatherHistoryResponse> {
  const db = getTursoClient()

  // 1. Get city metadata and latest reading
  const latestRes = await db.execute({
    sql: 'SELECT * FROM weather_aqi WHERE city = ? ORDER BY timestamp_utc DESC LIMIT 1;',
    args: [city]
  })

  const firstRow = latestRes.rows[0]
  if (!firstRow) {
    throw new Error(`City "${city}" not found in weather records.`)
  }

  const latest = mapRowToCityWeather(firstRow)

  // 2. Determine time filter and downsampling bucket dynamically
  // Range options: 24h, 7d, 30d, 90d, all
  const normalizedRange = range.toLowerCase()

  let sql: string
  const args: (string | number)[] = [city]

  if (normalizedRange === '24h') {
    // Hourly for last 24 records
    sql = `
      SELECT timestamp_utc, timestamp_local, temperature, apparent_temperature, relative_humidity,
             precipitation, wind_speed, us_aqi, pm2_5, pm10, carbon_monoxide, nitrogen_dioxide, sulphur_dioxide, ozone
      FROM weather_aqi
      WHERE city = ?
      ORDER BY timestamp_utc DESC
      LIMIT 24;
    `
  } else if (normalizedRange === '7d') {
    // Hourly for last 168 records (~7 days)
    sql = `
      SELECT timestamp_utc, timestamp_local, temperature, apparent_temperature, relative_humidity,
             precipitation, wind_speed, us_aqi, pm2_5, pm10, carbon_monoxide, nitrogen_dioxide, sulphur_dioxide, ozone
      FROM weather_aqi
      WHERE city = ?
      ORDER BY timestamp_utc DESC
      LIMIT 168;
    `
  } else if (normalizedRange === '30d') {
    // 6-hour bucket aggregation for last 30 days
    sql = `
      SELECT 
        MIN(timestamp_utc) as timestamp_utc,
        MIN(timestamp_local) as timestamp_local,
        ROUND(AVG(temperature), 1) as temperature,
        ROUND(AVG(apparent_temperature), 1) as apparent_temperature,
        ROUND(AVG(relative_humidity), 0) as relative_humidity,
        ROUND(SUM(precipitation), 1) as precipitation,
        ROUND(AVG(wind_speed), 1) as wind_speed,
        ROUND(AVG(us_aqi), 0) as us_aqi,
        ROUND(AVG(pm2_5), 1) as pm2_5,
        ROUND(AVG(pm10), 1) as pm10,
        ROUND(AVG(carbon_monoxide), 0) as carbon_monoxide,
        ROUND(AVG(nitrogen_dioxide), 1) as nitrogen_dioxide,
        ROUND(AVG(sulphur_dioxide), 1) as sulphur_dioxide,
        ROUND(AVG(ozone), 0) as ozone
      FROM weather_aqi
      WHERE city = ?
      GROUP BY SUBSTR(timestamp_utc, 1, 10), (CAST(SUBSTR(timestamp_utc, 12, 2) AS INTEGER) / 6)
      ORDER BY timestamp_utc DESC
      LIMIT 120;
    `
  } else {
    // '90d' or 'all': Daily aggregation (one point per day)
    const limit = normalizedRange === '90d' ? 90 : 365
    sql = `
      SELECT 
        MIN(timestamp_utc) as timestamp_utc,
        MIN(timestamp_local) as timestamp_local,
        ROUND(AVG(temperature), 1) as temperature,
        ROUND(AVG(apparent_temperature), 1) as apparent_temperature,
        ROUND(AVG(relative_humidity), 0) as relative_humidity,
        ROUND(SUM(precipitation), 1) as precipitation,
        ROUND(AVG(wind_speed), 1) as wind_speed,
        ROUND(AVG(us_aqi), 0) as us_aqi,
        ROUND(AVG(pm2_5), 1) as pm2_5,
        ROUND(AVG(pm10), 1) as pm10,
        ROUND(AVG(carbon_monoxide), 0) as carbon_monoxide,
        ROUND(AVG(nitrogen_dioxide), 1) as nitrogen_dioxide,
        ROUND(AVG(sulphur_dioxide), 1) as sulphur_dioxide,
        ROUND(AVG(ozone), 0) as ozone
      FROM weather_aqi
      WHERE city = ?
      GROUP BY SUBSTR(timestamp_utc, 1, 10)
      ORDER BY timestamp_utc DESC
      LIMIT ${limit};
    `
  }

  const historyRes = await db.execute({ sql, args })

  // Reverse so chronological order (oldest to newest)
  const history: WeatherHistoryPoint[] = historyRes.rows.reverse().map((r: Row) => ({
    timestampUtc: String(r.timestamp_utc),
    timestampLocal: String(r.timestamp_local || ''),
    temperature: Number(Number(r.temperature).toFixed(1)),
    apparentTemperature: Number(Number(r.apparent_temperature).toFixed(1)),
    relativeHumidity: Number(Number(r.relative_humidity).toFixed(0)),
    precipitation: Number(Number(r.precipitation).toFixed(1)),
    windSpeed: Number(Number(r.wind_speed).toFixed(1)),
    usAqi: Math.round(Number(r.us_aqi)),
    pm25: Number(Number(r.pm2_5).toFixed(1)),
    pm10: Number(Number(r.pm10).toFixed(1)),
    carbonMonoxide: r.carbon_monoxide !== undefined ? Number(r.carbon_monoxide) : undefined,
    nitrogenDioxide: r.nitrogen_dioxide !== undefined ? Number(r.nitrogen_dioxide) : undefined,
    sulphurDioxide: r.sulphur_dioxide !== undefined ? Number(r.sulphur_dioxide) : undefined,
    ozone: r.ozone !== undefined ? Number(r.ozone) : undefined
  }))

  return {
    city: latest.city,
    state: latest.state,
    latitude: latest.latitude,
    longitude: latest.longitude,
    range: normalizedRange,
    totalPoints: history.length,
    latest,
    history
  }
}

export async function getWeatherRankings(): Promise<WeatherRankingsResponse> {
  const { cities } = await getLatestWeatherSnapshots()

  const sortedByAqiAsc = [...cities].sort((a, b) => a.usAqi - b.usAqi)
  const sortedByAqiDesc = [...cities].sort((a, b) => b.usAqi - a.usAqi)
  const sortedByTempDesc = [...cities].sort((a, b) => b.temperature - a.temperature)
  const sortedByTempAsc = [...cities].sort((a, b) => a.temperature - b.temperature)
  const sortedByRainDesc = [...cities].sort((a, b) => b.precipitation - a.precipitation)

  return {
    cleanestCities: sortedByAqiAsc.slice(0, 5).map(c => ({
      city: c.city,
      state: c.state,
      aqi: c.usAqi,
      pm25: c.pm25
    })),
    mostPollutedCities: sortedByAqiDesc.slice(0, 5).map(c => ({
      city: c.city,
      state: c.state,
      aqi: c.usAqi,
      pm25: c.pm25,
      pm10: c.pm10
    })),
    hottestCities: sortedByTempDesc.slice(0, 5).map(c => ({
      city: c.city,
      state: c.state,
      temperature: c.temperature,
      feelsLike: c.apparentTemperature
    })),
    coldestCities: sortedByTempAsc.slice(0, 5).map(c => ({
      city: c.city,
      state: c.state,
      temperature: c.temperature
    })),
    wettestCities: sortedByRainDesc.slice(0, 5).map(c => ({
      city: c.city,
      state: c.state,
      precipitation: c.precipitation
    }))
  }
}

export async function getWeatherMarketCorrelations(): Promise<MarketWeatherSectorImpact[]> {
  let pulse: NationalWeatherPulse | null = null
  try {
    const snapshot = await getLatestWeatherSnapshots()
    pulse = snapshot.pulse
  } catch (err) {
    console.warn('[Weather correlations] Failed to fetch live snapshot:', err)
  }

  const hottestTemp = pulse?.hottestCity?.temperature ? `${pulse.hottestCity.temperature}°C` : 'elevated temperatures'
  const hottestCityName = pulse?.hottestCity?.city || 'northern plains'
  const rainCitiesCount = pulse?.activeRainCount || 0
  const maxRainCity = pulse?.highestRainCity ? `${pulse.highestRainCity.city} (${pulse.highestRainCity.precipitation}mm)` : null
  const mostPollutedCityName = pulse?.mostPollutedCity?.city || 'NCR'
  const maxAqi = pulse?.mostPollutedCity?.aqi ? pulse.mostPollutedCity.aqi : 150

  return [
    {
      sector: 'Agriculture & Fertilizers',
      metric: rainCitiesCount > 0 ? `Active Rain in ${rainCitiesCount} Cities` : 'Monsoon Precipitation Spread',
      status: rainCitiesCount > 3 ? 'positive' : 'watch',
      summary: maxRainCity
        ? `Monsoon activity highest in ${maxRainCity}, supporting Kharif sowing and fertilizer demand.`
        : 'Regional precipitation patterns across central & eastern belts influence Kharif sowing and fertilizer demand.',
      stocks: [
        { symbol: 'PARADEEP.NS', name: 'Paradeep Phosphates', correlationFactor: 'High DAP/NPK demand' },
        { symbol: 'UPL.NS', name: 'UPL Limited', correlationFactor: 'Crop protection volumes' },
        { symbol: 'COROMANDEL.NS', name: 'Coromandel International', correlationFactor: 'Nutrient consumption' }
      ]
    },
    {
      sector: 'Power & Energy Generation',
      metric: `Peak Heat Index: ${hottestTemp}`,
      status: pulse?.hottestCity?.temperature && pulse.hottestCity.temperature >= 35 ? 'positive' : 'watch',
      summary: `Peak temperatures reaching ${hottestTemp} in ${hottestCityName} drive institutional cooling loads and grid power demand.`,
      stocks: [
        { symbol: 'TATAPOWER.NS', name: 'Tata Power', correlationFactor: 'Discom peak load demand' },
        { symbol: 'NTPC.NS', name: 'NTPC Limited', correlationFactor: 'Thermal base load utilization' },
        { symbol: 'COALINDIA.NS', name: 'Coal India', correlationFactor: 'Power plant fuel dispatches' }
      ]
    },
    {
      sector: 'Air Purification & Healthcare',
      metric: `Peak AQI: ${maxAqi} (${mostPollutedCityName})`,
      status: maxAqi >= 120 ? 'positive' : 'neutral',
      summary: `Air quality readings peaking at ${maxAqi} AQI in ${mostPollutedCityName} elevate demand for respiratory solutions and air treatment appliances.`,
      stocks: [
        { symbol: 'VOLTAS.NS', name: 'Voltas', correlationFactor: 'Air treatment & HVAC units' },
        { symbol: 'HAVELLS.NS', name: 'Havells India', correlationFactor: 'Appliance & air purifier segment' }
      ]
    }
  ]
}

function formatPeriodLabel(period: string, type: 'day' | 'month' | 'year'): string {
  try {
    if (type === 'day') {
      const d = new Date(period + 'T00:00:00Z')
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    }
    if (type === 'month') {
      const [year, month] = period.split('-')
      const d = new Date(Date.UTC(Number(year), Number(month) - 1, 1))
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    }
    return `Year ${period}`
  } catch {
    return period
  }
}

function mapRowToPeriodAggregated(r: Row, type: 'day' | 'month' | 'year'): PeriodAggregatedRow {
  const avgAqi = Math.round(Number(r.avg_aqi ?? 0))
  const period = String(r.period)

  return {
    period,
    label: formatPeriodLabel(period, type),
    readingsCount: Number(r.readings_count ?? 0),
    temperature: {
      min: Number(Number(r.min_temp ?? 0).toFixed(1)),
      max: Number(Number(r.max_temp ?? 0).toFixed(1)),
      avg: Number(Number(r.avg_temp ?? 0).toFixed(1))
    },
    apparentTemperature: r.min_feels !== undefined
      ? {
          min: Number(Number(r.min_feels ?? 0).toFixed(1)),
          max: Number(Number(r.max_feels ?? 0).toFixed(1)),
          avg: Number(Number(r.avg_feels ?? 0).toFixed(1))
        }
      : undefined,
    usAqi: {
      min: Math.round(Number(r.min_aqi ?? 0)),
      max: Math.round(Number(r.max_aqi ?? 0)),
      avg: avgAqi
    },
    aqiCategory: getAqiCategoryInfo(avgAqi),
    pm25: {
      min: Number(Number(r.min_pm25 ?? 0).toFixed(1)),
      max: Number(Number(r.max_pm25 ?? 0).toFixed(1)),
      avg: Number(Number(r.avg_pm25 ?? 0).toFixed(1))
    },
    pm10: {
      min: Number(Number(r.min_pm10 ?? 0).toFixed(1)),
      max: Number(Number(r.max_pm10 ?? 0).toFixed(1)),
      avg: Number(Number(r.avg_pm10 ?? 0).toFixed(1))
    },
    humidity: {
      min: Math.round(Number(r.min_humidity ?? 0)),
      max: Math.round(Number(r.max_humidity ?? 0)),
      avg: Math.round(Number(r.avg_humidity ?? 0))
    },
    windSpeed: {
      min: Number(Number(r.min_wind ?? 0).toFixed(1)),
      max: Number(Number(r.max_wind ?? 0).toFixed(1)),
      avg: Number(Number(r.avg_wind ?? 0).toFixed(1))
    },
    totalRain: Number(Number(r.total_rain ?? 0).toFixed(1))
  }
}

export async function getCityWeatherStats(city: string): Promise<CityWeatherStats> {
  const db = getTursoClient()

  // 1. Get City info and basic boundaries
  const metaRes = await db.execute({
    sql: `
      SELECT city, state, COUNT(*) as cnt, MIN(timestamp_utc) as first_ts, MAX(timestamp_utc) as last_ts
      FROM weather_aqi
      WHERE city = ?
      GROUP BY city, state;
    `,
    args: [city]
  })

  const meta = metaRes.rows[0]
  if (!meta) {
    throw new Error(`City "${city}" not found in weather records.`)
  }

  // 2. Last 7 Days Daily Breakdown
  const sevenDaysRes = await db.execute({
    sql: `
      SELECT 
        DATE(timestamp_utc) as period,
        COUNT(*) as readings_count,
        ROUND(MIN(temperature), 1) as min_temp,
        ROUND(MAX(temperature), 1) as max_temp,
        ROUND(AVG(temperature), 1) as avg_temp,
        ROUND(MIN(apparent_temperature), 1) as min_feels,
        ROUND(MAX(apparent_temperature), 1) as max_feels,
        ROUND(AVG(apparent_temperature), 1) as avg_feels,
        ROUND(MIN(us_aqi), 0) as min_aqi,
        ROUND(MAX(us_aqi), 0) as max_aqi,
        ROUND(AVG(us_aqi), 0) as avg_aqi,
        ROUND(MIN(pm2_5), 1) as min_pm25,
        ROUND(MAX(pm2_5), 1) as max_pm25,
        ROUND(AVG(pm2_5), 1) as avg_pm25,
        ROUND(MIN(pm10), 1) as min_pm10,
        ROUND(MAX(pm10), 1) as max_pm10,
        ROUND(AVG(pm10), 1) as avg_pm10,
        ROUND(MIN(relative_humidity), 0) as min_humidity,
        ROUND(MAX(relative_humidity), 0) as max_humidity,
        ROUND(AVG(relative_humidity), 0) as avg_humidity,
        ROUND(MIN(wind_speed), 1) as min_wind,
        ROUND(MAX(wind_speed), 1) as max_wind,
        ROUND(AVG(wind_speed), 1) as avg_wind,
        ROUND(SUM(precipitation), 1) as total_rain
      FROM weather_aqi
      WHERE city = ?
      GROUP BY DATE(timestamp_utc)
      ORDER BY period DESC
      LIMIT 7;
    `,
    args: [city]
  })
  const sevenDaysRows = sevenDaysRes.rows.map(r => mapRowToPeriodAggregated(r, 'day'))

  // 7 Days Summary Overall
  const sevenDaysSummaryRes = await db.execute({
    sql: `
      SELECT 
        ROUND(MIN(temperature), 1) as min_temp,
        ROUND(MAX(temperature), 1) as max_temp,
        ROUND(AVG(temperature), 1) as avg_temp,
        ROUND(MIN(apparent_temperature), 1) as min_feels,
        ROUND(MAX(apparent_temperature), 1) as max_feels,
        ROUND(AVG(apparent_temperature), 1) as avg_feels,
        ROUND(MIN(us_aqi), 0) as min_aqi,
        ROUND(MAX(us_aqi), 0) as max_aqi,
        ROUND(AVG(us_aqi), 0) as avg_aqi,
        ROUND(MIN(pm2_5), 1) as min_pm25,
        ROUND(MAX(pm2_5), 1) as max_pm25,
        ROUND(AVG(pm2_5), 1) as avg_pm25,
        ROUND(MIN(pm10), 1) as min_pm10,
        ROUND(MAX(pm10), 1) as max_pm10,
        ROUND(AVG(pm10), 1) as avg_pm10,
        ROUND(MIN(relative_humidity), 0) as min_humidity,
        ROUND(MAX(relative_humidity), 0) as max_humidity,
        ROUND(AVG(relative_humidity), 0) as avg_humidity,
        ROUND(MIN(wind_speed), 1) as min_wind,
        ROUND(MAX(wind_speed), 1) as max_wind,
        ROUND(AVG(wind_speed), 1) as avg_wind,
        ROUND(SUM(precipitation), 1) as total_rain
      FROM (
        SELECT * FROM weather_aqi
        WHERE city = ?
        ORDER BY timestamp_utc DESC
        LIMIT 168
      );
    `,
    args: [city]
  })
  const s7 = (sevenDaysSummaryRes.rows[0] || {}) as Record<string, any>
  const s7AvgAqi = Math.round(Number(s7.avg_aqi ?? 0))

  // 3. Monthly Breakdown
  const monthlyRes = await db.execute({
    sql: `
      SELECT 
        SUBSTR(timestamp_utc, 1, 7) as period,
        COUNT(*) as readings_count,
        ROUND(MIN(temperature), 1) as min_temp,
        ROUND(MAX(temperature), 1) as max_temp,
        ROUND(AVG(temperature), 1) as avg_temp,
        ROUND(MIN(apparent_temperature), 1) as min_feels,
        ROUND(MAX(apparent_temperature), 1) as max_feels,
        ROUND(AVG(apparent_temperature), 1) as avg_feels,
        ROUND(MIN(us_aqi), 0) as min_aqi,
        ROUND(MAX(us_aqi), 0) as max_aqi,
        ROUND(AVG(us_aqi), 0) as avg_aqi,
        ROUND(MIN(pm2_5), 1) as min_pm25,
        ROUND(MAX(pm2_5), 1) as max_pm25,
        ROUND(AVG(pm2_5), 1) as avg_pm25,
        ROUND(MIN(pm10), 1) as min_pm10,
        ROUND(MAX(pm10), 1) as max_pm10,
        ROUND(AVG(pm10), 1) as avg_pm10,
        ROUND(MIN(relative_humidity), 0) as min_humidity,
        ROUND(MAX(relative_humidity), 0) as max_humidity,
        ROUND(AVG(relative_humidity), 0) as avg_humidity,
        ROUND(MIN(wind_speed), 1) as min_wind,
        ROUND(MAX(wind_speed), 1) as max_wind,
        ROUND(AVG(wind_speed), 1) as avg_wind,
        ROUND(SUM(precipitation), 1) as total_rain
      FROM weather_aqi
      WHERE city = ?
      GROUP BY SUBSTR(timestamp_utc, 1, 7)
      ORDER BY period DESC;
    `,
    args: [city]
  })
  const monthlyRows = monthlyRes.rows.map(r => mapRowToPeriodAggregated(r, 'month'))

  // 4. Yearly Breakdown
  const yearlyRes = await db.execute({
    sql: `
      SELECT 
        SUBSTR(timestamp_utc, 1, 4) as period,
        COUNT(*) as readings_count,
        ROUND(MIN(temperature), 1) as min_temp,
        ROUND(MAX(temperature), 1) as max_temp,
        ROUND(AVG(temperature), 1) as avg_temp,
        ROUND(MIN(apparent_temperature), 1) as min_feels,
        ROUND(MAX(apparent_temperature), 1) as max_feels,
        ROUND(AVG(apparent_temperature), 1) as avg_feels,
        ROUND(MIN(us_aqi), 0) as min_aqi,
        ROUND(MAX(us_aqi), 0) as max_aqi,
        ROUND(AVG(us_aqi), 0) as avg_aqi,
        ROUND(MIN(pm2_5), 1) as min_pm25,
        ROUND(MAX(pm2_5), 1) as max_pm25,
        ROUND(AVG(pm2_5), 1) as avg_pm25,
        ROUND(MIN(pm10), 1) as min_pm10,
        ROUND(MAX(pm10), 1) as max_pm10,
        ROUND(AVG(pm10), 1) as avg_pm10,
        ROUND(MIN(relative_humidity), 0) as min_humidity,
        ROUND(MAX(relative_humidity), 0) as max_humidity,
        ROUND(AVG(relative_humidity), 0) as avg_humidity,
        ROUND(MIN(wind_speed), 1) as min_wind,
        ROUND(MAX(wind_speed), 1) as max_wind,
        ROUND(AVG(wind_speed), 1) as avg_wind,
        ROUND(SUM(precipitation), 1) as total_rain
      FROM weather_aqi
      WHERE city = ?
      GROUP BY SUBSTR(timestamp_utc, 1, 4)
      ORDER BY period DESC;
    `,
    args: [city]
  })
  const yearlyRows = yearlyRes.rows.map(r => mapRowToPeriodAggregated(r, 'year'))

  // 5. Extremes & Records
  const hottestRes = await db.execute({
    sql: 'SELECT temperature, apparent_temperature, timestamp_local, timestamp_utc FROM weather_aqi WHERE city = ? ORDER BY temperature DESC LIMIT 1;',
    args: [city]
  })
  const coldestRes = await db.execute({
    sql: 'SELECT temperature, timestamp_local, timestamp_utc FROM weather_aqi WHERE city = ? ORDER BY temperature ASC LIMIT 1;',
    args: [city]
  })
  const highAqiRes = await db.execute({
    sql: 'SELECT us_aqi, timestamp_local, timestamp_utc FROM weather_aqi WHERE city = ? ORDER BY us_aqi DESC LIMIT 1;',
    args: [city]
  })
  const lowAqiRes = await db.execute({
    sql: 'SELECT us_aqi, timestamp_local, timestamp_utc FROM weather_aqi WHERE city = ? ORDER BY us_aqi ASC LIMIT 1;',
    args: [city]
  })
  const rainRes = await db.execute({
    sql: 'SELECT precipitation, timestamp_local, timestamp_utc FROM weather_aqi WHERE city = ? ORDER BY precipitation DESC LIMIT 1;',
    args: [city]
  })
  const windRes = await db.execute({
    sql: 'SELECT wind_speed, timestamp_local, timestamp_utc FROM weather_aqi WHERE city = ? ORDER BY wind_speed DESC LIMIT 1;',
    args: [city]
  })

  const hotRow = hottestRes.rows[0]
  const coldRow = coldestRes.rows[0]
  const highAqiRow = highAqiRes.rows[0]
  const lowAqiRow = lowAqiRes.rows[0]
  const rainRow = rainRes.rows[0]
  const windRow = windRes.rows[0]

  const maxAqiVal = highAqiRow ? Math.round(Number(highAqiRow.us_aqi)) : 0
  const minAqiVal = lowAqiRow ? Math.round(Number(lowAqiRow.us_aqi)) : 0

  // 6. Diurnal Analysis (Day: 06:00-18:00 IST -> UTC 01:00-12:00 vs Night: 18:00-06:00 IST -> UTC 13:00-00:00)
  const diurnalRes = await db.execute({
    sql: `
      SELECT 
        CASE 
          WHEN CAST(SUBSTR(timestamp_utc, 12, 2) AS INTEGER) BETWEEN 1 AND 12 THEN 'day'
          ELSE 'night'
        END as time_slot,
        COUNT(*) as cnt,
        ROUND(AVG(temperature), 1) as avg_temp,
        ROUND(AVG(us_aqi), 0) as avg_aqi,
        ROUND(AVG(relative_humidity), 0) as avg_humidity
      FROM weather_aqi
      WHERE city = ?
      GROUP BY time_slot;
    `,
    args: [city]
  })

  let dayStats = { avgTemp: 0, avgAqi: 0, avgHumidity: 0, hoursCount: 0 }
  let nightStats = { avgTemp: 0, avgAqi: 0, avgHumidity: 0, hoursCount: 0 }

  for (const r of diurnalRes.rows) {
    if (r.time_slot === 'day') {
      dayStats = {
        avgTemp: Number(r.avg_temp ?? 0),
        avgAqi: Math.round(Number(r.avg_aqi ?? 0)),
        avgHumidity: Math.round(Number(r.avg_humidity ?? 0)),
        hoursCount: Number(r.cnt ?? 0)
      }
    } else {
      nightStats = {
        avgTemp: Number(r.avg_temp ?? 0),
        avgAqi: Math.round(Number(r.avg_aqi ?? 0)),
        avgHumidity: Math.round(Number(r.avg_humidity ?? 0)),
        hoursCount: Number(r.cnt ?? 0)
      }
    }
  }

  // 7. AQI Category Bracket Distribution
  const aqiDistRes = await db.execute({
    sql: `
      SELECT 
        COUNT(CASE WHEN us_aqi <= 50 THEN 1 END) as good_cnt,
        COUNT(CASE WHEN us_aqi > 50 AND us_aqi <= 100 THEN 1 END) as mod_cnt,
        COUNT(CASE WHEN us_aqi > 100 AND us_aqi <= 150 THEN 1 END) as sens_cnt,
        COUNT(CASE WHEN us_aqi > 150 AND us_aqi <= 200 THEN 1 END) as unh_cnt,
        COUNT(CASE WHEN us_aqi > 200 AND us_aqi <= 300 THEN 1 END) as v_unh_cnt,
        COUNT(CASE WHEN us_aqi > 300 THEN 1 END) as haz_cnt,
        COUNT(*) as total_cnt
      FROM weather_aqi
      WHERE city = ?;
    `,
    args: [city]
  })

  const dRow = aqiDistRes.rows[0]
  const totalCnt = Number(dRow?.total_cnt ?? 1) || 1

  const aqiDistribution = [
    {
      category: 'Good (0-50)',
      level: 'good' as const,
      count: Number(dRow?.good_cnt ?? 0),
      percentage: Number(((Number(dRow?.good_cnt ?? 0) / totalCnt) * 100).toFixed(1)),
      color: '#10b981',
      badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
    },
    {
      category: 'Moderate (51-100)',
      level: 'moderate' as const,
      count: Number(dRow?.mod_cnt ?? 0),
      percentage: Number(((Number(dRow?.mod_cnt ?? 0) / totalCnt) * 100).toFixed(1)),
      color: '#f59e0b',
      badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
    },
    {
      category: 'Sensitive Warning (101-150)',
      level: 'unhealthy-sensitive' as const,
      count: Number(dRow?.sens_cnt ?? 0),
      percentage: Number(((Number(dRow?.sens_cnt ?? 0) / totalCnt) * 100).toFixed(1)),
      color: '#f97316',
      badgeClass: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30'
    },
    {
      category: 'Unhealthy (151-200)',
      level: 'unhealthy' as const,
      count: Number(dRow?.unh_cnt ?? 0),
      percentage: Number(((Number(dRow?.unh_cnt ?? 0) / totalCnt) * 100).toFixed(1)),
      color: '#ef4444',
      badgeClass: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30'
    },
    {
      category: 'Very Unhealthy (201-300)',
      level: 'very-unhealthy' as const,
      count: Number(dRow?.v_unh_cnt ?? 0),
      percentage: Number(((Number(dRow?.v_unh_cnt ?? 0) / totalCnt) * 100).toFixed(1)),
      color: '#a855f7',
      badgeClass: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30'
    },
    {
      category: 'Hazardous (300+)',
      level: 'hazardous' as const,
      count: Number(dRow?.haz_cnt ?? 0),
      percentage: Number(((Number(dRow?.haz_cnt ?? 0) / totalCnt) * 100).toFixed(1)),
      color: '#be123c',
      badgeClass: 'bg-rose-950/40 text-rose-500 dark:text-rose-400 border-rose-600/40'
    }
  ]

  // 8. Chemical Pollutant Stats
  const chemRes = await db.execute({
    sql: `
      SELECT 
        ROUND(MIN(pm2_5), 1) as min_pm25, ROUND(MAX(pm2_5), 1) as max_pm25, ROUND(AVG(pm2_5), 1) as avg_pm25,
        ROUND(MIN(pm10), 1) as min_pm10, ROUND(MAX(pm10), 1) as max_pm10, ROUND(AVG(pm10), 1) as avg_pm10,
        ROUND(MIN(carbon_monoxide), 0) as min_co, ROUND(MAX(carbon_monoxide), 0) as max_co, ROUND(AVG(carbon_monoxide), 0) as avg_co,
        ROUND(MIN(nitrogen_dioxide), 1) as min_no2, ROUND(MAX(nitrogen_dioxide), 1) as max_no2, ROUND(AVG(nitrogen_dioxide), 1) as avg_no2,
        ROUND(MIN(sulphur_dioxide), 1) as min_so2, ROUND(MAX(sulphur_dioxide), 1) as max_so2, ROUND(AVG(sulphur_dioxide), 1) as avg_so2,
        ROUND(MIN(ozone), 0) as min_o3, ROUND(MAX(ozone), 0) as max_o3, ROUND(AVG(ozone), 0) as avg_o3
      FROM weather_aqi
      WHERE city = ?;
    `,
    args: [city]
  })
  const ch = (chemRes.rows[0] || {}) as Record<string, any>

  const avgPm25 = Number(ch.avg_pm25 ?? 0)
  const avgPm10 = Number(ch.avg_pm10 ?? 0)
  const avgCo = Number(ch.avg_co ?? 0)
  const avgNo2 = Number(ch.avg_no2 ?? 0)
  const avgSo2 = Number(ch.avg_so2 ?? 0)
  const avgO3 = Number(ch.avg_o3 ?? 0)

  const pollutantChemistry = [
    {
      pollutant: 'PM2.5',
      name: 'Fine Particulate Matter',
      unit: 'µg/m³',
      min: Number(ch.min_pm25 ?? 0),
      max: Number(ch.max_pm25 ?? 0),
      avg: avgPm25,
      whoLimit: 15,
      status: avgPm25 <= 15 ? ('safe' as const) : avgPm25 <= 35 ? ('moderate' as const) : ('excess' as const)
    },
    {
      pollutant: 'PM10',
      name: 'Coarse Particulate Matter',
      unit: 'µg/m³',
      min: Number(ch.min_pm10 ?? 0),
      max: Number(ch.max_pm10 ?? 0),
      avg: avgPm10,
      whoLimit: 45,
      status: avgPm10 <= 45 ? ('safe' as const) : avgPm10 <= 100 ? ('moderate' as const) : ('excess' as const)
    },
    {
      pollutant: 'CO',
      name: 'Carbon Monoxide',
      unit: 'µg/m³',
      min: Number(ch.min_co ?? 0),
      max: Number(ch.max_co ?? 0),
      avg: avgCo,
      whoLimit: 4000,
      status: avgCo <= 4000 ? ('safe' as const) : ('excess' as const)
    },
    {
      pollutant: 'NO₂',
      name: 'Nitrogen Dioxide',
      unit: 'µg/m³',
      min: Number(ch.min_no2 ?? 0),
      max: Number(ch.max_no2 ?? 0),
      avg: avgNo2,
      whoLimit: 25,
      status: avgNo2 <= 25 ? ('safe' as const) : avgNo2 <= 50 ? ('moderate' as const) : ('excess' as const)
    },
    {
      pollutant: 'SO₂',
      name: 'Sulphur Dioxide',
      unit: 'µg/m³',
      min: Number(ch.min_so2 ?? 0),
      max: Number(ch.max_so2 ?? 0),
      avg: avgSo2,
      whoLimit: 40,
      status: avgSo2 <= 40 ? ('safe' as const) : ('excess' as const)
    },
    {
      pollutant: 'O₃',
      name: 'Ground-Level Ozone',
      unit: 'µg/m³',
      min: Number(ch.min_o3 ?? 0),
      max: Number(ch.max_o3 ?? 0),
      avg: avgO3,
      whoLimit: 100,
      status: avgO3 <= 100 ? ('safe' as const) : ('excess' as const)
    }
  ]

  // Monthly overall summary
  const mOverallAqi = monthlyRows.length > 0 ? Math.round(monthlyRows.reduce((acc, m) => acc + m.usAqi.avg, 0) / monthlyRows.length) : 0
  const mOverallRain = monthlyRows.reduce((acc, m) => acc + m.totalRain, 0)
  const mMinTemp = monthlyRows.length > 0 ? Math.min(...monthlyRows.map(m => m.temperature.min)) : 0
  const mMaxTemp = monthlyRows.length > 0 ? Math.max(...monthlyRows.map(m => m.temperature.max)) : 0
  const mAvgTemp = monthlyRows.length > 0 ? Number((monthlyRows.reduce((acc, m) => acc + m.temperature.avg, 0) / monthlyRows.length).toFixed(1)) : 0

  // Yearly overall summary
  const yOverallAqi = yearlyRows.length > 0 ? Math.round(yearlyRows.reduce((acc, y) => acc + y.usAqi.avg, 0) / yearlyRows.length) : 0
  const yOverallRain = yearlyRows.reduce((acc, y) => acc + y.totalRain, 0)
  const yMinTemp = yearlyRows.length > 0 ? Math.min(...yearlyRows.map(y => y.temperature.min)) : 0
  const yMaxTemp = yearlyRows.length > 0 ? Math.max(...yearlyRows.map(y => y.temperature.max)) : 0
  const yAvgTemp = yearlyRows.length > 0 ? Number((yearlyRows.reduce((acc, y) => acc + y.temperature.avg, 0) / yearlyRows.length).toFixed(1)) : 0

  return {
    city: String(meta.city),
    state: String(meta.state),
    totalReadings: Number(meta.cnt ?? 0),
    firstReading: String(meta.first_ts ?? ''),
    lastReading: String(meta.last_ts ?? ''),
    sevenDays: {
      summary: {
        temperature: {
          min: Number(Number(s7.min_temp ?? 0).toFixed(1)),
          max: Number(Number(s7.max_temp ?? 0).toFixed(1)),
          avg: Number(Number(s7.avg_temp ?? 0).toFixed(1))
        },
        apparentTemperature: {
          min: Number(Number(s7.min_feels ?? 0).toFixed(1)),
          max: Number(Number(s7.max_feels ?? 0).toFixed(1)),
          avg: Number(Number(s7.avg_feels ?? 0).toFixed(1))
        },
        usAqi: {
          min: Math.round(Number(s7.min_aqi ?? 0)),
          max: Math.round(Number(s7.max_aqi ?? 0)),
          avg: s7AvgAqi
        },
        aqiCategory: getAqiCategoryInfo(s7AvgAqi),
        pm25: {
          min: Number(Number(s7.min_pm25 ?? 0).toFixed(1)),
          max: Number(Number(s7.max_pm25 ?? 0).toFixed(1)),
          avg: Number(Number(s7.avg_pm25 ?? 0).toFixed(1))
        },
        pm10: {
          min: Number(Number(s7.min_pm10 ?? 0).toFixed(1)),
          max: Number(Number(s7.max_pm10 ?? 0).toFixed(1)),
          avg: Number(Number(s7.avg_pm10 ?? 0).toFixed(1))
        },
        humidity: {
          min: Math.round(Number(s7.min_humidity ?? 0)),
          max: Math.round(Number(s7.max_humidity ?? 0)),
          avg: Math.round(Number(s7.avg_humidity ?? 0))
        },
        windSpeed: {
          min: Number(Number(s7.min_wind ?? 0).toFixed(1)),
          max: Number(Number(s7.max_wind ?? 0).toFixed(1)),
          avg: Number(Number(s7.avg_wind ?? 0).toFixed(1))
        },
        totalRain: Number(Number(s7.total_rain ?? 0).toFixed(1))
      },
      days: sevenDaysRows
    },
    monthly: {
      summary: {
        temperature: { min: mMinTemp, max: mMaxTemp, avg: mAvgTemp },
        usAqi: {
          min: monthlyRows.length > 0 ? Math.min(...monthlyRows.map(m => m.usAqi.min)) : 0,
          max: monthlyRows.length > 0 ? Math.max(...monthlyRows.map(m => m.usAqi.max)) : 0,
          avg: mOverallAqi
        },
        aqiCategory: getAqiCategoryInfo(mOverallAqi),
        totalRain: Number(mOverallRain.toFixed(1))
      },
      months: monthlyRows
    },
    yearly: {
      summary: {
        temperature: { min: yMinTemp, max: yMaxTemp, avg: yAvgTemp },
        usAqi: {
          min: yearlyRows.length > 0 ? Math.min(...yearlyRows.map(y => y.usAqi.min)) : 0,
          max: yearlyRows.length > 0 ? Math.max(...yearlyRows.map(y => y.usAqi.max)) : 0,
          avg: yOverallAqi
        },
        aqiCategory: getAqiCategoryInfo(yOverallAqi),
        totalRain: Number(yOverallRain.toFixed(1))
      },
      years: yearlyRows
    },
    records: {
      hottest: {
        temperature: hotRow ? Number(Number(hotRow.temperature).toFixed(1)) : 0,
        feelsLike: hotRow ? Number(Number(hotRow.apparent_temperature).toFixed(1)) : 0,
        date: hotRow ? String(hotRow.timestamp_local || hotRow.timestamp_utc) : ''
      },
      coldest: {
        temperature: coldRow ? Number(Number(coldRow.temperature).toFixed(1)) : 0,
        date: coldRow ? String(coldRow.timestamp_local || coldRow.timestamp_utc) : ''
      },
      highestAqi: {
        aqi: maxAqiVal,
        date: highAqiRow ? String(highAqiRow.timestamp_local || highAqiRow.timestamp_utc) : '',
        category: getAqiCategoryInfo(maxAqiVal)
      },
      lowestAqi: {
        aqi: minAqiVal,
        date: lowAqiRow ? String(lowAqiRow.timestamp_local || lowAqiRow.timestamp_utc) : '',
        category: getAqiCategoryInfo(minAqiVal)
      },
      wettestDay: {
        rain: rainRow ? Number(Number(rainRow.precipitation).toFixed(1)) : 0,
        date: rainRow ? String(rainRow.timestamp_local || rainRow.timestamp_utc) : ''
      },
      maxWind: {
        wind: windRow ? Number(Number(windRow.wind_speed).toFixed(1)) : 0,
        date: windRow ? String(windRow.timestamp_local || windRow.timestamp_utc) : ''
      }
    },
    diurnal: {
      daytime: dayStats,
      nighttime: nightStats,
      tempVariance: Number((dayStats.avgTemp - nightStats.avgTemp).toFixed(1)),
      aqiVariance: dayStats.avgAqi - nightStats.avgAqi
    },
    aqiDistribution,
    pollutantChemistry
  }
}
