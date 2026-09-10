import { createClient } from '@libsql/client'
import fs from 'node:fs'

// 1. Load environment variables (Local .env or GitHub Actions env)
function loadEnv() {
  const env = { ...process.env }
  if (fs.existsSync('.env')) {
    const lines = fs.readFileSync('.env', 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim()
        const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
        if (!env[key]) {
          env[key] = val
        }
      }
    }
  }
  return env
}

const env = loadEnv()
const TURSO_URL = env.TURSO_DATABASE_URL || 'file:turso_security.db'
const TURSO_AUTH_TOKEN = env.TURSO_AUTH_TOKEN || undefined
const GROQ_API_KEY = env.GROQ_API_KEY?.trim()
const GROQ_MODEL = env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b'

if (!GROQ_API_KEY) {
  console.error('CRITICAL ERROR: GROQ_API_KEY is not defined in environment variables.')
  process.exit(1)
}

const db = createClient({
  url: TURSO_URL,
  authToken: TURSO_AUTH_TOKEN
})

// 2. Parse CLI Arguments
function parseArgs() {
  const args = process.argv.slice(2)
  const config = {
    minScore: 60,
    limit: 0,
    batchSize: 5,
    delayMs: 2000,
    batchDelayMs: 6000,
    maxRetries: 3,
    force: false,
    symbol: null
  }

  for (const arg of args) {
    if (arg.startsWith('--min-score=')) {
      config.minScore = Number(arg.split('=')[1]) || 60
    } else if (arg.startsWith('--limit=')) {
      config.limit = Number(arg.split('=')[1]) || 0
    } else if (arg.startsWith('--batch-size=')) {
      config.batchSize = Number(arg.split('=')[1]) || 5
    } else if (arg.startsWith('--delay-ms=')) {
      config.delayMs = Number(arg.split('=')[1]) || 2000
    } else if (arg.startsWith('--batch-delay-ms=')) {
      config.batchDelayMs = Number(arg.split('=')[1]) || 6000
    } else if (arg.startsWith('--max-retries=')) {
      config.maxRetries = Number(arg.split('=')[1]) || 3
    } else if (arg === '--force' || arg === '-f') {
      config.force = true
    } else if (arg.startsWith('--symbol=')) {
      config.symbol = arg.split('=')[1].trim().toUpperCase()
    }
  }
  return config
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// 3. Robust Groq API Caller with Exponential Backoff Retry
async function callGroqWithRetry(payload, maxRetries = 3) {
  let attempt = 0
  while (attempt < maxRetries) {
    attempt++
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          response_format: { type: 'json_object' },
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: `You are an elite quantitative technical analyst specializing in Indian equity markets (NSE/BSE).
Your task is to independently evaluate raw technical calculations and generate an unbiased technical review and independent AI score from 0 to 100.
IMPORTANT RULES:
1. You have NOT been given any internal score or predetermined rating. Evaluate purely based on mathematical confluence.
2. Score brackets:
   - 76 to 100: Strong Bullish (dominant uptrend, momentum expansion, price above major EMAs)
   - 56 to 75: Bullish (positive bias, constructive consolidation, healthy pullbacks)
   - 45 to 55: Neutral (range-bound, conflicting indicators, chop)
   - 25 to 44: Bearish (distribution, price below 50 EMA, deteriorating momentum)
   - 0 to 24: Strong Bearish (breakdown, severe divergence, multi-timeframe weakness)
3. Return ONLY a valid JSON object matching this exact structure:
{
  "aiScore": number (integer 0-100),
  "aiRating": "Strong Bullish" | "Bullish" | "Neutral" | "Bearish" | "Strong Bearish",
  "confidence": "High" | "Medium" | "Low",
  "timeHorizon": string (e.g. "1-4 Weeks (Swing)" or "1-5 Days (Momentum)"),
  "executiveSummary": string (2-3 punchy sentences on price action and trend health),
  "keyStrengths": string[] (array of 2 to 3 specific indicator observations that are bullish),
  "keyRisks": string[] (array of 2 to 3 specific technical warnings, divergences or resistance barriers),
  "technicalLevels": {
    "support1": number,
    "support2": number,
    "resistance1": number,
    "resistance2": number,
    "stopLoss": number
  },
  "tradingTactics": string (concrete guidance on entry zones, risk-reward setup, and trailing stops)
}`
            },
            {
              role: 'user',
              content: payload
            }
          ]
        })
      })

      if (response.ok) {
        const json = await response.json()
        const content = json.choices?.[0]?.message?.content
        if (!content) throw new Error('Empty completion content from Groq model')
        return JSON.parse(content)
      }

      const status = response.status
      const errorText = await response.text()

      // Retryable errors: 429 (Rate Limit), 500, 502, 503, 504
      if (status === 429 || (status >= 500 && status <= 504)) {
        const backoffMs = attempt * 3000
        console.warn(`[RETRY ${attempt}/${maxRetries}] Groq returned status ${status}. Waiting ${backoffMs / 1000}s before retrying...`)
        await sleep(backoffMs)
        continue
      } else {
        throw new Error(`Groq HTTP error ${status}: ${errorText}`)
      }
    } catch (err) {
      if (attempt < maxRetries) {
        const backoffMs = attempt * 3000
        console.warn(`[RETRY ${attempt}/${maxRetries}] Request exception: ${err.message}. Waiting ${backoffMs / 1000}s...`)
        await sleep(backoffMs)
      } else {
        throw err
      }
    }
  }
  throw new Error(`Failed to get response after ${maxRetries} attempts`)
}

