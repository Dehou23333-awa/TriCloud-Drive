export class CopyService {
  static async paste(targetFolderId: number | null, folderIds: number[], fileIds: number[], targetUserId?: number | null) {
    const body: any = { targetFolderId, folderIds, fileIds }
    if (targetUserId) body.targetUserId = targetUserId
    return $fetch('/api/copy/paste', {
      method: 'POST',
      body
    })
  }
}