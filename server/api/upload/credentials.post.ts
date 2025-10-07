import { getMeAndTarget } from '~/server/utils/auth-middleware'
import { getDb } from '~/server/utils/db-adapter'
import crypto from 'crypto'
import { UserService } from '~/server/utils/db'

export default defineEventHandler(async (event) => {
  // 处理 CORS 预检
  if (getMethod(event) === 'OPTIONS') {
    setHeaders(event, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
    })
    return ''
  }
  // CORS
  setHeaders(event, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
  })

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
      const dt = new Date(y, mo - 1, d, h, mi, se)
      return isNaN(dt.getTime()) ? null : dt
    }
    const dt = new Date(s.replace(' ', 'T'))
    return isNaN(dt.getTime()) ? null : dt
  }

  function isExpired(expireAt: any): boolean {
    const dt = parseSqlDateTime(expireAt)
    if (!dt) return false
    return Date.now() >= dt.getTime()
  }

  function normalizeFolderId(input: any): number | null {
    if (input === undefined || input === null || input === '' || input === 'root' || input === '0' || input === 0) {
      return null
    }
    const n = Number(input)
    if (!Number.isInteger(n) || n < 1) {
      throw createError({ statusCode: 400, statusMessage: '非法的 folderId' })
    }
    return n
  }

  try {
    const { targetUserId } = await getMeAndTarget(event)
    const config = useRuntimeConfig()
    const db = getDb(event)
    

    if (!db) {
      throw createError({ statusCode: 500, statusMessage: '数据库连接失败' })
    }
    const userService = new UserService(db)

    const body = await readBody(event)
    const { filename, fileSize, overwrite, skipIfExist } = body
    const folderId = normalizeFolderId(body?.folderId)


    if (overwrite === true && skipIfExist === true)
    {
      throw createError({ statusCode: 400, statusMessage: '不能既覆盖又跳过文件'})
    }

    if (!filename) {
      throw createError({ statusCode: 400, statusMessage: '文件名不能为空' })
    }

    const size = Number(fileSize)
    if (!Number.isFinite(size) || size < 0) {
      throw createError({ statusCode: 400, statusMessage: 'fileSize 参数无效' })
    }

    const user = await userService.getUserById(Number(targetUserId))
    if (!user)
    {
      throw createError({ statusCode: 404, statusMessage: '用户不存在或已被删除' })
    }
    if (isExpired(user.expire_at)) {
      throw createError({ statusCode: 403, statusMessage: '账号已过期，禁止上传' })
    }

    const usedStorage = Number(user.usedStorage ?? 0) || 0
    const maxStorage = Number(user.maxStorage ?? 0) || 0

    // 若选择覆盖且存在同名文件，则抵扣旧文件大小
    let usedForCheck = usedStorage
    if (overwrite === true || skipIfExist === true) {
      let row: any
      if (folderId === null) {
        row = await db
          .prepare('SELECT file_size FROM files WHERE user_id = ? AND folder_id IS NULL AND filename = ? LIMIT 1')
          .bind(user.id, filename)
          .first()
      } else {
        row = await db
          .prepare('SELECT file_size FROM files WHERE user_id = ? AND folder_id = ? AND filename = ? LIMIT 1')
          .bind(user.id, folderId, filename)
          .first()
      }
      if (row?.file_size != null && overwrite === true) {
        usedForCheck = usedStorage - Number(row.file_size)
        if (usedForCheck < 0) usedForCheck = 0
      } else if (row?.file_size != null && skipIfExist === true)
      {
        return { success: false, message: '当前目录下已存在该文件' }
      }
    }

    if (maxStorage > 0 && usedForCheck + size > maxStorage) {
      throw createError({ statusCode: 403, statusMessage: '存储空间不足，上传该文件将超出配额' })
    }

    // 如果指定了 folderId，则校验归属
    if (folderId !== null) {
      const chk = await db
        .prepare('SELECT 1 FROM folders WHERE id = ? AND user_id = ?')
        .bind(folderId, user.id)
        .first()
      if (!chk) {
        throw createError({ statusCode: 404, statusMessage: '文件夹不存在或无权限' })
      }
    }

    // 生成用于对象存储的 key（与文件夹逻辑解耦，文件夹信息仅存 DB）
    const uuid = crypto.randomUUID()
    const fileExtension = filename.includes('.') ? filename.substring(filename.lastIndexOf('.')).toLowerCase() : ''
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const safeFilename = `${uuid}${fileExtension}`
    const fileKey = `users/${user.id}/${year}${month}/${safeFilename}`

    // 检查 COS 密钥
    if (!config.tencentSecretId || !config.tencentSecretKey ||
        config.tencentSecretId === 'your_secret_id_here' ||
        config.tencentSecretKey === 'your_secret_key_here') {
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, message: '腾讯云密钥未配置' })
      }
    }

    // 生成 STS 临时密钥
    const { Client } = await import('tencentcloud-sdk-nodejs/tencentcloud/services/sts/v20180813/sts_client')
    const client = new Client({
      credential: { secretId: config.tencentSecretId, secretKey: config.tencentSecretKey },
      region: config.cosRegion,
    })

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
      DurationSeconds: config.cdnAuthTtl,
      Name: `cos-upload-${user.id}-${Date.now()}`
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
          ExpiredTime: Math.floor(Date.now() / 1000) + config.cdnAuthTtl
        },
        bucket: config.cosBucket,
        region: config.cosRegion,
        fileKey,
        folderId,                 // 回传当前目录
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