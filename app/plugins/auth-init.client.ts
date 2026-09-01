import { useAuth } from '../composables/useAuth'
import { useSilentRefresh } from '../composables/useSilentRefresh'

export default defineNuxtPlugin(async () => {
  const { fetchMe } = useAuth()
  const { init } = useSilentRefresh()

  // Bootstrap session state from HttpOnly cookies
  await fetchMe()

  // Setup tab sync and wake listeners
  init()
})
