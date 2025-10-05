// server/utils/auth-middleware.ts
import { getCookie } from 'h3'
import { verifyToken } from './auth'
import { getDb } from '~/server/utils/db-adapter'

export interface AuthenticatedUser {
  userId: number
  username?: string
  email?: string
  isAdmin?: boolean
  isSuperAdmin?: boolean
  canChangePassword?: boolean
  password_hash?: string
}

// 在一次请求内缓存认证结果，避免重复查询
function getAuthCache(event: any) {
  if (!event.context) event.context = {}
  if (!event.context.__authUser) event.context.__authUser = null
  return {
    get: () => event.context.__authUser as AuthenticatedUser | null,
    set: (u: AuthenticatedUser) => (event.context.__authUser = u),
  }
}

/**
 * 认证中间件 - 验证用户身份并返回用户信息
 * 默认：只解 token 返回 userId
 * 可选：withUser=true 时查 DB 返回更多信息（含管理员标记）
 */
export async function requireAuth(event: any, opts?: { withUser?: boolean }): Promise<AuthenticatedUser> {
  const cache = getAuthCache(event)
  const cached = cache.get()
  if (cached && (!opts?.withUser || (opts?.withUser && (cached.isAdmin !== undefined || cached.isSuperAdmin !== undefined)))) {
    return cached
  }

  const token = getCookie(event, 'auth-token')
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: '未登录' })
  }

  const config = useRuntimeConfig()
  const decoded = verifyToken(token, config.sessionSecret)
  if (!decoded) {
    throw createError({ statusCode: 401, statusMessage: '登录已过期' })
  }

  const baseUser: AuthenticatedUser = { userId: decoded.userId }

  if (!opts?.withUser) {
    cache.set(baseUser)
    return baseUser
  }

  // 需要更多信息时查库
  const db = getDb(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: '数据库连接失败' })
  }
  const row = await db
    .prepare('SELECT id, username, email, IsAdmin, IsSuperAdmin, canChangePassword, password_hash FROM users WHERE id = ?')
    .bind(decoded.userId)
    .first() as any

  if (!row) {
    throw createError({ statusCode: 401, statusMessage: '用户不存在或已被删除' })
  }

  const fullUser: AuthenticatedUser = {
    userId: row.id,
    username: row.username,
    email: row.email,
    isAdmin: !!(row.IsAdmin === true || row.IsAdmin === 1),
    isSuperAdmin: !!(row.IsSuperAdmin === true || row.IsSuperAdmin === 1),
    canChangePassword: !!(row.canChangePassword === true || row.canChangePassword === 1),
    password_hash: row.password_hash
  }
  cache.set(fullUser)
  return fullUser
}

/**
 * 需要管理员权限
 */
export async function requireAdmin(event: any): Promise<AuthenticatedUser> {
  const user = await requireAuth(event, { withUser: true })
  if (!(user.isAdmin || user.isSuperAdmin)) {
    throw createError({ statusCode: 403, statusMessage: '仅管理员可访问' })
  }
  return user
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

export async function getMeAndTarget(event: any): Promise<{ me: AuthenticatedUser, targetUserId: number }> {
  const me = await requireAuth(event, { withUser: true })
  const isGet = getMethod(event) === 'GET'
  const q: any = isGet ? getQuery(event) : null
  const b: any = isGet ? null : await readBody(event)
  const provided = q?.targetUserId ?? b?.targetUserId
  const targetUserId = provided != null ? Number(provided) : me.userId

  // 只需校验是否管理员：当操作他人资源时需要管理员
  if (targetUserId !== me.userId && !(me.isAdmin || me.isSuperAdmin)) {
    throw createError({ statusCode: 403, statusMessage: '仅管理员可操作他人文件' })
  }
  return { me, targetUserId }
}