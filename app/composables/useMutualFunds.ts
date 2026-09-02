import type { MFHoldingsResponse, MFDetailResponse, MFSchemeSearchItem } from '../types/mutualFunds'

export function useMutualFunds() {
  const isSearching = ref(false)
  const isActionLoading = ref(false)

  async function searchFunds(query: string): Promise<MFSchemeSearchItem[]> {
    if (!query || query.trim().length < 2) return []
    try {
      isSearching.value = true
      const res = await $fetch<{ results: MFSchemeSearchItem[] }>('/api/mf/search', {
        query: { q: query.trim() }
      })
      return res.results || []
    } catch (err) {
      console.error('Failed to search mutual funds:', err)
      return []
    } finally {
      isSearching.value = false
    }
  }

  async function fetchFundDetails(schemeCode: number): Promise<MFDetailResponse | null> {
    if (!schemeCode) return null
    try {
      const res = await $fetch<MFDetailResponse>(`/api/mf/${schemeCode}`)
      return res
    } catch (err) {
      console.error(`Failed to fetch details for scheme ${schemeCode}:`, err)
      return null
    }
  }

  async function fetchMFHoldings(portfolioId: string): Promise<MFHoldingsResponse | null> {
    if (!portfolioId) return null
    try {
      const res = await $fetch<MFHoldingsResponse>(`/api/portfolio/${portfolioId}/mf/holdings`)
      return res
    } catch (err) {
      console.error('Failed to fetch MF holdings:', err)
      return null
    }
  }

  async function logMFTransaction(portfolioId: string, payload: any): Promise<boolean> {
    if (!portfolioId) return false
    try {
      isActionLoading.value = true
      await $fetch(`/api/portfolio/${portfolioId}/mf/transactions`, {
        method: 'POST',
        body: payload
      })
      return true
    } catch (err: any) {
      console.error('Failed to log MF transaction:', err)
      alert(err?.data?.statusMessage || 'Failed to record mutual fund investment')
      return false
    } finally {
      isActionLoading.value = false
    }
  }

  async function deleteMFTransaction(portfolioId: string, txId: string): Promise<boolean> {
    if (!portfolioId || !txId) return false
    try {
      await $fetch(`/api/portfolio/${portfolioId}/mf/transactions/${txId}`, {
        method: 'DELETE'
      })
      return true
    } catch (err) {
      console.error('Failed to delete MF transaction:', err)
      return false
    }
  }

  function getCategoryBadgeColor(category: string): 'primary' | 'success' | 'warning' | 'error' | 'neutral' {
    const c = (category || '').toLowerCase()
    if (c.includes('flexi') || c.includes('multi')) return 'primary'
    if (c.includes('large') || c.includes('bluechip')) return 'success'
    if (c.includes('small') || c.includes('mid')) return 'warning'
    if (c.includes('debt') || c.includes('liquid') || c.includes('money')) return 'neutral'
    if (c.includes('elss') || c.includes('tax')) return 'error'
    return 'primary'
  }

  return {
    isSearching,
    isActionLoading,
    searchFunds,
    fetchFundDetails,
    fetchMFHoldings,
    logMFTransaction,
    deleteMFTransaction,
    getCategoryBadgeColor
  }
}
