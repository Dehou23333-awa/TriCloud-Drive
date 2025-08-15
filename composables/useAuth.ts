interface User {
  id: number
  email: string
  created_at: string
}

interface AuthState {
  user: User | null
  isLoggedIn: boolean
}

export const useAuth = () => {
  const user = useState<User | null>('auth.user', () => null)
  const isLoggedIn = computed(() => !!user.value)

  const login = async (email: string, password: string) => {
    const data = await $fetch<{ success: boolean; user: User; message: string }>('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    })

    if (data.success) {
      user.value = data.user
    }
    
    return data
  }

  const register = async (email: string, password: string) => {
    const data = await $fetch<{ success: boolean; user: User; message: string }>('/api/auth/register', {
      method: 'POST',
      body: { email, password }
    })

    return data
  }

  const logout = async () => {
    await $fetch('/api/auth/logout', {
      method: 'POST'
    })
    
    user.value = null
    await navigateTo('/login')
  }

  const fetchUser = async () => {
    try {
      const data = await $fetch<{ success: boolean; user: User }>('/api/auth/me')
      if (data.success) {
        user.value = data.user
      }
    } catch (error) {
      user.value = null
    }
  }

  return {
    user: readonly(user),
    isLoggedIn,
    login,
    register,
    logout,
    fetchUser
  }
}
