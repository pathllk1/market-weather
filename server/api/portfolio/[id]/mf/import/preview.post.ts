import { parseCASPDF } from '~~/server/utils/casParser'
import { getTursoClient } from '~~/server/utils/turso'

export default defineEventHandler(async (event) => {
  const portfolioId = getRouterParam(event, 'id')
  if (!portfolioId) {
    throw createError({ statusCode: 400, statusMessage: 'Portfolio ID is required' })
  }

  // Handle multipart form data or JSON body
  let pdfBuffer: Uint8Array | null = null
  let password = ''

  const contentType = getHeader(event, 'content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await readMultipartFormData(event)
    if (!formData || formData.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
    }

    for (const part of formData) {
      if (part.name === 'file' && part.data) {
        pdfBuffer = new Uint8Array(part.data)
      } else if (part.name === 'password' && part.data) {
        password = part.data.toString('utf-8')
      }
    }
  } else {
    // JSON body fallback (e.g. base64 file)
    const body = await readBody(event)
    if (body.fileBase64) {
      const b64 = body.fileBase64.replace(/^data:application\/pdf;base64,/, '')
      const buf = Buffer.from(b64, 'base64')
      pdfBuffer = new Uint8Array(buf)
    }
    password = body.password || ''
  }

  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Valid PDF file is required' })
  }

  // Parse CAS PDF with password
  const result = await parseCASPDF(pdfBuffer, password)

  if (!result.success) {
    throw createError({
      statusCode: 422,
      statusMessage: result.error || 'Failed to decrypt or parse CAS PDF. Check the password and try again.'
    })
  }

  // Check existing transactions for duplicate detection
  const db = getTursoClient()
  const existingRes = await db.execute({
    sql: `SELECT scheme_code, transaction_date, amount, units 
          FROM portfolio_mf_transactions 
          WHERE portfolio_id = ?`,
    args: [portfolioId]
  })

  const existingKeys = new Set<string>()
  for (const row of existingRes.rows as any[]) {
    const code = Number(row.scheme_code)
    const date = String(row.transaction_date)
    const amt = Number(row.amount || 0).toFixed(2)
    existingKeys.add(`${code}_${date}_${amt}`)
  }

  let duplicateCount = 0
  for (const txn of result.transactions) {
    const key = `${txn.schemeCode}_${txn.transactionDate}_${Number(txn.amount).toFixed(2)}`
    if (existingKeys.has(key)) {
      txn.isDuplicate = true
      txn.selected = false // Unselect duplicates by default
      duplicateCount++
    }
  }

  return {
    success: true,
    portfolioId,
    investor: result.investor,
    schemes: result.schemes,
    transactions: result.transactions,
    totalTransactions: result.transactions.length,
    duplicateCount
  }
})
