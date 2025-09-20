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
  folderId?: number | null
}

interface UploadProgress {
  loaded: number
  total: number
  percent: number
}

type UploadOptions = {
  folderId?: number | null
  overwrite?: boolean
  partOfBatch?: boolean
  onProgressDelta?: (delta: number) => void
}

export const useFileUpload = () => {
  const uploading = ref(false)
  const uploadProgress = ref<UploadProgress>({ loaded: 0, total: 0, percent: 0 })
  const uploadError = ref('')

  const setProgress = (loaded: number, total: number) => {
    const percent = total > 0 ? Math.round((loaded / total) * 100) : (loaded > 0 ? 100 : 0)
    uploadProgress.value = { loaded, total, percent }
  }

  const getUploadCredentials = async (params: {
    filename: string
    fileSize: number
    folderId?: number | null
    overwrite?: boolean
  }): Promise<UploadConfig> => {
    const response = await $fetch<{ success: boolean; data: UploadConfig }>('/api/upload/credentials', {
      method: 'POST',
      body: {
        filename: params.filename,
        fileSize: params.fileSize,
        folderId: params.folderId ?? null,
        overwrite: !!params.overwrite
      }
    })
    if (!response.success) throw new Error('获取上传凭证失败')
    return response.data
  }

  const uploadFile = async (file: File, options?: UploadOptions): Promise<string> => {
    const partOfBatch = !!options?.partOfBatch
    const folderId = options?.folderId ?? null
    const overwrite = !!options?.overwrite

    try {
      if (!partOfBatch) {
        uploading.value = true
        uploadError.value = ''
        setProgress(0, file.size)
      }

      const config = await getUploadCredentials({
        filename: file.name,
        fileSize: file.size,
        folderId,
        overwrite
      })

      if (config.demoMode) {
        let lastLoaded = 0
        for (let i = 0; i <= 100; i += 10) {
          const loaded = Math.round((file.size * i) / 100)
          const delta = Math.max(0, loaded - lastLoaded)
          lastLoaded = loaded
          options?.onProgressDelta?.(delta)
          if (!partOfBatch) setProgress(loaded, file.size)
          await new Promise(r => setTimeout(r, 100))
        }
        const fileUrl = `${config.uploadUrl}/${config.fileKey}`
        await $fetch('/api/files/save', {
          method: 'POST',
          body: {
            filename: file.name,
            safeFilename: config.safeFilename,
            fileKey: config.fileKey,
            fileSize: file.size,
            fileUrl: fileUrl,
            contentType: file.type,
            folderId,
            overwrite
          }
        })
        return fileUrl
      }

      const cos = new COS({
        SecretId: config.credentials.TmpSecretId,
        SecretKey: config.credentials.TmpSecretKey,
        SecurityToken: config.credentials.SecurityToken,
      })

      const fileUrl = await new Promise<string>((resolve, reject) => {
        let lastLoaded = 0
        cos.putObject({
          Bucket: config.bucket,
          Region: config.region,
          Key: config.fileKey,
          Body: file,
          onProgress: (progressData: any) => {
            const loaded = progressData?.loaded ?? 0
            const total = progressData?.total ?? file.size
            const delta = Math.max(0, loaded - lastLoaded)
            lastLoaded = loaded
            options?.onProgressDelta?.(delta)
            if (!partOfBatch) setProgress(loaded, total)
          }
        }, (err: any) => {
          if (err) {
            if (!partOfBatch) uploadError.value = err.message || '上传失败'
            reject(err)
          } else {
            const url = `https://${config.bucket}.cos.${config.region}.myqcloud.com/${config.fileKey}`
            resolve(url)
          }
        })
      })

      await $fetch('/api/files/save', {
        method: 'POST',
        body: {
          filename: file.name,
          safeFilename: config.safeFilename,
          fileKey: config.fileKey,
          fileSize: file.size,
          fileUrl: fileUrl,
          contentType: file.type,
          folderId,
          overwrite
        }
      })

      return fileUrl
    } catch (error: any) {
      if (!partOfBatch) uploadError.value = error.message || '上传失败'
      throw error
    } finally {
      if (!partOfBatch) uploading.value = false
    }
  }

  const uploadMultipleFiles = async (files: File[], options?: { folderId?: number | null; overwrite?: boolean }): Promise<string[]> => {
    const results: string[] = []
    const folderId = options?.folderId ?? null
    const overwrite = !!options?.overwrite

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
    let aggregatedLoaded = 0

    uploading.value = true
    uploadError.value = ''
    setProgress(0, totalBytes)

    try {
      for (const file of files) {
        const url = await uploadFile(file, {
          folderId,
          overwrite,
          partOfBatch: true,
          onProgressDelta: (delta: number) => {
            aggregatedLoaded += delta
            setProgress(aggregatedLoaded, totalBytes)
          }
        })
        results.push(url)
      }
      setProgress(totalBytes, totalBytes)
      return results
    } catch (error: any) {
      uploadError.value = error.message || '上传失败'
      throw error
    } finally {
      uploading.value = false
    }
  }

  return {
    uploading: readonly(uploading),
    uploadProgress: readonly(uploadProgress),
    uploadError: readonly(uploadError),
    uploadFile,
    uploadMultipleFiles
  }
}