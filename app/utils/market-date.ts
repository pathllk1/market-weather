/**
 * Formats various date representations (Unix ms, ISO string, 'DD/MM/YYYY, h:mm:ss a', Date object)
 * into a clean standard Indian format: 'D MMM YYYY, hh:mm a' (e.g. '18 Nov 2026, 05:11 pm')
 */
export function formatMarketDateTime(raw: unknown): string | undefined {
  if (!raw) return undefined

  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return undefined
    return raw.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }

  const str = String(raw).trim()
  if (!str) return undefined

  // Check if pure numeric timestamp (epoch seconds or milliseconds)
  const num = Number(str)
  if (!isNaN(num) && num > 1000000000) {
    const d = new Date(num > 1000000000000 ? num : num * 1000)
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    }
  }

  // Try direct Date parse
  const directDate = new Date(str)
  if (!isNaN(directDate.getTime()) && directDate.getFullYear() > 2000) {
    return directDate.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }

  // Handle DD/MM/YYYY or DD-MM-YYYY formats (e.g. 18/11/2026, 1:31:23 pm)
  const dmyMatch = str.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}),?\s*(.*)$/)
  if (dmyMatch) {
    const day = Number(dmyMatch[1])
    const month = Number(dmyMatch[2])
    const year = Number(dmyMatch[3])
    const remainder = dmyMatch[4]?.trim() || ''

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const monthStr = months[month - 1] || String(month)

    if (remainder) {
      const timeMatch = remainder.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([a-zA-Z]+)?$/)
      if (timeMatch) {
        const h = timeMatch[1].padStart(2, '0')
        const m = timeMatch[2]
        const ampm = (timeMatch[3] || '').toLowerCase()
        return `${day} ${monthStr} ${year}, ${h}:${m} ${ampm}`.trim()
      }
      return `${day} ${monthStr} ${year}, ${remainder}`
    }
    return `${day} ${monthStr} ${year}`
  }

  return str
}
