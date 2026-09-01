import { getCsrfTokenFromCookie } from '../utils/csrf'
import { getClientDeviceFingerprint } from '../utils/device-fingerprint'

export interface User {
  id: string
  email: string
  role: string
  createdAt?: number
}

export interface SessionInfo {
  id: string
  deviceName: string
  ipAddress: string
  createdAt: number
  lastActiveAt: number
  expiresAt: number
  isCurrent?: boolean
}

export const authService = {
  async register(credentials: { email: string; password: string }): Promise<{ user: User; sessionId: string; expiresAt: number }> {
    const csrf = getCsrfTokenFromCookie()
    const fp = getClientDeviceFingerprint()

    return await $fetch('/api/auth/register', {
      method: 'POST',
      body: credentials,
      headers: {
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        'X-Device-Fingerprint': fp
      }
    })
  },

  async login(credentials: { email: string; password: string }): Promise<{ user: User; sessionId: string; expiresAt: number }> {
    const csrf = getCsrfTokenFromCookie()
    const fp = getClientDeviceFingerprint()

    return await $fetch('/api/auth/login', {
      method: 'POST',
      body: credentials,
      headers: {
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        'X-Device-Fingerprint': fp
      }
    })
  },

  async me(): Promise<{ user: User; session: SessionInfo | null }> {
    return await $fetch('/api/auth/me', {
      method: 'GET'
    })
  },

  async refresh(): Promise<{ success: boolean; sessionId: string; expiresAt: number }> {
    const csrf = getCsrfTokenFromCookie()
    return await $fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        ...(csrf ? { 'X-CSRF-Token': csrf } : {})
      }
    })
  },

  async logout(): Promise<{ success: boolean }> {
    const csrf = getCsrfTokenFromCookie()
    try {
      return await $fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          ...(csrf ? { 'X-CSRF-Token': csrf } : {})
        }
      })
    } catch {
      return { success: true }
    }
  },

  async getSessions(): Promise<{ sessions: SessionInfo[] }> {
    return await $fetch('/api/auth/sessions', {
      method: 'GET'
    })
  },

  async revokeSession(sessionId?: string, revokeAllOthers = false): Promise<{ success: boolean; message: string }> {
    const csrf = getCsrfTokenFromCookie()
    return await $fetch('/api/auth/sessions', {
      method: 'DELETE',
      body: { sessionId, revokeAllOthers },
      headers: {
        ...(csrf ? { 'X-CSRF-Token': csrf } : {})
      }
    })
  }
}
