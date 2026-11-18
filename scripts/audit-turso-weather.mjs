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

async function runAudit() {
  console.log('='.repeat(80))
  console.log('       TURSO DATABASE COMPREHENSIVE DATA AUDIT: WEATHER & TELEMETRY')
  console.log('='.repeat(80))
  console.log(`Database URL: ${env.TURSO_DATABASE_URL}`)
  console.log(`Timestamp   : ${new Date().toISOString()}\n`)

  // 1. Table schema
  const schemaRes = await client.execute('SELECT sql FROM sqlite_master WHERE name = \'weather_aqi\'')
  console.log('--- 1. SCHEMA DEFINITION: weather_aqi ---')
  console.log(schemaRes.rows[0]?.sql || 'Table not found')
  console.log('')

  // 2. High-level totals
  const totalRes = await client.execute('SELECT COUNT(*) as total FROM weather_aqi')
  const totalRecords = Number(totalRes.rows[0]?.total || 0)

  const timeRes = await client.execute(`
    SELECT 
      MIN(timestamp_utc) as min_utc, 
      MAX(timestamp_utc) as max_utc,
      MIN(timestamp_local) as min_local, 
      MAX(timestamp_local) as max_local,
      COUNT(DISTINCT city) as total_cities,
      COUNT(DISTINCT state) as total_states
    FROM weather_aqi
  `)
  const timeInfo = timeRes.rows[0]
  console.log('--- 2. GENERAL INVENTORY ---')
  console.log(`Total Records   : ${totalRecords.toLocaleString()}`)
  console.log(`Unique Cities   : ${timeInfo.total_cities}`)
  console.log(`Unique States   : ${timeInfo.total_states}`)
  console.log(`UTC Range       : ${timeInfo.min_utc}  -->  ${timeInfo.max_utc}`)
  console.log(`Local Range     : ${timeInfo.min_local}  -->  ${timeInfo.max_local}\n`)

  // 3. Exact Zero and Null Analysis by Field
  console.log('--- 3. ZERO & NULL VALUES AUDIT PER FIELD ---')
  const fieldChecks = [
    'temperature',
    'apparent_temperature',
    'relative_humidity',
    'precipitation',
    'wind_speed',
    'weather_code',
    'us_aqi',
    'pm2_5',
    'pm10',
    'carbon_monoxide',
    'nitrogen_dioxide',
    'sulphur_dioxide',
    'ozone'
  ]

  const zeroStats = []
  for (const field of fieldChecks) {
    const q = await client.execute(`
      SELECT 
        COUNT(CASE WHEN ${field} = 0 THEN 1 END) as zero_count,
        COUNT(CASE WHEN ${field} IS NULL THEN 1 END) as null_count,
        COUNT(CASE WHEN ${field} < 0 THEN 1 END) as neg_count,
        MIN(${field}) as min_val,
        AVG(${field}) as avg_val,
        MAX(${field}) as max_val
      FROM weather_aqi
    `)
    const row = q.rows[0]
    const zeroCount = Number(row.zero_count || 0)
    const nullCount = Number(row.null_count || 0)
    const zeroPct = totalRecords > 0 ? ((zeroCount / totalRecords) * 100).toFixed(2) : '0'

    zeroStats.push({
      'Field': field,
      'Exact Zero (0)': zeroCount,
      'Zero %': `${zeroPct}%`,
      'Null Count': nullCount,
      'Negatives (<0)': Number(row.neg_count || 0),
      'Min Value': row.min_val != null ? Number(Number(row.min_val).toFixed(2)) : 'N/A',
      'Avg Value': row.avg_val != null ? Number(Number(row.avg_val).toFixed(2)) : 'N/A',
      'Max Value': row.max_val != null ? Number(Number(row.max_val).toFixed(2)) : 'N/A'
    })
  }
  console.table(zeroStats)
  console.log('')

  // 4. Multi-field Anomaly Detection (Correlated Zero Drops)
  console.log('--- 4. MULTI-FIELD CORRELATED ZERO CLUSTERS (API ERROR SIGNATURES) ---')

  // Severe Dropout 1: Both Temperature = 0 AND Humidity = 0
  const tempHumZero = await client.execute(`
    SELECT COUNT(*) as cnt 
    FROM weather_aqi 
    WHERE temperature = 0 AND relative_humidity = 0
  `)
  console.log(`• Records with BOTH Temperature = 0 AND Humidity = 0: ${tempHumZero.rows[0]?.cnt}`)

  // Severe Dropout 2: Temperature = 0 AND US AQI = 0
  const tempAqiZero = await client.execute(`
    SELECT COUNT(*) as cnt 
    FROM weather_aqi 
    WHERE temperature = 0 AND us_aqi = 0
  `)
  console.log(`• Records with BOTH Temperature = 0 AND US AQI = 0: ${tempAqiZero.rows[0]?.cnt}`)

  // Severe Dropout 3: ALL Pollutants Zero (us_aqi=0, pm2_5=0, pm10=0, co=0, no2=0, so2=0, ozone=0)
  const allPollutantsZero = await client.execute(`
    SELECT COUNT(*) as cnt 
    FROM weather_aqi 
    WHERE us_aqi = 0 AND pm2_5 = 0 AND pm10 = 0 AND carbon_monoxide = 0 AND nitrogen_dioxide = 0 AND sulphur_dioxide = 0 AND ozone = 0
  `)
  console.log(`• Records with ALL 7 Pollutants Exactly 0 (AQI/PM2.5/PM10/CO/NO2/SO2/O3): ${allPollutantsZero.rows[0]?.cnt}`)

  // Severe Dropout 4: ALL Weather Metrics Zero (temp=0, apparent=0, humidity=0, wind=0)
  const allWeatherZero = await client.execute(`
    SELECT COUNT(*) as cnt 
    FROM weather_aqi 
    WHERE temperature = 0 AND apparent_temperature = 0 AND relative_humidity = 0 AND wind_speed = 0
  `)
  console.log(`• Records with ALL 4 Weather Metrics Exactly 0 (Temp/Feels/Humidity/Wind): ${allWeatherZero.rows[0]?.cnt}`)

  // Severe Dropout 5: COMPLETE BLANK ROW (Weather + Pollutants all 0)
  const completeBlank = await client.execute(`
    SELECT COUNT(*) as cnt 
    FROM weather_aqi 
    WHERE temperature = 0 AND relative_humidity = 0 AND wind_speed = 0 AND us_aqi = 0 AND pm2_5 = 0 AND pm10 = 0
  `)
  console.log(`• Records with COMPLETE ZERO DROPOUT (All Weather + AQI = 0): ${completeBlank.rows[0]?.cnt}\n`)

  // 5. Zero-temperature Breakdown by City
  console.log('--- 5. ZERO TEMPERATURE (0°C) INCIDENCE BY CITY ---')
  const zeroTempByCity = await client.execute(`
    SELECT 
      city, state, 
      COUNT(*) as total_city_records,
      COUNT(CASE WHEN temperature = 0 THEN 1 END) as zero_temp_count,
      ROUND((COUNT(CASE WHEN temperature = 0 THEN 1 END) * 100.0 / COUNT(*)), 2) as zero_temp_pct,
      COUNT(CASE WHEN us_aqi = 0 THEN 1 END) as zero_aqi_count,
      COUNT(CASE WHEN relative_humidity = 0 THEN 1 END) as zero_humidity_count
    FROM weather_aqi
    GROUP BY city, state
    HAVING zero_temp_count > 0 OR zero_aqi_count > 0 OR zero_humidity_count > 0
    ORDER BY zero_temp_count DESC, zero_aqi_count DESC
    LIMIT 25
  `)
  if (zeroTempByCity.rows.length === 0) {
    console.log('  No cities found with zero values in temperature, AQI, or humidity.\n')
  } else {
    console.table(zeroTempByCity.rows)
    console.log('')
  }

  // 6. Zero Values by Date/Timestamp
  console.log('--- 6. ZERO VALUES INCIDENCE BY DATE (TIMESTAMPS WITH DROP-OUTS) ---')
  const zeroByDate = await client.execute(`
    SELECT 
      SUBSTR(timestamp_utc, 1, 10) as date_utc,
      COUNT(*) as readings_on_date,
      COUNT(CASE WHEN temperature = 0 THEN 1 END) as zero_temp,
      COUNT(CASE WHEN relative_humidity = 0 THEN 1 END) as zero_hum,
      COUNT(CASE WHEN us_aqi = 0 THEN 1 END) as zero_aqi,
      COUNT(CASE WHEN pm2_5 = 0 THEN 1 END) as zero_pm25,
      COUNT(CASE WHEN carbon_monoxide = 0 THEN 1 END) as zero_co
    FROM weather_aqi
    GROUP BY date_utc
    HAVING zero_temp > 0 OR zero_hum > 0 OR zero_aqi > 0
    ORDER BY zero_temp DESC, zero_aqi DESC
    LIMIT 25
  `)
  if (zeroByDate.rows.length === 0) {
    console.log('  No dates found with zero values in temperature, humidity, or AQI.\n')
  } else {
    console.table(zeroByDate.rows)
    console.log('')
  }

  // 7. Sample Anomaly Rows
  console.log('--- 7. SAMPLE ANOMALOUS ROWS (Zero Temp or Zero AQI or Zero Humidity) ---')
  const sampleAnomalies = await client.execute(`
    SELECT 
      city, state, timestamp_utc, timestamp_local, 
      temperature, apparent_temperature, relative_humidity, precipitation, wind_speed, weather_code,
      us_aqi, pm2_5, pm10, carbon_monoxide, nitrogen_dioxide, sulphur_dioxide, ozone
    FROM weather_aqi
    WHERE temperature = 0 OR relative_humidity = 0 OR us_aqi = 0
    LIMIT 10
  `)
  if (sampleAnomalies.rows.length === 0) {
    console.log('  (No anomalous rows found)\n')
  } else {
    console.table(sampleAnomalies.rows)
    console.log('')
  }

  // 8. General Health of Other Key Turso Tables
  console.log('--- 8. AUDIT OF OTHER TURSO TABLES ---')
  const otherTables = [
    'historical_candles',
    'technical_analysis',
    'ai_technical_reviews',
    'users',
    'portfolios',
    'portfolio_trades',
    'sessions',
    'audit_logs'
  ]
  const otherTableStats = []
  for (const t of otherTables) {
    try {
      const q = await client.execute(`SELECT COUNT(*) as total FROM ${t}`)
      otherTableStats.push({ 'Table': t, 'Row Count': Number(q.rows[0]?.total || 0), 'Status': 'Active' })
    } catch (e) {
      otherTableStats.push({ 'Table': t, 'Row Count': 0, 'Status': `Error: ${e.message}` })
    }
  }
  console.table(otherTableStats)
  console.log('')
}

runAudit().catch((err) => {
  console.error('Audit failed with error:', err)
  process.exit(1)
})
