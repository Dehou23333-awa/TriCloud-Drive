export const useAuth = () => {
  const user = useState<User | null>('auth.user', () => null)
  const isLoggedIn = computed(() => !!user.value)

  const login = async (username: string, password: string) => {
    const data = await $fetch<{ success: boolean; user: User; message: string }>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
      credentials: 'include'
    })
    if (data.success) user.value = data.user
    return data
  }

  const register = async (email: string, username: string, password: string) => {
    const data = await $fetch<{ success: boolean; user: User; message: string }>('/api/auth/register', {
      method: 'POST',
      body: { email, username, password },
      credentials: 'include'
    })
    return data
  }

  const logout = async () => {
    await $fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    user.value = null
    await navigateTo('/login')
  }

  const fetchUser = async () => {
    try {
      const headers = process.server ? useRequestHeaders(['cookie']) : undefined
      const data = await $fetch<{ success: boolean; user: User | null }>('/api/auth/me', {
        headers,
        credentials: 'include'
      })
      user.value = data.success ? data.user : null
    } catch {
      user.value = null
    }
  }
  const isAdminOrSuperAdmin =  async () => {
    try {
      const headers = process.server ? useRequestHeaders(['cookie']) : undefined
      const data = await $fetch<{ success: boolean; user: User | null }>('/api/auth/isAdminOrSuperAdmin', {
        headers,
        credentials: 'include'
      })
      if(data.success && data.user){
        return data.user.IsAdmin || data.user.IsSuperAdmin
        
      }
      return false
    } catch {
      return false
    }
  }

  return {
    user: readonly(user),
    isLoggedIn,
    login,
    register,
    logout,
    fetchUser,
    isAdminOrSuperAdmin,
  }
}