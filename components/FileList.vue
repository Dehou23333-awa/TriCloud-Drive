<template>
  <div class="bg-white rounded-lg shadow p-6">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
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
        <div class="flex items-center space-x-3 cursor-pointer" @click="navigateToFolder(folder)">
          <div class="flex-shrink-0">
            <svg class="h-8 w-8 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h3l2 2h7a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
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
          <div class="flex items-center space-x-1 text-sm text-gray-400">
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
      // File System Access API 的句柄本身就是标准 WritableStream
      outStream = await handle.createWritable()
    } else {
      const mod = await import('streamsaver')
      const streamSaver = (mod as any).default || mod
      // 若自托管，请改为 '/streamsaver/mitm.html'
      streamSaver.mitm = 'https://jimmywarting.github.io/StreamSaver.js/mitm.html'
      outStream = streamSaver.createWriteStream(zipName) as unknown as WritableStream
    }

    // 3) 使用 ZipWriterStream（不依赖 WritableStreamWriter/ReadableStreamReader）
    const zip = await import('@zip.js/zip.js')
    const { ZipWriter, configure } = zip as any // <-- Note: ZipWriter, not ZipWriterStream
    if (!ZipWriter) {
      console.error('zip module exports:', Object.keys(zip as any))
      throw new Error('ZipWriter 不可用，请确认 @zip.js/zip.js 版本')
    }
    // 避免 worker 路径问题
    if (typeof configure === 'function') configure({ useWebWorkers: false })

    // 创建 ZipWriter：它直接接收目标输出流作为参数
    const zipWriter = new ZipWriter(outStream, { zip64: true }) // <-- Pass outStream here directly!

    for (const item of manifest.files) {
      // 每个文件都走你的签名接口（会进行额度强校验/预占）
      const signed = await $fetch<{ success: boolean; data: { downloadUrl: string } }>('/api/files/download', {
        method: 'POST',
        body: { fileKey: item.fileKey, filename: item.filename }
      })
      if (!signed?.success) throw new Error(`签名失败: ${item.filename}`)

      const res = await fetch(signed.data.downloadUrl, { mode: 'cors' })
      if (!res.ok) throw new Error(`获取文件失败: ${item.filename}`)

      // 读取源流。部分浏览器可能没有 res.body，则退化为 blob.stream()（会占用内存，极端兜底）
      const srcStream = res.body || (await res.blob()).stream()

      const entryPath = [folder.name, item.relDir, item.filename].filter(Boolean).join('/')

      // 将条目写入 zip：name + 该文件的 ReadableStream。level 不传为默认压缩；如需极速可加 level: 0
      await zipWriter.write({
        name: entryPath,
        stream: srcStream,
        // level: 0, // 需要更快/更省 CPU 时打开
      })
    }

    // 所有条目写完，关闭 zip 的输入端，然后等待管道完成
    await zipWriter.close()
    //await piping

    alert('打包完成，已保存。')
  } catch (e: any) {
    console.error('文件夹下载失败:', e)
    alert(e?.message || '文件夹下载失败，请稍后重试')
  } finally {
    downloadingFolderId.value = null
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