<template>
  <div class="bg-white rounded-lg shadow p-6">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <!-- 全选 -->
        <input
          ref="masterCheckboxRef"
          type="checkbox"
          class="h-4 w-4 text-indigo-600 rounded border-gray-300"
          :checked="isAllSelected"
          :disabled="!hasItems"
          @change="toggleSelectAll"
          title="全选/全不选"
        />
        <h3 class="text-lg font-medium text-gray-900">我的文件</h3>
        <!-- 面包屑 -->
        <nav class="text-sm text-gray-500">
          <span v-for="(crumb, idx) in breadcrumbs" :key="String(crumb.id) + '-' + idx">
            <span v-if="idx > 0" class="mx-1">/</span>
            <button class="hover:text-indigo-600" @click="handleGoToBreadcrumb(idx)"
              :disabled="idx === breadcrumbs.length - 1">
              {{ crumb.name }}
            </button>
          </span>
        </nav>
      </div>

      <!-- 顶部工具栏 -->
      <div class="flex items-center gap-3">
        <button class="text-sm text-gray-600 hover:text-gray-800" v-if="breadcrumbs.length > 1" @click="handleGoUp">
          返回上一级
        </button>

        <!-- 批量操作 -->
        <button
          class="text-sm text-red-600 hover:text-red-500 disabled:opacity-50"
          :disabled="selectedCount === 0 || bulkDeleting"
          @click="deleteSelected"
        >
          删除
        </button>
        <button
          class="text-sm text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
          :disabled="selectedCount === 0 || bulkDownloading"
          @click="downloadSelected"
        >
          下载
        </button>

        <!-- 顶部：剪贴 / 复制 / 粘贴 -->
        <button
          class="text-sm text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
          :disabled="selectedCount === 0"
          @click="clipSelection"
          title="剪贴所选项目（移动）"
        >
          剪贴
        </button>

        <button
          class="text-sm text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
          :disabled="selectedCount === 0"
          @click="copySelection"
          title="复制所选项目（拷贝）"
        >
          复制
        </button>

        <button
          class="text-sm text-green-600 hover:text-green-500 disabled:opacity-50"
          :disabled="!hasClipboard || pasting"
          @click="pasteClipboard"
          :title="clipboard?.mode === 'cut' ? '移动到当前文件夹' : '复制到当前文件夹'"
        >
          {{ pasteBtnText }}
        </button>

        <!-- 剪贴板计数提示 -->
        <span v-if="hasClipboard" class="text-xs text-gray-500">
          {{ clipboardActionLabel }} {{ clipboardCount }} 项
        </span>

        <button class="text-sm text-indigo-600 hover:text-indigo-500" @click="createFolder">
          新建文件夹
        </button>
        <button @click="fetchFiles" class="text-sm text-indigo-600 hover:text-indigo-500">
          刷新
        </button>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="text-center py-8">
      <div class="inline-flex items-center">
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none"
          viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
          </path>
        </svg>
        <span class="text-gray-600">加载中...</span>
      </div>
    </div>

    <!-- 列表 -->
    <div v-else-if="hasItems" class="space-y-3">
      <!-- 文件夹 -->
      <div v-for="folder in folders" :key="'folder-' + folder.id"
        class="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
        <div class="flex items-center space-x-3">
          <!-- 选择复选框 -->
          <input
            type="checkbox"
            class="h-4 w-4 text-indigo-600 rounded border-gray-300"
            :checked="selectedFolderIds.has(folder.id)"
            @change.stop="toggleSelectFolder(folder)"
            @click.stop
            :title="`选择文件夹：${folder.name}`"
          />
          <div class="flex-shrink-0 cursor-pointer" @click="handleNavigateToFolder(folder)">
            <svg class="h-8 w-8 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h3l2 2h7a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
          </div>
          <div class="flex-1 min-w-0 cursor-pointer" @click="handleNavigateToFolder(folder)">
            <p class="text-sm font-medium text-gray-900 truncate">
              {{ folder.name }}
            </p>
            <p class="text-sm text-gray-500">
              {{ formatToUTC8(folder.createdAt) }}
            </p>
          </div>
        </div>
        <div class="flex items-center space-x-3">
          <button class="text-sm text-blue-600 hover:text-blue-500" @click.stop="downloadFolder(folder)"
            :disabled="downloadingFolderId === folder.id">
            {{ downloadingFolderId === folder.id ? '打包中...' : '下载' }}
          </button>
          <button class="text-sm text-red-600 hover:text-red-500" @click.stop="deleteFolder(folder)">
            删除
          </button>
          <button class="text-sm text-gray-600 hover:text-gray-800" @click.stop="renameFolder(folder)">
            重命名
          </button>
          <button class="text-sm text-indigo-600 hover:text-indigo-500" @click.stop="clipFolder(folder)">
            剪贴
          </button>
          <button class="text-sm text-indigo-600 hover:text-indigo-500" @click.stop="copyFolder(folder)">
            复制
          </button>
          <div class="flex items-center space-x-1 text-sm text-gray-400 cursor-pointer" @click="handleNavigateToFolder(folder)">
            进入
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>

      <!-- 文件 -->
      <div v-for="file in files" :key="'file-' + file.id"
        class="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
        <div class="flex items-center space-x-3">
          <!-- 选择复选框 -->
          <input
            type="checkbox"
            class="h-4 w-4 text-indigo-600 rounded border-gray-300"
            :checked="selectedFileIds.has(file.id)"
            @change.stop="toggleSelectFile(file)"
            @click.stop
            :title="`选择文件：${file.filename}`"
          />
          <div class="flex-shrink-0">
            <svg class="h-8 w-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd"
                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                clip-rule="evenodd" />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900 truncate">
              {{ file.filename }}
            </p>
            <p class="text-sm text-gray-500">
              {{ formatFileSize(file.fileSize) }} • {{ formatToUTC8(file.createdAt) }}
            </p>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <button @click="downloadFile(file)" class="text-sm text-blue-600 hover:text-blue-500">
            下载
          </button>
          <button @click="renameFile(file)" class="text-sm text-gray-600 hover:text-gray-800">
            重命名
          </button>
          <button @click="deleteFile(file)" class="text-sm text-red-600 hover:text-red-500">
            删除
          </button>
          <button @click="clipFile(file)" class="text-sm text-indigo-600 hover:text-indigo-500">
            剪贴
          </button>
          <button @click="copyFile(file)" class="text-sm text-indigo-600 hover:text-indigo-500">
            复制
          </button>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="text-center py-8">
      <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
        <path
          d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900">这里空空如也</h3>
      <p class="mt-1 text-sm text-gray-500">在当前文件夹上传或创建新的内容吧。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MoveService } from '~/services/move.service'
