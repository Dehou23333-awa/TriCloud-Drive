// ~/services/move.service.ts
import { $fetch } from 'ofetch'

export const MoveService = {
  async paste(targetFolderId: number | null, folderIds: number[], fileIds: number[]) {
    return $fetch('/api/files/move', {
      method: 'POST',
      body: { targetFolderId, folderIds, fileIds }
    }) as Promise<{
      success: boolean
      message?: string
      moved?: { folders: number; files: number }
    }>
  }
}