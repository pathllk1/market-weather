import { ref, computed } from 'vue'
import type {
  CityLatestWeather,
  NationalWeatherPulse,
  WeatherHistoryResponse
} from '~/types/weather'

export function useWeather() {
  const cities = useState<CityLatestWeather[]>('weather_cities', () => [])
  const pulse = useState<NationalWeatherPulse | null>('weather_pulse', () => null)
  const selectedCity = useState<CityLatestWeather | null>('weather_selected_city', () => null)
  const historyData = useState<WeatherHistoryResponse | null>('weather_history', () => null)

  const isLoading = ref(false)
  const isHistoryLoading = ref(false)
  const isModalOpen = ref(false)
  const error = ref<string | null>(null)

  // Filtering & Sorting State
  const searchQuery = ref('')
  const selectedState = ref('ALL')
  const aqiFilter = ref<'ALL' | 'GOOD' | 'MODERATE' | 'POOR' | 'SEVERE' | 'RAIN'>('ALL')
  const sortKey = ref<'aqi' | 'temp' | 'humidity' | 'rain' | 'city'>('aqi')
  const sortOrder = ref<'asc' | 'desc'>('desc')
  const selectedRange = ref<'24h' | '7d' | '30d' | '90d' | 'all'>('7d')

  async function fetchLatest(force = false) {
    try {
      isLoading.value = true
      error.value = null

      const res: any = await $fetch(`/api/weather/latest${force ? '?refresh=true' : ''}`)
      if (res.success && res.data) {
        cities.value = res.data.cities
        pulse.value = res.data.pulse
      }
    } catch (err: any) {
      error.value = err?.data?.statusMessage || err?.message || 'Failed to load weather data.'
    } finally {
      isLoading.value = false
    }
  }

  async function fetchCityHistory(cityName: string, range = '7d') {
    try {
      isHistoryLoading.value = true
      selectedRange.value = range as any

      const res: any = await $fetch(`/api/weather/history?city=${encodeURIComponent(cityName)}&range=${range}`)
      if (res.success && res.data) {
        historyData.value = res.data
      }
    } catch (err: any) {
      console.error('Failed to load city history:', err)
    } finally {
      isHistoryLoading.value = false
    }
  }

  function openCityModal(city: CityLatestWeather) {
    selectedCity.value = city
    isModalOpen.value = true
    fetchCityHistory(city.city, selectedRange.value)
  }

  function closeCityModal() {
    isModalOpen.value = false
  }

  function changeRange(range: '24h' | '7d' | '30d' | '90d' | 'all') {
    if (selectedCity.value) {
      fetchCityHistory(selectedCity.value.city, range)
    }
  }

  // Available unique states with count
  const availableStates = computed(() => {
    const counts: Record<string, number> = {}
    for (const c of cities.value) {
      counts[c.state] = (counts[c.state] || 0) + 1
    }
    const list = Object.keys(counts).sort().map(st => ({
      state: st,
      count: counts[st] ?? 0
    }))
    return [{ state: 'ALL', count: cities.value.length }, ...list]
  })

  // Filtered and sorted list
  const filteredCities = computed(() => {
    let list = [...cities.value]

    // 1. Search Query
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim()
      list = list.filter(c =>
        c.city.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q)
      )
    }

    // 2. State Filter
    if (selectedState.value !== 'ALL') {
      list = list.filter(c => c.state === selectedState.value)
    }

    // 3. AQI / Status Filter
    if (aqiFilter.value === 'GOOD') {
      list = list.filter(c => c.usAqi <= 50)
    } else if (aqiFilter.value === 'MODERATE') {
      list = list.filter(c => c.usAqi > 50 && c.usAqi <= 100)
    } else if (aqiFilter.value === 'POOR') {
      list = list.filter(c => c.usAqi > 100 && c.usAqi <= 200)
    } else if (aqiFilter.value === 'SEVERE') {
      list = list.filter(c => c.usAqi > 200)
    } else if (aqiFilter.value === 'RAIN') {
      list = list.filter(c => c.precipitation > 0)
    }

    // 4. Sorting
    list.sort((a, b) => {
      let valA: any
      let valB: any

      if (sortKey.value === 'aqi') {
        valA = a.usAqi
        valB = b.usAqi
      } else if (sortKey.value === 'temp') {
        valA = a.temperature
        valB = b.temperature
      } else if (sortKey.value === 'humidity') {
        valA = a.relativeHumidity
        valB = b.relativeHumidity
      } else if (sortKey.value === 'rain') {
        valA = a.precipitation
        valB = b.precipitation
      } else {
        valA = a.city
        valB = b.city
      }

      if (typeof valA === 'string') {
        return sortOrder.value === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA)
      }

      return sortOrder.value === 'asc' ? valA - valB : valB - valA
    })

    return list
  })

  function toggleSort(key: 'aqi' | 'temp' | 'humidity' | 'rain' | 'city') {
    if (sortKey.value === key) {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortKey.value = key
      sortOrder.value = 'desc'
    }
  }

  return {
    cities,
    pulse,
    selectedCity,
    historyData,
    isLoading,
    isHistoryLoading,
    isModalOpen,
    error,
    searchQuery,
    selectedState,
    aqiFilter,
    sortKey,
    sortOrder,
    selectedRange,
    availableStates,
    filteredCities,
    fetchLatest,
    fetchCityHistory,
    openCityModal,
    closeCityModal,
    changeRange,
    toggleSort
  }
}
