<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuth } from '../composables/useAuth'

definePageMeta({
  layout: 'auth',
  middleware: 'guest'
})

const { register, isLoading } = useAuth()

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const errorMessage = ref<string | null>(null)

const isPasswordValid = computed(() => {
  const p = password.value
  return (
    p.length >= 12 &&
    /[a-zA-Z]/.test(p) &&
    /[0-9]/.test(p) &&
    /[^a-zA-Z0-9]/.test(p)
  )
})

const doPasswordsMatch = computed(() => {
  return password.value && password.value === confirmPassword.value
})

async function handleRegister() {
  if (!email.value || !password.value) {
    errorMessage.value = 'Please fill in all required fields.'
    return
  }

  if (!isPasswordValid.value) {
    errorMessage.value = 'Password does not meet complexity requirements (min 12 characters, including letter, number, and special character).'
    return
  }

  if (!doPasswordsMatch.value) {
    errorMessage.value = 'Passwords do not match.'
    return
  }

  try {
    errorMessage.value = null
    await register({ email: email.value, password: password.value })
    navigateTo('/dashboard')
  } catch (err: any) {
    errorMessage.value = err?.data?.statusMessage || err?.message || 'Registration failed.'
  }
}
</script>

<template>
  <UCard class="w-full">
    <template #header>
      <div class="text-center space-y-1">
        <UIcon name="i-lucide-user-check" class="text-primary text-3xl mx-auto" />
        <h2 class="text-lg font-bold">Create ERP User Account</h2>
        <p class="text-xs text-muted">
          Enterprise user enrollment with encrypted access authentication
        </p>
      </div>
    </template>

    <form class="space-y-4" @submit.prevent="handleRegister">
      <UAlert
        v-if="errorMessage"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
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
        <label class="block text-xs font-medium mb-1">Password (Min 12 Chars)</label>
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

      <PasswordStrengthMeter :password="password" />

      <div>
        <label class="block text-xs font-medium mb-1">Confirm Password</label>
        <UInput
          v-model="confirmPassword"
          type="password"
          placeholder="••••••••••••"
          icon="i-lucide-lock"
          required
          size="sm"
          class="w-full"
        />
        <p v-if="confirmPassword && !doPasswordsMatch" class="text-xs text-error mt-1">
          Passwords do not match.
        </p>
      </div>

      <UButton
        type="submit"
        color="primary"
        variant="solid"
        block
        size="sm"
        :loading="isLoading"
        icon="i-lucide-user-plus"
      >
        Create Account
      </UButton>
    </form>

    <template #footer>
      <div class="flex items-center justify-between text-xs text-muted">
        <span>Already registered?</span>
        <NuxtLink to="/login" class="text-primary font-medium hover:underline">
          Sign In
        </NuxtLink>
      </div>
    </template>
  </UCard>
</template>
