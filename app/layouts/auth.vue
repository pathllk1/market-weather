<template>
  <div class="w-full min-h-screen flex flex-col bg-background text-foreground">
    <!-- Fixed Minimal Header -->
    <header class="fixed top-0 inset-x-0 z-50 h-12 border-b border-default bg-background/90 backdrop-blur flex items-center px-4 justify-between">
      <NuxtLink to="/" class="flex items-center gap-2 font-bold text-sm tracking-tight text-primary">
        <UIcon name="i-lucide-layout-grid" class="text-lg" />
        <span>ENTERPRISE ERP</span>
      </NuxtLink>
      <UColorModeButton size="xs" />
    </header>

    <!-- Centered Auth Card on full width screen -->
    <main class="w-full flex-1 pt-12 pb-8 flex items-center justify-center p-4">
      <div class="w-full max-w-md">
        <slot />
      </div>
    </main>

    <!-- Fixed Minimal Footer -->
    <footer class="fixed bottom-0 inset-x-0 z-50 h-8 border-t border-default bg-background/90 backdrop-blur flex items-center justify-center px-4 text-[11px] text-muted">
      Enterprise Resource Planning • Secure Authentication Gateway
    </footer>
  </div>
</template>
