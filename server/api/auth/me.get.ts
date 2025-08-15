import { UserService } from '~/server/utils/db'
import { verifyToken } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  try {
    // 获取认证 token
    const token = getCookie(event, 'auth-token')
    if (!token) {
      throw createError({
        statusCode: 401,
        statusMessage: '未登录'
      })
    }

    // 验证 token
    const config = useRuntimeConfig()
    const decoded = verifyToken(token, config.sessionSecret)
    if (!decoded) {
      throw createError({
        statusCode: 401,
        statusMessage: '登录已过期'
      })
    }

    // 获取数据库连接
    const db = event.context.cloudflare?.env?.DB
    if (!db) {
      throw createError({
        statusCode: 500,
        statusMessage: '数据库连接失败'
      })
    }

    const userService = new UserService(db)

    // 获取用户信息
    const user = await userService.getUserById(decoded.userId)
    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: '用户不存在'
      })
    }

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    
    console.error('Get user error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: '服务器内部错误'
    })
  }
})
