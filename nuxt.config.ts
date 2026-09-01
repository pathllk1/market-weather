// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    tursoDatabaseUrl: process.env.TURSO_DATABASE_URL || 'file:turso_security.db',
    tursoAuthToken: process.env.TURSO_AUTH_TOKEN || '',
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET || '',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || '',
    csrfSecret: process.env.CSRF_SECRET || '',
    initialAdminEmail: process.env.INITIAL_ADMIN_EMAIL || 'admin@security.enterprise',
    initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD || 'AdminSecure#2026@Defense!',
    public: {
      appName: 'Enterprise ERP System'
    }
  },

  routeRules: {
    '/': { prerender: false }
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  icon: {
    provider: 'server',
    clientBundle: {
      scan: true
    },
    serverBundle: {
      collections: ['lucide', 'simple-icons']
    }
  }
})
