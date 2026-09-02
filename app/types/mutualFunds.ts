export interface MFHolding {
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
  holdingMode: string // 'DEMAT' | 'PHYSICAL'
  dematAccountId?: string
  brokerName?: string
}

export interface MFCategoryAllocation {
  name: string
  value: number
  percentage: number
}

export interface MFHoldingsResponse {
  holdings: MFHolding[]
  totalMFInvested: number
  totalMFCurrentValue: number
  totalMFPnL: number
  totalMFReturnPct: number
  categoryAllocation: MFCategoryAllocation[]
}

export interface MFTransaction {
  id: string
  portfolio_id: string
  scheme_code: number
  scheme_name: string
  amc_name: string
  category: string
  transaction_type: 'BUY_SIP' | 'BUY_LUMPSUM' | 'REDEMPTION'
  transaction_date: string
  nav: number
  units: number
  amount: number
  stamp_duty: number
  folio_number?: string
  holding_mode: string
  demat_account_id?: string
  broker_name?: string
  notes?: string
  created_at: number
}

export interface MFSchemeSearchItem {
  schemeCode: number
  schemeName: string
}

export interface MFDetailResponse {
  meta: {
    fund_house: string
    scheme_type: string
    scheme_category: string
    scheme_code: number
    scheme_name: string
  }
  latestNAV: number
  latestDate: string
  trailingReturns: {
    '1M': number | null
    '6M': number | null
    '1Y': number | null
    '3Y': number | null
    '5Y': number | null
  }
  chartPoints: Array<{ time: string; value: number }>
}
