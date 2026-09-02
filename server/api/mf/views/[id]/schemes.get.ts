import { getTursoClient } from '~~/server/utils/turso'
import { getMutualFundDetails, parseCategoryFromScheme } from '~~/server/utils/mfapi'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const userId = user?.id || 'guest_user'
  const viewId = getRouterParam(event, 'id')

  if (!viewId) {
    throw createError({ statusCode: 400, statusMessage: 'View ID is required' })
  }

  const db = getTursoClient()
  const viewRes = await db.execute({
    sql: `SELECT id, name, description, scheme_codes, is_default
          FROM user_mf_views
          WHERE id = ? AND user_id = ?`,
    args: [viewId, userId]
  })

  if (viewRes.rows.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'View not found' })
  }

  const row = viewRes.rows[0] as any
  const schemeCodes: number[] = typeof row.scheme_codes === 'string'
    ? JSON.parse(row.scheme_codes)
    : row.scheme_codes || []

  // Fetch live AMFI scheme details in parallel with timeout/fallback
  const schemePromises = schemeCodes.map(async (code) => {
    try {
      const details = await getMutualFundDetails(code)
      if (!details) return null

      const data = details.data || []
      const latestNAV = data[0] ? Number(data[0].nav) : 0
      const prevNAV = data[1] ? Number(data[1].nav) : latestNAV
      const dailyChange = Number((latestNAV - prevNAV).toFixed(4))
      const dailyChangePct = prevNAV > 0 ? Number(((dailyChange / prevNAV) * 100).toFixed(2)) : 0

      // Compute trailing returns
      const findNavNDaysAgo = (days: number): number | null => {
        if (data.length <= 1) return null
        const targetIdx = Math.min(Math.round(days * (5 / 7)), data.length - 1)
        const entry = data[targetIdx]
        return entry ? Number(entry.nav) : null
      }

      const cagr = (pastNav: number | null, years: number): number | null => {
        if (!pastNav || pastNav <= 0 || latestNAV <= 0) return null
        const totalGrowth = latestNAV / pastNav
        return Number(((Math.pow(totalGrowth, 1 / years) - 1) * 100).toFixed(2))
      }

      const absReturn = (pastNav: number | null): number | null => {
        if (!pastNav || pastNav <= 0 || latestNAV <= 0) return null
        return Number((((latestNAV - pastNav) / pastNav) * 100).toFixed(2))
      }

      const trailingReturns = {
        '1M': absReturn(findNavNDaysAgo(30)),
        '6M': absReturn(findNavNDaysAgo(182)),
        '1Y': absReturn(findNavNDaysAgo(365)),
        '3Y': cagr(findNavNDaysAgo(365 * 3), 3),
        '5Y': cagr(findNavNDaysAgo(365 * 5), 5)
      }

      const category = details.meta?.scheme_category || parseCategoryFromScheme(details.meta?.scheme_name || '')

      return {
        schemeCode: code,
        schemeName: details.meta?.scheme_name || `Scheme #${code}`,
        fundHouse: details.meta?.fund_house || 'AMC',
        schemeType: details.meta?.scheme_type || 'Open Ended',
        category,
        latestNAV,
        navDate: data[0]?.date || 'Latest',
        dailyChange,
        dailyChangePct,
        trailingReturns
      }
    } catch (err) {
      console.error(`Error loading scheme ${code}:`, err)
      return null
    }
  })

  const results = (await Promise.all(schemePromises)).filter(Boolean)

  return {
    view: {
      id: row.id,
      name: row.name,
      description: row.description,
      is_default: Boolean(row.is_default),
      scheme_codes: schemeCodes
    },
    schemes: results
  }
})
