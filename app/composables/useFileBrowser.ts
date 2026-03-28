import { FilesService } from '~/services/files.service'
import type { FolderRecord, FileRecord } from '~/types/files'

export function useFileBrowser(options?: { targetUserId?: Ref<number | null | undefined> }) {
  const tRef = options?.targetUserId

  const folders = ref<FolderRecord[]>([])
  const files = ref<FileRecord[]>([])
  const loading = ref(false)
  const currentFolderId = ref<number | null>(null)
  const breadcrumbs = ref<{ id: number | null; name: string }[]>([
    { id: null, name: '全部文件' }
  ])
  const hasItems = computed(() => folders.value.length + files.value.length > 0)

  const fetchFiles = async () => {
    try {
      loading.value = true
      const res = await FilesService.list(currentFolderId.value, tRef?.value ?? null)
      if (res.success) {
        folders.value = res.folders || []
        files.value = res.files || []
        currentFolderId.value = res.currentFolderId ?? null
      }
    } finally {
      loading.value = false
    }
  }

  const navigateToFolder = (folder: FolderRecord) => {
    currentFolderId.value = folder.id
    breadcrumbs.value.push({ id: folder.id, name: folder.name })
    fetchFiles()
  }
  const goUp = () => {
    if (breadcrumbs.value.length <= 1) return
    breadcrumbs.value.pop()
    currentFolderId.value = breadcrumbs.value[breadcrumbs.value.length - 1].id
    fetchFiles()
  }
  const goToBreadcrumb = (index: number) => {
    if (index < 0 || index >= breadcrumbs.value.length) return
    breadcrumbs.value.splice(index + 1)
    currentFolderId.value = breadcrumbs.value[index].id
    fetchFiles()
  }

  onMounted(fetchFiles)

  // 切换 targetUserId 时重置浏览状态
  watch(tRef, () => {
    folders.value = []
    files.value = []
    currentFolderId.value = null
    breadcrumbs.value = [{ id: null, name: '全部文件' }]
    fetchFiles()
  })

  return {
    folders, files, loading, hasItems,
    currentFolderId, breadcrumbs,
    fetchFiles, navigateToFolder, goUp, goToBreadcrumb
  }
}