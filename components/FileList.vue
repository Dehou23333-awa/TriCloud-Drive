<template>
  <div
    class="bg-white rounded-lg shadow p-6 transition-colors"
    @dragover.prevent
    @dragenter.prevent="onDragEnter"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="handleDrop"
    :class="{
      'border-2 border-dashed border-indigo-400 bg-indigo-50': isDragging
    }"
  >
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
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
        <nav class="text-sm text-gray-500">
          <span v-for="(crumb, idx) in breadcrumbs" :key="String(crumb.id) + '-' + idx">
            <span v-if="idx > 0" class="mx-1">/</span>
            <button class="hover:text-indigo-600" @click="handleGoToBreadcrumb(idx)" :disabled="idx === breadcrumbs.length - 1">
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

        <!-- 剪贴 / 复制 / 粘贴 -->
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

        <span v-if="hasClipboard" class="text-xs text-gray-500">
          {{ clipboardActionLabel }} {{ clipboardCount }} 项
        </span>

        <!-- 上传按钮（悬浮菜单） -->
        <div
          class="relative"
          ref="uploadMenuRef"
          @mouseenter="openUploadMenu"
          @mouseleave="scheduleCloseUploadMenu"
        >
          <button
            class="text-sm px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
            @click.stop="toggleUploadMenu"
          >
            上传
          </button>

          <transition name="fade-slide">
            <div
              v-show="showUploadMenu"
              class="absolute right-0 mt-2 w-44 z-20 bg-white border border-gray-200 rounded-md shadow-lg"
              @mouseenter="openUploadMenu"
              @mouseleave="scheduleCloseUploadMenu"
            >
              <button
                class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                @click="fileInputRef?.click()"
              >
                上传文件
              </button>
              <button
                class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                @click="folderInputRef?.click()"
              >
                上传文件夹
              </button>
              <div class="px-4 py-2 border-t border-gray-100">
                <label class="flex items-center gap-2 text-xs text-gray-600">
                  <input type="checkbox" v-model="overwriteExisting" class="rounded border-gray-300" />
                  同名时覆盖
                </label>
              </div>
            </div>
          </transition>
        </div>

        <button class="text-sm text-indigo-600 hover:text-indigo-500" @click="createFolder">新建文件夹</button>
        <button @click="fetchFiles" class="text-sm text-indigo-600 hover:text-indigo-500">刷新</button>
      </div>
    </div>

    <!-- 隐藏的文件选择器 -->
    <input ref="fileInputRef" type="file" multiple class="hidden" @change="handleFileSelect" />
    <input ref="folderInputRef" type="file" webkitdirectory directory multiple class="hidden" @change="handleFolderSelect" />

    <!-- 上传进度与错误 -->
    <div v-if="uploading" class="mt-2 mb-4">
      <div class="flex items-center justify-between text-sm text-gray-600 mb-2">
        <span>上传中...</span>
        <span>{{ uploadProgress.percent }}%</span>
      </div>
      <div class="w-full bg-gray-200 rounded-full h-2">
        <div class="bg-indigo-600 h-2 rounded-full transition-all duration-300" :style="{ width: uploadProgress.percent + '%' }"></div>
      </div>
    </div>
    <div v-if="uploadError" class="mt-2 mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
      {{ uploadError }}
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
          <button @click="downloadFile(file)" class="text-sm text-blue-600 hover:text-blue-500">下载</button>
          <button @click="renameFile(file)" class="text-sm text-gray-600 hover:text-gray-800">重命名</button>
          <button @click="deleteFile(file)" class="text-sm text-red-600 hover:text-red-500">删除</button>
          <button @click="clipFile(file)" class="text-sm text-indigo-600 hover:text-indigo-500">剪贴</button>
          <button @click="copyFile(file)" class="text-sm text-indigo-600 hover:text-indigo-500">复制</button>
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
      <p class="mt-1 text-sm text-gray-500">拖拽文件/文件夹到此处上传，或使用右上角“上传”按钮。</p>
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
import { CopyService } from '~/services/copy.service'
import { useFileUpload } from '~/composables/useFileUpload'

