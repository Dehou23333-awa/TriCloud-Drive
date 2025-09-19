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
  originalFilename: string
  safeFilename: string
  uploadUrl: string
  demoMode?: boolean
  // 后端会原样返回，但前端不强依赖
  folderId?: number | null
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

  const getUploadCredentials = async (
    filename: string,
    fileSize: number,
    folderId?: number | null
  ): Promise<UploadConfig> => {
    const response = await $fetch<{ success: boolean; data: UploadConfig }>('/api/upload/credentials', {
      method: 'POST',
      body: { filename, fileSize, folderId: folderId ?? null }
    })

    if (!response.success) {
      throw new Error('获取上传凭证失败')
    }

    return response.data
  }

  // 新增参数 options.folderId：指定上传到的文件夹（null 表示根目录）
  const uploadFile = async (file: File, options?: { folderId?: number | null }): Promise<string> => {
    try {
      uploading.value = true
      uploadError.value = ''
      uploadProgress.value = { loaded: 0, total: file.size, percent: 0 }

      const folderId = options?.folderId ?? null

      // 获取上传凭证
      const config = await getUploadCredentials(file.name, file.size, folderId)

      // 演示模式
      if (config.demoMode) {
        for (let i = 0; i <= 100; i += 10) {
          uploadProgress.value = {
            loaded: (file.size * i) / 100,
            total: file.size,
            percent: i
          }
          await new Promise(resolve => setTimeout(resolve, 100))
        }

        const fileUrl = `${config.uploadUrl}/${config.fileKey}`
        
        // 保存文件记录到数据库（带上 folderId）
        await $fetch('/api/files/save', {
          method: 'POST',
          body: {
            filename: file.name,
            safeFilename: config.safeFilename,
            fileKey: config.fileKey,
            fileSize: file.size,
            fileUrl: fileUrl,
            contentType: file.type,
            folderId
          }
        })

        return fileUrl
      }

      // 真实上传
      const cos = new COS({
        SecretId: config.credentials.TmpSecretId,
        SecretKey: config.credentials.TmpSecretKey,
        SecurityToken: config.credentials.SecurityToken,
      })

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
            const url = `https://${config.bucket}.cos.${config.region}.myqcloud.com/${config.fileKey}`
            resolve(url)
          }
        })
      })

      // 保存文件记录到数据库（带上 folderId）
      await $fetch('/api/files/save', {
        method: 'POST',
        body: {
          filename: file.name,
          safeFilename: config.safeFilename,
          fileKey: config.fileKey,
          fileSize: file.size,
          fileUrl: fileUrl,
          contentType: file.type,
          folderId
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

  const uploadMultipleFiles = async (files: File[], options?: { folderId?: number | null }): Promise<string[]> => {
    const results: string[] = []
    for (const file of files) {
      try {
        const url = await uploadFile(file, { folderId: options?.folderId ?? null })
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