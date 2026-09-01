import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

export interface AccessTokenPayload extends JWTPayload {
  sub: string
  email: string
  role: string
  sid: string
  jti: string
}

export interface RefreshTokenPayload extends JWTPayload {
  sub: string
  sid: string
  fid: string
  jti: string
}

// 15 minutes = 900 seconds
export const ACCESS_TOKEN_EXPIRY = '15m'
export const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60

// 30 days = 2592000 seconds
export const REFRESH_TOKEN_EXPIRY = '30d'
export const REFRESH_TOKEN_EXPIRY_SECONDS = 30 * 24 * 60 * 60

function getAccessSecret(): Uint8Array {
  const config = useRuntimeConfig()
  const secret = config.jwtAccessSecret || process.env.JWT_ACCESS_SECRET || 'fallback_secret_for_access_token_min_32_bytes_hs256!'
  return new TextEncoder().encode(secret)
}

function getRefreshSecret(): Uint8Array {
  const config = useRuntimeConfig()
  const secret = config.jwtRefreshSecret || process.env.JWT_REFRESH_SECRET || 'fallback_secret_for_refresh_token_min_64_bytes_hs512_military_grade_security!'
  return new TextEncoder().encode(secret)
}

/**
 * Sign an Access Token (15 min lifespan, HS256 algorithm)
 */
export async function signAccessToken(payload: {
  userId: string
  email: string
  role: string
  sessionId: string
  tokenId?: string
}): Promise<{ token: string; jti: string; expiresAt: number }> {
  const jti = payload.tokenId || generateUUID()
  const secret = getAccessSecret()
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + ACCESS_TOKEN_EXPIRY_SECONDS

  const token = await new SignJWT({
    email: payload.email,
    role: payload.role,
    sid: payload.sessionId
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(payload.userId)
    .setJti(jti)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(secret)

  return { token, jti, expiresAt }
}

/**
 * Sign a Refresh Token (30 days lifespan, HS512 algorithm)
 */
export async function signRefreshToken(payload: {
  userId: string
  sessionId: string
  familyId: string
  tokenId?: string
}): Promise<{ token: string; jti: string; expiresAt: number }> {
  const jti = payload.tokenId || generateUUID()
  const secret = getRefreshSecret()
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + REFRESH_TOKEN_EXPIRY_SECONDS

  const token = await new SignJWT({
    sid: payload.sessionId,
    fid: payload.familyId
  })
    .setProtectedHeader({ alg: 'HS512', typ: 'JWT' })
    .setSubject(payload.userId)
    .setJti(jti)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(secret)

  return { token, jti, expiresAt }
}

/**
 * Verify an Access Token strictly with HS256
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const secret = getAccessSecret()
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
      clockTolerance: 5
    })
    return payload as AccessTokenPayload
  } catch {
    return null
  }
}

/**
 * Verify a Refresh Token strictly with HS512
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
  try {
    const secret = getRefreshSecret()
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS512'],
      clockTolerance: 5
    })
    return payload as RefreshTokenPayload
  } catch {
    return null
  }
}
