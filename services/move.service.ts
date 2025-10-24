import { $fetch } from 'ofetch'

export const MoveService = {
  async paste(targetFolderId: number | null, folderIds: number[], fileIds: number[], targetUserId?: number | null, overwriteExisting?: boolean | null, skipExisting?: boolean | null) {
    const body: any = { targetFolderId, folderIds, fileIds, overwrite: overwriteExisting, skipIfExist: skipExisting }
    if (targetUserId) body.targetUserId = targetUserId
    return $fetch('/api/files/move', {
      method: 'POST',
      body
    }) as Promise<{
      success: boolean
      message?: string
      moved?: { folders: number; files: number }
      skipped:number
      failed: number
    }>
  }
}