<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '../composables/useAuth'

definePageMeta({
  layout: 'auth',
  middleware: 'guest'
})

const { login, isLoading } = useAuth()

const email = ref('')
const password = ref('')
const errorMessage = ref<string | null>(null)
const lockoutRemainingSeconds = ref<number | null>(null)
let countdownInterval: any = null

async function handleLogin() {
  if (!email.value || !password.value) return

  try {
    errorMessage.value = null
    await login({ email: email.value, password: password.value })
    navigateTo('/dashboard')
  } catch (err: any) {
    const message = err?.data?.statusMessage || err?.message || 'Login failed.'
    errorMessage.value = message

    // Check if error is 423 Locked
    if (err?.statusCode === 423) {
      const match = message.match(/(\d+)\s*seconds/)
      if (match) {
        startCountdown(parseInt(match[1], 10))
      }
    }
  }
}

function startCountdown(seconds: number) {
  lockoutRemainingSeconds.value = seconds
  if (countdownInterval) clearInterval(countdownInterval)

  countdownInterval = setInterval(() => {
    if (lockoutRemainingSeconds.value && lockoutRemainingSeconds.value > 0) {
      lockoutRemainingSeconds.value--
    } else {
      lockoutRemainingSeconds.value = null
      clearInterval(countdownInterval)
    }
  }, 1000)
}
</script>

<template>
  <UCard class="w-full">
    <template #header>
      <div class="text-center space-y-1">
        <UIcon name="i-lucide-shield-check" class="text-primary text-3xl mx-auto" />
        <h2 class="text-lg font-bold">Enterprise ERP Sign In</h2>
        <p class="text-xs text-muted">
          Secure business access portal with automated account protection
        </p>
      </div>
    </template>

    <form class="space-y-4" @submit.prevent="handleLogin">
      <!-- Error / Lockout Alert -->
      <UAlert
        v-if="lockoutRemainingSeconds && lockoutRemainingSeconds > 0"
        color="error"
        variant="solid"
        icon="i-lucide-lock"
        title="Account Temporarily Locked"
        :description="`Continuous failed attempts detected. Access is locked for ${lockoutRemainingSeconds} seconds.`"
      />

      <UAlert
        v-else-if="errorMessage"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="errorMessage"
        close
        @update:open="errorMessage = null"
      />

      <div>
        <label class="block text-xs font-medium mb-1">Work Email</label>
        <UInput
          v-model="email"
          type="email"
          placeholder="user@enterprise.com"
          icon="i-lucide-mail"
          required
          autofocus
          size="sm"
          class="w-full"
        />
      </div>

      <div>
        <label class="block text-xs font-medium mb-1">Password</label>
        <UInput
          v-model="password"
          type="password"
          placeholder="••••••••••••"
          icon="i-lucide-key"
          required
          size="sm"
          class="w-full"
        />
      </div>

      <div class="flex items-center justify-between text-xs text-muted">
        <span>Continuous security active</span>
        <span class="text-primary font-medium">5-Attempt Threshold</span>
      </div>

      <UButton
        type="submit"
        color="primary"
        variant="solid"
        block
        size="sm"
        :loading="isLoading"
        :disabled="!!lockoutRemainingSeconds && lockoutRemainingSeconds > 0"
        icon="i-lucide-log-in"
      >
        Sign In to Portal
      </UButton>
    </form>

    <template #footer>
      <div class="flex items-center justify-between text-xs text-muted">
        <span>Need an account?</span>
        <NuxtLink to="/register" class="text-primary font-medium hover:underline">
          Enroll Account
        </NuxtLink>
      </div>
    </template>
  </UCard>
</template>
