import type { AIReviewsListResponse, AITechnicalReviewResponse } from '~/types/market'
import { getTursoClient } from '../../utils/turso'

export default defineEventHandler(async (event): Promise<AIReviewsListResponse> => {
  const query = getQuery(event)
  const search = typeof query.search === 'string' ? query.search.trim().toUpperCase() : ''
  const rating = typeof query.rating === 'string' ? query.rating.trim() : ''
  const sortBy = typeof query.sortBy === 'string' ? query.sortBy : 'ai_score'
  const sortOrder = query.sortOrder === 'asc' ? 'ASC' : 'DESC'
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 100))

  const db = getTursoClient()

  // 1. Fetch aggregate statistics
  let stats = {
    total: 0,
    bullishCount: 0,
    bearishCount: 0,
    neutralCount: 0,
    avgAiScore: 0,
    lastRunTime: undefined as string | undefined
  }

  try {
    const statsRes = await db.execute(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN ai_score >= 56 THEN 1 ELSE 0 END) as bullish_count,
        SUM(CASE WHEN ai_score <= 44 THEN 1 ELSE 0 END) as bearish_count,
        SUM(CASE WHEN ai_score >= 45 AND ai_score <= 55 THEN 1 ELSE 0 END) as neutral_count,
        ROUND(AVG(ai_score), 1) as avg_score,
        MAX(updated_at) as latest_update
      FROM ai_technical_reviews
    `)
    const row = statsRes.rows[0]
    if (row) {
      const latestTs = Number(row.latest_update)
      stats = {
        total: Number(row.total || 0),
        bullishCount: Number(row.bullish_count || 0),
        bearishCount: Number(row.bearish_count || 0),
        neutralCount: Number(row.neutral_count || 0),
        avgAiScore: Number(row.avg_score || 0),
        lastRunTime: !isNaN(latestTs) && latestTs > 0 ? new Date(latestTs).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : undefined
      }
    }
  } catch (statsErr) {
    console.warn('[AI Reviews List API] Stats error:', statsErr)
  }

  // 2. Fetch records with dynamic filtering and sorting
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

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  // Valid sort columns
  const allowedSortCols: Record<string, string> = {
    ai_score: 'ai_score',
    current_price: 'current_price',
    updated_at: 'updated_at',
    symbol: 'symbol',
    algorithmic_score: 'algorithmic_score'
  }
  const sortCol = allowedSortCols[sortBy] || 'ai_score'

  const sql = `
    SELECT * FROM ai_technical_reviews
    ${whereClause}
    ORDER BY ${sortCol} ${sortOrder}
    LIMIT ?
  `
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

      const updatedTs = Number(row.updated_at)

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
        generatedAt: !isNaN(updatedTs) && updatedTs > 0
          ? new Date(updatedTs).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          : 'N/A',
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
