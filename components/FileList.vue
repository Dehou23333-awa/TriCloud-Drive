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
            <button class="hover:text-indigo-600" @click="goToBreadcrumb(idx)"
              :disabled="idx === breadcrumbs.length - 1">
              {{ crumb.name }}
            </button>
          </span>
        </nav>
      </div>

      <div class="flex items-center gap-3">
        <button class="text-sm text-gray-600 hover:text-gray-800" v-if="breadcrumbs.length > 1" @click="goUp">
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

        <button class="text-sm text-indigo-600 hover:text-indigo-500" @click="createFolder">
          新建文件夹
        </button>
        <button @click="refreshFiles" class="text-sm text-indigo-600 hover:text-indigo-500">
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
          <div class="flex-shrink-0 cursor-pointer" @click="navigateToFolder(folder)">
            <svg class="h-8 w-8 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h3l2 2h7a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
          </div>
          <div class="flex-1 min-w-0 cursor-pointer" @click="navigateToFolder(folder)">
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
          <div class="flex items-center space-x-1 text-sm text-gray-400 cursor-pointer" @click="navigateToFolder(folder)">
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
import { formatToUTC8 } from '~/server/utils/time'

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

const folders = ref<FolderRecord[]>([])
const files = ref<FileRecord[]>([])
const loading = ref(false)

const currentFolderId = ref<number | null>(null)
const breadcrumbs = ref<{ id: number | null; name: string }[]>([
  { id: null, name: '全部文件' }
])

const hasItems = computed(() => folders.value.length + files.value.length > 0)

/* ========== 新增：选择状态/全选 ========== */
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
  // 刷新时尽量保留当前目录中仍存在的选择项
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
  if (set.has(folder.id)) set.delete(folder.id)
  else set.add(folder.id)
  selectedFolderIds.value = set
}
const toggleSelectFile = (file: FileRecord) => {
  const set = new Set(selectedFileIds.value)
  if (set.has(file.id)) set.delete(file.id)
  else set.add(file.id)
  selectedFileIds.value = set
}

// 控制“半选”样式
watch(isIndeterminate, (v) => {
  if (masterCheckboxRef.value) masterCheckboxRef.value.indeterminate = v
}, { immediate: true })

/* ========== 原有：获取列表 ========== */
const fetchFiles = async () => {
  try {
    loading.value = true
    const response = await $fetch<{
      success: boolean
      currentFolderId: number | null
      folders: FolderRecord[]
      files: FileRecord[]
    }>('/api/files', {
      params: {
        folderId: currentFolderId.value ?? 'root'
      }
    })

    if (response.success) {
      folders.value = response.folders || []
      files.value = response.files || []
      currentFolderId.value = response.currentFolderId ?? null
      reconcileSelection() // 刷新时尽可能保持已选
    }
  } catch (error) {
    console.error('获取文件列表失败:', error)
  } finally {
    loading.value = false
  }
}

const refreshFiles = () => {
  fetchFiles()
}

const navigateToFolder = (folder: FolderRecord) => {
  clearSelection()
  currentFolderId.value = folder.id
  breadcrumbs.value.push({ id: folder.id, name: folder.name })
  fetchFiles()
}

const goUp = () => {
  if (breadcrumbs.value.length <= 1) return
  breadcrumbs.value.pop()
  clearSelection()
  currentFolderId.value = breadcrumbs.value[breadcrumbs.value.length - 1].id
  fetchFiles()
}

