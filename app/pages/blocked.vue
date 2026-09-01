<script setup lang="ts">
definePageMeta({
  layout: 'auth'
})

const route = useRoute()
const blockType = route.query.type === 'device' ? 'Device Fingerprint' : 'IP Address'
</script>

<template>
  <UCard class="w-full">
    <template #header>
      <div class="text-center space-y-2">
        <UIcon name="i-lucide-ban" class="text-error text-5xl mx-auto" />
        <h1 class="text-xl font-bold text-error">Access Restricted</h1>
        <UBadge color="error" variant="subtle" size="sm">
          Policy Restriction 403
        </UBadge>
      </div>
    </template>

    <div class="space-y-4 text-center">
      <p class="text-sm text-default">
        Your <strong>{{ blockType }}</strong> has been restricted from establishing connections to this enterprise network.
      </p>

      <UAlert
        color="error"
        variant="subtle"
        icon="i-lucide-octagon-alert"
        title="Access Restriction Active"
        description="Requests from this origin are blocked in accordance with access control policy."
      />

      <div class="p-3 border border-default rounded-md text-xs text-muted font-mono">
        Incident ID: {{ Math.random().toString(36).substring(2, 10).toUpperCase() }} • Protocol: HTTPS
      </div>
    </div>

    <template #footer>
      <div class="text-center text-xs text-muted">
        If you believe this is an error, please contact your system administrator with the Incident ID.
      </div>
    </template>
  </UCard>
</template>
