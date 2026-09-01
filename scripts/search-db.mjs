import { createClient } from '@libsql/client'
import fs from 'node:fs'

function loadEnv() {
  const env = {}
  if (fs.existsSync('.env')) {
    for (const line of fs.readFileSync('.env', 'utf-8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const idx = t.indexOf('=')
      if (idx !== -1) {
        env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
      }
    }
  }
  return env
}

const env = loadEnv()
const client = createClient({
  url: env.TURSO_DATABASE_URL,
  authToken: env.TURSO_AUTH_TOKEN
})

console.log('='.repeat(70))
console.log('       COMPLETE DATABASE CONTENT & SCHEMA BREAKDOWN')
console.log('='.repeat(70))
console.log(`Database URL: ${env.TURSO_DATABASE_URL}\n`)

// 1. Get all tables
const tablesRes = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC")
const tables = tablesRes.rows.map(r => r.name)

console.log(`Found ${tables.length} tables in database:\n`)

const tableDetails = []

for (const tableName of tables) {
  const colsRes = await client.execute(`PRAGMA table_info("${tableName}")`)
  const countRes = await client.execute(`SELECT COUNT(*) as cnt FROM "${tableName}"`)
  const sampleRes = await client.execute(`SELECT * FROM "${tableName}" LIMIT 2`)
  
  const colNames = colsRes.rows.map(c => `${c.name} (${c.type})`).join(', ')
  const count = Number(countRes.rows[0].cnt)

  tableDetails.push({
    tableName,
    count,
    columns: colsRes.rows.map(c => c.name),
    colDefinition: colNames,
    sample: sampleRes.rows
  })
}

// Print table summaries
for (const td of tableDetails) {
  console.log(`📌 TABLE: "${td.tableName}" (${td.count} records)`)
  console.log(`   Columns: ${td.colDefinition}`)
  if (td.sample.length > 0) {
    console.log(`   Sample Data (First 1-2 rows):`)
    console.log(`   ` + JSON.stringify(td.sample, null, 2).replace(/\n/g, '\n   '))
  } else {
    console.log(`   (Empty table)`)
  }
  console.log('-'.repeat(70))
}

// 2. Specific search for keyword "hat" across all columns in all tables
console.log('\n' + '='.repeat(70))
console.log('  SEARCH FOR KEYWORD "hat" ACROSS ALL TABLES')
console.log('='.repeat(70))

let matchFound = false
for (const td of tableDetails) {
  for (const col of td.columns) {
    try {
      const matchRes = await client.execute(`SELECT * FROM "${td.tableName}" WHERE CAST("${col}" AS TEXT) LIKE '%hat%' LIMIT 5`)
      if (matchRes.rows.length > 0) {
        matchFound = true
        console.log(`🔍 MATCH in Table "${td.tableName}", Column "${col}":`)
        console.log(JSON.stringify(matchRes.rows, null, 2))
      }
    } catch {}
  }
}

if (!matchFound) {
  console.log('No rows matching string "hat" found in any table.')
}
