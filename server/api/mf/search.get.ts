import { searchMutualFunds } from '~~/server/utils/mfapi'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = String(query.q || '').trim()
  if (!q || q.length < 2) {
    return { results: [] }
  }

  const results = await searchMutualFunds(q)
  return { results }
})
