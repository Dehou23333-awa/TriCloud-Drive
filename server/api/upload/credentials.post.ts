import { requireAuth } from '~/server/utils/auth-middleware'
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

  try {
    // 验证用户认证
    const user = await requireAuth(event)

    // 获取运行时配置
    const config = useRuntimeConfig()

    // 获取上传文件信息
    const { filename, fileSize } = await readBody(event)
    if (!filename) {
      throw createError({
        statusCode: 400,
        statusMessage: '文件名不能为空'
      })
    }

    // 生成UUID作为文件名，避免中文字符问题
    const uuid = crypto.randomUUID()
    // 提取文件扩展名
    const fileExtension = filename.includes('.') ? 
      filename.substring(filename.lastIndexOf('.')).toLowerCase() : ''
    
    // 生成文件路径（用户ID/年月/UUID文件名）
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
        body: JSON.stringify({
          success: false,
          message: '腾讯云密钥未配置'
        })
      }
    }

    // 生成临时密钥（使用腾讯云 STS）
    const { Client } = await import('tencentcloud-sdk-nodejs/tencentcloud/services/sts/v20180813/sts_client')
    
    const client = new Client({
      credential: {
        secretId: config.tencentSecretId,
        secretKey: config.tencentSecretKey,
      },
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
            resource: [
              resource
            ]
          }
        ]
      }),
      DurationSeconds: 1800, // 30分钟
      Name: `cos-upload-${user.userId}-${Date.now()}`
    }

    const response = await client.GetFederationToken(params)
    const credentials = response.Credentials

    if (!credentials) {
      throw createError({
        statusCode: 500,
        statusMessage: '获取临时密钥失败'
      })
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
        originalFilename: filename, // 原始文件名
        safeFilename,              // UUID安全文件名
        uploadUrl: `https://${config.cosBucket}.cos.${config.cosRegion}.myqcloud.com`
      }
    }
  } catch (error: any) {
    console.error('Generate upload credentials error:', error)
    
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: '生成上传凭证失败'
    })
  }
})