type ClipboardPayload = {
  mode: 'cut' | 'copy'
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

/* 批量操作&单项操作 */
const {
  bulkDeleting, bulkDownloading, downloadingFolderId,
  downloadFile, deleteFile, deleteFolder,
  deleteSelected, downloadSelected
} = useBulkActions(folders, files, selectedFolderIds, selectedFileIds)

/* 上传相关 */
const { uploading, uploadProgress, uploadError, uploadMultipleFiles } = useFileUpload()
const isDragging = ref(false)
const dragCounter = ref(0)
const fileInputRef = ref<HTMLInputElement | null>(null)
const folderInputRef = ref<HTMLInputElement | null>(null)
const overwriteExisting = ref(false)

const onDragEnter = () => { dragCounter.value++; isDragging.value = true }
const onDragLeave = () => { dragCounter.value = Math.max(0, dragCounter.value - 1); if (dragCounter.value === 0) isDragging.value = false }

/* 保持选择状态与列表同步 */
watch([folders, files], () => reconcileSelection())

/* 导航封装 */
const handleNavigateToFolder = (folder: FolderRecord) => { clearSelection(); navigateToFolder(folder) }
const handleGoUp = () => { clearSelection(); goUp() }
const handleGoToBreadcrumb = (index: number) => { clearSelection(); goToBreadcrumb(index) }

/* 剪贴板文案 */
const clipboardActionLabel = computed(() => !clipboard.value ? '' : (clipboard.value.mode === 'cut' ? '已剪贴' : '已复制'))
const pasteBtnText = computed(() => pasting.value ? (clipboard.value?.mode === 'cut' ? '移动中...' : '复制中...') : '粘贴')


// 上传菜单：延迟关闭
const showUploadMenu = ref(false)
const uploadMenuRef = ref<HTMLElement | null>(null)
const HIDE_DELAY_MS = 250
let uploadMenuCloseTimer: number | undefined

const openUploadMenu = () => {
  if (uploadMenuCloseTimer) {
    clearTimeout(uploadMenuCloseTimer)
    uploadMenuCloseTimer = undefined
  }
  showUploadMenu.value = true
}
const scheduleCloseUploadMenu = (delay = HIDE_DELAY_MS) => {
  if (uploadMenuCloseTimer) clearTimeout(uploadMenuCloseTimer)
  uploadMenuCloseTimer = window.setTimeout(() => {
    showUploadMenu.value = false
    uploadMenuCloseTimer = undefined
  }, delay)
}
const toggleUploadMenu = () => {
  if (showUploadMenu.value) scheduleCloseUploadMenu(0)
  else openUploadMenu()
}

// 点击外部关闭
onMounted(() => {
  const onDocClick = (e: MouseEvent) => {
    const el = uploadMenuRef.value
    if (!el) return
    if (!el.contains(e.target as Node)) showUploadMenu.value = false
  }
  document.addEventListener('click', onDocClick)
  onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
})

/* 顶部按钮：剪贴/复制 */
const clipSelection = () => {
  if (selectedCount.value === 0) return
  clipboard.value = {
    mode: 'cut',
    folderIds: Array.from(selectedFolderIds.value),
    fileIds: Array.from(selectedFileIds.value),
    fromFolderId: currentFolderId.value ?? null
  }
}
const copySelection = () => {
  if (selectedCount.value === 0) return
  clipboard.value = {
    mode: 'copy',
    folderIds: Array.from(selectedFolderIds.value),
    fileIds: Array.from(selectedFileIds.value),
    fromFolderId: currentFolderId.value ?? null
  }
}

/* 单项剪贴/复制 */
const clipFolder = (folder: FolderRecord) => {
  clipboard.value = { mode: 'cut', folderIds: [folder.id], fileIds: [], fromFolderId: currentFolderId.value ?? null }
}
const copyFolder = (folder: FolderRecord) => {
  clipboard.value = { mode: 'copy', folderIds: [folder.id], fileIds: [], fromFolderId: currentFolderId.value ?? null }
}
const clipFile = (file: FileRecord) => {
  clipboard.value = { mode: 'cut', folderIds: [], fileIds: [file.id], fromFolderId: currentFolderId.value ?? null }
}
const copyFile = (file: FileRecord) => {
  clipboard.value = { mode: 'copy', folderIds: [], fileIds: [file.id], fromFolderId: currentFolderId.value ?? null }
}

/* 粘贴 */
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
      alert(res?.message || (c.mode === 'cut' ? '移动失败' : '复制失败'))
      return
    }
    clipboard.value = null
    clearSelection()
    await fetchFiles()
  } catch (e: any) {
    alert(e?.message || '粘贴失败，请稍后重试')
  } finally {
    pasting.value = false
  }
}

