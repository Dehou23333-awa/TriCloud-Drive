// services/copy.service.ts
export class CopyService {
  static async paste(targetFolderId: number | null, folderIds: number[], fileIds: number[]) {
    return $fetch('/api/copy/paste', {
      method: 'POST',
      body: { targetFolderId, folderIds, fileIds }
    })
  }
}