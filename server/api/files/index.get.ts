import { requireAuth } from '~/server/utils/auth-middleware'

export default defineEventHandler(async (event) => {
  try {
    // 验证用户认证
    const user = await requireAuth(event)

    // 获取数据库连接
    const db = event.context.cloudflare?.env?.DB
    if (!db) {
      throw createError({
        statusCode: 500,
        statusMessage: '数据库连接失败'
      })
    }

    // 获取用户的文件列表
    const result = await db
      .prepare(`
        SELECT * FROM files 
        WHERE user_id = ? 
        ORDER BY created_at DESC
      `)
      .bind(user.userId)
      .all()

    return {
      success: true,
      files: result.results || []
    }
  } catch (error: any) {
    console.error('Get files error:', error)
    
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: '获取文件列表失败'
    })
  }
})