// 4. Main Batch Runner
async function main() {
  const config = parseArgs()

  console.log('='.repeat(75))
  console.log('       AUTOMATED AI TECHNICAL REVIEW & SCORING PIPELINE')
  console.log('='.repeat(75))
  console.log(`Database URL      : ${TURSO_URL}`)
  console.log(`Groq Model        : ${GROQ_MODEL}`)
  console.log(`Min Score Filter  : >= ${config.minScore}`)
  console.log(`Stock Limit       : ${config.limit > 0 ? config.limit : 'ALL matching'}`)
  console.log(`Batch Size        : ${config.batchSize} stocks / batch`)
  console.log(`Inter-Stock Delay : ${config.delayMs} ms`)
  console.log(`Inter-Batch Delay : ${config.batchDelayMs} ms`)
  console.log(`Force Re-analyze  : ${config.force ? 'YES' : 'NO (skip stocks updated in last 16h)'}`)
  if (config.symbol) console.log(`Specific Symbol   : ${config.symbol}`)
  console.log('='.repeat(75) + '\n')

  // Query eligible stocks
  let query = 'SELECT * FROM technical_analysis WHERE overall_score >= ?'
  const args = [config.minScore]

  if (config.symbol) {
    query += ' AND (symbol = ? OR symbol = ?)'
    args.push(config.symbol, `${config.symbol}.NS`)
  }

  query += ' ORDER BY overall_score DESC'

  if (config.limit > 0) {
    query += ` LIMIT ${config.limit}`
  }

  const stocksRes = await db.execute({ sql: query, args })
  const candidates = stocksRes.rows

  console.log(`Found ${candidates.length} qualifying stocks with algorithmic overall_score >= ${config.minScore}.\n`)

  if (candidates.length === 0) {
    console.log('No eligible stocks found. Pipeline finished.')
    return
  }

  const stats = {
    total: candidates.length,
    processed: 0,
    skipped: 0,
    succeeded: 0,
    failed: 0,
    startTime: Date.now()
  }

  // Group into batches
  const batches = []
  for (let i = 0; i < candidates.length; i += config.batchSize) {
    batches.push(candidates.slice(i, i + config.batchSize))
  }

  console.log(`Divided into ${batches.length} batches of up to ${config.batchSize} stocks.\n`)

  const SIXTEEN_HOURS_MS = 16 * 60 * 60 * 1000

  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    const currentBatch = batches[bIdx]
    console.log(`>>> Starting Batch ${bIdx + 1}/${batches.length} (${currentBatch.length} stocks) <<<`)

    for (let sIdx = 0; sIdx < currentBatch.length; sIdx++) {
      const stock = currentBatch[sIdx]
      const rawSymbol = String(stock.symbol)
      const cleanSymbol = rawSymbol.replace(/\.(NS|BO)$/i, '')
      const symbolWithNs = rawSymbol.endsWith('.NS') || rawSymbol.endsWith('.BO') ? rawSymbol : `${rawSymbol}.NS`
      stats.processed++

      // Check if already reviewed recently
      if (!config.force) {
        try {
          const existingRes = await db.execute({
            sql: 'SELECT updated_at, ai_score FROM ai_technical_reviews WHERE symbol IN (?, ?) LIMIT 1',
            args: [cleanSymbol, symbolWithNs]
          })
          const existing = existingRes.rows[0]
          if (existing && existing.updated_at) {
            const age = Date.now() - Number(existing.updated_at)
            if (age < SIXTEEN_HOURS_MS) {
              console.log(`  [${stats.processed}/${stats.total}] ${cleanSymbol.padEnd(12)} - SKIPPED (Reviewed ${Math.round(age / 3600000)}h ago, Score: ${existing.ai_score})`)
              stats.skipped++
              continue
            }
          }
        } catch {
          // non-fatal, proceed with analysis
        }
      }

      console.log(`  [${stats.processed}/${stats.total}] ${cleanSymbol.padEnd(12)} (Algo Score: ${stock.overall_score}) - Analyzing with Groq...`)

      // 52-Week Statistics from historical_candles
      let high52w = null
      let low52w = null
      let avgVolume52w = null
      try {
        const statsRes = await db.execute({
          sql: `
            SELECT MAX(high) as h52, MIN(low) as l52, AVG(volume) as v52
            FROM (
              SELECT high, low, volume FROM historical_candles
              WHERE symbol IN (?, ?)
              ORDER BY date DESC LIMIT 252
            )
          `,
          args: [cleanSymbol, symbolWithNs]
        })
        const row = statsRes.rows[0]
        if (row) {
          high52w = row.h52 ? Number(row.h52) : null
          low52w = row.l52 ? Number(row.l52) : null
          avgVolume52w = row.v52 ? Math.round(Number(row.v52)) : null
        }
      } catch {
        // non-fatal
      }

      // Construct prompt strictly with raw indicators (EXCLUDING overall_score)
      const prompt = `Analyze the following raw technical indicators for ${stock.company_name} (${cleanSymbol}):

Current Market Price: ₹${stock.current_price} (${Number(stock.percentage_change || 0) >= 0 ? '+' : ''}${Number(stock.percentage_change || 0).toFixed(2)}%)
52-Week Range: High ₹${high52w ?? 'N/A'} | Low ₹${low52w ?? 'N/A'} | Avg Daily Vol: ${avgVolume52w ? avgVolume52w.toLocaleString() : 'N/A'}

Momentum Indicators:
- RSI (14-period): ${stock.rsi_14 !== null && stock.rsi_14 !== undefined ? Number(stock.rsi_14).toFixed(2) : 'N/A'}
- MACD Line: ${stock.macd_line !== null ? Number(stock.macd_line).toFixed(2) : 'N/A'} | Signal: ${stock.macd_signal !== null ? Number(stock.macd_signal).toFixed(2) : 'N/A'} | Histogram: ${stock.macd_hist !== null ? Number(stock.macd_hist).toFixed(2) : 'N/A'}
- Stochastic %K: ${stock.stoch_k !== null ? Number(stock.stoch_k).toFixed(2) : 'N/A'} | %D: ${stock.stoch_d !== null ? Number(stock.stoch_d).toFixed(2) : 'N/A'}
- Money Flow Index (MFI-14): ${stock.mfi_14 !== null ? Number(stock.mfi_14).toFixed(2) : 'N/A'}
- Williams %R: ${stock.williams_r_14 !== null ? Number(stock.williams_r_14).toFixed(2) : 'N/A'}
- ADX (14-period Trend Strength): ${stock.adx_14 !== null ? Number(stock.adx_14).toFixed(2) : 'N/A'} (+DI: ${stock.plus_di_14 !== null ? Number(stock.plus_di_14).toFixed(2) : 'N/A'}, -DI: ${stock.minus_di_14 !== null ? Number(stock.minus_di_14).toFixed(2) : 'N/A'})
- Commodity Channel Index (CCI-20): ${stock.cci_20 !== null ? Number(stock.cci_20).toFixed(2) : 'N/A'}
- Rate of Change (ROC-12): ${stock.roc_12 !== null ? Number(stock.roc_12).toFixed(2) : 'N/A'}%

Trend & Moving Averages:
- Supertrend: ${stock.supertrend_trend || 'N/A'} (Level: ₹${stock.supertrend_value !== null ? Number(stock.supertrend_value).toFixed(2) : 'N/A'})
- EMA 10: ₹${stock.ema_10 !== null ? Number(stock.ema_10).toFixed(2) : 'N/A'}
- EMA 20: ₹${stock.ema_20 !== null ? Number(stock.ema_20).toFixed(2) : 'N/A'}
- EMA 50: ₹${stock.ema_50 !== null ? Number(stock.ema_50).toFixed(2) : 'N/A'}
- EMA 100: ₹${stock.ema_100 !== null ? Number(stock.ema_100).toFixed(2) : 'N/A'}
- EMA 200: ₹${stock.ema_200 !== null ? Number(stock.ema_200).toFixed(2) : 'N/A'}
- SMA 20: ₹${stock.sma_20 !== null ? Number(stock.sma_20).toFixed(2) : 'N/A'}
- SMA 50: ₹${stock.sma_50 !== null ? Number(stock.sma_50).toFixed(2) : 'N/A'}
- SMA 200: ₹${stock.sma_200 !== null ? Number(stock.sma_200).toFixed(2) : 'N/A'}

Volatility & Volume:
- Bollinger Bands: Upper ₹${stock.bb_upper !== null ? Number(stock.bb_upper).toFixed(2) : 'N/A'} | Middle ₹${stock.bb_middle !== null ? Number(stock.bb_middle).toFixed(2) : 'N/A'} | Lower ₹${stock.bb_lower !== null ? Number(stock.bb_lower).toFixed(2) : 'N/A'}
- Average True Range (ATR-14): ₹${stock.atr_14 !== null ? Number(stock.atr_14).toFixed(2) : 'N/A'}
- Volume Weighted Average Price (VWAP): ₹${stock.vwap !== null ? Number(stock.vwap).toFixed(2) : 'N/A'}
- On-Balance Volume (OBV): ${stock.obv !== null ? Number(stock.obv).toLocaleString() : 'N/A'}

Provide your independent quantitative assessment in JSON format.`

      try {
        const aiOutput = await callGroqWithRetry(prompt, config.maxRetries)
        const now = Date.now()

        // Upsert into Turso ai_technical_reviews table
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
            cleanSymbol,
            String(stock.company_name || cleanSymbol),
            Number(stock.current_price || 0),
            Math.max(0, Math.min(100, Math.round(Number(aiOutput.aiScore) || 50))),
            String(aiOutput.aiRating || 'Neutral'),
            String(aiOutput.confidence || 'Medium'),
            String(aiOutput.timeHorizon || '1-4 Weeks (Swing)'),
            String(aiOutput.executiveSummary || ''),
            JSON.stringify(Array.isArray(aiOutput.keyStrengths) ? aiOutput.keyStrengths : []),
            JSON.stringify(Array.isArray(aiOutput.keyRisks) ? aiOutput.keyRisks : []),
            JSON.stringify(aiOutput.technicalLevels || {}),
            String(aiOutput.tradingTactics || ''),
            `${GROQ_MODEL} (Groq)`,
            Number(stock.overall_score || 0),
            now,
            now
          ]
        })

        console.log(`      ✓ Saved: AI Score ${aiOutput.aiScore}/100 (${aiOutput.aiRating}, Conf: ${aiOutput.confidence})`)
        stats.succeeded++
      } catch (err) {
        console.error(`      ✗ FAILED for ${cleanSymbol}: ${err.message}`)
        stats.failed++
      }

      // Delay between individual stock requests within batch
      if (sIdx < currentBatch.length - 1) {
        await sleep(config.delayMs)
      }
    }

    // Cooling delay between batches
    if (bIdx < batches.length - 1) {
      console.log(`\n  --- Cooling down for ${config.batchDelayMs / 1000}s before next batch ---\n`)
      await sleep(config.batchDelayMs)
    }
  }

  const durationSec = Math.round((Date.now() - stats.startTime) / 1000)
  console.log('\n' + '='.repeat(75))
  console.log('                   EXECUTION SUMMARY')
  console.log('='.repeat(75))
  console.log(`Total Candidates : ${stats.total}`)
  console.log(`Successfully Saved: ${stats.succeeded}`)
  console.log(`Skipped (Fresh)  : ${stats.skipped}`)
  console.log(`Failed           : ${stats.failed}`)
  console.log(`Total Duration   : ${durationSec} seconds (${Math.round(durationSec / 60)} min)`)
  console.log('='.repeat(75) + '\n')
}

main().catch(err => {
  console.error('Fatal execution error:', err)
  process.exit(1)
})
