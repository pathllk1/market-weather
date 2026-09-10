import type { AITechnicalReviewResponse } from '~/types/market'

export interface RawTechnicalInput {
  symbol: string
  companyName: string
  currentPrice: number
  priceChange: number
  percentageChange: number
  high52w?: number
  low52w?: number
  avgVolume52w?: number
  rsi14?: number
  macd?: {
    line: number
    signal: number
    hist: number
  }
  supertrend?: {
    trend: string
    value: number
  }
  volatility?: {
    bbUpper: number
    bbMiddle: number
    bbLower: number
    atr: number
  }
  momentum?: {
    adx: number
    plusDi: number
    minusDi: number
    stochK: number
    stochD: number
    mfi: number
    williamsR: number
    cci: number
    roc: number
  }
  volume?: {
    obv: number
    vwap: number
  }
  movingAverages?: {
    sma10: number
    sma20: number
    sma30: number
    sma50: number
    sma100: number
    sma200: number
    ema10: number
    ema20: number
    ema30: number
    ema50: number
    ema100: number
    ema200: number
  }
}

// In-memory cache for fast repeated views (15 minute TTL)
const aiReviewCache = new Map<string, { timestamp: number, data: AITechnicalReviewResponse }>()
const CACHE_TTL_MS = 1000 * 60 * 15 // 15 minutes

