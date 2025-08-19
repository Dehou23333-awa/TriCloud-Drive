import { requireAuth } from '~/server/utils/auth-middleware'
import crypto from 'crypto'

// 生成 CDN 鉴权 URL (TypeA)
const generateCDNUrl = (
  fileKey: string,
  cdnDomain: string,
  primaryKey: string,
  backupKey: string, // backupKey 未在此逻辑中使用，但保留参数
  ttl: number,
  authParam: string, // 这是签名参数的名称，例如 'sign'
  filename?: string
) => {
  const timestamp = Math.floor(Date.now() / 1000) + ttl;
  const path = `/${fileKey}`;
  const rand = Math.floor(Math.random() * 1000000).toString(); // 确保是字符串
  const uid = 0;
  
  const secret = primaryKey;
  
  // 1. 构造待签名的字符串 (这部分是正确的)
  const authString = `${path}-${timestamp}-${rand}-${uid}-${secret}`;
  const sign = crypto.createHash('md5').update(authString).digest('hex');
  
  // 2. 构造符合 TypeA 规范的签名参数值
  // 格式: timestamp-rand-uid-md5hash
  const authValue = `${timestamp}-${rand}-${uid}-${sign}`;
  
  // 3. 构建最终 URL
  const params = new URLSearchParams();
  params.set(authParam, authValue); // 将拼接好的完整字符串作为签名参数的值
  
  // 如果指定了文件名，添加下载参数
  if (filename) {
    params.set('response-content-disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  }
  
  return `https://${cdnDomain}${path}?${params.toString()}`;
}

export default defineEventHandler(async (event) => {
  try {
    // 验证用户认证
    const user = await requireAuth(event)
    
    const { fileKey, filename } = await readBody(event)
    
    if (!fileKey) {
      throw createError({
        statusCode: 400,
        statusMessage: '文件路径不能为空'
      })
    }

    const config = useRuntimeConfig()
    
    // 检查文件是否属于当前用户
    const db = event.context.cloudflare?.env?.DB
    if (!db) {
      throw createError({
        statusCode: 500,
        statusMessage: '数据库连接失败'
      })
    }

    // 验证文件所有权
    const fileRecord = await db
      .prepare('SELECT * FROM files WHERE user_id = ? AND file_key = ?')
      .bind(user.userId, fileKey)
      .first()

    if (!fileRecord) {
      throw createError({
        statusCode: 404,
        statusMessage: '文件不存在或无权访问'
      })
    }

    // 检查是否启用 CDN
    if (config.cdnEnabled && config.cdnDomain) {
      // 使用 CDN 生成下载链接
      const cdnUrl = generateCDNUrl(
        fileKey, 
        config.cdnDomain, 
        config.cdnAuthKeyPrimary, 
        config.cdnAuthKeyBackup, 
        config.cdnAuthTtl, 
        config.cdnAuthParam, 
        filename
      )
      
      return {
        success: true,
        data: {
          downloadUrl: cdnUrl,
          filename: filename || fileRecord.filename,
          fileSize: fileRecord.file_size,
          expiresAt: new Date(Date.now() + config.cdnAuthTtl * 1000).toISOString(),
          useCDN: true
        }
      }
    }

    // 简化版：直接返回 COS URL（用于测试）
    const cosUrl = `https://${config.cosBucket}.cos.${config.cosRegion}.myqcloud.com/${fileKey}`
    
    return {
      success: true,
      data: {
        downloadUrl: cosUrl,
        filename: filename || fileRecord.filename,
        fileSize: fileRecord.file_size,
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        useCDN: false
      }
    }
    
  } catch (error: any) {
    console.error('Generate download signature error:', error)
    
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: '生成下载签名失败'
    })
  }
})
