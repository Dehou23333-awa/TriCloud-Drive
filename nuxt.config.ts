// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxtjs/tailwindcss'],

  nitro: {
    preset: 'cloudflare-pages',
    experimental: {
      wasm: true
    },
    routeRules: {
      '/api/**': {
        cors: true,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
        }
      }
    }
  },

  runtimeConfig: {
    sessionSecret: process.env.SESSION_SECRET || 'fallback-secret-key',
    tencentSecretId: process.env.TENCENT_SECRET_ID || '',
    tencentSecretKey: process.env.TENCENT_SECRET_KEY || '',
    cosRegion: process.env.COS_REGION || 'ap-guangzhou',
    cosBucket: process.env.COS_BUCKET || '',
    // CDN 配置
    cdnDomain: process.env.CDN_DOMAIN || '',
    cdnEnabled: process.env.CDN_ENABLED === 'true',
    // CDN 鉴权配置
    cdnAuthKeyPrimary: process.env.CDN_AUTH_KEY_PRIMARY || 'Xuw6iUKsInF4Cdh9ExWcrQQzaY78o',
    cdnAuthKeyBackup: process.env.CDN_AUTH_KEY_BACKUP || 'zU0Aa8tR34fwZHpE9zef76UbD05',
    cdnAuthTtl: parseInt(process.env.CDN_AUTH_TTL || '10'), // 默认10秒
    cdnAuthParam: process.env.CDN_AUTH_PARAM || 'sign',
    public: {
      apiBase: ''
    }
  }
})