export async function generateAITechnicalReview(
  input: RawTechnicalInput,
  algorithmicScore: number,
  forceRefresh = false
): Promise<AITechnicalReviewResponse> {
  const cleanSymbol = input.symbol.trim().toUpperCase()

  if (!forceRefresh) {
    const cached = aiReviewCache.get(cleanSymbol)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return {
        ...cached.data,
        isCached: true,
        algorithmicScore
      }
    }
  }

  const apiKey = process.env.GROQ_API_KEY?.trim()

  if (!apiKey || apiKey === 'your-groq-api-key-here') {
    throw createError({
      statusCode: 500,
      statusMessage: 'GROQ_API_KEY is not configured in .env. Please configure your Groq API key to generate live AI technical analysis.'
    })
  }

  const selectedModel = process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b'

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: selectedModel,
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
          content: `Analyze the following raw technical indicators for ${input.companyName} (${input.symbol}):

Current Market Price: ₹${input.currentPrice} (${input.percentageChange >= 0 ? '+' : ''}${input.percentageChange.toFixed(2)}%)
52-Week Range: High ₹${input.high52w ?? 'N/A'} | Low ₹${input.low52w ?? 'N/A'}

Momentum Indicators:
- RSI (14-period): ${input.rsi14 !== undefined ? input.rsi14.toFixed(2) : 'N/A'}
- MACD Line: ${input.macd?.line !== undefined ? input.macd.line.toFixed(2) : 'N/A'} | Signal: ${input.macd?.signal !== undefined ? input.macd.signal.toFixed(2) : 'N/A'} | Histogram: ${input.macd?.hist !== undefined ? input.macd.hist.toFixed(2) : 'N/A'}
- Stochastic %K: ${input.momentum?.stochK !== undefined ? input.momentum.stochK.toFixed(2) : 'N/A'} | %D: ${input.momentum?.stochD !== undefined ? input.momentum.stochD.toFixed(2) : 'N/A'}
- Money Flow Index (MFI-14): ${input.momentum?.mfi !== undefined ? input.momentum.mfi.toFixed(2) : 'N/A'}
- Williams %R: ${input.momentum?.williamsR !== undefined ? input.momentum.williamsR.toFixed(2) : 'N/A'}
- ADX (14-period Trend Strength): ${input.momentum?.adx !== undefined ? input.momentum.adx.toFixed(2) : 'N/A'} (+DI: ${input.momentum?.plusDi !== undefined ? input.momentum.plusDi.toFixed(2) : 'N/A'}, -DI: ${input.momentum?.minusDi !== undefined ? input.momentum.minusDi.toFixed(2) : 'N/A'})
- Commodity Channel Index (CCI-20): ${input.momentum?.cci !== undefined ? input.momentum.cci.toFixed(2) : 'N/A'}
- Rate of Change (ROC-12): ${input.momentum?.roc !== undefined ? input.momentum.roc.toFixed(2) : 'N/A'}%

Trend & Moving Averages:
- Supertrend: ${input.supertrend?.trend || 'N/A'} (Level: ₹${input.supertrend?.value !== undefined ? input.supertrend.value.toFixed(2) : 'N/A'})
- EMA 10: ₹${input.movingAverages?.ema10 !== undefined ? input.movingAverages.ema10.toFixed(2) : 'N/A'}
- EMA 20: ₹${input.movingAverages?.ema20 !== undefined ? input.movingAverages.ema20.toFixed(2) : 'N/A'}
- EMA 50: ₹${input.movingAverages?.ema50 !== undefined ? input.movingAverages.ema50.toFixed(2) : 'N/A'}
- EMA 100: ₹${input.movingAverages?.ema100 !== undefined ? input.movingAverages.ema100.toFixed(2) : 'N/A'}
- EMA 200: ₹${input.movingAverages?.ema200 !== undefined ? input.movingAverages.ema200.toFixed(2) : 'N/A'}
- SMA 20: ₹${input.movingAverages?.sma20 !== undefined ? input.movingAverages.sma20.toFixed(2) : 'N/A'}
- SMA 50: ₹${input.movingAverages?.sma50 !== undefined ? input.movingAverages.sma50.toFixed(2) : 'N/A'}
- SMA 200: ₹${input.movingAverages?.sma200 !== undefined ? input.movingAverages.sma200.toFixed(2) : 'N/A'}

Volatility & Volume:
- Bollinger Bands: Upper ₹${input.volatility?.bbUpper !== undefined ? input.volatility.bbUpper.toFixed(2) : 'N/A'} | Middle ₹${input.volatility?.bbMiddle !== undefined ? input.volatility.bbMiddle.toFixed(2) : 'N/A'} | Lower ₹${input.volatility?.bbLower !== undefined ? input.volatility.bbLower.toFixed(2) : 'N/A'}
- Average True Range (ATR-14): ₹${input.volatility?.atr !== undefined ? input.volatility.atr.toFixed(2) : 'N/A'}
- Volume Weighted Average Price (VWAP): ₹${input.volume?.vwap !== undefined ? input.volume.vwap.toFixed(2) : 'N/A'}
- On-Balance Volume (OBV): ${input.volume?.obv !== undefined ? input.volume.obv.toLocaleString() : 'N/A'}

Provide your independent quantitative assessment in JSON format.`
        }
      ]
    })
  })

  if (!response.ok) {
    const errText = await response.text()
    console.error(`[Groq AI Review] Groq API returned status ${response.status}: ${errText}`)
    throw createError({
      statusCode: response.status === 429 ? 429 : 502,
      statusMessage: `Groq AI API error (${response.status}): ${response.statusText}`
    })
  }

  const json = await response.json()
  const content = json.choices?.[0]?.message?.content
  if (!content) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Empty response returned by Groq AI model'
    })
  }

  try {
    const parsed = JSON.parse(content)

    const result: AITechnicalReviewResponse = {
      symbol: cleanSymbol,
      companyName: input.companyName,
      currentPrice: input.currentPrice,
      aiScore: Math.max(0, Math.min(100, Math.round(Number(parsed.aiScore) || 50))),
      aiRating: parsed.aiRating || 'Neutral',
      confidence: parsed.confidence || 'Medium',
      timeHorizon: parsed.timeHorizon || '1-4 Weeks (Swing)',
      executiveSummary: parsed.executiveSummary || 'Technical confluence evaluation complete.',
      keyStrengths: Array.isArray(parsed.keyStrengths) ? parsed.keyStrengths : [],
      keyRisks: Array.isArray(parsed.keyRisks) ? parsed.keyRisks : [],
      technicalLevels: {
        support1: Number(parsed.technicalLevels?.support1) || Number((input.currentPrice * 0.97).toFixed(2)),
        support2: Number(parsed.technicalLevels?.support2) || Number((input.currentPrice * 0.94).toFixed(2)),
        resistance1: Number(parsed.technicalLevels?.resistance1) || Number((input.currentPrice * 1.03).toFixed(2)),
        resistance2: Number(parsed.technicalLevels?.resistance2) || Number((input.currentPrice * 1.06).toFixed(2)),
        stopLoss: Number(parsed.technicalLevels?.stopLoss) || Number((input.currentPrice * 0.95).toFixed(2))
      },
      tradingTactics: parsed.tradingTactics || 'Manage risk according to technical support and resistance levels.',
      modelUsed: `${selectedModel} (Groq)`,
      generatedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      isCached: false,
      algorithmicScore
    }

    aiReviewCache.set(cleanSymbol, { timestamp: Date.now(), data: result })
    return result
  } catch (parseErr) {
    console.error(`[Groq AI Review] JSON parse error for ${cleanSymbol}:`, parseErr, content)
    throw createError({
      statusCode: 502,
      statusMessage: 'Invalid structured JSON response returned by Groq model'
    })
  }
}
