export type AqiLevel =
  | 'good'
  | 'moderate'
  | 'unhealthy-sensitive'
  | 'unhealthy'
  | 'very-unhealthy'
  | 'hazardous'

export interface AqiCategoryInfo {
  level: AqiLevel
  label: string
  color: 'success' | 'warning' | 'error' | 'primary' | 'neutral'
  badgeClass: string
  textClass: string
  bgClass: string
  description: string
  healthAdvisory: string
}

export interface WeatherConditionInfo {
  code: number
  description: string
  icon: string
  category: 'clear' | 'cloudy' | 'rain' | 'thunderstorm' | 'fog' | 'snow'
}

export interface WeatherAqiReading {
  id?: number
  timestampUtc: string
  timestampLocal: string
  city: string
  state: string
  latitude: number
  longitude: number
  temperature: number
  apparentTemperature: number
  relativeHumidity: number
  precipitation: number
  windSpeed: number
  weatherCode: number
  usAqi: number
  pm25: number
  pm10: number
  carbonMonoxide: number
  nitrogenDioxide: number
  sulphurDioxide: number
  ozone: number
  createdAt?: string
}

export interface CityLatestWeather extends WeatherAqiReading {
  aqiCategory: AqiCategoryInfo
  weatherCondition: WeatherConditionInfo
}

export interface NationalWeatherPulse {
  totalCities: number
  totalReadings: number
  lastUpdatedUtc: string
  lastUpdatedLocal: string
  nationalAvgAqi: number
  nationalAqiCategory: AqiCategoryInfo
  cleanestCity: {
    city: string
    state: string
    aqi: number
    temperature: number
  }
  mostPollutedCity: {
    city: string
    state: string
    aqi: number
    pm25: number
    primaryPollutant: string
  }
  hottestCity: {
    city: string
    state: string
    temperature: number
    feelsLike: number
  }
  coldestCity: {
    city: string
    state: string
    temperature: number
  }
  activeRainCount: number
  activeRainCities: string[]
  highestRainCity?: {
    city: string
    state: string
    precipitation: number
  }
}

export interface WeatherHistoryPoint {
  timestampUtc: string
  timestampLocal: string
  temperature: number
  apparentTemperature: number
  relativeHumidity: number
  precipitation: number
  windSpeed: number
  usAqi: number
  pm25: number
  pm10: number
  carbonMonoxide?: number
  nitrogenDioxide?: number
  sulphurDioxide?: number
  ozone?: number
}

export interface WeatherHistoryResponse {
  city: string
  state: string
  latitude: number
  longitude: number
  range: string
  totalPoints: number
  latest: CityLatestWeather
  history: WeatherHistoryPoint[]
}

export interface WeatherRankingsResponse {
  cleanestCities: Array<{ city: string; state: string; aqi: number; pm25: number }>
  mostPollutedCities: Array<{ city: string; state: string; aqi: number; pm25: number; pm10: number }>
  hottestCities: Array<{ city: string; state: string; temperature: number; feelsLike: number }>
  coldestCities: Array<{ city: string; state: string; temperature: number }>
  wettestCities: Array<{ city: string; state: string; precipitation: number }>
}

export interface MarketWeatherSectorImpact {
  sector: string
  metric: string
  status: 'positive' | 'neutral' | 'watch' | 'negative'
  summary: string
  stocks: Array<{
    symbol: string
    name: string
    correlationFactor: string
  }>
}

export interface StatMetric {
  min: number
  max: number
  avg: number
}

export interface PeriodAggregatedRow {
  period: string
  label: string
  readingsCount: number
  temperature: StatMetric
  apparentTemperature?: StatMetric
  usAqi: StatMetric
  aqiCategory: AqiCategoryInfo
  pm25: StatMetric
  pm10: StatMetric
  humidity: StatMetric
  windSpeed: StatMetric
  totalRain: number
}

export interface CityWeatherStats {
  city: string
  state: string
  totalReadings: number
  firstReading: string
  lastReading: string
  sevenDays: {
    summary: {
      temperature: StatMetric
      apparentTemperature: StatMetric
      usAqi: StatMetric
      aqiCategory: AqiCategoryInfo
      pm25: StatMetric
      pm10: StatMetric
      humidity: StatMetric
      windSpeed: StatMetric
      totalRain: number
    }
    days: PeriodAggregatedRow[]
  }
  monthly: {
    summary: {
      temperature: StatMetric
      usAqi: StatMetric
      aqiCategory: AqiCategoryInfo
      totalRain: number
    }
    months: PeriodAggregatedRow[]
  }
  yearly: {
    summary: {
      temperature: StatMetric
      usAqi: StatMetric
      aqiCategory: AqiCategoryInfo
      totalRain: number
    }
    years: PeriodAggregatedRow[]
  }
  records: {
    hottest: { temperature: number; date: string; feelsLike: number }
    coldest: { temperature: number; date: string }
    highestAqi: { aqi: number; date: string; category: AqiCategoryInfo }
    lowestAqi: { aqi: number; date: string; category: AqiCategoryInfo }
    wettestDay: { rain: number; date: string }
    maxWind: { wind: number; date: string }
  }
  diurnal: {
    daytime: { avgTemp: number; avgAqi: number; avgHumidity: number; hoursCount: number }
    nighttime: { avgTemp: number; avgAqi: number; avgHumidity: number; hoursCount: number }
    tempVariance: number
    aqiVariance: number
  }
  aqiDistribution: Array<{
    category: string
    level: AqiLevel
    count: number
    percentage: number
    color: string
    badgeClass: string
  }>
  pollutantChemistry: Array<{
    pollutant: string
    name: string
    unit: string
    min: number
    max: number
    avg: number
    whoLimit: number
    status: 'safe' | 'moderate' | 'excess'
  }>
}
