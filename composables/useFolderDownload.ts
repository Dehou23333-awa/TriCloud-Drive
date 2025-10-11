// ~/composables/useFolderDownload.ts
import { ref, type Ref } from 'vue'
import { FoldersService } from '~/services/folders.service'
import { FilesService } from '~/services/files.service'
import { createZipSink } from '~/utils/zipper'
import { formatFileSize } from '~/utils/format'
import type { FolderRecord } from '~/types/file-browser'

export function useFolderDownload(options?: { targetUserId?: Ref<number | null | undefined> }) {
  const tRef = options?.targetUserId
  const downloadingFolderId = ref<number | null>(null)

  const downloadFolder = async (folder: FolderRecord) => {
    if (downloadingFolderId.value) return
    downloadingFolderId.value = folder.id
    try {
      const t = tRef?.value ?? null
      const manifest = await FoldersService.manifest(folder.id, t)
      if (!manifest?.success) throw new Error('无法获取清单')
      if (!manifest.files?.length) {
        notify('该文件夹为空','error')
        return
      }
      const go = confirm(`将打包下载 "${folder.name}"（${manifest.totals.count} 个文件，共约 ${formatFileSize(manifest.totals.bytes)}）。继续？`)
      if (!go) return

      const sink = await createZipSink(`${folder.name}.zip`)
      for (const item of manifest.files) {
        const sign = await FilesService.downloadSign({ fileKey: item.fileKey, filename: item.filename }, t)
        if (!sign?.success) throw new Error(`签名失败: ${item.filename}`)
        const entryPath = [folder.name, item.relDir, item.filename].filter(Boolean).join('/')
        await sink.addFromUrl(entryPath, sign.data.downloadUrl)
      }
      await sink.close()
      notify('打包完成，已保存。', 'success')
    } catch (e: any) {
      console.error('文件夹下载失败:', e)
      notify(e?.message || '文件夹下载失败，请稍后重试', 'error')
    } finally {
      downloadingFolderId.value = null
    }
  }

  return { downloadingFolderId, downloadFolder }
}