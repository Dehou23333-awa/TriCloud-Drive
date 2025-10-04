// ~/composables/useNameEditing.ts
import { type Ref } from 'vue'
import { FilesService } from '~/services/files.service'
import { FoldersService } from '~/services/folders.service'
import type { FolderRecord, FileRecord } from '~/types/file-browser'

export function useNameEditing(
  folders: Ref<FolderRecord[]>,
  files: Ref<FileRecord[]>,
  breadcrumbs: Ref<Array<{ id: number; name: string }>>,
  currentFolderId: Ref<number | null>,
  fetchFiles: () => Promise<void>
) {
    const keepExtIfNone = (oldName: string, entered: string) => {
    const trim = (entered || '').trim()
    if (!trim) return trim
    const hasExt = /\.[^./\\]+$/.test(trim)  // 修正正则
    if (hasExt) return trim
    const oldExt = oldName.match(/\.[^./\\]+$/)?.[0] || ''  // 修正正则
    return trim + oldExt
    }

  const validateName = (name: string, isFolder = false) => {
    if (!name || !name.trim()) return '名称不能为空'
    if (name.length > 255) return '名称过长（最多255字符）'
    if (/[\\/]/.test(name)) return '名称不可包含斜杠/反斜杠'
    if (isFolder && (name === '.' || name === '..')) return '非法的文件夹名称'
    return ''
  }

  const createFolder = async () => {
    const name = prompt('请输入新建文件夹名称：')?.trim()
    if (!name) return
    if (name.length > 255) return alert('文件夹名称过长（最多255字符）')
    const res = await FoldersService.create(name, currentFolderId.value ?? null)
    if (res.success) await fetchFiles()
    else alert(res.message || '创建失败')
  }

  const renameFolder = async (folder: FolderRecord) => {
    const entered = prompt('请输入新的文件夹名称：', folder.name)
    if (entered == null) return
    const newName = entered.trim()
    const err = validateName(newName, true)
    if (err) return alert(err)
    if (newName === folder.name) return
    const res = await FoldersService.rename(folder.id, newName)
    if (!res.success) return alert(res.message || '重命名失败')

    const idx = folders.value.findIndex(f => f.id === folder.id)
    if (idx >= 0) folders.value[idx].name = newName
    breadcrumbs.value = breadcrumbs.value.map(c => c.id === folder.id ? { ...c, name: newName } : c)
  }

  const renameFile = async (file: FileRecord) => {
    const entered = prompt('请输入新的文件名：', file.filename)
    if (entered == null) return
    const finalName = keepExtIfNone(file.filename, entered)
    const err = validateName(finalName)
    if (err) return alert(err)
    if (finalName === file.filename) return
    const res = await FilesService.rename(file.id, finalName)
    if (!res.success) return alert(res.message || '重命名失败')
    const idx = files.value.findIndex(f => f.id === file.id)
    if (idx >= 0) files.value[idx].filename = finalName
  }

  return {
    keepExtIfNone,
    validateName,
    createFolder,
    renameFolder,
    renameFile
  }
}