const goToBreadcrumb = (index: number) => {
  if (index < 0 || index >= breadcrumbs.value.length) return
  breadcrumbs.value.splice(index + 1)
  clearSelection()
  currentFolderId.value = breadcrumbs.value[index].id
  fetchFiles()
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const downloadFile = async (file: FileRecord) => {
  try {
    const response = await $fetch<{
      success: boolean;
      data: { downloadUrl: string; filename: string }
    }>('/api/files/download', {
      method: 'POST',
      body: {
        fileKey: file.fileKey,
        filename: file.filename
      }
    })

    if (response.success) {
      const link = document.createElement('a')
      link.href = response.data.downloadUrl
      link.download = response.data.filename
      link.target = '_blank'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  } catch (error) {
    console.error('生成下载链接失败:', error)
    alert('下载失败，请稍后重试')
  }
}

const deleteFile = async (file: FileRecord) => {
  if (!confirm(`确定要删除文件 "${file.filename}" 吗？`)) return
  try {
    const response = await $fetch<{ success: boolean; message: string }>('/api/files/delete', {
      method: 'POST',
      body: { fileId: file.id }
    })
    if (response.success) {
      files.value = files.value.filter(f => f.id !== file.id)
      // 同步清理已选
      selectedFileIds.value = new Set([...selectedFileIds.value].filter(id => id !== file.id))
      alert('文件删除成功')
    } else {
      alert('删除失败：' + response.message)
    }
  } catch (error: any) {
    console.error('删除文件失败:', error)
    alert('删除失败：' + (error.data?.message || '请稍后重试'))
  }
}

const createFolder = async () => {
  const name = prompt('请输入新建文件夹名称：')?.trim()
  if (!name) return
  if (name.length > 255) {
    alert('文件夹名称过长（最多255字符）')
    return
  }
  try {
    const res = await $fetch<{ success: boolean; folder?: FolderRecord; message?: string }>('/api/folders/create', {
      method: 'POST',
      body: { name, parentId: currentFolderId.value ?? null }
    })
    if (res.success) {
      await fetchFiles()
    } else {
      alert(res.message || '创建失败')
    }
  } catch (e: any) {
    const msg = e?.data?.statusMessage || e?.data?.message || e?.message || '创建失败'
    alert(msg)
  }
}

const deleteFolder = async (folder: FolderRecord) => {
  if (!confirm(`确定要删除文件夹 "${folder.name}" 吗？\n将同时删除其所有子文件夹与文件，操作不可恢复。`)) return
  try {
    const res = await $fetch<{ success: boolean; message?: string }>('/api/folders/delete', {
      method: 'POST',
      body: { folderId: folder.id }
    })
    if (res.success) {
      folders.value = folders.value.filter(f => f.id !== folder.id)
      // 同步清理已选
      selectedFolderIds.value = new Set([...selectedFolderIds.value].filter(id => id !== folder.id))
      alert('文件夹删除成功')
    } else {
      alert(res.message || '删除失败')
    }
  } catch (e: any) {
    const msg = e?.data?.statusMessage || e?.data?.message || e?.message || '删除失败'
    alert(msg)
  }
}
const emit = defineEmits<{ 'folder-change': [number | null] }>()
watch(currentFolderId, (id) => {
  emit('folder-change', id)
}, { immediate: true })

// 辅助：保留扩展名（如果用户未输入扩展名）
const keepExtIfNone = (oldName: string, entered: string) => {
  const trim = entered.trim()
  if (!trim) return trim
  const hasExt = /\.[^./\\]+$/.test(trim)  // 修正正则
  if (hasExt) return trim
  const oldExt = oldName.match(/\.[^./\\]+$/)?.[0] || ''  // 修正正则
  return trim + oldExt
}

// 基础校验：名称非空、长度、非法字符
const validateName = (name: string, isFolder = false) => {
  if (!name || !name.trim()) return '名称不能为空'
  if (name.length > 255) return '名称过长（最多255字符）'
  if (/[\\/]/.test(name)) return '名称不可包含斜杠/反斜杠'  // 简化正则
  if (isFolder && (name === '.' || name === '..')) return '非法的文件夹名称'
  return ''
}

const renameFolder = async (folder: FolderRecord) => {
  const entered = prompt('请输入新的文件夹名称：', folder.name)
  if (entered == null) return
  const newName = entered.trim()
  const err = validateName(newName, true)
  if (err) return alert(err)
  if (newName === folder.name) return // 无改动视为成功

  try {
    const res = await $fetch<{ success: boolean; folder?: FolderRecord; message?: string }>('/api/folders/rename', {
      method: 'POST',
      body: { folderId: folder.id, newName }
    })
    if (!res.success) return alert(res.message || '重命名失败')

    // 本地更新（避免整页刷新）
    const idx = folders.value.findIndex(f => f.id === folder.id)
    if (idx >= 0) folders.value[idx].name = newName

    // 若这个文件夹在面包屑里（通常不是当前层），也一并更新
    breadcrumbs.value = breadcrumbs.value.map(c => c.id === folder.id ? { ...c, name: newName } : c)
  } catch (e: any) {
    const msg = e?.data?.statusMessage || e?.data?.message || e?.message
    if (msg?.includes('UNIQUE') || msg?.includes('已存在')) {
      alert('同一目录下已存在同名文件夹')
    } else {
      alert(msg || '重命名失败')
    }
  }
}

const renameFile = async (file: FileRecord) => {
  const entered = prompt('请输入新的文件名：', file.filename)
  if (entered == null) return
  // 默认保留扩展名（如果用户没输入扩展名）
  const finalName = keepExtIfNone(file.filename, entered)
  const err = validateName(finalName, false)
  if (err) return alert(err)
  if (finalName === file.filename) return

  try {
    const res = await $fetch<{ success: boolean; file?: FileRecord; message?: string }>('/api/files/rename', {
      method: 'POST',
      body: { fileId: file.id, newName: finalName }
    })
    if (!res.success) return alert(res.message || '重命名失败')

    // 本地更新
    const idx = files.value.findIndex(f => f.id === file.id)
    if (idx >= 0) files.value[idx].filename = finalName
  } catch (e: any) {
    const msg = e?.data?.statusMessage || e?.data?.message || e?.message
    if (msg?.includes('UNIQUE') || msg?.includes('已存在')) {
      alert('当前文件夹内已存在同名文件')
    } else {
      alert(msg || '重命名失败')
    }
  }
}

const downloadingFolderId = ref<number | null>(null)

const downloadFolder = async (folder: FolderRecord) => {
  if (downloadingFolderId.value) return
  downloadingFolderId.value = folder.id

  type ManifestResp = {
    success: boolean
    folder: { id: number; name: string }
    files: { id: number; filename: string; fileKey: string; fileSize: number; relDir: string }[]
    totals: { count: number; bytes: number }
    precheck: {
      allowed: boolean
      unlimited: boolean
      requiredBytes: number
      remainingBytes: number
      exceedBytes: number
      usedDownload: number
      maxDownload: number
    }
  }

  try {
    if (typeof window === 'undefined') {
      alert('请在浏览器中进行下载操作')
      return
    }

    // 1) 获取清单 + 预检（不预占）
    const manifest = await $fetch<ManifestResp>('/api/folders/manifest', {
      method: 'GET',
      params: { folderId: folder.id }
    })
    if (!manifest?.success) throw new Error('无法获取清单')
    if (!manifest.files?.length) {
      alert('该文件夹为空')
      return
    }

    if (!manifest.precheck.allowed && !manifest.precheck.unlimited) {
      const go = confirm(
        `注意：当前剩余额度 ${formatFileSize(manifest.precheck.remainingBytes)}，` +
        `打包需 ${formatFileSize(manifest.precheck.requiredBytes)}，将超过 ${formatFileSize(manifest.precheck.exceedBytes)}。\n` +
        `仍要尝试下载吗？（实际下载会在每个文件时进行强制校验，可能中途失败）`
      )
      if (!go) return
    } else {
      const go = confirm(
        `将打包下载 "${folder.name}"（${manifest.totals.count} 个文件，共约 ${formatFileSize(manifest.totals.bytes)}）。继续？`
      )
      if (!go) return
    }

    // 2) 目标输出流（FSA 优先，否则 streamSaver）
    const zipName = `${folder.name}.zip`
    const canFSA = 'showSaveFilePicker' in window
    let outStream: WritableStream

    if (canFSA) {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: zipName,
        types: [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }]
      })
      outStream = await handle.createWritable()
    } else {
      const mod = await import('streamsaver')
      const streamSaver = (mod as any).default || mod
      streamSaver.mitm = 'https://jimmywarting.github.io/StreamSaver.js/mitm.html'
      outStream = streamSaver.createWriteStream(zipName) as unknown as WritableStream
    }

    const zip = await import('@zip.js/zip.js')
    const { ZipWriter, configure } = zip as any
    if (!ZipWriter) {
      console.error('zip module exports:', Object.keys(zip as any))
      throw new Error('ZipWriter 不可用，请确认 @zip.js/zip.js 版本')
    }
    if (typeof configure === 'function') configure({ useWebWorkers: false })

    const zipWriter = new ZipWriter(outStream, { zip64: true })

    for (const item of manifest.files) {
      const signed = await $fetch<{ success: boolean; data: { downloadUrl: string } }>('/api/files/download', {
        method: 'POST',
        body: { fileKey: item.fileKey, filename: item.filename }
      })
      if (!signed?.success) throw new Error(`签名失败: ${item.filename}`)

      const res = await fetch(signed.data.downloadUrl, { mode: 'cors' })
      if (!res.ok) throw new Error(`获取文件失败: ${item.filename}`)

      const srcStream = res.body || (await res.blob()).stream()
      const entryPath = [folder.name, item.relDir, item.filename].filter(Boolean).join('/')

      await zipWriter.write({
        name: entryPath,
        stream: srcStream,
      })
    }

    await zipWriter.close()
    alert('打包完成，已保存。')
  } catch (e: any) {
    console.error('文件夹下载失败:', e)
    alert(e?.message || '文件夹下载失败，请稍后重试')
  } finally {
    downloadingFolderId.value = null
  }
}

