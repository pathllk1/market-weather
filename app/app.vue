<script setup lang="ts">
useHead({
  title: 'Enterprise ERP System',
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'description', content: 'Enterprise Resource Planning & Business Management Platform' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

useSeoMeta({
  title: 'Enterprise ERP System',
  description: 'Enterprise Resource Planning & Operations Platform',
  ogTitle: 'Enterprise ERP System',
  ogDescription: 'Enterprise Resource Planning & Operations Platform'
})
</script>

<template>
  <UApp class="w-full min-h-screen">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
