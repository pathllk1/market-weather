<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})
</script>

<template>
  <div class="w-full space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold flex items-center gap-2">
          <UIcon name="i-lucide-sliders" class="text-primary" />
          System Access Administration
        </h1>
        <p class="text-xs text-muted">
          Enterprise access management, network filtering, and real-time audit history
        </p>
      </div>

      <div class="flex items-center gap-2">
        <UBadge color="primary" variant="subtle">
          Access Control Engine
        </UBadge>
        <UBadge color="success" variant="subtle">
          Database Connected
        </UBadge>
      </div>
    </div>

    <!-- Blacklist Operations (Full Width) -->
    <div class="w-full">
      <BlacklistManager />
    </div>

    <!-- Security Audit Logs & Unlock Tools (Full Width) -->
    <div class="w-full">
      <AuditLogViewer />
    </div>
  </div>
</template>
