/**
 * Generate a client-side device fingerprint based on browser environment attributes
 */
export function getClientDeviceFingerprint(): string {
  if (typeof window === 'undefined') return 'server'

  const screenResolution = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  const language = navigator.language || ''
  const hardwareConcurrency = navigator.hardwareConcurrency || 0
  const platform = navigator.platform || ''

  const raw = `${screenResolution}|${timezone}|${language}|${hardwareConcurrency}|${platform}`

  // Simple string hash
  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0 // Convert to 32bit integer
  }

  return Math.abs(hash).toString(16)
}
