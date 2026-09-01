import type { H3Event } from 'h3'
import { generateCsrfToken } from './crypto'

export const COOKIE_ACCESS_TOKEN = 'access_token'
export const COOKIE_REFRESH_TOKEN = 'refresh_token'
export const COOKIE_CSRF_TOKEN = 'csrf_token'

export function setAuthCookies(
  event: H3Event,
  accessToken: string,
  refreshToken: string,
  csrfToken?: string
) {
  const isProduction = process.env.NODE_ENV === 'production'

  // Access Token: HttpOnly, SameSite=Strict, 15 Minutes
  setCookie(event, COOKIE_ACCESS_TOKEN, accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: ACCESS_TOKEN_EXPIRY_SECONDS
  })

  // Refresh Token: HttpOnly, SameSite=Strict, 30 Days
  setCookie(event, COOKIE_REFRESH_TOKEN, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: REFRESH_TOKEN_EXPIRY_SECONDS
  })

  // CSRF Token: SameSite=Strict, readable by client JS to attach to X-CSRF-Token header
  if (csrfToken) {
    setCookie(event, COOKIE_CSRF_TOKEN, csrfToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: REFRESH_TOKEN_EXPIRY_SECONDS
    })
  }
}

export function setAccessTokenCookie(event: H3Event, accessToken: string) {
  const isProduction = process.env.NODE_ENV === 'production'
  setCookie(event, COOKIE_ACCESS_TOKEN, accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: ACCESS_TOKEN_EXPIRY_SECONDS
  })
}

export function clearAuthCookies(event: H3Event) {
  const isProduction = process.env.NODE_ENV === 'production'

  deleteCookie(event, COOKIE_ACCESS_TOKEN, {
    path: '/',
    secure: isProduction,
    sameSite: 'strict'
  })

  deleteCookie(event, COOKIE_REFRESH_TOKEN, {
    path: '/',
    secure: isProduction,
    sameSite: 'strict'
  })

  // Issue a fresh CSRF token so subsequent guest/login requests are never blocked
  const freshCsrf = generateCsrfToken()
  setCookie(event, COOKIE_CSRF_TOKEN, freshCsrf, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: REFRESH_TOKEN_EXPIRY_SECONDS
  })
}
