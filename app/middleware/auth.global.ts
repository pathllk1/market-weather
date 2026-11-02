import { useAuth } from '../composables/useAuth'

export default defineNuxtRouteMiddleware(async (to) => {
  // 1. Whitelist unauthenticated bootstrap & system error pages
  const publicRoutes = ['/login', '/register', '/blocked']
  const isPublicRoute = publicRoutes.includes(to.path)

  const { user, isInitialized, fetchMe } = useAuth()

  // Ensure session is initialized from HttpOnly cookies
  if (!isInitialized.value) {
    await fetchMe()
  }

  // Case A: Unauthenticated user trying to access protected enterprise pages
  if (!user.value) {
    if (isPublicRoute) {
      return
    }
    // Redirect to login with intended destination
    const redirectQuery = to.fullPath !== '/' && to.fullPath !== '/dashboard'
      ? { redirect: to.fullPath }
      : {}
    return navigateTo({
      path: '/login',
      query: redirectQuery
    })
  }

  // Case B: Authenticated user visiting login/register -> redirect to dashboard
  if (isPublicRoute && (to.path === '/login' || to.path === '/register')) {
    return navigateTo('/dashboard')
  }

  // Case C: Role-based access control for administrative defense routes
  if (to.path.startsWith('/admin') && user.value.role !== 'admin') {
    return navigateTo('/dashboard')
  }
})