import { formatToUTC8 } from '~/server/utils/time'
import { useFileBrowser } from '~/composables/useFileBrowser'
import { useDualSelection } from '~/composables/useDualSelection'
import { useBulkActions } from '~/composables/useBulkActions'
import { formatFileSize } from '~/utils/format'
import { FilesService } from '~/services/files.service'
import { FoldersService } from '~/services/folders.service'
import { createZipSink } from '~/utils/zipper'
import { CopyService } from '~/services/copy.service' // 新增：复制服务

type ClipboardPayload = {
  mode: 'cut' | 'copy'       // 新增
  folderIds: number[]
  fileIds: number[]
  fromFolderId: number | null
}

const clipboard = ref<ClipboardPayload | null>(null)
const pasting = ref(false)

const hasClipboard = computed(() => {
  const c = clipboard.value
  return !!c && (c.folderIds.length + c.fileIds.length) > 0
})
const clipboardCount = computed(() => {
  const c = clipboard.value
  return c ? (c.folderIds.length + c.fileIds.length) : 0
})



interface FolderRecord {
  id: number
  name: string
  parentId: number | null
  createdAt: string
}
interface FileRecord {
  id: number
  folderId: number | null
  filename: string
  fileKey: string
  fileSize: number
  fileUrl: string
  contentType: string
  createdAt: string
}

/* 列表/导航 */
const {
  folders, files, loading, hasItems,
  currentFolderId, breadcrumbs,
  fetchFiles, navigateToFolder, goUp, goToBreadcrumb
} = useFileBrowser()

/* 选择/全选 */
const {
  masterCheckboxRef,
  selectedFolderIds, selectedFileIds,
  selectedCount, isAllSelected,
  toggleSelectAll, toggleSelectFolder, toggleSelectFile,
  clearSelection, reconcileSelection
} = useDualSelection(folders, files)

/* 批量操作&单项操作（下载/删除） */
const {
  bulkDeleting, bulkDownloading, downloadingFolderId,
  downloadFile, deleteFile, deleteFolder,
  deleteSelected, downloadSelected
} = useBulkActions(folders, files, selectedFolderIds, selectedFileIds)

/* 保持选择状态与列表同步 */
watch([folders, files], () => reconcileSelection())

/* 包装导航动作：切换目录前清空选择 */
const handleNavigateToFolder = (folder: FolderRecord) => {
  clearSelection()
  navigateToFolder(folder)
}
const handleGoUp = () => {
  clearSelection()
  goUp()
}
const handleGoToBreadcrumb = (index: number) => {
  clearSelection()
  goToBreadcrumb(index)
}

const clipboardActionLabel = computed(() => {
  if (!clipboard.value) return ''
  return clipboard.value.mode === 'cut' ? '已剪贴' : '已复制'
})

const pasteBtnText = computed(() =>
  pasting.value
    ? (clipboard.value?.mode === 'cut' ? '移动中...' : '复制中...')
    : '粘贴'
)

