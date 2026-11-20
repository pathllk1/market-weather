import type { AIReviewsListResponse, AITechnicalReviewResponse } from '~/types/market'
import { getTursoClient } from '../../utils/turso'

export default defineEventHandler(async (event): Promise<AIReviewsListResponse> => {
  const query = getQuery(event)
  const search = typeof query.search === 'string' ? query.search.trim().toUpperCase() : ''
  const rating = typeof query.rating === 'string' ? query.rating.trim() : ''
  const timeframe = typeof query.timeframe === 'string' ? query.timeframe.trim() : 'all'
  const sortBy = typeof query.sortBy === 'string' ? query.sortBy : 'smart_momentum'
  const sortOrder = query.sortOrder === 'asc' ? 'ASC' : 'DESC'
  let limit = Math.min(200, Math.max(1, Number(query.limit) || 100))

  const db = getTursoClient()
  const now = Date.now()
  const oneDayAgo = now - 24 * 60 * 60 * 1000

  // 1. Fetch aggregate statistics
  let stats: AIReviewsListResponse['stats'] = {
    total: 0,
    bullishCount: 0,
    bearishCount: 0,
    neutralCount: 0,
    avgAiScore: 0,
    lastRunTime: undefined,
    latestBatchCount: 0,
    todayCount: 0,
    latestRunTimestamp: 0
  }

  try {
    const statsRes = await db.execute({
      sql: `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN ai_score >= 56 THEN 1 ELSE 0 END) as bullish_count,
          SUM(CASE WHEN ai_score <= 44 THEN 1 ELSE 0 END) as bearish_count,
          SUM(CASE WHEN ai_score >= 45 AND ai_score <= 55 THEN 1 ELSE 0 END) as neutral_count,
          ROUND(AVG(ai_score), 1) as avg_score,
          MAX(updated_at) as latest_update,
          SUM(CASE WHEN updated_at >= ? THEN 1 ELSE 0 END) as today_count
        FROM ai_technical_reviews
      `,
      args: [oneDayAgo]
    })
    const row = statsRes.rows[0]
    if (row) {
      stats = {
        total: Number(row.total || 0),
        bullishCount: Number(row.bullish_count || 0),
        bearishCount: Number(row.bearish_count || 0),
        neutralCount: Number(row.neutral_count || 0),
        avgAiScore: Number(row.avg_score || 0),
        lastRunTime: formatMarketDateTime(row.latest_update),
        latestRunTimestamp: Number(row.latest_update || 0),
        todayCount: Number(row.today_count || 0),
        latestBatchCount: Math.min(20, Number(row.total || 0))
      }
    }
  } catch (statsErr) {
    console.warn('[AI Reviews List API] Stats error:', statsErr)
  }

  // 2. Determine Table Source (Batch isolated vs full catalog)
  const isLatestBatch = timeframe === 'latest_batch'
  const tableSource = isLatestBatch
    ? '(SELECT * FROM ai_technical_reviews ORDER BY updated_at DESC LIMIT 20) AS ai_technical_reviews'
    : 'ai_technical_reviews'

  if (isLatestBatch) {
    limit = 20
  }

  // 3. Dynamic Filtering Conditions
  const conditions: string[] = []
  const args: (string | number)[] = []

  if (search) {
    conditions.push('(symbol LIKE ? OR company_name LIKE ?)')
    args.push(`%${search}%`, `%${search}%`)
  }

  if (rating && rating !== 'all') {
    conditions.push('ai_rating = ?')
    args.push(rating)
  }

  if (timeframe === '24h' || timeframe === 'today') {
    conditions.push('updated_at >= ?')
    args.push(oneDayAgo)
  } else if (timeframe === '7d' || timeframe === 'week') {
    conditions.push('updated_at >= ?')
    args.push(now - 7 * 86400000)
  } else if (timeframe === 'top_conviction') {
    conditions.push('ai_score >= 76')
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  // 4. Smart Dynamic Sorting
  let sortExpr: string
  let sortPreArg: number | null = null

  if (sortBy === 'smart_momentum') {
    // Hybrid score: AI score with recency decay (1.5 pts per day of age)
    // Fresh reviews today take prominence over older high-score records
    sortExpr = '(ai_score - ((? - updated_at) / 86400000.0) * 1.5)'
    sortPreArg = now
  } else if (sortBy === 'consensus_delta') {
    sortExpr = '(ai_score - algorithmic_score)'
  } else if (sortBy === 'updated_at') {
    sortExpr = 'updated_at'
  } else if (sortBy === 'algorithmic_score') {
    sortExpr = 'algorithmic_score'
  } else if (sortBy === 'current_price') {
    sortExpr = 'current_price'
  } else if (sortBy === 'symbol') {
    sortExpr = 'symbol'
  } else {
    sortExpr = 'ai_score'
  }

  const sql = `
    SELECT * FROM ${tableSource}
    ${whereClause}
    ORDER BY ${sortExpr} ${sortOrder}
    LIMIT ?
  `

  if (sortPreArg !== null) {
    args.push(sortPreArg)
  }
  args.push(limit)

  try {
    const res = await db.execute({ sql, args })

    const reviews: AITechnicalReviewResponse[] = res.rows.map((row) => {
      let keyStrengths: string[]
      let keyRisks: string[]
      let technicalLevels = {
        support1: 0,
        support2: 0,
        resistance1: 0,
        resistance2: 0,
        stopLoss: 0
      }

      try {
        keyStrengths = JSON.parse(String(row.key_strengths || '[]'))
      } catch {
        keyStrengths = []
      }
      try {
        keyRisks = JSON.parse(String(row.key_risks || '[]'))
      } catch {
        keyRisks = []
      }
      try {
        technicalLevels = JSON.parse(String(row.technical_levels || '{}'))
      } catch {
        // fallback
      }

      return {
        symbol: String(row.symbol),
        companyName: String(row.company_name),
        currentPrice: Number(row.current_price),
        aiScore: Number(row.ai_score),
        aiRating: row.ai_rating as AITechnicalReviewResponse['aiRating'],
        confidence: row.confidence as AITechnicalReviewResponse['confidence'],
        timeHorizon: String(row.time_horizon),
        executiveSummary: String(row.executive_summary),
        keyStrengths,
        keyRisks,
        technicalLevels,
        tradingTactics: String(row.trading_tactics),
        modelUsed: String(row.model_used),
        generatedAt: formatMarketDateTime(row.updated_at) || 'N/A',
        updatedAt: Number(row.updated_at || 0),
        isCached: true,
        algorithmicScore: Number(row.algorithmic_score)
      }
    })

    return {
      total: stats.total,
      stats,
      reviews
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[AI Reviews List API] Failed to fetch reviews:', errMsg)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to load AI reviews: ${errMsg}`
    })
  }
})
