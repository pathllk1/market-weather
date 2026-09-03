export interface MFSchemeSearchItem {
  schemeCode: number
  schemeName: string
}

export interface MFNavDataPoint {
  date: string // "DD-MM-YYYY"
  nav: string
}

export interface MFMeta {
  fund_house: string
  scheme_type: string
  scheme_category: string
  scheme_code: number
  scheme_name: string
}

export interface MFDetailsResponse {
  meta: MFMeta
  data: MFNavDataPoint[]
  status?: string
}

// In-memory cache for fast lookups
const searchCache = new Map<string, { timestamp: number; data: MFSchemeSearchItem[] }>()
const detailsCache = new Map<number, { timestamp: number; data: MFDetailsResponse }>()
const CACHE_TTL_MS = 1000 * 60 * 30 // 30 minutes

// Safe fetch helper for both Nuxt and standalone Node runtimes
async function doFetch<T>(url: string, timeoutMs = 10000): Promise<T> {
  if (typeof $fetch !== 'undefined') {
    return (await $fetch(url, { timeout: timeoutMs })) as T
  }
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return (await res.json()) as T
  } finally {
    clearTimeout(id)
  }
}

export async function searchMutualFunds(query: string): Promise<MFSchemeSearchItem[]> {
  const cleanQ = (query || '').trim().toLowerCase()
  if (!cleanQ || cleanQ.length < 2) return []

  const cached = searchCache.get(cleanQ)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  try {
    const res = await doFetch<MFSchemeSearchItem[]>(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(cleanQ)}`, 8000)
    const items = Array.isArray(res) ? res : []
    searchCache.set(cleanQ, { timestamp: Date.now(), data: items })
    return items
  } catch (err: any) {
    console.error(`MFAPI search failed for query "${cleanQ}":`, err?.message || err)
    return []
  }
}

export async function getMutualFundDetails(schemeCode: number): Promise<MFDetailsResponse | null> {
  if (!schemeCode || schemeCode <= 0) return null

  const cached = detailsCache.get(schemeCode)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  try {
    const res = await doFetch<MFDetailsResponse>(`https://api.mfapi.in/mf/${schemeCode}`, 10000)
    if (res && res.meta && Array.isArray(res.data)) {
      detailsCache.set(schemeCode, { timestamp: Date.now(), data: res })
      return res
    }
    return null
  } catch (err: any) {
    console.error(`MFAPI details failed for scheme ${schemeCode}:`, err?.message || err)
    return null
  }
}

export async function getLatestNAV(schemeCode: number): Promise<{
  currentNav: number
  previousNav: number
  navDate: string
  oneDayChange: number
  oneDayChangePct: number
  meta: MFMeta | null
} | null> {
  const details = await getMutualFundDetails(schemeCode)
  if (!details || !details.data || details.data.length === 0) {
    return null
  }

  const latest = details.data[0]
  const prev = details.data[1] || latest
  const curNav = Number(latest?.nav) || 0
  const prevNav = Number(prev?.nav) || curNav
  const change = curNav - prevNav
  const changePct = prevNav > 0 ? (change / prevNav) * 100 : 0

  return {
    currentNav: curNav,
    previousNav: prevNav,
    navDate: latest?.date || '',
    oneDayChange: Number(change.toFixed(4)),
    oneDayChangePct: Number(changePct.toFixed(2)),
    meta: details.meta
  }
}

export function parseCategoryFromScheme(schemeName: string): string {
  const s = (schemeName || '').toLowerCase()
  if (s.includes('flexi cap')) return 'Flexi Cap Fund'
  if (s.includes('small cap')) return 'Small Cap Fund'
  if (s.includes('mid-cap') || s.includes('mid cap')) return 'Mid Cap Fund'
  if (s.includes('large & mid') || s.includes('large and mid')) return 'Large & Mid Cap Fund'
  if (s.includes('large cap') || s.includes('bluechip') || s.includes('top 100')) return 'Large Cap Fund'
  if (s.includes('elss') || s.includes('tax saver')) return 'ELSS (Tax Saver)'
  if (s.includes('liquid') || s.includes('overnight') || s.includes('money market')) return 'Liquid / Debt Fund'
  if (s.includes('hybrid') || s.includes('balanced') || s.includes('advantage')) return 'Hybrid Fund'
  if (s.includes('arbitrage')) return 'Arbitrage Fund'
  if (s.includes('index') || s.includes('nifty') || s.includes('sensex')) return 'Index / ETF'
  return 'Other Equity Fund'
}

export interface MFMasterSchemeItem {
  schemeCode: number
  schemeName: string
  isinGrowth?: string | null
  isinDivReinvestment?: string | null
}

let masterListCache: { timestamp: number; isinMap: Map<string, MFMasterSchemeItem>; items: MFMasterSchemeItem[] } | null = null
const MASTER_TTL_MS = 1000 * 60 * 60 * 12 // 12 hours

export async function getMFMasterList(): Promise<Map<string, MFMasterSchemeItem>> {
  if (masterListCache && Date.now() - masterListCache.timestamp < MASTER_TTL_MS) {
    return masterListCache.isinMap
  }

  try {
    const list = await doFetch<MFMasterSchemeItem[]>('https://api.mfapi.in/mf', 15000)
    const isinMap = new Map<string, MFMasterSchemeItem>()
    if (Array.isArray(list)) {
      for (const item of list) {
        if (item.isinGrowth) {
          isinMap.set(item.isinGrowth.trim().toUpperCase(), item)
        }
        if (item.isinDivReinvestment) {
          isinMap.set(item.isinDivReinvestment.trim().toUpperCase(), item)
        }
      }
      masterListCache = { timestamp: Date.now(), isinMap, items: list }
    }
    return isinMap
  } catch (err: any) {
    console.error('Failed to load MFAPI master scheme list:', err?.message || err)
    return masterListCache?.isinMap || new Map()
  }
}

export async function findSchemeByISIN(isin: string): Promise<MFMasterSchemeItem | null> {
  const clean = (isin || '').trim().toUpperCase()
  if (!clean) return null
  const isinMap = await getMFMasterList()
  const direct = isinMap.get(clean)
  if (direct) return direct

  // If truncated in PDF (e.g. INF109K015)
  if (clean.length >= 8 && masterListCache?.items) {
    const found = masterListCache.items.find(it => 
      (it.isinGrowth && it.isinGrowth.toUpperCase().startsWith(clean)) ||
      (it.isinDivReinvestment && it.isinDivReinvestment.toUpperCase().startsWith(clean))
    )
    if (found) return found
  }
  return null
}

