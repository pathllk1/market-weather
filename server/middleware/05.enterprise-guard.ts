import { defineEventHandler, getRequestPath, getHeader, createError } from 'h3'

export default defineEventHandler((event) => {
  const path = getRequestPath(event)

  // 1. Skip static assets, Nuxt internals, and error pages
  if (
    !path.startsWith('/api/') ||
    path.startsWith('/_nuxt') ||
    path.startsWith('/__nuxt') ||
    path.startsWith('/api/_nuxt_icon') ||
    path.startsWith('/favicon.ico') ||
    path === '/blocked'
  ) {
    return
  }

  // 2. Explicit whitelist for authentication bootstrap endpoints
  const isAuthWhitelisted =
    path === '/api/auth/login' ||
    path === '/api/auth/register' ||
    path === '/api/auth/refresh' ||
    path === '/api/auth/logout' ||
    path === '/api/auth/me'

  // Also exempt CRON background runner on sync trigger if valid secret is provided
  const authHeader = getHeader(event, 'x-sync-secret')
  const cronSecret = process.env.CRON_SECRET
  const isCronAuthorized = Boolean(cronSecret && authHeader && authHeader === cronSecret)

  if (isAuthWhitelisted || isCronAuthorized) {
    return
  }

  // 3. Zero-Trust Enforcement: All other /api/* endpoints require an authenticated user
  const user = event.context.user
  if (!user || !user.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized: Enterprise session clearance required. Please authenticate at /login.'
    })
  }

  // 4. Role-Based Access Control (RBAC): Admin routes require admin role
  if (path.startsWith('/api/admin/') && user.role !== 'admin') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden: Administrative clearance required for this operation.'
    })
  }
})

