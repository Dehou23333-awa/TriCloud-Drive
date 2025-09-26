export default defineNuxtRouteMiddleware(async (to) => {
  const { public: { allowRegister } } = useRuntimeConfig()
  const auth = useAuth()

  // 如果还没拉过用户信息（初始为 null），先尝试获取一次
  if (auth.user.value === null) {
    try { await auth.fetchUser() } catch { }
  }

  // 注册开关
  if (allowRegister === false && to.path === '/register') {
    return navigateTo('/')
  }

  const whitelist = new Set(['/', '/login', '/loginold', '/registerold', '/register'])

  // 未登录且不在白名单 => 去登录
  if (!auth.isLoggedIn.value && !whitelist.has(to.path)) {
    return navigateTo('/login')
  }

  // 可选：已登录就别进登录/注册页
  if (auth.isLoggedIn.value && whitelist.has(to.path) && (to.path === '/login' || to.path === '/loginold')) {
    return navigateTo('/')
  }

  if (!(auth.user.value?.IsAdmin || auth.user.value?.IsSuperAdmin) && to.path.startsWith('/api/manage') )
  {
    throw createError({ statusCode: 400, statusMessage: 'You are not authorized to access this page' })
  }
})