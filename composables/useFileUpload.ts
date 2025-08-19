import COS from 'cos-js-sdk-v5'

interface UploadCredentials {
  TmpSecretId: string
  TmpSecretKey: string
  SecurityToken: string
  StartTime: number
  ExpiredTime: number
}

interface UploadConfig {
  credentials: UploadCredentials
  bucket: string
  region: string
  fileKey: string
  originalFilename: string  // 原始文件名
  safeFilename: string     // UUID安全文件名
  uploadUrl: string
  demoMode?: boolean
}

interface UploadProgress {
  loaded: number
  total: number
  percent: number
}

export const useFileUpload = () => {
  const uploading = ref(false)
  const uploadProgress = ref<UploadProgress>({ loaded: 0, total: 0, percent: 0 })
  const uploadError = ref('')

  const getUploadCredentials = async (filename: string, fileSize: number): Promise<UploadConfig> => {
    const response = await $fetch<{ success: boolean; data: UploadConfig }>('/api/upload/credentials', {
      method: 'POST',
      body: { filename, fileSize }
    })

    if (!response.success) {
      throw new Error('获取上传凭证失败')
    }

    return response.data
  }

  const uploadFile = async (file: File): Promise<string> => {
    try {
      uploading.value = true
      uploadError.value = ''
      uploadProgress.value = { loaded: 0, total: file.size, percent: 0 }

      // 获取上传凭证
      const config = await getUploadCredentials(file.name, file.size)

      // 检查是否为演示模式
      if (config.demoMode) {
        // 模拟上传进度
        for (let i = 0; i <= 100; i += 10) {
          uploadProgress.value = {
            loaded: (file.size * i) / 100,
            total: file.size,
            percent: i
          }
          await new Promise(resolve => setTimeout(resolve, 100))
        }

        // 生成演示文件URL
        const fileUrl = `${config.uploadUrl}/${config.fileKey}`
        
        // 保存文件记录到数据库
        await $fetch('/api/files/save', {
          method: 'POST',
          body: {
            filename: file.name,              // 原始文件名
            safeFilename: config.safeFilename, // UUID安全文件名
            fileKey: config.fileKey,
            fileSize: file.size,
            fileUrl: fileUrl,
            contentType: file.type
          }
        })

        return fileUrl
      }

      // 真实上传模式
      // 初始化 COS 实例
      const cos = new COS({
        SecretId: config.credentials.TmpSecretId,
        SecretKey: config.credentials.TmpSecretKey,
        SecurityToken: config.credentials.SecurityToken,
      })

      // 上传文件
      const fileUrl = await new Promise<string>((resolve, reject) => {
        cos.putObject({
          Bucket: config.bucket,
          Region: config.region,
          Key: config.fileKey,
          Body: file,
          onProgress: (progressData: any) => {
            uploadProgress.value = {
              loaded: progressData.loaded,
              total: progressData.total,
              percent: Math.round((progressData.loaded / progressData.total) * 100)
            }
          }
        }, (err: any, data: any) => {
          if (err) {
            uploadError.value = err.message || '上传失败'
            reject(err)
          } else {
            // 返回文件的访问URL
            const fileUrl = `https://${config.bucket}.cos.${config.region}.myqcloud.com/${config.fileKey}`
            resolve(fileUrl)
          }
        })
      })

      // 保存文件记录到数据库
      await $fetch('/api/files/save', {
        method: 'POST',
        body: {
          filename: file.name,              // 原始文件名
          safeFilename: config.safeFilename, // UUID安全文件名
          fileKey: config.fileKey,
          fileSize: file.size,
          fileUrl: fileUrl,
          contentType: file.type
        }
      })

      return fileUrl
    } catch (error: any) {
      uploadError.value = error.message || '上传失败'
      throw error
    } finally {
      uploading.value = false
    }
  }

  const uploadMultipleFiles = async (files: File[]): Promise<string[]> => {
    const results: string[] = []
    
    for (const file of files) {
      try {
        const url = await uploadFile(file)
        results.push(url)
      } catch (error) {
        console.error(`上传文件 ${file.name} 失败:`, error)
        throw error
      }
    }
    
    return results
  }

  return {
    uploading: readonly(uploading),
    uploadProgress: readonly(uploadProgress),
    uploadError: readonly(uploadError),
    uploadFile,
    uploadMultipleFiles
  }
}
