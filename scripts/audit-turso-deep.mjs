import { createClient } from '@libsql/client'
import fs from 'node:fs'
import path from 'node:path'

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return {}
  const content = fs.readFileSync(envPath, 'utf-8')
  const env = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const equalsIdx = trimmed.indexOf('=')
    if (equalsIdx !== -1) {
      const key = trimmed.slice(0, equalsIdx).trim()
      let val = trimmed.slice(equalsIdx + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith('\'') && val.endsWith('\''))) {
        val = val.slice(1, -1)
      }
      env[key] = val
    }
  }
  return env
}

const env = loadEnv()
const client = createClient({
  url: env.TURSO_DATABASE_URL || 'file:turso_security.db',
  authToken: env.TURSO_AUTH_TOKEN
})

async function runDeepAudit() {
  console.log('='.repeat(80))
  console.log('       TURSO DATABASE DEEP FORENSIC AUDIT: ZERO & NULL ROOT CAUSES')
  console.log('='.repeat(80))

  // 1. Audit the 195 NULL Weather rows
  console.log('\n--- 1. FORENSIC AUDIT: 195 NULL WEATHER ROWS ---')
  const nullWeatherRes = await client.execute(`
    SELECT 
      city, state, 
      COUNT(*) as null_weather_count,
      MIN(timestamp_utc) as earliest_incident,
      MAX(timestamp_utc) as latest_incident,
      ROUND(AVG(us_aqi), 1) as avg_aqi_during_null_weather
    FROM weather_aqi
    WHERE temperature IS NULL
    GROUP BY city, state
    ORDER BY null_weather_count DESC
  `)
  console.log(`Cities affected by NULL weather metrics (Total rows: 195):`)
  console.table(nullWeatherRes.rows)

  // Sample of these NULL weather rows
  const sampleNullWeather = await client.execute(`
    SELECT id, city, state, timestamp_utc, timestamp_local, temperature, relative_humidity, us_aqi, pm2_5, pm10
    FROM weather_aqi
    WHERE temperature IS NULL
    LIMIT 5
  `)
  console.log('Sample records with NULL weather data:')
  console.table(sampleNullWeather.rows)

  // 2. Audit the 3 NULL AQI rows
  console.log('\n--- 2. FORENSIC AUDIT: 3 NULL AIR QUALITY ROWS ---')
  const nullAqiRes = await client.execute(`
    SELECT id, city, state, timestamp_utc, timestamp_local, temperature, relative_humidity, us_aqi, pm2_5, pm10
    FROM weather_aqi
    WHERE us_aqi IS NULL
  `)
  console.table(nullAqiRes.rows)

  // 3. Audit the 11 Exact Zero Temperature rows
  console.log('\n--- 3. FORENSIC AUDIT: 11 EXACT ZERO (0.0°C) TEMPERATURE ROWS ---')
  const zeroTempRes = await client.execute(`
    SELECT id, city, state, timestamp_utc, timestamp_local, temperature, apparent_temperature, relative_humidity, precipitation, wind_speed, weather_code, us_aqi
    FROM weather_aqi
    WHERE temperature = 0
    ORDER BY timestamp_utc DESC
  `)
  console.table(zeroTempRes.rows)

  // 4. Inconsistency check: weather_code = 0 while precipitation > 0
  console.log('\n--- 4. LOGICAL INCONSISTENCY AUDIT: weather_code vs precipitation ---')
  const rainContradiction = await client.execute(`
    SELECT COUNT(*) as count
    FROM weather_aqi
    WHERE weather_code = 0 AND precipitation > 0
  `)
  console.log(`• Rows with weather_code = 0 (Clear Sky) BUT precipitation > 0: ${rainContradiction.rows[0]?.count}`)

  const rainWithWeatherCode = await client.execute(`
    SELECT weather_code, COUNT(*) as count, ROUND(AVG(precipitation), 2) as avg_rain, MAX(precipitation) as max_rain
    FROM weather_aqi
    WHERE precipitation > 0
    GROUP BY weather_code
    ORDER BY count DESC
    LIMIT 10
  `)
  console.log('Precipitation distribution across weather codes:')
  console.table(rainWithWeatherCode.rows)

  // 5. Zero Gas Concentrations Analysis (NO2=0, SO2=0, Ozone=0)
  console.log('\n--- 5. FORENSIC AUDIT: ZERO GAS CONCENTRATIONS (NO2, SO2, Ozone) ---')
  const zeroGasesSummary = await client.execute(`
    SELECT 
      COUNT(CASE WHEN nitrogen_dioxide = 0 THEN 1 END) as zero_no2_count,
      COUNT(CASE WHEN sulphur_dioxide = 0 THEN 1 END) as zero_so2_count,
      COUNT(CASE WHEN ozone = 0 THEN 1 END) as zero_ozone_count,
      COUNT(CASE WHEN nitrogen_dioxide = 0 AND ozone = 0 THEN 1 END) as zero_both_no2_o3
    FROM weather_aqi
  `)
  console.table(zeroGasesSummary.rows)

  // Time-of-day distribution for zero ozone (Ozone titration occurs at night)
  const zeroOzoneTimeOfDay = await client.execute(`
    SELECT 
      SUBSTR(timestamp_utc, 12, 2) as utc_hour,
      COUNT(*) as zero_ozone_readings
    FROM weather_aqi
    WHERE ozone = 0
    GROUP BY utc_hour
    ORDER BY zero_ozone_readings DESC
    LIMIT 10
  `)
  console.log('Top UTC hours when Ozone is recorded as 0 (night vs day photochemical behavior):')
  console.table(zeroOzoneTimeOfDay.rows)

  // 6. Audit of historical_candles table in Turso (432,101 rows)
  console.log('\n--- 6. AUDIT: historical_candles TABLE (432,101 Rows) ---')
  const candlesAudit = await client.execute(`
    SELECT 
      COUNT(*) as total_candles,
      COUNT(DISTINCT symbol) as unique_symbols,
      MIN(date) as min_date,
      MAX(date) as max_date,
      COUNT(CASE WHEN close = 0 THEN 1 END) as zero_close,
      COUNT(CASE WHEN open = 0 THEN 1 END) as zero_open,
      COUNT(CASE WHEN high = 0 THEN 1 END) as zero_high,
      COUNT(CASE WHEN low = 0 THEN 1 END) as zero_low,
      COUNT(CASE WHEN volume = 0 THEN 1 END) as zero_volume,
      COUNT(CASE WHEN high < low THEN 1 END) as high_less_than_low,
      COUNT(CASE WHEN high < close OR high < open THEN 1 END) as invalid_high,
      COUNT(CASE WHEN low > close OR low > open THEN 1 END) as invalid_low
    FROM historical_candles
  `)
  console.table(candlesAudit.rows)

  // 7. Audit of technical_analysis table (563 rows)
  console.log('\n--- 7. AUDIT: technical_analysis TABLE (563 Rows) ---')
  const techPragma = await client.execute('PRAGMA table_info(technical_analysis)')
  console.log('Columns in technical_analysis:', techPragma.rows.map(r => r.name).join(', '))
  const techAudit = await client.execute(`
    SELECT 
      COUNT(*) as total_records,
      COUNT(DISTINCT symbol) as unique_symbols,
      COUNT(CASE WHEN overall_score = 0 THEN 1 END) as zero_overall_score,
      COUNT(CASE WHEN current_price = 0 THEN 1 END) as zero_current_price
    FROM technical_analysis
  `)
  console.table(techAudit.rows)

  // 8. Audit of ai_technical_reviews table (344 rows)
  console.log('\n--- 8. AUDIT: ai_technical_reviews TABLE (344 Rows) ---')
  const aiPragma = await client.execute('PRAGMA table_info(ai_technical_reviews)')
  console.log('Columns in ai_technical_reviews:', aiPragma.rows.map(r => r.name).join(', '))
  const aiAudit = await client.execute(`
    SELECT 
      COUNT(*) as total_reviews,
      COUNT(CASE WHEN ai_score = 0 THEN 1 END) as zero_ai_score,
      COUNT(CASE WHEN algorithmic_score = 0 THEN 1 END) as zero_algo_score,
      COUNT(CASE WHEN current_price = 0 THEN 1 END) as zero_price,
      COUNT(CASE WHEN executive_summary IS NULL OR executive_summary = '' THEN 1 END) as blank_summary
    FROM ai_technical_reviews
  `)
  console.table(aiAudit.rows)

  console.log('\n' + '='.repeat(80))
  console.log('                     DEEP FORENSIC AUDIT COMPLETE')
  console.log('='.repeat(80))
}

runDeepAudit().catch((err) => {
  console.error('Deep audit failed:', err)
  process.exit(1)
})
