import { getDocumentProxy } from 'unpdf'
import { findSchemeByISIN, searchMutualFunds, parseCategoryFromScheme } from './mfapi'

export interface CASInvestorInfo {
  name: string
  email: string
  mobile?: string
  pan?: string
  address?: string
  statementPeriod?: string
  totalCost?: number
  totalMarketValue?: number
}

export interface CASTransaction {
  tempId: string
  schemeCode: number
  schemeName: string
  amcName: string
  category: string
  isin: string
  folioNumber: string
  holdingMode: 'DEMAT' | 'PHYSICAL'
  transactionType: 'BUY_SIP' | 'BUY_LUMPSUM' | 'REDEMPTION'
  transactionDate: string // YYYY-MM-DD
  amount: number
  units: number
  nav: number
  stampDuty: number
  runningBalance?: number
  description: string
  isReversal?: boolean
  isDuplicate?: boolean
  selected?: boolean
}

export interface CASSchemeSummary {
  schemeKey: string
  casSchemeName: string
  isin: string
  folioNumber: string
  holdingMode: 'DEMAT' | 'PHYSICAL'
  amcName: string
  category: string
  matchedSchemeCode: number | null
  matchedSchemeName: string | null
  mfapiStatus: 'MATCHED' | 'UNMATCHED' | 'MANUAL'
  closingUnitBalance: number
  calculatedUnitBalance: number
  unitsReconciled: boolean
  transactionCount: number
  totalInvested: number
  selected: boolean
}

export interface CASParseResult {
  success: boolean
  investor: CASInvestorInfo
  schemes: CASSchemeSummary[]
  transactions: CASTransaction[]
  totalTransactions: number
  error?: string
}

// Convert "DD-Mon-YYYY" (e.g. "07-Oct-2020") to "YYYY-MM-DD"
const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
}

export function parseCASDate(dateStr: string): string {
  const parts = dateStr.trim().split('-')
  if (parts.length === 3) {
    const day = parts[0]!.padStart(2, '0')
    const mon = MONTH_MAP[parts[1]!.toLowerCase().slice(0, 3)] || '01'
    const year = parts[2]!
    return `${year}-${mon}-${day}`
  }
  return dateStr
}

function cleanNumber(val: string): number {
  if (!val) return 0
  const clean = val.replace(/,/g, '').replace(/\((.*?)\)/, '-$1').trim()
  const num = parseFloat(clean)
  return isNaN(num) ? 0 : num
}

/**
 * Extracts lines using layout coordinates (X/Y) so table columns are preserved
 */
async function extractLinesWithLayout(page: any): Promise<string[]> {
  const content = await page.getTextContent()
  const linesMap = new Map<number, any[]>()

  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue
    // Cluster Y coordinate within ~4 units
    const y = Math.round(item.transform[5] / 4) * 4
    if (!linesMap.has(y)) linesMap.set(y, [])
    linesMap.get(y)!.push(item)
  }

  // Sort descending by Y (top of page to bottom)
  const sortedY = Array.from(linesMap.keys()).sort((a, b) => b - a)
  const lines: string[] = []

  for (const y of sortedY) {
    const items = linesMap.get(y)!
    items.sort((a, b) => a.transform[4] - b.transform[4])
    // Join items with whitespace
    const lineText = items.map(it => it.str.trim()).filter(Boolean).join('   ')
    if (lineText) lines.push(lineText)
  }

  return lines
}