/* ========== 新增：批量删除/下载 ========== */
const bulkDeleting = ref(false)
const bulkDownloading = ref(false)

const deleteSelected = async () => {
  if (selectedCount.value === 0) return
  const fileIds = Array.from(selectedFileIds.value)
  const folderIds = Array.from(selectedFolderIds.value)

  const ok = confirm(
    `确定要删除选中的 ${folderIds.length} 个文件夹和 ${fileIds.length} 个文件吗？\n` +
    `删除文件夹将同时删除其所有子内容，操作不可恢复。`
  )
  if (!ok) return

  bulkDeleting.value = true
  try {
    const fileTasks = fileIds.map(id =>
      $fetch<{ success: boolean; message?: string }>('/api/files/delete', {
        method: 'POST',
        body: { fileId: id }
      }).then(res => ({ ok: res.success, id, type: 'file', message: res.message }))
        .catch(e => ({ ok: false, id, type: 'file', message: e?.data?.message || e?.message }))
    )
    const folderTasks = folderIds.map(id =>
      $fetch<{ success: boolean; message?: string }>('/api/folders/delete', {
        method: 'POST',
        body: { folderId: id }
      }).then(res => ({ ok: res.success, id, type: 'folder', message: res.message }))
        .catch(e => ({ ok: false, id, type: 'folder', message: e?.data?.message || e?.message }))
    )

    const results = await Promise.all([...fileTasks, ...folderTasks])

    const okFileIds = results.filter(r => r.ok && r.type === 'file').map(r => r.id as number)
    const okFolderIds = results.filter(r => r.ok && r.type === 'folder').map(r => r.id as number)
    if (okFileIds.length) files.value = files.value.filter(f => !okFileIds.includes(f.id))
    if (okFolderIds.length) folders.value = folders.value.filter(f => !okFolderIds.includes(f.id))

    // 清理选择
    selectedFileIds.value = new Set([...selectedFileIds.value].filter(id => !okFileIds.includes(id)))
    selectedFolderIds.value = new Set([...selectedFolderIds.value].filter(id => !okFolderIds.includes(id)))

    const failed = results.filter(r => !r.ok)
    if (failed.length) {
      alert(`部分删除失败：${failed.length} 项。\n` + failed.slice(0, 5).map(r =>
        `${r.type === 'folder' ? '文件夹' : '文件'} #${r.id}: ${r.message || '失败'}`
      ).join('\n'))
    } else {
      alert('删除成功')
    }
  } finally {
    bulkDeleting.value = false
  }
}

