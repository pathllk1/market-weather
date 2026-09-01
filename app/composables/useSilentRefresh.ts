import { useAuth } from './useAuth'
import { authService } from '../services/auth.service'

export function useSilentRefresh() {
  const { fetchMe, logout, isAuthenticated, user } = useAuth()
  let broadcastChannel: BroadcastChannel | null = null

  async function handleVisibilityOrFocus() {
    if (typeof document === 'undefined' || !isAuthenticated.value || !user.value) return

    if (document.visibilityState === 'visible') {
      try {
        await authService.refresh()
        await fetchMe()
      } catch (err: any) {
        if (err?.statusCode === 401 || err?.statusCode === 403) {
          await logout(false)
        }
      }
    }
  }

  function setupChannel() {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return

    broadcastChannel = new BroadcastChannel('erp_security_auth')
    broadcastChannel.onmessage = async (e) => {
      if (e.data?.type === 'LOGOUT') {
        // Skip re-broadcast to prevent infinite loop across tabs
        await logout({ skipBroadcast: true })
      } else if (e.data?.type === 'LOGIN') {
        await fetchMe()
      }
    }
  }

  function init() {
    if (typeof window === 'undefined') return

    setupChannel()
    document.addEventListener('visibilitychange', handleVisibilityOrFocus)
    window.addEventListener('focus', handleVisibilityOrFocus)
  }

  function destroy() {
    if (typeof window === 'undefined') return

    document.removeEventListener('visibilitychange', handleVisibilityOrFocus)
    window.removeEventListener('focus', handleVisibilityOrFocus)
    if (broadcastChannel) {
      broadcastChannel.close()
      broadcastChannel = null
    }
  }

  return {
    init,
    destroy
  }
}
