export default defineNuxtPlugin(async () => {
  const { user, fetchUser } = useAuth()
  if (user.value === null) {
    try { await fetchUser() } catch { }
  }
})