<script setup lang="ts">
// Route alias forwarding to /market
await navigateTo('/market', { replace: true })
</script>

<template>
  <div class="flex items-center justify-center min-h-[50vh]">
    <UIcon name="i-lucide-loader-2" class="animate-spin text-2xl text-primary" />
  </div>
</template>
