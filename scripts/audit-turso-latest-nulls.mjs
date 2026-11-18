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

async function checkLatestSnapshots() {
  console.log('--- CHECKING LATEST CITY SNAPSHOTS FOR NULL/ZERO TEMPERATURE ---')
  const res = await client.execute(`
    SELECT w.city, w.state, w.timestamp_utc, w.temperature, w.apparent_temperature, w.relative_humidity, w.us_aqi
    FROM weather_aqi w
    INNER JOIN (
      SELECT city, MAX(timestamp_utc) as max_ts
      FROM weather_aqi
      GROUP BY city
    ) latest ON w.city = latest.city AND w.timestamp_utc = latest.max_ts
    ORDER BY w.city ASC
  `)

  const nullLatest = res.rows.filter(r => r.temperature === null || r.temperature === 0 || r.us_aqi === null || r.us_aqi === 0)
  console.log(`Total latest snapshots: ${res.rows.length}`)
  console.log(`Latest snapshots with NULL or ZERO: ${nullLatest.length}`)
  if (nullLatest.length > 0) {
    console.table(nullLatest)
  } else {
    console.log('All current latest city snapshots have valid, non-null temperature and AQI values.')
  }
}

checkLatestSnapshots().catch(console.error)
