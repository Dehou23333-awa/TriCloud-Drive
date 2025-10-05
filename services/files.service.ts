import type { FileRecord } from '~/types/files.ts'

export const FilesService = {
  async list(folderId: number | null, targetUserId?: number | null) {
    const params: any = { folderId: folderId ?? 'root' }
    if (targetUserId) params.targetUserId = targetUserId
    return await $fetch<{
      success: boolean
      currentFolderId: number | null
      folders: any[]
      files: any[]
    }>('/api/files', { params })
  },

  async downloadSign(file: Pick<FileRecord, 'fileKey' | 'filename'>, targetUserId?: number | null) {
    const body: any = { fileKey: file.fileKey, filename: file.filename }
    if (targetUserId) body.targetUserId = targetUserId
    return await $fetch<{ success: boolean; data: { downloadUrl: string; filename: string } }>(
      '/api/files/download',
      { method: 'POST', body }
    )
  },

  async delete(id: number, targetUserId?: number | null) {
    const body: any = { fileId: id }
    if (targetUserId) body.targetUserId = targetUserId
    return await $fetch<{ success: boolean; message?: string }>('/api/files/delete', {
      method: 'POST',
      body
    })
  },

  async rename(id: number, newName: string, targetUserId?: number | null) {
    const body: any = { fileId: id, newName }
    if (targetUserId) body.targetUserId = targetUserId
    return await $fetch<{ success: boolean; file?: FileRecord; message?: string }>('/api/files/rename', {
      method: 'POST',
      body
    })
  }
}