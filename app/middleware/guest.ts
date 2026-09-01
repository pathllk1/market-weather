import { useAuth } from '../composables/useAuth'

export default defineNuxtRouteMiddleware(async () => {
  const { user, isInitialized, fetchMe } = useAuth()

  if (!isInitialized.value) {
    await fetchMe()
  }

  if (user.value) {
    return navigateTo('/dashboard')
  }
})
