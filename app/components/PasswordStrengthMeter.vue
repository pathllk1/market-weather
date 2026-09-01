<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  password: string
}>()

const criteria = computed(() => {
  const pwd = props.password || ''
  return [
    { label: 'Minimum 12 characters', valid: pwd.length >= 12 },
    { label: 'At least one letter (a-z, A-Z)', valid: /[a-zA-Z]/.test(pwd) },
    { label: 'At least one number (0-9)', valid: /[0-9]/.test(pwd) },
    { label: 'At least one special character (!@#$...)', valid: /[^a-zA-Z0-9]/.test(pwd) }
  ]
})

const score = computed(() => {
  const metCount = criteria.value.filter((c) => c.valid).length
  return (metCount / criteria.value.length) * 100
})

const strengthColor = computed(() => {
  if (score.value === 100) return 'success'
  if (score.value >= 75) return 'primary'
  if (score.value >= 50) return 'warning'
  return 'error'
})

const strengthLabel = computed(() => {
  if (score.value === 100) return 'Very Strong (Optimal)'
  if (score.value >= 75) return 'Strong'
  if (score.value >= 50) return 'Moderate'
  return 'Weak (Insufficient)'
})
</script>

<template>
  <div v-if="props.password" class="space-y-2">
    <div class="flex items-center justify-between">
      <span class="text-xs text-muted">Password Strength</span>
      <UBadge :color="strengthColor" variant="subtle" size="sm">
        {{ strengthLabel }}
      </UBadge>
    </div>

    <UProgress :value="score" :color="strengthColor" size="sm" />

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1">
      <div
        v-for="(item, idx) in criteria"
        :key="idx"
        class="flex items-center gap-1.5 text-xs"
      >
        <UIcon
          :name="item.valid ? 'i-lucide-circle-check' : 'i-lucide-circle'"
          :class="item.valid ? 'text-success' : 'text-muted'"
        />
        <span :class="item.valid ? 'text-default' : 'text-muted'">
          {{ item.label }}
        </span>
      </div>
    </div>
  </div>
</template>
