import type { FolderRecord, FolderManifest } from '~/types/files'

export const FoldersService = {
  async create(name: string, parentId: number | null, targetUserId?: number | null) {
    const body: any = { name, parentId }
    if (targetUserId) body.targetUserId = targetUserId
    return await $fetch<{ success: boolean; folder?: FolderRecord; message?: string }>(
      '/api/folders/create',
      { method: 'POST', body }
    )
  },

  async delete(id: number, targetUserId?: number | null) {
    const body: any = { folderId: id }
    if (targetUserId) body.targetUserId = targetUserId
    return await $fetch<{ success: boolean; message?: string }>('/api/folders/delete', {
      method: 'POST',
      body
    })
  },

  async rename(id: number, newName: string, targetUserId?: number | null) {
    const body: any = { folderId: id, newName }
    if (targetUserId) body.targetUserId = targetUserId
    return await $fetch<{ success: boolean; folder?: FolderRecord; message?: string }>(
      '/api/folders/rename',
      { method: 'POST', body }
    )
  },

  async manifest(folderId: number, targetUserId?: number | null) {
    const params: any = { folderId }
    if (targetUserId) params.targetUserId = targetUserId
    return await $fetch<FolderManifest>('/api/folders/manifest', {
      method: 'GET',
      params
    })
  }
}