import { verifyToken } from './auth'

export interface AuthenticatedUser {
  userId: number
  email: string
  username: string
}

/**
 * 认证中间件 - 验证用户身份并返回用户信息
 */
export async function requireAuth(event: any): Promise<AuthenticatedUser> {
  const token = getCookie(event, 'auth-token')
  
  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: '未登录'
    })
  }

  const config = useRuntimeConfig()
  const decoded = verifyToken(token, config.sessionSecret)
  
  if (!decoded) {
    throw createError({
      statusCode: 401,
      statusMessage: '登录已过期'
    })
  }

  return {
    userId: decoded.userId,
    email: decoded.email || '',
    username: decoded.username || ''
  }
}

/**
 * 可选认证中间件 - 如果有 token 则验证，没有则返回 null
 */
export async function optionalAuth(event: any): Promise<AuthenticatedUser | null> {
  try {
    return await requireAuth(event)
  } catch {
    return null
  }
}