export async function parseCASPDF(pdfBuffer: Uint8Array, password?: string): Promise<CASParseResult> {
  try {
    const pdf = await getDocumentProxy(pdfBuffer, { password: password || undefined })
    const totalPages = pdf.numPages

    const investor: CASInvestorInfo = {
      name: '',
      email: '',
      mobile: '',
      pan: '',
      statementPeriod: '',
      totalCost: 0,
      totalMarketValue: 0
    }

    const allLines: { page: number; text: string }[] = []

    for (let pIdx = 1; pIdx <= totalPages; pIdx++) {
      const page = await pdf.getPage(pIdx)
      const pageLines = await extractLinesWithLayout(page)
      for (const pl of pageLines) {
        allLines.push({ page: pIdx, text: pl })
      }
    }

    // 1. Parse Investor & Statement Header
    for (let i = 0; i < Math.min(allLines.length, 60); i++) {
      const line = allLines[i]!.text

      const periodMatch = line.match(/(\d{2}-[A-Za-z]{3}-\d{4}\s+To\s+\d{2}-[A-Za-z]{3}-\d{4})/i)
      if (periodMatch && !investor.statementPeriod) investor.statementPeriod = periodMatch[1]

      const emailMatch = line.match(/Email\s*(?:Id)?:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)
      if (emailMatch && !investor.email) {
        investor.email = emailMatch[1] || ''
      }

      // Find investor name: in CAMS CAS, it is typically an uppercase full name in the header
      if (!investor.name && i < 20) {
        const trimmed = line.trim()
        if (/^[A-Z\s.]{3,35}$/.test(trimmed) &&
            !trimmed.includes('CONSOLIDATED') &&
            !trimmed.includes('STATEMENT') &&
            !trimmed.includes('ACCOUNT') &&
            !trimmed.includes('VERSION') &&
            !trimmed.includes('PAGE') &&
            !trimmed.includes('LIVE')) {
          investor.name = trimmed
        }
      }

      const mobileMatch = line.match(/Mobile:\s*(\+?[0-9\s-]+)/i)
      if (mobileMatch && !investor.mobile) investor.mobile = mobileMatch[1]?.trim()

      const panMatch = line.match(/PAN:\s*([A-Z]{5}[0-9]{4}[A-Z])/i)
      if (panMatch && !investor.pan) investor.pan = panMatch[1]

      const totalMatch = line.match(/Total\s+([0-9,.]+)\s+([0-9,.]+)/i)
      if (totalMatch && !investor.totalCost) {
        investor.totalCost = cleanNumber(totalMatch[1] || '0')
        investor.totalMarketValue = cleanNumber(totalMatch[2] || '0')
      }
    }

    interface RawSchemeBlock {
      casSchemeName: string
      isin: string
      folioNumber: string
      holdingMode: 'DEMAT' | 'PHYSICAL'
      amcName: string
      closingBalance: number
      startLineIdx: number
      endLineIdx: number
    }

    const schemeBlocks: RawSchemeBlock[] = []

    // 2. Identify Scheme Boundaries
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i]!.text

      let isin: string | null = null
      const isinMatch = line.match(/ISIN:\s*([A-Z0-9]{12})/i)
      if (isinMatch) {
        isin = isinMatch[1]!.toUpperCase()
      } else {
        const splitMatch = line.match(/ISIN:\s*([A-Z0-9]{6,11})$/i)
        if (splitMatch && i + 1 < allLines.length) {
          const nextPart = allLines[i + 1]!.text.match(/^([A-Z0-9]{1,6})/i)
          if (nextPart) {
            const combined = (splitMatch[1]! + nextPart[1]!).toUpperCase()
            if (combined.length === 12 && combined.startsWith('INF')) {
              isin = combined
            }
          }
        }
      }

      if (isin) {
        const isDemat = line.toLowerCase().includes('(demat') && !line.toLowerCase().includes('non-demat') && !line.toLowerCase().includes('non demat')
        const holdingMode: 'DEMAT' | 'PHYSICAL' = isDemat ? 'DEMAT' : 'PHYSICAL'

        // Folio No within nearby lines
        let folio = ''
        for (let k = Math.max(0, i - 4); k < Math.min(allLines.length, i + 8); k++) {
          const fMatch = allLines[k]!.text.match(/Folio\s*No:\s*([0-9\s/]+)/i)
          if (fMatch) {
            folio = fMatch[1]!.replace(/\s+/g, '').trim()
            break
          }
        }

        // Scheme Name: Look at current line and up to 2 preceding lines
        let candidateLines = [line]
        if (i > 0 && !allLines[i - 1]!.text.includes('PAN:') && !allLines[i - 1]!.text.includes('Closing')) {
          candidateLines.unshift(allLines[i - 1]!.text)
        }
        if (i > 1 && !allLines[i - 2]!.text.includes('PAN:') && !allLines[i - 2]!.text.includes('Closing') && candidateLines.length < 2) {
          candidateLines.unshift(allLines[i - 2]!.text)
        }

        let sName = candidateLines.join(' ')
        sName = sName.replace(/ISIN:.*$/i, '')
                     .replace(/\(Non-?Demat\s*\)/gi, '')
                     .replace(/\(Demat\s*\)/gi, '')
                     .replace(/Registrar\s*:.*$/i, '')
                     .replace(/^[A-Z0-9]+-/, '')
                     .replace(/^[-–\s]+/, '')
                     .trim()

        // AMC Name
        let amc = 'Mutual Fund'
        const AMC_LIST = [
          'Axis Mutual Fund', 'HDFC Mutual Fund', 'ICICI Prudential Mutual Fund',
          'Aditya Birla Sun Life Mutual Fund', 'SBI Mutual Fund', 'Kotak Mutual Fund',
          'Nippon India Mutual Fund', 'UTI Mutual Fund', 'Tata Mutual Fund',
          'Mirae Asset Mutual Fund', 'DSP Mutual Fund', 'Parag Parikh Mutual Fund'
        ]
        for (let b = Math.max(0, i - 15); b <= i; b++) {
          for (const aName of AMC_LIST) {
            if (allLines[b]!.text.toLowerCase().includes(aName.toLowerCase())) {
              amc = aName
              break
            }
          }
        }

        schemeBlocks.push({
          casSchemeName: sName,
          isin,
          folioNumber: folio || 'DEFAULT',
          holdingMode,
          amcName: amc,
          closingBalance: 0,
          startLineIdx: i,
          endLineIdx: allLines.length - 1
        })
      }
    }

    for (let s = 0; s < schemeBlocks.length; s++) {
      if (s < schemeBlocks.length - 1) {
        schemeBlocks[s]!.endLineIdx = schemeBlocks[s + 1]!.startLineIdx - 1
      }
    }

    // 3. Extract Transactions per Scheme Block
    const transactions: CASTransaction[] = []
    const schemes: CASSchemeSummary[] = []
    const datePattern = /^(\d{2}-[A-Za-z]{3}-\d{4})\s+(.*)$/

    for (let sIdx = 0; sIdx < schemeBlocks.length; sIdx++) {
      const block = schemeBlocks[sIdx]!
      const blockLines = allLines.slice(block.startLineIdx, block.endLineIdx + 1)

      let closingUnits = 0
      for (const bl of blockLines) {
        const cbMatch = bl.text.match(/Closing\s*Unit\s*Balance:\s*([0-9,.]+)/i)
        if (cbMatch) {
          closingUnits = cleanNumber(cbMatch[1] || '0')
          break
        }
      }

      // Pre-match scheme with MFAPI via ISIN
      const mfapiMatch = await findSchemeByISIN(block.isin)
      let matchedSchemeCode = mfapiMatch ? mfapiMatch.schemeCode : null
      let matchedSchemeName = mfapiMatch ? mfapiMatch.schemeName : null

      if (!matchedSchemeCode) {
        const searchResults = await searchMutualFunds(block.casSchemeName.slice(0, 30))
        if (searchResults.length > 0) {
          matchedSchemeCode = searchResults[0]!.schemeCode
          matchedSchemeName = searchResults[0]!.schemeName
        }
      }

      const category = parseCategoryFromScheme(matchedSchemeName || block.casSchemeName)

      let calculatedUnits = 0
      let totalInvested = 0
      const schemeTxns: CASTransaction[] = []
      let lastPurchaseTxn: CASTransaction | null = null

      for (let lIdx = 0; lIdx < blockLines.length; lIdx++) {
        const lineText = blockLines[lIdx]!.text.trim()
        const match = lineText.match(datePattern)
        if (!match) continue

        const rawDate = match[1]!
        const rest = match[2]!.trim()

        if (rest.includes('*** Address Updated') ||
            rest.includes('*** Registration of Nominee') ||
            rest.includes('***SIP Registered***') ||
            rest.includes('***SIPTerminated***')) {
          continue
        }

        // Stamp duty attachment
        if (rest.includes('*** Stamp Duty ***')) {
          const dutyMatch = rest.match(/([0-9.]+)/)
          const dutyNum = dutyMatch ? cleanNumber(dutyMatch[1]!) : 0
          if (lastPurchaseTxn && dutyNum > 0) {
            lastPurchaseTxn.stampDuty = dutyNum
            lastPurchaseTxn.amount = Number((lastPurchaseTxn.amount + dutyNum).toFixed(2))
          }
          continue
        }

        if (rest.includes('*** STT Paid ***')) continue

        // Extract tokens separated by multiple spaces (layout mode)
        const parts = rest.split(/\s{2,}/).map(p => p.trim()).filter(Boolean)
        if (parts.length < 2) continue

        // Layout format: [Description, Amount, Units, Price/NAV, Unit Balance]
        // or [Description, Amount, Units, Price]
        let desc = parts[0] || 'Purchase'
        let amount = 0
        let units = 0
        let nav = 0
        let runningBal = 0

        // Parse numerical columns from the rest of parts
        const numericParts = parts.slice(1).map(p => cleanNumber(p))

        if (numericParts.length >= 4) {
          amount = numericParts[0]!
          units = numericParts[1]!
          nav = numericParts[2]!
          runningBal = numericParts[3]!
        } else if (numericParts.length === 3) {
          amount = numericParts[0]!
          units = numericParts[1]!
          nav = numericParts[2]!
        } else if (numericParts.length === 2) {
          amount = numericParts[0]!
          units = numericParts[1]!
          nav = units > 0 ? Number((Math.abs(amount) / Math.abs(units)).toFixed(4)) : 10
        } else {
          continue
        }

        const absAmount = Math.abs(amount)
        const absUnits = Math.abs(units)
        if (absUnits <= 0 && absAmount <= 0) continue

        let txType: 'BUY_SIP' | 'BUY_LUMPSUM' | 'REDEMPTION' = 'BUY_SIP'
        const lowerDesc = desc.toLowerCase()

        if (lowerDesc.includes('redemption')) {
          txType = 'REDEMPTION'
        } else if (lowerDesc.includes('sip') || lowerDesc.includes('systematic')) {
          txType = 'BUY_SIP'
        } else {
          txType = 'BUY_LUMPSUM'
        }

        const isReversal = lowerDesc.includes('reversal') || lowerDesc.includes('rejection') || lowerDesc.includes('insufficient balance')

        const txn: CASTransaction = {
          tempId: `cas_${sIdx}_${schemeTxns.length}_${Date.now()}`,
          schemeCode: matchedSchemeCode || 0,
          schemeName: matchedSchemeName || block.casSchemeName,
          amcName: block.amcName,
          category,
          isin: block.isin,
          folioNumber: block.folioNumber,
          holdingMode: block.holdingMode,
          transactionType: txType,
          transactionDate: parseCASDate(rawDate),
          amount: absAmount,
          units: absUnits,
          nav: nav > 0 ? nav : (absUnits > 0 ? Number((absAmount / absUnits).toFixed(4)) : 10),
          stampDuty: 0,
          runningBalance: runningBal,
          description: desc,
          isReversal,
          isDuplicate: false,
          selected: !isReversal
        }

        if (!isReversal) {
          if (txType === 'REDEMPTION') {
            calculatedUnits -= absUnits
          } else {
            calculatedUnits += absUnits
            totalInvested += absAmount
          }
        }

        if (txType !== 'REDEMPTION' && !isReversal) {
          lastPurchaseTxn = txn
        } else {
          lastPurchaseTxn = null
        }

        schemeTxns.push(txn)
      }

      const diff = Math.abs(calculatedUnits - closingUnits)
      const isReconciled = diff < 0.05 || closingUnits === 0

      const schemeSummary: CASSchemeSummary = {
        schemeKey: `${block.isin}_${block.folioNumber}`,
        casSchemeName: block.casSchemeName,
        isin: block.isin,
        folioNumber: block.folioNumber,
        holdingMode: block.holdingMode,
        amcName: block.amcName,
        category,
        matchedSchemeCode,
        matchedSchemeName,
        mfapiStatus: matchedSchemeCode ? 'MATCHED' : 'UNMATCHED',
        closingUnitBalance: Number(closingUnits.toFixed(4)),
        calculatedUnitBalance: Number(calculatedUnits.toFixed(4)),
        unitsReconciled: isReconciled,
        transactionCount: schemeTxns.length,
        totalInvested: Number(totalInvested.toFixed(2)),
        selected: schemeTxns.length > 0
      }

      schemes.push(schemeSummary)
      transactions.push(...schemeTxns)
    }

    return {
      success: true,
      investor,
      schemes,
      transactions,
      totalTransactions: transactions.length
    }
  } catch (err: any) {
    console.error('Error in parseCASPDF:', err)
    return {
      success: false,
      investor: { name: '', email: '' },
      schemes: [],
      transactions: [],
      totalTransactions: 0,
      error: err?.message || 'Failed to parse CAS statement PDF'
    }
  }
}
