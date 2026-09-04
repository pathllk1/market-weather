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
  MarketWeatherSectorImpact
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
