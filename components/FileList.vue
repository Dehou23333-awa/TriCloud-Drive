<template>
  <div class="bg-white rounded-lg shadow p-6">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <h3 class="text-lg font-medium text-gray-900">我的文件</h3>
        <!-- 面包屑 -->
        <nav class="text-sm text-gray-500">
          <span
            v-for="(crumb, idx) in breadcrumbs"
            :key="String(crumb.id) + '-' + idx"
          >
            <span v-if="idx > 0" class="mx-1">/</span>
            <button
              class="hover:text-indigo-600"
              @click="goToBreadcrumb(idx)"
              :disabled="idx === breadcrumbs.length - 1"
            >
              {{ crumb.name }}
            </button>
          </span>
        </nav>
      </div>

      <div class="flex items-center gap-3">
        <button
          class="text-sm text-gray-600 hover:text-gray-800"
          v-if="breadcrumbs.length > 1"
          @click="goUp"
        >
          返回上一级
        </button>
        <button
          class="text-sm text-indigo-600 hover:text-indigo-500"
          @click="createFolder"
        >
          新建文件夹
        </button>
        <button
          @click="refreshFiles"
          class="text-sm text-indigo-600 hover:text-indigo-500"
        >
          刷新
        </button>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="text-center py-8">
      <div class="inline-flex items-center">
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span class="text-gray-600">加载中...</span>
      </div>
    </div>

    <!-- 列表 -->
    <div v-else-if="hasItems" class="space-y-3">
      <!-- 文件夹 -->
      <div
        v-for="folder in folders"
        :key="'folder-' + folder.id"
        class="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
      >
        <div class="flex items-center space-x-3 cursor-pointer" @click="navigateToFolder(folder)">
          <div class="flex-shrink-0">
            <svg class="h-8 w-8 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h3l2 2h7a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900 truncate">
              {{ folder.name }}
            </p>
            <p class="text-sm text-gray-500">
              {{ formatToUTC8(folder.createdAt) }}
            </p>
          </div>
        </div>
        <div class="flex items-center space-x-3">
          <button
            class="text-sm text-red-600 hover:text-red-500"
            @click.stop="deleteFolder(folder)"
          >
            删除
          </button>
          <div class="flex items-center space-x-1 text-sm text-gray-400">
            进入
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </div>
        </div>
      </div>

      <!-- 文件 -->
      <div
        v-for="file in files"
        :key="'file-' + file.id"
        class="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
      >
        <div class="flex items-center space-x-3">
          <div class="flex-shrink-0">
            <svg class="h-8 w-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd" />
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
          <button
            @click="downloadFile(file)"
            class="text-sm text-blue-600 hover:text-blue-500"
          >
            下载
          </button>
          <button
            @click="deleteFile(file)"
            class="text-sm text-red-600 hover:text-red-500"
          >
            删除
          </button>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="text-center py-8">
      <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
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
      // 也可以 push 到本地列表，这里直接刷新以确保一致性
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
      alert('文件夹删除成功')
      // 可选：刷新（如果你担心并发或统计）
      // await fetchFiles()
    } else {
      alert(res.message || '删除失败')
    }
  } catch (e: any) {
    const msg = e?.data?.statusMessage || e?.data?.message || e?.message || '删除失败'
    alert(msg)
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