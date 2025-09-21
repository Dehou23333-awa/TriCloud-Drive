import type { FileRecord } from '~/types/files.ts'

export const FilesService = {
  async list(folderId: number | null) {
    return await $fetch<{
      success: boolean
      currentFolderId: number | null
      folders: any[]
      files: any[]
    }>('/api/files', { params: { folderId: folderId ?? 'root' } })
  },

  async downloadSign(file: Pick<FileRecord, 'fileKey' | 'filename'>) {
    return await $fetch<{ success: boolean; data: { downloadUrl: string; filename: string } }>(
      '/api/files/download',
      { method: 'POST', body: { fileKey: file.fileKey, filename: file.filename } }
    )
  },

  async delete(id: number) {
    return await $fetch<{ success: boolean; message?: string }>('/api/files/delete', {
      method: 'POST',
      body: { fileId: id }
    })
  },

  async rename(id: number, newName: string) {
    return await $fetch<{ success: boolean; file?: FileRecord; message?: string }>('/api/files/rename', {
      method: 'POST',
      body: { fileId: id, newName }
    })
  }
}