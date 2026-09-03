import { getTursoClient } from '~~/server/utils/turso'
import { getMutualFundDetails, getLatestNAV } from '~~/server/utils/mfapi'
import { calculateXIRR, type CashFlow } from '~~/server/utils/xirr'

export interface SchemeDetailResponse {
  schemeCode: number
  schemeName: string
  amcName: string
  category: string
  folioNumber?: string
  holdingMode: string
  dematAccountId?: string
  brokerName?: string
  totalUnits: number
  avgNav: number
  currentNav: number
  previousNav: number
  oneDayChange: number
  oneDayChangePct: number
  totalInvested: number
  currentValue: number
  unrealizedPnL: number
  unrealizedPnLPct: number
  realizedPnL: number
  xirr: number | null
  firstInvestmentDate?: string
  daysInvested?: number
  transactions: Array<{
    id: string
    transactionType: string
    transactionDate: string
    amount: number
    units: number
    nav: number
    stampDuty: number
    runningUnits: number
    folioNumber?: string
    notes?: string
  }>
  historicalNav: Array<{
    time: string // YYYY-MM-DD
    value: number
  }>
  buyMarkers: Array<{
    time: string // YYYY-MM-DD
    type: string
    amount: number
    units: number
    nav: number
  }>
}

export default defineEventHandler(async (event) => {
  const portfolioId = getRouterParam(event, 'id')
  const codeParam = getRouterParam(event, 'code')
  const schemeCode = Number(codeParam)

  if (!portfolioId || !schemeCode) {
    throw createError({ statusCode: 400, statusMessage: 'Portfolio ID and Scheme Code are required' })
  }

  const db = getTursoClient()

  // 1. Fetch transactions for this scheme in this portfolio
  const txRes = await db.execute({
    sql: `SELECT t.*, d.broker_name, d.account_name as demat_account_name
          FROM portfolio_mf_transactions t
          LEFT JOIN demat_accounts d ON t.demat_account_id = d.id
          WHERE t.portfolio_id = ? AND t.scheme_code = ?
          ORDER BY t.transaction_date ASC, t.created_at ASC`,
    args: [portfolioId, schemeCode]
  })

  const rawTxns = txRes.rows as any[]
  if (rawTxns.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'No transactions found for this scheme' })
  }

  const firstTx = rawTxns[0]
  const schemeName = firstTx.scheme_name || `Scheme #${schemeCode}`
  const amcName = firstTx.amc_name || 'Mutual Fund'
  const category = firstTx.category || 'Other Equity Fund'
  const folioNumber = firstTx.folio_number || undefined
  const holdingMode = firstTx.holding_mode || 'PHYSICAL'
  const dematAccountId = firstTx.demat_account_id || undefined
  const brokerName = firstTx.broker_name || undefined

  // 2. Calculate position, realized P&L, running units, and cash flows for XIRR
  let currentUnits = 0
  let totalInvested = 0
  let realizedPnL = 0
  const cashFlows: CashFlow[] = []
  const buyMarkers: Array<{ time: string; type: string; amount: number; units: number; nav: number }> = []

  // Running ledger items
  const processedTxns = rawTxns.map((tx) => {
    const txUnits = Number(tx.units) || 0
    const txAmount = Number(tx.amount) || 0
    const txNav = Number(tx.nav) || 0
    const txDate = String(tx.transaction_date)

    if (tx.transaction_type === 'BUY_SIP' || tx.transaction_type === 'BUY_LUMPSUM') {
      currentUnits += txUnits
      totalInvested += txAmount
      cashFlows.push({ date: txDate, amount: -txAmount })

      buyMarkers.push({
        time: txDate,
        type: tx.transaction_type,
        amount: txAmount,
        units: txUnits,
        nav: txNav
      })
    } else if (tx.transaction_type === 'REDEMPTION') {
      const avgCost = currentUnits > 0 ? (totalInvested / currentUnits) : 0
      const costOfUnitsSold = txUnits * avgCost
      const gain = txAmount - costOfUnitsSold
      realizedPnL += gain

      currentUnits = Math.max(0, currentUnits - txUnits)
      totalInvested = Math.max(0, totalInvested - costOfUnitsSold)
      cashFlows.push({ date: txDate, amount: txAmount })
    }

    return {
      id: String(tx.id),
      transactionType: String(tx.transaction_type),
      transactionDate: txDate,
      amount: txAmount,
      units: txUnits,
      nav: txNav,
      stampDuty: Number(tx.stamp_duty) || 0,
      runningUnits: Number(currentUnits.toFixed(4)),
      folioNumber: tx.folio_number || undefined,
      notes: tx.notes || undefined
    }
  })

  // 3. Fetch latest live NAV & MF details
  const [navInfo, mfDetails] = await Promise.all([
    getLatestNAV(schemeCode),
    getMutualFundDetails(schemeCode)
  ])

  const curNav = navInfo?.currentNav || (rawTxns[rawTxns.length - 1]?.nav ? Number(rawTxns[rawTxns.length - 1].nav) : 10)
  const prevNav = navInfo?.previousNav || curNav
  const oneDayChange = navInfo?.oneDayChange || 0
  const oneDayChangePct = navInfo?.oneDayChangePct || 0

  const currentValue = Number((currentUnits * curNav).toFixed(2))
  const avgNav = currentUnits > 0 ? Number((totalInvested / currentUnits).toFixed(4)) : 0
  const unrealizedPnL = Number((currentValue - totalInvested).toFixed(2))
  const unrealizedPnLPct = totalInvested > 0 ? Number(((unrealizedPnL / totalInvested) * 100).toFixed(2)) : 0

  // 4. Calculate XIRR
  const todayStr = new Date().toISOString().split('T')[0]!
  if (currentValue > 0) {
    cashFlows.push({ date: todayStr, amount: currentValue })
  }

  const xirr = calculateXIRR(cashFlows)

  // Inception & duration
  const firstInvestmentDate = rawTxns[0]?.transaction_date
  let daysInvested = 0
  if (firstInvestmentDate) {
    const d1 = new Date(firstInvestmentDate).getTime()
    const d2 = Date.now()
    daysInvested = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)))
  }

  // 5. Format historical NAV series for TradingView lightweight-charts
  const historicalNav: Array<{ time: string; value: number }> = []
  if (mfDetails && Array.isArray(mfDetails.data)) {
    // mfDetails.data is sorted latest to earliest, so reverse it to ascending
    const reversed = [...mfDetails.data].reverse()
    for (const pt of reversed) {
      if (!pt.date || !pt.nav) continue
      // Date format is DD-MM-YYYY in mfapi
      const parts = pt.date.split('-')
      if (parts.length === 3) {
        const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`
        const navNum = Number(pt.nav)
        if (!isNaN(navNum) && navNum > 0) {
          historicalNav.push({ time: isoDate, value: navNum })
        }
      }
    }
  }

  // Reverse processed transactions for UI display (newest first)
  const displayTransactions = [...processedTxns].reverse()

  return {
    schemeCode,
    schemeName,
    amcName,
    category,
    folioNumber,
    holdingMode,
    dematAccountId,
    brokerName,
    totalUnits: Number(currentUnits.toFixed(4)),
    avgNav,
    currentNav: curNav,
    previousNav: prevNav,
    oneDayChange,
    oneDayChangePct,
    totalInvested: Number(totalInvested.toFixed(2)),
    currentValue,
    unrealizedPnL,
    unrealizedPnLPct,
    realizedPnL: Number(realizedPnL.toFixed(2)),
    xirr,
    firstInvestmentDate,
    daysInvested,
    transactions: displayTransactions,
    historicalNav,
    buyMarkers
  }
})
