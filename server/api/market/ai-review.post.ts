import type { AITechnicalReviewResponse } from '~/types/market'
import { getTursoClient } from '../../utils/turso'
import { getLiveQuotes } from '../../utils/yahoo'
import { generateAITechnicalReview, type RawTechnicalInput } from '../../utils/groq'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const rawSymbol = typeof body?.symbol === 'string' ? body.symbol.trim().toUpperCase() : ''
  const forceRefresh = Boolean(body?.forceRefresh)

  if (!rawSymbol) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Stock symbol is required'
    })
  }

  const symbolWithNs = rawSymbol.endsWith('.NS') || rawSymbol.endsWith('.BO') ? rawSymbol : `${rawSymbol}.NS`
  const symbolWithoutNs = rawSymbol.replace(/\.(NS|BO)$/i, '')

  const db = getTursoClient()

  // 1. If not forcing a fresh review, check if we already have a saved review in Turso DB
  if (!forceRefresh) {
    try {
      const savedRes = await db.execute({
        sql: 'SELECT * FROM ai_technical_reviews WHERE symbol IN (?, ?) LIMIT 1',
        args: [symbolWithoutNs, symbolWithNs]
      })
      const saved = savedRes.rows[0] as Record<string, unknown> | undefined
      if (saved) {
        let keyStrengths: string[] = []
        let keyRisks: string[] = []
        let technicalLevels = {
          support1: 0,
          support2: 0,
          resistance1: 0,
          resistance2: 0,
          stopLoss: 0
        }

        try {
          keyStrengths = JSON.parse(String(saved.key_strengths || '[]'))
        } catch {
          keyStrengths = []
        }
        try {
          keyRisks = JSON.parse(String(saved.key_risks || '[]'))
        } catch {
          keyRisks = []
        }
        try {
          technicalLevels = JSON.parse(String(saved.technical_levels || '{}'))
        } catch {
          // fallback to defaults
        }

        const cachedResponse: AITechnicalReviewResponse = {
          symbol: String(saved.symbol),
          companyName: String(saved.company_name),
          currentPrice: Number(saved.current_price),
          aiScore: Number(saved.ai_score),
          aiRating: saved.ai_rating as AITechnicalReviewResponse['aiRating'],
          confidence: saved.confidence as AITechnicalReviewResponse['confidence'],
          timeHorizon: String(saved.time_horizon),
          executiveSummary: String(saved.executive_summary),
          keyStrengths,
          keyRisks,
          technicalLevels,
          tradingTactics: String(saved.trading_tactics),
          modelUsed: String(saved.model_used),
          generatedAt: new Date(Number(saved.updated_at)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          isCached: true,
          algorithmicScore: Number(saved.algorithmic_score)
        }
        return cachedResponse
      }
    } catch (cacheErr) {
      console.warn(`[AI Review API] Error reading cached review for ${rawSymbol}:`, cacheErr)
    }
  }

  // 2. Fetch complete technical analysis row matching with or without .NS
  let tech: Record<string, unknown> | undefined

  try {
    const techRes = await db.execute({
      sql: 'SELECT * FROM technical_analysis WHERE symbol IN (?, ?) LIMIT 1',
      args: [symbolWithNs, symbolWithoutNs]
    })
    tech = techRes.rows[0] as Record<string, unknown> | undefined
  } catch (dbErr) {
    console.warn(`[AI Review API] DB query error for ${rawSymbol}:`, dbErr)
  }

  // 2. Fetch 52-week range from the last 252 sessions of historical_candles
  let high52w = 0
  let low52w = 0
  let avgVolume52w = 0

  try {
    const statsRes = await db.execute({
      sql: `
        SELECT 
          MAX(high) as high_52w,
          MIN(low) as low_52w,
          AVG(volume) as avg_volume_52w
        FROM (
          SELECT high, low, volume 
          FROM historical_candles 
          WHERE symbol IN (?, ?) 
          ORDER BY date DESC 
          LIMIT 252
        )
      `,
      args: [symbolWithNs, symbolWithoutNs]
    })
    const row = statsRes.rows[0] as Record<string, unknown> | undefined
    if (row) {
      high52w = Number(row.high_52w || 0)
      low52w = Number(row.low_52w || 0)
      avgVolume52w = Math.round(Number(row.avg_volume_52w || 0))
    }
  } catch (statsErr) {
    console.warn(`[AI Review API] 52W stats query error for ${rawSymbol}:`, statsErr)
  }

  let currentPrice = Number(tech?.current_price || 0)
  let priceChange = Number(tech?.price_change || 0)
  let percentageChange = Number(tech?.percentage_change || 0)

  // 3. Sync with real-time live quotes if available
  try {
    const liveQuotes = await getLiveQuotes([symbolWithNs])
    const liveQuote = liveQuotes[symbolWithNs] || liveQuotes[symbolWithoutNs]
    if (liveQuote && liveQuote.price > 0) {
      currentPrice = liveQuote.price
      priceChange = liveQuote.change
      percentageChange = liveQuote.changePercent
    }
  } catch {
    // Non-fatal, keep precomputed prices
  }

  // If stock is not in database, reject request (no fake or demo data)
  if (!tech) {
    throw createError({
      statusCode: 404,
      statusMessage: `Stock symbol '${rawSymbol}' does not have technical analysis data in the database.`
    })
  }

  const companyName = String(tech.company_name || symbolWithoutNs)
  const algorithmicScore = Number(tech.overall_score || 50)

  // 4. Construct sanitized technical input: EXCLUDE overall_score and overall_rating!
  const technicalInput: RawTechnicalInput = {
    symbol: symbolWithoutNs,
    companyName,
    currentPrice,
    priceChange,
    percentageChange,
    high52w: high52w || undefined,
    low52w: low52w || undefined,
    avgVolume52w: avgVolume52w || undefined,
    rsi14: tech?.rsi_14 !== undefined ? Number(tech.rsi_14) : undefined,
    macd: tech
      ? {
          line: Number(tech.macd_line || 0),
          signal: Number(tech.macd_signal || 0),
          hist: Number(tech.macd_hist || 0)
        }
      : undefined,
    supertrend: tech
      ? {
          trend: String(tech.supertrend_trend || ''),
          value: Number(tech.supertrend_value || 0)
        }
      : undefined,
    volatility: tech
      ? {
          bbUpper: Number(tech.bb_upper || 0),
          bbMiddle: Number(tech.bb_middle || 0),
          bbLower: Number(tech.bb_lower || 0),
          atr: Number(tech.atr_14 || 0)
        }
      : undefined,
    momentum: tech
      ? {
          adx: Number(tech.adx_14 || 0),
          plusDi: Number(tech.plus_di_14 || 0),
          minusDi: Number(tech.minus_di_14 || 0),
          stochK: Number(tech.stoch_k || 0),
          stochD: Number(tech.stoch_d || 0),
          mfi: Number(tech.mfi_14 || 0),
          williamsR: Number(tech.williams_r_14 || 0),
          cci: Number(tech.cci_20 || 0),
          roc: Number(tech.roc_12 || 0)
        }
      : undefined,
    volume: tech
      ? {
          obv: Number(tech.obv || 0),
          vwap: Number(tech.vwap || 0)
        }
      : undefined,
    movingAverages: tech
      ? {
          sma10: Number(tech.sma_10 || 0),
          sma20: Number(tech.sma_20 || 0),
          sma30: Number(tech.sma_30 || 0),
          sma50: Number(tech.sma_50 || 0),
          sma100: Number(tech.sma_100 || 0),
          sma200: Number(tech.sma_200 || 0),
          ema10: Number(tech.ema_10 || 0),
          ema20: Number(tech.ema_20 || 0),
          ema30: Number(tech.ema_30 || 0),
          ema50: Number(tech.ema_50 || 0),
          ema100: Number(tech.ema_100 || 0),
          ema200: Number(tech.ema_200 || 0)
        }
      : undefined
  }

  // 5. Generate independent AI Review (passes only raw indicator values, with algorithmicScore attached for UI comparison only)
  const result = await generateAITechnicalReview(technicalInput, algorithmicScore, forceRefresh)

  // 6. Save or update the freshly generated review in Turso database
  try {
    const now = Date.now()
    await db.execute({
      sql: `
        INSERT INTO ai_technical_reviews (
          symbol, company_name, current_price, ai_score, ai_rating,
          confidence, time_horizon, executive_summary, key_strengths,
          key_risks, technical_levels, trading_tactics, model_used,
          algorithmic_score, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol) DO UPDATE SET
          company_name = excluded.company_name,
          current_price = excluded.current_price,
          ai_score = excluded.ai_score,
          ai_rating = excluded.ai_rating,
          confidence = excluded.confidence,
          time_horizon = excluded.time_horizon,
          executive_summary = excluded.executive_summary,
          key_strengths = excluded.key_strengths,
          key_risks = excluded.key_risks,
          technical_levels = excluded.technical_levels,
          trading_tactics = excluded.trading_tactics,
          model_used = excluded.model_used,
          algorithmic_score = excluded.algorithmic_score,
          updated_at = excluded.updated_at;
      `,
      args: [
        symbolWithoutNs,
        result.companyName,
        result.currentPrice,
        result.aiScore,
        result.aiRating,
        result.confidence,
        result.timeHorizon,
        result.executiveSummary,
        JSON.stringify(result.keyStrengths),
        JSON.stringify(result.keyRisks),
        JSON.stringify(result.technicalLevels),
        result.tradingTactics,
        result.modelUsed,
        result.algorithmicScore,
        now,
        now
      ]
    })
  } catch (saveErr) {
    console.warn(`[AI Review API] Non-fatal error saving review to DB for ${rawSymbol}:`, saveErr)
  }

  return result
})
