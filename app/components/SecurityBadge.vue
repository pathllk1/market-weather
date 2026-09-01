<template>
  <UCard variant="subtle" class="w-full">
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <UIcon name="i-lucide-shield-check" class="text-primary text-2xl shrink-0" />
        <div>
          <h4 class="text-sm font-semibold">Enterprise Access Security</h4>
          <p class="text-xs text-muted">
            Continuous threat protection, automatic session sliding, and device verification active
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <UBadge color="primary" variant="subtle" size="xs">
          Multi-Tier Authentication
        </UBadge>
        <UBadge color="info" variant="subtle" size="xs">
          30-Day Session Continuity
        </UBadge>
        <UBadge color="success" variant="subtle" size="xs">
          Strict Cookie Guard
        </UBadge>
        <UBadge color="neutral" variant="subtle" size="xs">
          Edge Data Sync
        </UBadge>
      </div>
    </div>
  </UCard>
</template>
