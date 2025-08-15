export default defineNuxtPlugin(async () => {
  // 在客户端初始化时获取用户信息
  if (process.client) {
    const { fetchUser } = useAuth()
    await fetchUser()
  }
})
