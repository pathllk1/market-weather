import { getTursoClient } from '~~/server/utils/turso'
import { randomUUID } from 'crypto'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const userId = user?.id || 'guest_user'

  const db = getTursoClient()

  const res = await db.execute({
    sql: `SELECT id, user_id, name, description, scheme_codes, is_default, created_at, updated_at
          FROM user_mf_views
          WHERE user_id = ?
          ORDER BY is_default DESC, updated_at DESC`,
    args: [userId]
  })

  let views = res.rows as any[]

  // Seed default views if user has none
  if (views.length === 0) {
    const defaultViews = [
      {
        id: randomUUID(),
        name: 'Indian Core Wealth (Top Funds)',
        description: 'Institutional benchmark direct growth funds across Flexi Cap, Mid Cap, and Bluechip',
        scheme_codes: JSON.stringify([122639, 118989, 120503, 119598, 120716]),
        is_default: 1
      },
      {
        id: randomUUID(),
        name: 'High-Alpha Aggressive Growth',
        description: 'Small cap and mid cap high momentum funds with maximum 3Y/5Y alpha',
        scheme_codes: JSON.stringify([120828, 120503, 118989, 120716]),
        is_default: 0
      },
      {
        id: randomUUID(),
        name: 'ELSS Tax Savers (80C) & Liquid',
        description: 'Tax-saving equity schemes and liquid parking funds',
        scheme_codes: JSON.stringify([120465, 120743, 122639]),
        is_default: 0
      }
    ]

    const now = Date.now()
    for (const v of defaultViews) {
      await db.execute({
        sql: `INSERT INTO user_mf_views (id, user_id, name, description, scheme_codes, is_default, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [v.id, userId, v.name, v.description, v.scheme_codes, v.is_default, now, now]
      })
    }

    views = defaultViews.map(v => ({
      ...v,
      user_id: userId,
      created_at: now,
      updated_at: now
    }))
  }

  return {
    views: views.map(v => ({
      ...v,
      scheme_codes: typeof v.scheme_codes === 'string' ? JSON.parse(v.scheme_codes) : v.scheme_codes,
      is_default: Boolean(v.is_default)
    }))
  }
})
