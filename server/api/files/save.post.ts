import { requireAuth } from '~/server/utils/auth-middleware'
import { getDb } from '~/server/utils/db-adapter'
export default defineEventHandler(async (event) => {
  try {
    // 验证用户认证
    const user = await requireAuth(event)

    // 获取上传文件信息
    const { filename, safeFilename, fileKey, fileSize, fileUrl, contentType } = await readBody(event)
    
    if (!filename || !fileKey || !fileUrl) {
      throw createError({
        statusCode: 400,
        statusMessage: '缺少必要的文件信息'
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

    // 保存文件记录到数据库
    const result = await db
      .prepare(`
        INSERT INTO files (user_id, filename, file_key, file_size, file_url, content_type) 
        VALUES (?, ?, ?, ?, ?, ?) 
        RETURNING *
      `)
      .bind(user.userId, filename, fileKey, fileSize || 0, fileUrl, contentType || 'application/octet-stream')
      .first()

    return {
      success: true,
      message: '文件记录保存成功',
      file: result
    }
  } catch (error: any) {
    console.error('Save file record error:', error)
    
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: '保存文件记录失败'
    })
  }
})
