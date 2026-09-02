import { getTursoClient } from '~~/server/utils/turso'
import { getLatestNAV } from '~~/server/utils/mfapi'

export interface MFHoldingSummary {
  schemeCode: number
  schemeName: string
  amcName: string
  category: string
  totalUnits: number
  avgNav: number
  currentNav: number
  previousNav: number
  navDate: string
  oneDayChange: number
  oneDayChangePct: number
  totalInvested: number
  currentValue: number
  unrealizedPnL: number
  unrealizedPnLPct: number
  allocationPct: number
  folioNumber?: string
  holdingMode: string
  dematAccountId?: string
  brokerName?: string
}

export default defineEventHandler(async (event) => {
  const portfolioId = getRouterParam(event, 'id')
  if (!portfolioId) {
    throw createError({ statusCode: 400, statusMessage: 'Portfolio ID is required' })
  }

  const db = getTursoClient()
  const txRes = await db.execute({
    sql: `SELECT t.*, d.broker_name, d.account_name as demat_account_name
          FROM portfolio_mf_transactions t
          LEFT JOIN demat_accounts d ON t.demat_account_id = d.id
          WHERE t.portfolio_id = ?
          ORDER BY t.transaction_date ASC, t.created_at ASC`,
    args: [portfolioId]
  })

  const transactions = txRes.rows as any[]

  // Group by scheme_code
  const schemeMap = new Map<number, {
    schemeCode: number
    schemeName: string
    amcName: string
    category: string
    units: number
    invested: number
    folioNumber?: string
    holdingMode: string
    dematAccountId?: string
    brokerName?: string
  }>()

  for (const tx of transactions) {
    const code = Number(tx.scheme_code)
    const existing = schemeMap.get(code) || {
      schemeCode: code,
      schemeName: tx.scheme_name,
      amcName: tx.amc_name,
      category: tx.category,
      units: 0,
      invested: 0,
      folioNumber: tx.folio_number || undefined,
      holdingMode: tx.holding_mode || 'DEMAT',
      dematAccountId: tx.demat_account_id || undefined,
      brokerName: tx.broker_name || undefined
    }

    const txUnits = Number(tx.units) || 0
    const txAmount = Number(tx.amount) || 0

    if (tx.transaction_type === 'BUY_SIP' || tx.transaction_type === 'BUY_LUMPSUM') {
      existing.units += txUnits
      existing.invested += txAmount
    } else if (tx.transaction_type === 'REDEMPTION') {
      const avgCost = existing.units > 0 ? (existing.invested / existing.units) : 0
      existing.units = Math.max(0, existing.units - txUnits)
      existing.invested = Math.max(0, existing.invested - (txUnits * avgCost))
    }

    schemeMap.set(code, existing)
  }

  // Filter out schemes with 0 units
  const activeSchemes = Array.from(schemeMap.values()).filter(s => s.units > 0.0001)

  // Fetch live NAVs concurrently
  const navPromises = activeSchemes.map(s => getLatestNAV(s.schemeCode))
  const navResults = await Promise.all(navPromises)

  let totalMFInvested = 0
  let totalMFCurrentValue = 0

  const holdings: MFHoldingSummary[] = activeSchemes.map((s, idx) => {
    const navInfo = navResults[idx]
    const curNav = navInfo?.currentNav || s.invested / s.units
    const prevNav = navInfo?.previousNav || curNav
    const curVal = Number((s.units * curNav).toFixed(2))
    const pnl = Number((curVal - s.invested).toFixed(2))
    const pnlPct = s.invested > 0 ? Number(((pnl / s.invested) * 100).toFixed(2)) : 0

    totalMFInvested += s.invested
    totalMFCurrentValue += curVal

    return {
      schemeCode: s.schemeCode,
      schemeName: s.schemeName,
      amcName: s.amcName,
      category: s.category,
      totalUnits: Number(s.units.toFixed(4)),
      avgNav: Number((s.invested / s.units).toFixed(4)),
      currentNav: curNav,
      previousNav: prevNav,
      navDate: navInfo?.navDate || '',
      oneDayChange: navInfo?.oneDayChange || 0,
      oneDayChangePct: navInfo?.oneDayChangePct || 0,
      totalInvested: Number(s.invested.toFixed(2)),
      currentValue: curVal,
      unrealizedPnL: pnl,
      unrealizedPnLPct: pnlPct,
      allocationPct: 0, // computed below
      folioNumber: s.folioNumber,
      holdingMode: s.holdingMode,
      dematAccountId: s.dematAccountId,
      brokerName: s.brokerName
    }
  })

  // Calculate allocation %
  for (const h of holdings) {
    h.allocationPct = totalMFCurrentValue > 0 ? Number(((h.currentValue / totalMFCurrentValue) * 100).toFixed(1)) : 0
  }

  // Category breakdown
  const categoryMap = new Map<string, number>()
  for (const h of holdings) {
    const cat = h.category || 'Other'
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + h.currentValue)
  }

  const categoryAllocation = Array.from(categoryMap.entries()).map(([name, val]) => ({
    name,
    value: Number(val.toFixed(2)),
    percentage: totalMFCurrentValue > 0 ? Number(((val / totalMFCurrentValue) * 100).toFixed(1)) : 0
  }))

  const totalMFPnL = Number((totalMFCurrentValue - totalMFInvested).toFixed(2))
  const totalMFReturnPct = totalMFInvested > 0 ? Number(((totalMFPnL / totalMFInvested) * 100).toFixed(2)) : 0

  return {
    holdings,
    totalMFInvested: Number(totalMFInvested.toFixed(2)),
    totalMFCurrentValue: Number(totalMFCurrentValue.toFixed(2)),
    totalMFPnL,
    totalMFReturnPct,
    categoryAllocation
  }
})