/* 创建/重命名 */
const createFolder = async () => {
  const name = prompt('请输入新建文件夹名称：')?.trim()
  if (!name) return
  if (name.length > 255) return alert('文件夹名称过长（最多255字符）')
  const res = await FoldersService.create(name, currentFolderId.value ?? null)
  if (res.success) await fetchFiles()
  else alert(res.message || '创建失败')
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

/* 下载文件夹 */
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
    const go = confirm(`将打包下载 "${folder.name}"（${manifest.totals.count} 个文件，共约 ${formatFileSize(manifest.totals.bytes)}）。继续？`)
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

/* 拖拽/选择上传 */
const toPosix = (p: string) => p.replace(/\\/g, '/')
const normalizeDir = (p: string) => toPosix(p).replace(/^\/+|\/+$/g, '')

const handleDrop = async (event: DragEvent) => {
  dragCounter.value = 0
  isDragging.value = false
  const items = Array.from(event.dataTransfer?.items || [])
  // 检测是否包含目录
  if (items.some((it: any) => typeof it.webkitGetAsEntry === 'function' && it.webkitGetAsEntry()?.isDirectory)) {
    const entries = await getFilesFromDataTransferItems(items as any)
    if (entries.length) {
      await handleEntries(entries)
      return
    }
  }
  const fls = Array.from(event.dataTransfer?.files || [])
  if (fls.length > 0) await handleFiles(fls)
}
const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const fls = Array.from(target.files || [])
  if (!fls.length) return
  await handleFiles(fls)
  if (fileInputRef.value) fileInputRef.value.value = ''
}
const handleFolderSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const fls = Array.from(input.files || [])
  if (!fls.length) return
  const entries = fls.map((f) => {
    const rpRaw = (f as any).webkitRelativePath || f.name
    const rp = toPosix(rpRaw)
    const dir = rp.includes('/') ? rp.slice(0, rp.lastIndexOf('/')) : ''
    return { file: f, relativePath: normalizeDir(dir) }
  })
  await handleEntries(entries)
  if (folderInputRef.value) folderInputRef.value.value = ''
}
const handleFiles = async (fls: File[]) => {
  try {
    await uploadMultipleFiles(fls, {
      folderId: currentFolderId.value ?? null,
      overwrite: overwriteExisting.value
    })
    clearSelection()
    await fetchFiles()
  } catch (error) {
    console.error('文件上传失败:', error)
  }
}
const handleEntries = async (entries: { file: File; relativePath: string }[]) => {
  const uniqueDirs = Array.from(new Set(entries.map(e => e.relativePath).filter(Boolean)))
  const baseParentId = currentFolderId.value ?? null
  const dirMap = await ensurePaths(uniqueDirs, baseParentId)

  // 分组：同一目录一组
  const groups = new Map<string, File[]>()
  for (const { file, relativePath } of entries) {
    const key = relativePath || '__ROOT__'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(file)
  }

  for (const [dir, fls] of groups) {
    const folderId = dir === '__ROOT__' ? baseParentId : (dirMap[dir] ?? baseParentId)
    try {
      await uploadMultipleFiles(fls, {
        folderId,
        overwrite: overwriteExisting.value
      })
    } catch (e) {
      console.error('文件夹内文件上传失败:', e)
    }
  }

  clearSelection()
  await fetchFiles()
}

const ensurePaths = async (paths: string[], parentId: number | null) => {
  if (!paths.length) return {} as Record<string, number | null>
  try {
    const res = await $fetch<{ success: boolean; map: Record<string, number> }>('/api/folders/ensure-paths', {
      method: 'POST',
      body: { parentId, paths }
    })
    return res?.map || {}
  } catch (e) {
    console.error('确保目录存在失败:', e)
    return {}
  }
}
// 目录遍历辅助
const readAllDirectoryEntries = (reader: any): Promise<any[]> => {
  return new Promise((resolve) => {
    const entries: any[] = []
    const readBatch = () => {
      reader.readEntries((batch: any[]) => {
        if (batch.length === 0) resolve(entries)
        else { entries.push(...batch); readBatch() }
      }, () => resolve(entries))
    }
    readBatch()
  })
}
const traverseDirectoryEntry = async (dirEntry: any, path: string): Promise<{ file: File; relativePath: string }[]> => {
  const reader = dirEntry.createReader()
  const children = await readAllDirectoryEntries(reader)
  const result: { file: File; relativePath: string }[] = []
  for (const entry of children) {
    if (entry.isFile) {
      const file: File = await new Promise((res) => entry.file(res))
      result.push({ file, relativePath: normalizeDir(path) })
    } else if (entry.isDirectory) {
      const subPath = path ? `${path}/${entry.name}` : entry.name
      const subFiles = await traverseDirectoryEntry(entry, subPath)
      result.push(...subFiles)
    }
  }
  return result
}
const getFilesFromDataTransferItems = async (items: DataTransferItem[]) => {
  const results: { file: File; relativePath: string }[] = []
  for (const item of items) {
    const entry = (item as any).webkitGetAsEntry?.()
    if (!entry) continue
    if (entry.isFile) {
      const file: File = await new Promise((res) => entry.file(res))
      results.push({ file, relativePath: '' })
    } else if (entry.isDirectory) {
      const files = await traverseDirectoryEntry(entry, entry.name)
      results.push(...files)
    }
  }
  return results.map(r => ({ file: r.file, relativePath: normalizeDir(r.relativePath) }))
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


<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}
.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>