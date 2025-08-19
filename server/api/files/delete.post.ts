import { requireAuth } from '~/server/utils/auth-middleware'

export default defineEventHandler(async (event) => {
  try {
    // 验证用户认证
    const user = await requireAuth(event)
    
    const { fileId } = await readBody(event)
    
    if (!fileId) {
      throw createError({
        statusCode: 400,
        statusMessage: '文件ID不能为空'
      })
    }

    // 获取运行时配置
    const config = useRuntimeConfig()

    // 获取数据库连接
    const db = event.context.cloudflare?.env?.DB
    if (!db) {
      throw createError({
        statusCode: 500,
        statusMessage: '数据库连接失败'
      })
    }

    // 查询文件信息，确保文件属于当前用户
    const fileRecord = await db
      .prepare('SELECT * FROM files WHERE id = ? AND user_id = ?')
      .bind(fileId, user.userId)
      .first()

    if (!fileRecord) {
      throw createError({
        statusCode: 404,
        statusMessage: '文件不存在或无权访问'
      })
    }

    // 如果配置了腾讯云密钥，则删除COS中的文件
    let cosDeleteSuccess = false
    if (config.tencentSecretId && config.tencentSecretKey && 
        config.tencentSecretId !== 'your_secret_id_here' && 
        config.tencentSecretKey !== 'your_secret_key_here') {
      
      try {
        // 使用腾讯云COS Node.js SDK删除文件
        const COS = await import('cos-nodejs-sdk-v5')
        
        const cos = new COS.default({
          SecretId: config.tencentSecretId,
          SecretKey: config.tencentSecretKey,
        })

        // 删除COS中的文件
        await new Promise((resolve, reject) => {
          cos.deleteObject({
            Bucket: config.cosBucket,
            Region: config.cosRegion,
            Key: fileRecord.file_key
          }, (err: any, data: any) => {
            if (err) {
              console.error('COS delete error:', err)
              reject(err)
            } else {
              console.log(`Successfully deleted file from COS: ${fileRecord.file_key}`)
              console.log('COS delete response:', data)
              resolve(data)
            }
          })
        })
        
        cosDeleteSuccess = true
        
      } catch (cosError: any) {
        console.error('Failed to delete file from COS:', cosError)
        // 注意：即使COS删除失败，我们仍然继续删除数据库记录
        // 这样可以避免数据库中的"孤儿"记录
        // 但会在响应中提醒用户
        cosDeleteSuccess = false
      }
    }

    // 从数据库中删除文件记录
    await db
      .prepare('DELETE FROM files WHERE id = ? AND user_id = ?')
      .bind(fileId, user.userId)
      .run()

    return {
      success: true,
      message: cosDeleteSuccess ? '文件删除成功' : '文件记录已删除，但COS文件删除可能失败',
      cosDeleted: cosDeleteSuccess,
      deletedFile: {
        id: fileRecord.id,
        filename: fileRecord.filename,
        fileKey: fileRecord.file_key
      }
    }
  } catch (error: any) {
    console.error('Delete file error:', error)
    
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: '删除文件失败'
    })
  }
})
