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
