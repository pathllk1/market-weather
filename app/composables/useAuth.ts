import { ref, computed } from 'vue'
import { authService, type User, type SessionInfo } from '../services/auth.service'

export function useAuth() {
  const user = useState<User | null>('auth_user', () => null)
  const session = useState<SessionInfo | null>('auth_session', () => null)
  const isInitialized = useState<boolean>('auth_initialized', () => false)
  const isLoading = ref(false)
  const authError = ref<string | null>(null)

  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

  async function fetchMe() {
    try {
      isLoading.value = true
      authError.value = null
      const res = await authService.me()
      user.value = res.user
      session.value = res.session
    } catch {
      user.value = null
      session.value = null
    } finally {
      isLoading.value = false
      isInitialized.value = true
    }
  }

  async function login(credentials: { email: string; password: string }) {
    try {
      isLoading.value = true
      authError.value = null
      const res = await authService.login(credentials)
      user.value = res.user
      await fetchMe()

      // Inform other tabs
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const channel = new BroadcastChannel('erp_security_auth')
        channel.postMessage({ type: 'LOGIN', user: res.user })
        channel.close()
      }

      return res
    } catch (err: any) {
      authError.value = err?.data?.statusMessage || err?.message || 'Login failed.'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function register(credentials: { email: string; password: string }) {
    try {
      isLoading.value = true
      authError.value = null
      const res = await authService.register(credentials)
      user.value = res.user
      await fetchMe()

      // Inform other tabs
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const channel = new BroadcastChannel('erp_security_auth')
        channel.postMessage({ type: 'LOGIN', user: res.user })
        channel.close()
      }

      return res
    } catch (err: any) {
      authError.value = err?.data?.statusMessage || err?.message || 'Registration failed.'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const isLoggingOut = useState<boolean>('auth_is_logging_out', () => false)

  async function logout(opts?: { skipBroadcast?: boolean } | unknown) {
    if (isLoggingOut.value) return
    isLoggingOut.value = true

    const skipBroadcast = opts && typeof opts === 'object' && 'skipBroadcast' in opts
      ? Boolean((opts as { skipBroadcast?: boolean }).skipBroadcast)
      : false

    try {
      isLoading.value = true
      await authService.logout()
    } catch (err) {
      console.warn('Logout API error:', err)
    } finally {
      user.value = null
      session.value = null
      isLoading.value = false
      isInitialized.value = true

      // Inform other tabs (only once, avoid loopback)
      if (!skipBroadcast && typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        try {
          const channel = new BroadcastChannel('erp_security_auth')
          channel.postMessage({ type: 'LOGOUT' })
          channel.close()
        } catch {}
      }

      isLoggingOut.value = false
      await navigateTo('/login', { replace: true })
    }
  }

  return {
    user,
    session,
    isInitialized,
    isLoading,
    authError,
    isAuthenticated,
    isAdmin,
    fetchMe,
    login,
    register,
    logout
  }
}
