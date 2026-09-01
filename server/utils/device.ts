import type { H3Event } from 'h3'
import { hashSha256 } from './crypto'

export function getClientIp(event: H3Event): string {
  const req = event.node.req
  const headers = req.headers

  const cfConnectingIp = headers['cf-connecting-ip']
  if (typeof cfConnectingIp === 'string') return cfConnectingIp.trim()

  const xRealIp = headers['x-real-ip']
  if (typeof xRealIp === 'string') return xRealIp.trim()

  const xForwardedFor = headers['x-forwarded-for']
  if (typeof xForwardedFor === 'string') {
    const ips = xForwardedFor.split(',')
    const firstIp = ips[0]
    if (firstIp && firstIp.trim()) {
      return firstIp.trim()
    }
  }

  const remoteAddress = req.socket?.remoteAddress
  if (remoteAddress) {
    if (remoteAddress === '::1') return '127.0.0.1'
    if (remoteAddress.startsWith('::ffff:')) return remoteAddress.slice(7)
    return remoteAddress
  }

  return '127.0.0.1'
}

export function getUserAgent(event: H3Event): string {
  return (event.node.req.headers['user-agent'] as string) || 'Unknown Device'
}

export function getDeviceFingerprint(event: H3Event): { fingerprint: string; deviceName: string } {
  const headers = event.node.req.headers
  const ua = (headers['user-agent'] as string) || 'Unknown'
  const acceptLang = (headers['accept-language'] as string) || 'en'
  const platform = (headers['sec-ch-ua-platform'] as string) || ''
  const clientFpHeader = (headers['x-device-fingerprint'] as string) || ''

  // Deterministic server-side device hash
  const rawFingerprint = `${ua}|${acceptLang}|${platform}|${clientFpHeader}`
  const fingerprint = hashSha256(rawFingerprint)

  // Derive readable device name
  let os = 'Unknown OS'
  if (/windows/i.test(ua)) os = 'Windows'
  else if (/macintosh|mac os/i.test(ua)) os = 'macOS'
  else if (/iphone|ipad/i.test(ua)) os = 'iOS'
  else if (/android/i.test(ua)) os = 'Android'
  else if (/linux/i.test(ua)) os = 'Linux'

  let browser = 'Browser'
  if (/edg/i.test(ua)) browser = 'Edge'
  else if (/chrome/i.test(ua)) browser = 'Chrome'
  else if (/firefox/i.test(ua)) browser = 'Firefox'
  else if (/safari/i.test(ua)) browser = 'Safari'

  const deviceName = `${browser} on ${os}`

  return {
    fingerprint,
    deviceName
  }
}
