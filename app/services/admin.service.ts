import { getCsrfTokenFromCookie } from '../utils/csrf'

export interface BlacklistIp {
  id: string
  ipAddress: string
  reason: string
  blockedBy: string
  blockedAt: number
  expiresAt: number | null
}

export interface BlacklistDevice {
  id: string
  deviceFingerprint: string
  deviceName: string
  reason: string
  blockedBy: string
  blockedAt: number
  expiresAt: number | null
}

export interface AuditLog {
  id: string
  userId: string | null
  eventType: string
  ipAddress: string
  userAgent: string
  deviceFingerprint: string | null
  status: string
  details: any
  createdAt: number
}

export const adminService = {
  async getBlacklists(): Promise<{ ips: BlacklistIp[]; devices: BlacklistDevice[] }> {
    return await $fetch('/api/admin/blacklist', { method: 'GET' })
  },

  async addBlacklist(payload: {
    type: 'ip' | 'device'
    value: string
    deviceName?: string
    reason: string
    durationHours?: number | null
  }): Promise<{ success: boolean; message: string }> {
    const csrf = getCsrfTokenFromCookie()
    return await $fetch('/api/admin/blacklist', {
      method: 'POST',
      body: payload,
      headers: { ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }
    })
  },

  async removeBlacklist(type: 'ip' | 'device', id: string): Promise<{ success: boolean; message: string }> {
    const csrf = getCsrfTokenFromCookie()
    return await $fetch('/api/admin/blacklist', {
      method: 'DELETE',
      body: { type, id },
      headers: { ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }
    })
  },

  async getAuditLogs(options?: { limit?: number; offset?: number; type?: string }): Promise<{ logs: AuditLog[] }> {
    return await $fetch('/api/admin/audit-logs', {
      method: 'GET',
      query: options
    })
  },

  async unlockUser(email: string): Promise<{ success: boolean; message: string }> {
    const csrf = getCsrfTokenFromCookie()
    return await $fetch('/api/admin/unlock-user', {
      method: 'POST',
      body: { email },
      headers: { ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }
    })
  }
}
