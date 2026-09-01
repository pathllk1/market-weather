import { getTursoClient } from '../../utils/turso'

const VALID_SORT_COLUMNS = new Set([
  'overall_score',
  'percentage_change',
  'current_price',
  'price_change',
  'rsi_14',
  'symbol',
  'company_name',
  'adx_14',
  'mfi_14'
])

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const search = typeof query.search === 'string' ? query.search.trim() : ''
  const preset = typeof query.preset === 'string' ? query.preset.trim().toLowerCase() : 'all'

  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(100, Math.max(10, Number(query.limit) || 20))
  const offset = (page - 1) * limit

  let sortBy = typeof query.sortBy === 'string' && VALID_SORT_COLUMNS.has(query.sortBy) ? query.sortBy : 'overall_score'
  let sortOrder = typeof query.sortOrder === 'string' && query.sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC'

  // Apply default preset sorting if not explicitly specified
  if (!query.sortBy) {
    if (preset === 'gainers') {
      sortBy = 'percentage_change'
      sortOrder = 'DESC'
    } else if (preset === 'losers') {
      sortBy = 'percentage_change'
      sortOrder = 'ASC'
    } else if (preset === 'oversold') {
      sortBy = 'rsi_14'
      sortOrder = 'ASC'
    } else if (preset === 'overbought') {
      sortBy = 'rsi_14'
      sortOrder = 'DESC'
    }
  }

  const db = getTursoClient()

  // Build WHERE conditions safely with parameterized values
  const whereClauses: string[] = []
  const queryArgs: (string | number)[] = []

  if (search) {
    whereClauses.push('(symbol LIKE ? OR company_name LIKE ?)')
    const pattern = `%${search}%`
    queryArgs.push(pattern, pattern)
  }

  switch (preset) {
    case 'bullish':
      whereClauses.push('overall_score >= 75')
      break
    case 'oversold':
      whereClauses.push('rsi_14 <= 35')
      break
    case 'overbought':
      whereClauses.push('rsi_14 >= 70')
      break
    case 'macd_cross':
      whereClauses.push('macd_hist > 0 AND macd_line > macd_signal')
      break
    case 'gainers':
      whereClauses.push('percentage_change > 0')
      break
    case 'losers':
      whereClauses.push('percentage_change < 0')
      break
    case 'all':
    default:
      break
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

  // 1. Total Count for current filter
  const countSql = `SELECT COUNT(*) as total FROM technical_analysis ${whereSql}`
  const countRes = await db.execute({ sql: countSql, args: queryArgs })
  const total = Number(countRes.rows[0]?.total ?? 0)

  // 2. Fetch paginated records
  const fetchSql = `
    SELECT 
      symbol, company_name, current_price, price_change, percentage_change,
      overall_score, rsi_14, macd_line, macd_signal, macd_hist,
      supertrend_trend, supertrend_value, bb_upper, bb_lower,
      adx_14, mfi_14, stoch_k, stoch_d, last_updated
    FROM technical_analysis
    ${whereSql}
    ORDER BY ${sortBy} ${sortOrder}
    LIMIT ? OFFSET ?
  `
  const fetchRes = await db.execute({
    sql: fetchSql,
    args: [...queryArgs, limit, offset]
  })

  // 3. Market Summary Stats (overall breadth across the entire dataset)
  const summaryRes = await db.execute(`
    SELECT
      COUNT(*) as total_stocks,
      SUM(CASE WHEN overall_score >= 75 THEN 1 ELSE 0 END) as bullish_count,
      SUM(CASE WHEN overall_score <= 35 THEN 1 ELSE 0 END) as bearish_count,
      SUM(CASE WHEN overall_score > 35 AND overall_score < 75 THEN 1 ELSE 0 END) as neutral_count,
      AVG(overall_score) as avg_score,
      SUM(CASE WHEN percentage_change > 0 THEN 1 ELSE 0 END) as advancing_count,
      SUM(CASE WHEN percentage_change < 0 THEN 1 ELSE 0 END) as declining_count
    FROM technical_analysis
  `)

  const summaryRow = (summaryRes.rows[0] ?? {}) as Record<string, unknown>

  return {
    stocks: fetchRes.rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    },
    summary: {
      totalStocks: Number(summaryRow.total_stocks || 0),
      bullishCount: Number(summaryRow.bullish_count || 0),
      bearishCount: Number(summaryRow.bearish_count || 0),
      neutralCount: Number(summaryRow.neutral_count || 0),
      advancingCount: Number(summaryRow.advancing_count || 0),
      decliningCount: Number(summaryRow.declining_count || 0),
      avgScore: Math.round(Number(summaryRow.avg_score || 0))
    }
  }
})
