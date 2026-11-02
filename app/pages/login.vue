<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '../composables/useAuth'

definePageMeta({
  layout: 'auth',
  middleware: 'guest'
})

const { login, isLoading } = useAuth()
const route = useRoute()

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
    const target = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') && !route.query.redirect.startsWith('//')
      ? route.query.redirect
      : '/dashboard'
    navigateTo(target)
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
  <div class="space-y-6">
    <div class="space-y-1">
      <h2 class="text-xl font-bold tracking-tight text-slate-900">
        Enterprise Clearance Login
      </h2>
      <p class="text-xs text-slate-500">
        Enter your cryptographically registered credentials to access the enterprise terminal
      </p>
    </div>

    <!-- Error / Lockout Alert -->
    <div
      v-if="errorMessage"
      class="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2"
    >
      <UIcon
        name="i-lucide-alert-triangle"
        class="w-4 h-4 text-red-500 shrink-0 mt-0.5"
      />
      <div>
        <div class="font-medium">
          {{ errorMessage }}
        </div>
        <div
          v-if="lockoutRemainingSeconds"
          class="font-mono mt-1 text-red-600 font-bold"
        >
          Security cool-down remaining: {{ lockoutRemainingSeconds }}s
        </div>
      </div>
    </div>

    <form
      class="space-y-4"
      @submit.prevent="handleLogin"
    >
      <UFormField
        label="Clearance Identity (Email)"
        name="email"
      >
        <UInput
          v-model="email"
          type="email"
          placeholder="officer@enterprise.defense"
          icon="i-lucide-mail"
          class="w-full"
          :disabled="isLoading || lockoutRemainingSeconds !== null"
          required
        />
      </UFormField>

      <UFormField
        label="Access Password"
        name="password"
      >
        <UInput
          v-model="password"
          type="password"
          placeholder="••••••••••••"
          icon="i-lucide-lock"
          class="w-full"
          :disabled="isLoading || lockoutRemainingSeconds !== null"
          required
        />
      </UFormField>

      <UButton
        type="submit"
        block
        color="primary"
        class="w-full mt-2"
        :loading="isLoading"
        :disabled="lockoutRemainingSeconds !== null"
      >
        Authenticate Session
      </UButton>
    </form>

    <div class="text-center text-xs text-slate-400">
      Need credentials?
      <NuxtLink
        to="/register"
        class="text-primary font-semibold hover:underline ml-1"
      >
        Register Account
      </NuxtLink>
    </div>
  </div>
</template>
