import { FilesService } from '~/services/files.service'
import type { FolderRecord, FileRecord } from '~/types/files'

export function useFileBrowser() {
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
      const res = await FilesService.list(currentFolderId.value)
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

  return {
    folders, files, loading, hasItems,
    currentFolderId, breadcrumbs,
    fetchFiles, navigateToFolder, goUp, goToBreadcrumb
  }
}