import type { FolderRecord, FolderManifest } from '~/types/files'

export const FoldersService = {
  async create(name: string, parentId: number | null) {
    return await $fetch<{ success: boolean; folder?: FolderRecord; message?: string }>(
      '/api/folders/create',
      { method: 'POST', body: { name, parentId } }
    )
  },

  async delete(id: number) {
    return await $fetch<{ success: boolean; message?: string }>('/api/folders/delete', {
      method: 'POST',
      body: { folderId: id }
    })
  },

  async rename(id: number, newName: string) {
    return await $fetch<{ success: boolean; folder?: FolderRecord; message?: string }>(
      '/api/folders/rename',
      { method: 'POST', body: { folderId: id, newName } }
    )
  },

  async manifest(folderId: number) {
    return await $fetch<FolderManifest>('/api/folders/manifest', {
      method: 'GET',
      params: { folderId }
    })
  }
}