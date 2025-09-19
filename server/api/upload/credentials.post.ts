import { requireAuth } from '~/server/utils/auth-middleware'
import { getDb } from '~/server/utils/db-adapter'
import crypto from 'crypto'

export default defineEventHandler(async (event) => {
  // 处理 CORS 预检请求
  if (getMethod(event) === 'OPTIONS') {
    setHeaders(event, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
    })
    return ''
  }

  // 设置 CORS 头
  setHeaders(event, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
  })

  // 解析 SQL 时间字符串（形如 2026-12-31 11:20:28）；无法解析时返回 null
  function parseSqlDateTime(input: any): Date | null {
    if (!input) return null
    if (input instanceof Date) return input
    if (typeof input === 'number') {
      const d = new Date(input)
      return isNaN(d.getTime()) ? null : d
    }
    const s = String(input).trim()
    if (!s) return null
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/)
    if (m) {
      const y = parseInt(m[1], 10)
      const mo = parseInt(m[2], 10)
      const d = parseInt(m[3], 10)
      const h = parseInt(m[4], 10)
      const mi = parseInt(m[5], 10)
      const se = parseInt(m[6], 10)
      const dt = new Date(y, mo - 1, d, h, mi, se) // 以本地时区解释
      return isNaN(dt.getTime()) ? null : dt
    }
    // 兜底：尝试让 JS 解析（将空格替换为 T）
    const dt = new Date(s.replace(' ', 'T'))
    return isNaN(dt.getTime()) ? null : dt
  }

  function isExpired(expireAt: any): boolean {
    const dt = parseSqlDateTime(expireAt)
    if (!dt) return false
    return Date.now() >= dt.getTime()
  }

  try {
    // 验证用户认证
    const user = await requireAuth(event)
    const config = useRuntimeConfig()

    // 获取上传文件信息
    const { filename, fileSize } = await readBody(event)
    if (!filename) {
      throw createError({ statusCode: 400, statusMessage: '文件名不能为空' })
    }

    // 参数校验：fileSize 必须为正数
    const size = Number(fileSize)
    if (!Number.isFinite(size) || size <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'fileSize 参数无效' })
    }

    // ——— 用户配额与过期校验（使用 db-adapter）———
    const db = getDb(event)
    const quotaRow: any = await db
      .prepare('SELECT usedStorage, maxStorage, expire_at FROM users WHERE id = ?')
      .bind(user.userId)
      .first()

    if (!quotaRow) {
      throw createError({ statusCode: 404, statusMessage: '用户不存在或已被删除' })
    }

    // 新增：过期校验
    if (isExpired(quotaRow.expire_at)) {
      throw createError({ statusCode: 403, statusMessage: '账号已过期，禁止上传' })
    }

    const usedStorage = Number(quotaRow.usedStorage ?? 0) || 0
    const maxStorage = Number(quotaRow.maxStorage ?? 0) || 0

    if (maxStorage > 0 && usedStorage + size > maxStorage) {
      throw createError({ statusCode: 403, statusMessage: '存储空间不足，上传该文件将超出配额' })
    }
    // ————————————————————————————————————

    // 生成UUID作为文件名，避免中文字符问题
    const uuid = crypto.randomUUID()
    const fileExtension = filename.includes('.') ? filename.substring(filename.lastIndexOf('.')).toLowerCase() : ''
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const safeFilename = `${uuid}${fileExtension}`
    const fileKey = `users/${user.userId}/${year}${month}/${safeFilename}`

    // 检查是否配置了腾讯云密钥
    if (!config.tencentSecretId || !config.tencentSecretKey || 
        config.tencentSecretId === 'your_secret_id_here' || 
        config.tencentSecretKey === 'your_secret_key_here') {
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, message: '腾讯云密钥未配置' })
      }
    }

    // 生成临时密钥（使用腾讯云 STS）
    const { Client } = await import('tencentcloud-sdk-nodejs/tencentcloud/services/sts/v20180813/sts_client')
    const client = new Client({
      credential: { secretId: config.tencentSecretId, secretKey: config.tencentSecretKey },
      region: config.cosRegion,
    })

    // 从存储桶名称中提取 AppId
    const appId = config.cosBucket.substr(config.cosBucket.lastIndexOf('-') + 1)
    const resource = `qcs::cos:${config.cosRegion}:uid/${appId}:${config.cosBucket}/${fileKey}`

    const params = {
      Policy: JSON.stringify({
        version: '2.0',
        statement: [
          {
            effect: 'allow',
            action: [
              'name/cos:PutObject',
              'name/cos:PostObject',
              'name/cos:InitiateMultipartUpload',
              'name/cos:ListMultipartUploads',
              'name/cos:ListParts',
              'name/cos:UploadPart',
              'name/cos:CompleteMultipartUpload'
            ],
            resource: [resource]
          }
        ]
      }),
      DurationSeconds: 1800, // 30分钟
      Name: `cos-upload-${user.userId}-${Date.now()}`
    }

    const response = await client.GetFederationToken(params)
    const credentials = response.Credentials
    if (!credentials) {
      throw createError({ statusCode: 500, statusMessage: '获取临时密钥失败' })
    }

    return {
      success: true,
      data: {
        credentials: {
          TmpSecretId: credentials.TmpSecretId,
          TmpSecretKey: credentials.TmpSecretKey,
          SecurityToken: credentials.Token,
          StartTime: Math.floor(Date.now() / 1000),
          ExpiredTime: Math.floor(Date.now() / 1000) + 1800
        },
        bucket: config.cosBucket,
        region: config.cosRegion,
        fileKey,
        originalFilename: filename,
        safeFilename,
        uploadUrl: `https://${config.cosBucket}.cos.${config.cosRegion}.myqcloud.com`
      }
    }
  } catch (error: any) {
    console.error('Generate upload credentials error:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, statusMessage: '生成上传凭证失败' })
  }
})