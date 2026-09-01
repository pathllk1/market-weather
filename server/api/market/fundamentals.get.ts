import { getStockFundamentals } from '../../utils/yahoo'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const symbol = typeof query.symbol === 'string' ? query.symbol.trim().toUpperCase() : ''

  if (!symbol) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required query parameter: symbol'
    })
  }

  try {
    const data = await getStockFundamentals(symbol)
    if (!data) {
      throw createError({
        statusCode: 404,
        statusMessage: `No fundamental data found for symbol: ${symbol}`
      })
    }

    return data
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to retrieve fundamentals for ${symbol}: ${message}`
    })
  }
})
