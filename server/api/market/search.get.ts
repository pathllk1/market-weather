import { getTursoClient } from '../../utils/turso'

export interface MarketSearchResult {
  symbol: string
  cleanSymbol: string
  companyName: string
  price: number
  change: number
  changePercent: number
  overallScore: number
  rsi?: number
}

export default defineEventHandler(async (event): Promise<{ results: MarketSearchResult[] }> => {
  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.trim() : ''

  const db = getTursoClient()

  if (!q) {
    // Return top high-volume/score equities when search is empty
    const res = await db.execute({
      sql: `SELECT symbol, company_name, current_price, price_change, percentage_change, overall_score, rsi_14
            FROM technical_analysis
            ORDER BY overall_score DESC
            LIMIT 15`,
      args: []
    })

    const results: MarketSearchResult[] = res.rows.map((r) => {
      const sym = String(r.symbol)
      return {
        symbol: sym,
        cleanSymbol: sym.replace(/\.NS$/, ''),
        companyName: String(r.company_name || sym),
        price: Number(r.current_price || 0),
        change: Number(r.price_change || 0),
        changePercent: Number(r.percentage_change || 0),
        overallScore: Number(r.overall_score || 50),
        rsi: r.rsi_14 !== null && r.rsi_14 !== undefined ? Number(r.rsi_14) : undefined
      }
    })

    return { results }
  }

  // Normalize query for search: strip .NS if user typed it, uppercase
  const cleanQ = q.replace(/\.NS$/i, '').toUpperCase()
  const containsPattern = `%${cleanQ}%`
  const startsWithPattern = `${cleanQ}%`

  const res = await db.execute({
    sql: `SELECT symbol, company_name, current_price, price_change, percentage_change, overall_score, rsi_14
          FROM technical_analysis
          WHERE symbol LIKE ? OR company_name LIKE ?
          ORDER BY 
            CASE WHEN symbol LIKE ? THEN 0 ELSE 1 END,
            overall_score DESC
          LIMIT 15`,
    args: [containsPattern, containsPattern, startsWithPattern]
  })

  const results: MarketSearchResult[] = res.rows.map((r) => {
    const sym = String(r.symbol)
    return {
      symbol: sym,
      cleanSymbol: sym.replace(/\.NS$/, ''),
      companyName: String(r.company_name || sym),
      price: Number(r.current_price || 0),
      change: Number(r.price_change || 0),
      changePercent: Number(r.percentage_change || 0),
      overallScore: Number(r.overall_score || 50),
      rsi: r.rsi_14 !== null && r.rsi_14 !== undefined ? Number(r.rsi_14) : undefined
    }
  })

  return { results }
})
