// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },

  modules: ['@nuxtjs/tailwindcss'],

  nitro: {
    preset: 'node-server',
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
    },
    externals: {
      inline: []
    },
    esbuild: {
      options: {
        target: 'es2020'
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
    cdnAuthKeyPrimary: process.env.CDN_AUTH_KEY_PRIMARY || 'cdn_auth_key_primary',
    cdnAuthKeyBackup: process.env.CDN_AUTH_KEY_BACKUP || 'cdn_auth_key_backup',
    cdnAuthTtl: parseInt(process.env.CDN_AUTH_TTL || '10'), // 默认10秒
    cdnAuthParam: process.env.CDN_AUTH_PARAM || 'sign',
    dbPath: process.env.SQLITE_PATH || './data.sqlite',
    public: {
      apiBase: '',
      allowRegister: process.env.ALLOW_REGISTER === 'true'
    }
  },
  build: {
    transpile: ['@zip.js/zip.js', 'streamsaver']
  },
  vite: {
    optimizeDeps: {
      // 重要：不要预打包 @zip.js/zip.js，避免 dev 时 esbuild 选到 Node 条件
      exclude: ['@zip.js/zip.js']
      // 不要 include '@zip.js/zip.js'
    }
  }
})
