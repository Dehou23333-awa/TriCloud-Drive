import type { FolderRecord, FileRecord } from '~/types/files'

export function useDualSelection(folders: Ref<FolderRecord[]>, files: Ref<FileRecord[]>) {
  const masterCheckboxRef = ref<HTMLInputElement | null>(null)
  const selectedFolderIds = ref<Set<number>>(new Set())
  const selectedFileIds = ref<Set<number>>(new Set())

  const totalItemCount = computed(() => folders.value.length + files.value.length)
  const selectedCount = computed(() => selectedFolderIds.value.size + selectedFileIds.value.size)
  const isAllSelected = computed(() => totalItemCount.value > 0 && selectedCount.value === totalItemCount.value)
  const isIndeterminate = computed(() => selectedCount.value > 0 && selectedCount.value < totalItemCount.value)

  const clearSelection = () => {
    selectedFolderIds.value = new Set()
    selectedFileIds.value = new Set()
  }
  const reconcileSelection = () => {
    const folderSet = new Set(folders.value.map(f => f.id))
    const fileSet = new Set(files.value.map(f => f.id))
    selectedFolderIds.value = new Set([...selectedFolderIds.value].filter(id => folderSet.has(id)))
    selectedFileIds.value = new Set([...selectedFileIds.value].filter(id => fileSet.has(id)))
  }

  const toggleSelectAll = () => {
    if (isAllSelected.value) {
      clearSelection()
    } else {
      selectedFolderIds.value = new Set(folders.value.map(f => f.id))
      selectedFileIds.value = new Set(files.value.map(f => f.id))
    }
  }
  const toggleSelectFolder = (folder: FolderRecord) => {
    const set = new Set(selectedFolderIds.value)
    set.has(folder.id) ? set.delete(folder.id) : set.add(folder.id)
    selectedFolderIds.value = set
  }
  const toggleSelectFile = (file: FileRecord) => {
    const set = new Set(selectedFileIds.value)
    set.has(file.id) ? set.delete(file.id) : set.add(file.id)
    selectedFileIds.value = set
  }

  watch(isIndeterminate, (v) => {
    if (masterCheckboxRef.value) masterCheckboxRef.value.indeterminate = v
  }, { immediate: true })

  return {
    masterCheckboxRef,
    selectedFolderIds, selectedFileIds,
    totalItemCount, selectedCount,
    isAllSelected, isIndeterminate,
    clearSelection, reconcileSelection,
    toggleSelectAll, toggleSelectFolder, toggleSelectFile
  }
}