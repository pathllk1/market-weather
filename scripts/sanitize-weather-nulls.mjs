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

async function main() {
  const isApply = process.argv.includes('--apply')
  console.log('='.repeat(70))
  console.log(` TURSO WEATHER DATA SANITATION TOOL (${isApply ? 'APPLY MODE' : 'DRY-RUN MODE'})`)
  console.log('='.repeat(70))

  // 1. Identify rows with NULL weather data
  const nullWeather = await client.execute(`
    SELECT COUNT(*) as cnt 
    FROM weather_aqi 
    WHERE temperature IS NULL AND relative_humidity IS NULL
  `)
  const countWeather = Number(nullWeather.rows[0]?.cnt || 0)

  // 2. Identify rows with NULL air quality data
  const nullAqi = await client.execute(`
    SELECT COUNT(*) as cnt 
    FROM weather_aqi 
    WHERE us_aqi IS NULL
  `)
  const countAqi = Number(nullAqi.rows[0]?.cnt || 0)

  console.log(`\n• Records with NULL weather metrics: ${countWeather}`)
  console.log(`• Records with NULL air quality metrics: ${countAqi}`)

  if (countWeather === 0 && countAqi === 0) {
    const totalRes = await client.execute('SELECT COUNT(*) as cnt FROM weather_aqi')
    console.log(`\n✅ Database is 100% clean! Total active records: ${Number(totalRes.rows[0]?.cnt).toLocaleString()}`)
    return
  }

  if (!isApply) {
    console.log('\n⚠️ DRY RUN ONLY. No changes have been made to the database.')
    console.log('To purge corrupted rows, run:')
    console.log('   node scripts/sanitize-weather-nulls.mjs --apply\n')
    return
  }

  // Purge any remaining corrupted records
  if (countWeather > 0) {
    const delWeather = await client.execute(`DELETE FROM weather_aqi WHERE temperature IS NULL AND relative_humidity IS NULL`)
    console.log(`✅ Deleted ${delWeather.rowsAffected} corrupted weather records.`)
  }
  if (countAqi > 0) {
    const delAqi = await client.execute(`DELETE FROM weather_aqi WHERE us_aqi IS NULL`)
    console.log(`✅ Deleted ${delAqi.rowsAffected} corrupted air quality records.`)
  }

  const finalTotal = await client.execute('SELECT COUNT(*) as cnt FROM weather_aqi')
  console.log(`\n🎉 Sanitation complete! Remaining pristine records: ${Number(finalTotal.rows[0]?.cnt).toLocaleString()}`)
}

main().catch(console.error)
