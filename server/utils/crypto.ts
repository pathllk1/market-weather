import crypto from 'node:crypto'

/**
 * Generate cryptographically secure random bytes as hex
 */
export function generateRandomHex(byteCount = 32): string {
  return crypto.randomBytes(byteCount).toString('hex')
}

/**
 * Generate secure UUID v4
 */
export function generateUUID(): string {
  return crypto.randomUUID()
}

/**
 * Hash data using SHA-256
 */
export function hashSha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}

/**
 * Hash data using SHA-512
 */
export function hashSha512(data: string): string {
  return crypto.createHash('sha512').update(data).digest('hex')
}

/**
 * Hash a password using Node.js scrypt with a unique 32-byte salt
 * Military-grade memory-hard derivation (N=16384, r=8, p=1, keylen=64)
 */
export function hashPassword(password: string, customSalt?: string): Promise<{ hash: string; salt: string }> {
  return new Promise((resolve, reject) => {
    const salt = customSalt || crypto.randomBytes(32).toString('hex')
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) return reject(err)
      resolve({
        hash: derivedKey.toString('hex'),
        salt
      })
    })
  })
}

/**
 * Constant-time password verification to prevent timing attacks
 */
export async function verifyPassword(password: string, storedHash: string, salt: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) return reject(err)
      const storedKeyBuffer = Buffer.from(storedHash, 'hex')
      if (storedKeyBuffer.length !== derivedKey.length) {
        return resolve(false)
      }
      resolve(crypto.timingSafeEqual(storedKeyBuffer, derivedKey))
    })
  })
}

/**
 * Generate a signed CSRF token (random value + HMAC signature)
 */
export function generateCsrfToken(): string {
  const config = useRuntimeConfig()
  const secret = config.csrfSecret || 'default_fallback_csrf_secret_min_32_bytes_defense'
  const rawId = crypto.randomBytes(24).toString('hex')
  const timestamp = Date.now().toString()
  const payload = `${rawId}.${timestamp}`
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${signature}`
}

/**
 * Validate a signed CSRF token
 */
export function verifyCsrfToken(token: string, maxAgeMs = 24 * 60 * 60 * 1000): boolean {
  if (!token || typeof token !== 'string') return false
  const parts = token.split('.')
  if (parts.length !== 3) return false

  const rawId = parts[0]
  const timestampStr = parts[1]
  const signature = parts[2]
  if (!rawId || !timestampStr || !signature) return false

  const timestamp = parseInt(timestampStr, 10)
  if (isNaN(timestamp) || Date.now() - timestamp > maxAgeMs) {
    return false // Expired CSRF token
  }

  const config = useRuntimeConfig()
  const secret = config.csrfSecret || 'default_fallback_csrf_secret_min_32_bytes_defense'
  const payload = `${rawId}.${timestampStr}`
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex')

  const sigBuffer = Buffer.from(signature, 'hex')
  const expectedBuffer = Buffer.from(expectedSig, 'hex')

  if (sigBuffer.length !== expectedBuffer.length) return false
  return crypto.timingSafeEqual(sigBuffer, expectedBuffer)
}
