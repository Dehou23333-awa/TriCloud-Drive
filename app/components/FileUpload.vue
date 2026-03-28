<template>
  <div class="bg-white rounded-lg shadow p-6">
    <h3 class="text-lg font-medium text-gray-900 mb-4">文件上传</h3>

    <div class="flex items-center flex-wrap gap-3 mb-4">
      <button @click="fileInputRef?.click()" class="px-3 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">
        选择文件
      </button>
      <button @click="folderInputRef?.click()" class="px-3 py-2 rounded-md text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100">
        选择文件夹
      </button>
      <label class="inline-flex items-center text-sm text-gray-700 ml-2">
        <input type="checkbox" v-model="overwriteExisting" class="mr-2">
        同名时覆盖
      </label>
    </div>

    <div
      ref="dropZoneRef"
      data-drop-zone
      @drop.prevent="handleDrop"
      @dragover.prevent
      @dragenter.prevent="onDragEnter"
      @dragleave.prevent="onDragLeave"
      class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center transition-colors"
      :class="{ 'border-indigo-500 bg-indigo-50': isDragging, 'hover:border-gray-400': !isDragging }"
    >
      <div class="space-y-2">
        <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div>
          <p class="text-gray-600">
            拖拽文件或文件夹到此处，或
            <button @click="fileInputRef?.click()" class="text-indigo-600 hover:text-indigo-500 font-medium">点击选择文件</button>
            /
            <button @click="folderInputRef?.click()" class="text-indigo-600 hover:text-indigo-500 font-medium">点击选择文件夹</button>
          </p>
          <p class="text-sm text-gray-500">支持多文件/文件夹上传；“同名时覆盖”仅对同目录同名文件生效</p>
        </div>
      </div>
    </div>

    <input ref="fileInputRef" type="file" multiple class="hidden" @change="handleFileSelect" />
    <input ref="folderInputRef" type="file" webkitdirectory directory multiple class="hidden" @change="handleFolderSelect" />

    <div v-if="uploading" class="mt-4">
      <div class="flex items-center justify-between text-sm text-gray-600 mb-2">
        <span>上传中...</span>
        <span>{{ uploadProgress.percent }}%</span>
      </div>
      <div class="w-full bg-gray-200 rounded-full h-2">
        <div class="bg-indigo-600 h-2 rounded-full transition-all duration-300" :style="{ width: uploadProgress.percent + '%' }"></div>
      </div>
    </div>

    <div v-if="uploadError" class="mt-4 rounded-md bg-red-50 p-4">
      <div class="flex">
        <div class="ml-3">
          <h3 class="text-sm font-medium text-red-800">上传失败</h3>
          <div class="mt-2 text-sm text-red-700">{{ uploadError }}</div>
        </div>
      </div>
    </div>

    <div v-if="uploadedFiles.length > 0" class="mt-4">
      <h4 class="text-sm font-medium text-gray-900 mb-2">已上传文件</h4>
      <div class="space-y-2">
        <div v-for="(file, index) in uploadedFiles" :key="index" class="flex items-center justify-between bg-green-50 p-3 rounded-md">
          <div class="flex items-center">
            <svg class="h-5 w-5 text-green-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
            <span class="text-sm text-gray-900">{{ file.name }}</span>
          </div>
          <button @click="copyToClipboard(file.url)" class="text-sm text-indigo-600 hover:text-indigo-500">复制链接</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ currentFolderId?: number | null }>()
interface UploadedFile { name: string; url: string }
const emit = defineEmits<{ uploaded: [] }>()
const { uploading, uploadProgress, uploadError, uploadMultipleFiles } = useFileUpload()

const isDragging = ref(false)
const dragCounter = ref(0)
const uploadedFiles = ref<UploadedFile[]>([])
const fileInputRef = ref<HTMLInputElement>()
const folderInputRef = ref<HTMLInputElement>()
const dropZoneRef = ref<HTMLElement | null>(null)
const overwriteExisting = ref(false)

const onDragEnter = () => { dragCounter.value++; isDragging.value = true }
const onDragLeave = () => { dragCounter.value = Math.max(0, dragCounter.value - 1); if (dragCounter.value === 0) isDragging.value = false }

const toPosix = (p: string) => p.replace(/\\/g, '/')
const normalizeDir = (p: string) => toPosix(p).replace(/^\/+|\/+$/g, '')

const handleDrop = async (event: DragEvent) => {
  dragCounter.value = 0
  isDragging.value = false
  const items = Array.from(event.dataTransfer?.items || [])
  if (items.some((it: any) => typeof it.webkitGetAsEntry === 'function' && it.webkitGetAsEntry()?.isDirectory)) {
    const entries = await getFilesFromDataTransferItems(items)
    if (entries.length) {
      await handleEntries(entries)
      return
    }
  }
  const files = Array.from(event.dataTransfer?.files || [])
  if (files.length > 0) await handleFiles(files)
}

const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files || [])
  if (files.length > 0) await handleFiles(files)
}

const handleFolderSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (!files.length) return
  const entries = files.map((f) => {
    const rpRaw = (f as any).webkitRelativePath || f.name
    const rp = toPosix(rpRaw)
    const dir = rp.includes('/') ? rp.slice(0, rp.lastIndexOf('/')) : ''
    return { file: f, relativePath: normalizeDir(dir) }
  })
  await handleEntries(entries)
}

const handleFiles = async (files: File[]) => {
  try {
    const urls = await uploadMultipleFiles(files, {
      folderId: props.currentFolderId ?? null,
      overwrite: overwriteExisting.value
    })
    const newFiles: UploadedFile[] = files.map((file, index) => ({ name: file.name, url: urls[index] }))
    uploadedFiles.value.push(...newFiles)
    if (fileInputRef.value) fileInputRef.value.value = ''
    emit('uploaded')
  } catch (error) {
    console.error('文件上传失败:', error)
  }
}

const handleEntries = async (entries: { file: File; relativePath: string }[]) => {
  const uniqueDirs = Array.from(new Set(entries.map(e => e.relativePath).filter(Boolean)))
  const baseParentId = props.currentFolderId ?? null
  const dirMap = await ensurePaths(uniqueDirs, baseParentId)

  const groups = new Map<string, File[]>()
  for (const { file, relativePath } of entries) {
    const key = relativePath || '__ROOT__'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(file)
  }

  for (const [dir, files] of groups) {
    const folderId = dir === '__ROOT__' ? baseParentId : (dirMap[dir] ?? baseParentId)
    try {
      const urls = await uploadMultipleFiles(files, {
        folderId,
        overwrite: overwriteExisting.value
      })
      files.forEach((f, i) => uploadedFiles.value.push({ name: f.name, url: urls[i] }))
    } catch (e) {
      console.error('文件夹内文件上传失败:', e)
    }
  }

  if (fileInputRef.value) fileInputRef.value.value = ''
  if (folderInputRef.value) folderInputRef.value.value = ''
  emit('uploaded')
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

// 读取一个目录里的所有 entry（readEntries 需循环至空）
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

const copyToClipboard = async (text: string) => {
  try { await navigator.clipboard.writeText(text) } catch (error) { console.error('复制失败:', error) }
}
</script>