const downloadSelected = async () => {
  if (selectedCount.value === 0) return
  bulkDownloading.value = true

  try {
    const selectedFolders = folders.value.filter(f => selectedFolderIds.value.has(f.id))
    const selectedFilesArr = files.value.filter(f => selectedFileIds.value.has(f.id))

    // 仅文件：逐个直下下载
    if (selectedFolders.length === 0) {
      for (const f of selectedFilesArr) {
        await downloadFile(f)
      }
      return
    }

    // 含有文件夹：统一打包
    if (typeof window === 'undefined') {
      alert('请在浏览器中进行下载操作')
      return
    }

    type ManifestResp = {
      success: boolean
      folder: { id: number; name: string }
      files: { id: number; filename: string; fileKey: string; fileSize: number; relDir: string }[]
      totals: { count: number; bytes: number }
      precheck: any
    }

    const manifests = await Promise.all(
      selectedFolders.map((folder) =>
        $fetch<ManifestResp>('/api/folders/manifest', {
          method: 'GET',
          params: { folderId: folder.id }
        })
      )
    )

    const totalBytesFolders = manifests.reduce((acc, m) => acc + (m.totals?.bytes || 0), 0)
    const totalBytesFiles = selectedFilesArr.reduce((acc, f) => acc + (f.fileSize || 0), 0)
    const totalBytes = totalBytesFolders + totalBytesFiles

    const zipName = (selectedFolders.length === 1 && selectedFilesArr.length === 0)
      ? `${selectedFolders[0].name}.zip`
      : '选中项.zip'

    const go = confirm(
      `将打包下载 ${selectedFolders.length} 个文件夹和 ${selectedFilesArr.length} 个文件，` +
      `共约 ${formatFileSize(totalBytes)}。继续？`
    )
    if (!go) return

    // 输出流
    const canFSA = 'showSaveFilePicker' in window
    let outStream: WritableStream
    if (canFSA) {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: zipName,
        types: [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }]
      })
      outStream = await handle.createWritable()
    } else {
      const mod = await import('streamsaver')
      const streamSaver = (mod as any).default || mod
      streamSaver.mitm = 'https://jimmywarting.github.io/StreamSaver.js/mitm.html'
      outStream = streamSaver.createWriteStream(zipName) as unknown as WritableStream
    }

    const zip = await import('@zip.js/zip.js')
    const { ZipWriter, configure } = zip as any
    if (typeof configure === 'function') configure({ useWebWorkers: false })
    const zipWriter = new ZipWriter(outStream, { zip64: true })

    // 写入函数
    const addEntryFromSignedUrl = async (downloadUrl: string, entryPath: string) => {
      const res = await fetch(downloadUrl, { mode: 'cors' })
      if (!res.ok) throw new Error(`获取文件失败: ${entryPath}`)
      const srcStream = res.body || (await res.blob()).stream()
      await zipWriter.write({ name: entryPath, stream: srcStream })
    }

    // 文件夹条目
    for (const manifest of manifests) {
      if (!manifest?.success) continue
      for (const item of manifest.files) {
        const signed = await $fetch<{ success: boolean; data: { downloadUrl: string } }>('/api/files/download', {
          method: 'POST',
          body: { fileKey: item.fileKey, filename: item.filename }
        })
        if (!signed?.success) throw new Error(`签名失败: ${item.filename}`)
        const entryPath = [manifest.folder.name, item.relDir, item.filename].filter(Boolean).join('/')
        await addEntryFromSignedUrl(signed.data.downloadUrl, entryPath)
      }
    }

    // 单独选中的文件（放在 zip 根目录）
    for (const file of selectedFilesArr) {
      const signed = await $fetch<{ success: boolean; data: { downloadUrl: string } }>('/api/files/download', {
        method: 'POST',
        body: { fileKey: file.fileKey, filename: file.filename }
      })
      if (!signed?.success) throw new Error(`签名失败: ${file.filename}`)
      await addEntryFromSignedUrl(signed.data.downloadUrl, file.filename)
    }

    await zipWriter.close()
    alert('打包完成，已保存。')
  } catch (e: any) {
    console.error('批量下载失败:', e)
    alert(e?.message || '批量下载失败，请稍后重试')
  } finally {
    bulkDownloading.value = false
  }
}

onMounted(() => {
  fetchFiles()
})

// 提供给父组件：刷新与当前目录
defineExpose({
  refreshFiles,
  currentFolderId,
  breadcrumbs
})
</script>