/* 顶部按钮：剪贴 */
const clipSelection = () => {
  if (selectedCount.value === 0) return
  clipboard.value = {
    mode: 'cut',
    folderIds: Array.from(selectedFolderIds.value),
    fileIds: Array.from(selectedFileIds.value),
    fromFolderId: currentFolderId.value ?? null
  }
}
/* 顶部按钮：复制 */
const copySelection = () => {
  if (selectedCount.value === 0) return
  clipboard.value = {
    mode: 'copy',
    folderIds: Array.from(selectedFolderIds.value),
    fileIds: Array.from(selectedFileIds.value),
    fromFolderId: currentFolderId.value ?? null
  }
}

/* 单个项目：剪贴/复制 */
const clipFolder = (folder: FolderRecord) => {
  clipboard.value = {
    mode: 'cut',
    folderIds: [folder.id],
    fileIds: [],
    fromFolderId: currentFolderId.value ?? null
  }
}
const copyFolder = (folder: FolderRecord) => {
  clipboard.value = {
    mode: 'copy',
    folderIds: [folder.id],
    fileIds: [],
    fromFolderId: currentFolderId.value ?? null
  }
}
const clipFile = (file: FileRecord) => {
  clipboard.value = {
    mode: 'cut',
    folderIds: [],
    fileIds: [file.id],
    fromFolderId: currentFolderId.value ?? null
  }
}
const copyFile = (file: FileRecord) => {
  clipboard.value = {
    mode: 'copy',
    folderIds: [],
    fileIds: [file.id],
    fromFolderId: currentFolderId.value ?? null
  }
}

/* 粘贴（根据 mode 调用不同服务） */
const pasteClipboard = async () => {
  if (!hasClipboard.value || pasting.value) return
  pasting.value = true
  try {
    const targetFolderId = currentFolderId.value ?? null
    const c = clipboard.value!

    const res = c.mode === 'cut'
      ? await MoveService.paste(targetFolderId, c.folderIds, c.fileIds)
      : await CopyService.paste(targetFolderId, c.folderIds, c.fileIds)

    if (!res?.success) {
      return alert(res?.message || (c.mode === 'cut' ? '移动失败' : '复制失败'))
    }

    clipboard.value = null
    clearSelection()
    await fetchFiles()
    // 可选：提示
    // const action = c.mode === 'cut' ? '已移动' : '已复制'
    // alert(`${action} 文件夹 ${res?.affected?.folders ?? 0} 个，文件 ${res?.affected?.files ?? 0} 个，共 ${formatFileSize(res?.affected?.bytes ?? 0)}`)
  } catch (e: any) {
    alert(e?.message || '粘贴失败，请稍后重试')
  } finally {
    pasting.value = false
  }
}

/* 创建/重命名（保留在组件内，轻量即可） */
const createFolder = async () => {
  const name = prompt('请输入新建文件夹名称：')?.trim()
  if (!name) return
  if (name.length > 255) return alert('文件夹名称过长（最多255字符）')

  const res = await FoldersService.create(name, currentFolderId.value ?? null)
  if (res.success) {
    await fetchFiles()
  } else {
    alert(res.message || '创建失败')
  }
}

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

/* 单个文件夹下载（含进度状态） */
const downloadFolder = async (folder: FolderRecord) => {
  if (downloadingFolderId.value) return
  downloadingFolderId.value = folder.id
  try {
    const manifest = await FoldersService.manifest(folder.id)
    if (!manifest?.success) throw new Error('无法获取清单')
    if (!manifest.files?.length) {
      alert('该文件夹为空')
      return
    }

    const go = confirm(
      `将打包下载 "${folder.name}"（${manifest.totals.count} 个文件，共约 ${formatFileSize(manifest.totals.bytes)}）。继续？`
    )
    if (!go) return

    const sink = await createZipSink(`${folder.name}.zip`)

    for (const item of manifest.files) {
      const sign = await FilesService.downloadSign({ fileKey: item.fileKey, filename: item.filename })
      if (!sign?.success) throw new Error(`签名失败: ${item.filename}`)
      const entryPath = [folder.name, item.relDir, item.filename].filter(Boolean).join('/')
      await sink.addFromUrl(entryPath, sign.data.downloadUrl)
    }

    await sink.close()
    alert('打包完成，已保存。')
  } catch (e: any) {
    console.error('文件夹下载失败:', e)
    alert(e?.message || '文件夹下载失败，请稍后重试')
  } finally {
    downloadingFolderId.value = null
  }
}


/* 向父组件暴露 */
const emit = defineEmits<{ 'folder-change': [number | null] }>()
watch(currentFolderId, (id) => emit('folder-change', id), { immediate: true })

defineExpose({
  fetchFiles,
  currentFolderId,
  breadcrumbs
})
</script>