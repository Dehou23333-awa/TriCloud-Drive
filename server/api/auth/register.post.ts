import { UserService } from '~/server/utils/db'
import { hashPassword, validateEmail, validatePassword } from '~/server/utils/auth'
import { getDb } from '~/server/utils/db-adapter'
export default defineEventHandler(async (event) => {
  if (getMethod(event) !== 'POST') {
    throw createError({
      statusCode: 405,
      statusMessage: 'Method not allowed'
    })
  }

  try {
    const { email, password } = await readBody(event)

    // 验证输入
    if (!email || !password) {
      throw createError({
        statusCode: 400,
        statusMessage: '邮箱和密码都是必填项'
      })
    }

    if (!validateEmail(email)) {
      throw createError({
        statusCode: 400,
        statusMessage: '邮箱格式不正确'
      })
    }

    if (!validatePassword(password)) {
      throw createError({
        statusCode: 400,
        statusMessage: '密码至少8位，且包含字母和数字'
      })
    }

    // 获取数据库连接
    //const db = event.context.cloudflare?.env?.DB
    const db = getDb(event)
    if (!db) {
      throw createError({
        statusCode: 500,
        statusMessage: '数据库连接失败'
      })
    }

    const userService = new UserService(db)

    // 检查用户是否已存在
    const existingUser = await userService.getUserByEmail(email)
    if (existingUser) {
      throw createError({
        statusCode: 409,
        statusMessage: '该邮箱已被注册'
      })
    }

    // 创建新用户
    const passwordHash = await hashPassword(password)
    const newUser = await userService.createUser(email, passwordHash)

    if (!newUser) {
      throw createError({
        statusCode: 500,
        statusMessage: '用户创建失败'
      })
    }

    return {
      success: true,
      message: '注册成功',
      user: {
        id: newUser.id,
        email: newUser.email,
        created_at: newUser.created_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    
    console.error('Registration error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: '服务器内部错误'
    })
  }
})
