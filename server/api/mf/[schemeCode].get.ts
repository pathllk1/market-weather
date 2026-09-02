import { getMutualFundDetails } from '~~/server/utils/mfapi'

function parseDate(dStr: string): Date {
  // Format is "DD-MM-YYYY"
  const parts = dStr.split('-')
  if (parts.length === 3) {
    return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
  }
  return new Date(dStr)
}

function findNavNearDaysAgo(data: { date: string; nav: string }[], targetDays: number): number | null {
  if (!data || data.length === 0) return null
  const latestDate = parseDate(data[0]!.date).getTime()
  const targetMs = latestDate - targetDays * 24 * 60 * 60 * 1000

  let closestNav: number | null = null
  let minDiff = Infinity

  for (const pt of data) {
    const ptMs = parseDate(pt.date).getTime()
    const diff = Math.abs(ptMs - targetMs)
    if (diff < minDiff) {
      minDiff = diff
      closestNav = Number(pt.nav)
    }
    // Optimization: data is reverse-chronological, once we pass target by > 15 days, break
    if (targetMs - ptMs > 15 * 24 * 60 * 60 * 1000) break
  }

  // Only accept if within 14 days of target
  if (minDiff < 14 * 24 * 60 * 60 * 1000) {
    return closestNav
  }
  return null
}

export default defineEventHandler(async (event) => {
  const codeParam = getRouterParam(event, 'schemeCode')
  const schemeCode = parseInt(codeParam || '0', 10)

  if (!schemeCode || isNaN(schemeCode)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid mutual fund scheme code' })
  }

  const details = await getMutualFundDetails(schemeCode)
  if (!details) {
    throw createError({ statusCode: 404, statusMessage: 'Mutual fund scheme not found' })
  }

  const data = details.data || []
  const latestNAV = Number(data[0]?.nav) || 0

  // Resolve NAV for specific date if requested
  const query = getQuery(event)
  const reqDate = query.date ? String(query.date).trim() : ''
  let navOnDate = latestNAV
  let matchedDate = data[0]?.date || ''

  if (reqDate) {
    let targetTime = 0
    if (reqDate.includes('-')) {
      const parts = reqDate.split('-')
      if (parts[0]!.length === 4) {
        // YYYY-MM-DD
        targetTime = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime()
      } else {
        // DD-MM-YYYY
        targetTime = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime()
      }
    }

    if (targetTime > 0) {
      for (const pt of data) {
        const ptTime = parseDate(pt.date).getTime()
        if (ptTime <= targetTime) {
          navOnDate = Number(pt.nav)
          matchedDate = pt.date
          break
        }
      }
    }
  }

  // Calculate trailing returns
  const nav1M = findNavNearDaysAgo(data, 30)
  const nav6M = findNavNearDaysAgo(data, 182)
  const nav1Y = findNavNearDaysAgo(data, 365)
  const nav3Y = findNavNearDaysAgo(data, 365 * 3)
  const nav5Y = findNavNearDaysAgo(data, 365 * 5)

  const return1M = nav1M && nav1M > 0 ? Number((((latestNAV - nav1M) / nav1M) * 100).toFixed(2)) : null
  const return6M = nav6M && nav6M > 0 ? Number((((latestNAV - nav6M) / nav6M) * 100).toFixed(2)) : null
  const return1Y = nav1Y && nav1Y > 0 ? Number((((latestNAV - nav1Y) / nav1Y) * 100).toFixed(2)) : null
  const return3Y = nav3Y && nav3Y > 0 ? Number(((Math.pow(latestNAV / nav3Y, 1 / 3) - 1) * 100).toFixed(2)) : null
  const return5Y = nav5Y && nav5Y > 0 ? Number(((Math.pow(latestNAV / nav5Y, 1 / 5) - 1) * 100).toFixed(2)) : null

  // Chart data (sorted chronologically: "YYYY-MM-DD")
  const chartPoints = data
    .map(d => {
      const parts = d.date.split('-')
      const isoDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : d.date
      return {
        time: isoDate,
        value: Number(Number(d.nav).toFixed(4))
      }
    })
    .reverse()

  return {
    meta: details.meta,
    latestNAV,
    latestDate: data[0]?.date || '',
    navOnDate,
    matchedDate,
    trailingReturns: {
      '1M': return1M,
      '6M': return6M,
      '1Y': return1Y,
      '3Y': return3Y,
      '5Y': return5Y
    },
    chartPoints
  }
})
