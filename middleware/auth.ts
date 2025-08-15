export default defineNuxtRouteMiddleware((to) => {
  const { isLoggedIn } = useAuth()
  
  // 如果用户未登录且访问的不是登录或注册页面，重定向到登录页
  if (!isLoggedIn.value && to.path !== '/login' && to.path !== '/register' && to.path !== '/') {
    return navigateTo('/login')
  }
})
