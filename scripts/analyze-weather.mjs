import { createClient } from '@libsql/client'
import fs from 'node:fs'

function loadEnv() {
  const env = {}
  if (fs.existsSync('.env')) {
    const lines = fs.readFileSync('.env', 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx !== -1) {
        env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
      }
    }
  }
  return env
}

const env = loadEnv()
const client = createClient({
  url: env.TURSO_DATABASE_URL || 'file:turso_security.db',
  authToken: env.TURSO_AUTH_TOKEN
})

async function run() {
  console.log('='.repeat(70))
  console.log('         WEATHER & AIR QUALITY (AQI) DATA ANALYSIS')
  console.log('='.repeat(70))

  // 1. Total records and time bounds
  const countRes = await client.execute('SELECT COUNT(*) as cnt FROM weather_aqi')
  const timeRes = await client.execute('SELECT MIN(timestamp_utc) as first_ts, MAX(timestamp_utc) as last_ts FROM weather_aqi')
  
  console.log(`Total Records: ${countRes.rows[0].cnt}`)
  console.log(`Time Span    : ${timeRes.rows[0].first_ts}  -->  ${timeRes.rows[0].last_ts}\n`)

  // 2. City and State counts
  const citiesRes = await client.execute('SELECT DISTINCT city, state, latitude, longitude FROM weather_aqi ORDER BY state, city')
  console.log(`Unique Cities Tracked: ${citiesRes.rows.length}`)
  
  const stateCounts = await client.execute(`
    SELECT state, COUNT(DISTINCT city) as city_count, COUNT(*) as reading_count 
    FROM weather_aqi 
    GROUP BY state 
    ORDER BY reading_count DESC
  `)
  console.log('\n--- Readings per State ---')
  console.table(stateCounts.rows)

  // 3. Overall Weather & AQI Metrics Overview
  const statsRes = await client.execute(`
    SELECT 
      ROUND(MIN(temperature), 1) as min_temp_c,
      ROUND(AVG(temperature), 1) as avg_temp_c,
      ROUND(MAX(temperature), 1) as max_temp_c,
      ROUND(AVG(relative_humidity), 1) as avg_humidity_pct,
      ROUND(MIN(us_aqi), 1) as min_aqi,
      ROUND(AVG(us_aqi), 1) as avg_aqi,
      ROUND(MAX(us_aqi), 1) as max_aqi,
      ROUND(AVG(pm2_5), 1) as avg_pm25,
      ROUND(AVG(pm10), 1) as avg_pm10
    FROM weather_aqi
  `)
  console.log('--- Overall Statistical Summary ---')
  console.table(statsRes.rows)

  // 4. Top 10 Most Polluted Cities (Highest Average US AQI)
  const topPolluted = await client.execute(`
    SELECT 
      city, state, 
      ROUND(AVG(us_aqi), 1) as avg_aqi, 
      ROUND(MAX(us_aqi), 1) as peak_aqi,
      ROUND(AVG(pm2_5), 1) as avg_pm25,
      ROUND(AVG(pm10), 1) as avg_pm10
    FROM weather_aqi
    GROUP BY city, state
    ORDER BY avg_aqi DESC
    LIMIT 10
  `)
  console.log('--- Top 10 Cities with Highest AQI (Most Polluted) ---')
  console.table(topPolluted.rows)

  // 5. Top 10 Cleanest Air Cities (Lowest Average US AQI)
  const cleanest = await client.execute(`
    SELECT 
      city, state, 
      ROUND(AVG(us_aqi), 1) as avg_aqi, 
      ROUND(AVG(temperature), 1) as avg_temp,
      ROUND(AVG(pm2_5), 1) as avg_pm25
    FROM weather_aqi
    GROUP BY city, state
    ORDER BY avg_aqi ASC
    LIMIT 10
  `)
  console.log('--- Top 10 Cleanest Cities (Lowest AQI) ---')
  console.table(cleanest.rows)

  // 6. Latest Snapshot (Most recent timestamp)
  const latestTs = timeRes.rows[0].last_ts
  const latestSnapshot = await client.execute({
    sql: `
      SELECT city, state, temperature, apparent_temperature as feels_like, relative_humidity as humidity, us_aqi, pm2_5, weather_code, timestamp_local
      FROM weather_aqi
      WHERE timestamp_utc = ?
      ORDER BY us_aqi DESC
      LIMIT 15
    `,
    args: [latestTs]
  })
  console.log(`\n--- Latest Snapshot across Cities (${latestTs}) ---`)
  console.table(latestSnapshot.rows)

  // 7. Schema column details
  const schemaRes = await client.execute('PRAGMA table_info(weather_aqi)')
  console.log('\n--- Schema Columns ---')
  console.table(schemaRes.rows.map(r => ({ column: r.name, type: r.type })))
}

run().catch(console.error)
