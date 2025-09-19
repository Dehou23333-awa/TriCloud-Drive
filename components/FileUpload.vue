<template>
  <div class="bg-white rounded-lg shadow p-6">
    <h3 class="text-lg font-medium text-gray-900 mb-4">文件上传</h3>
    
    <!-- 拖拽上传区域 -->
    <div
      ref="dropZoneRef"
      data-drop-zone
      @drop.prevent="handleDrop"
      @dragover.prevent
      @dragenter.prevent="onDragEnter"
      @dragleave.prevent="onDragLeave"
      class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center transition-colors"
      :class="{
        'border-indigo-500 bg-indigo-50': isDragging,
        'hover:border-gray-400': !isDragging
      }"
    >
      <div class="space-y-2">
        <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div>
          <p class="text-gray-600">
            拖拽文件到此处，或
            <button
              @click="fileInputRef?.click()"
              class="text-indigo-600 hover:text-indigo-500 font-medium"
            >
              点击选择文件
            </button>
          </p>
          <p class="text-sm text-gray-500">支持多文件上传</p>
        </div>
      </div>
    </div>

    <!-- 隐藏的文件输入 -->
    <input
      ref="fileInputRef"
      type="file"
      multiple
      class="hidden"
      @change="handleFileSelect"
    />

    <!-- 上传进度 -->
    <div v-if="uploading" class="mt-4">
      <div class="flex items-center justify-between text-sm text-gray-600 mb-2">
        <span>上传中...</span>
        <span>{{ uploadProgress.percent }}%</span>
      </div>
      <div class="w-full bg-gray-200 rounded-full h-2">
        <div
          class="bg-indigo-600 h-2 rounded-full transition-all duration-300"
          :style="{ width: uploadProgress.percent + '%' }"
        ></div>
      </div>
    </div>

    <!-- 错误信息 -->
    <div v-if="uploadError" class="mt-4 rounded-md bg-red-50 p-4">
      <div class="flex">
        <div class="ml-3">
          <h3 class="text-sm font-medium text-red-800">
            上传失败
          </h3>
          <div class="mt-2 text-sm text-red-700">
            {{ uploadError }}
          </div>
        </div>
      </div>
    </div>

    <!-- 成功信息 -->
    <div v-if="uploadedFiles.length > 0" class="mt-4">
      <h4 class="text-sm font-medium text-gray-900 mb-2">已上传文件</h4>
      <div class="space-y-2">
        <div
          v-for="(file, index) in uploadedFiles"
          :key="index"
          class="flex items-center justify-between bg-green-50 p-3 rounded-md"
        >
          <div class="flex items-center">
            <svg class="h-5 w-5 text-green-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
            <span class="text-sm text-gray-900">{{ file.name }}</span>
          </div>
          <button
            @click="copyToClipboard(file.url)"
            class="text-sm text-indigo-600 hover:text-indigo-500"
          >
            复制链接
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 当前文件夹ID（根目录传 null/不传）
const props = defineProps<{
  currentFolderId?: number | null
}>()

interface UploadedFile {
  name: string
  url: string
}

const emit = defineEmits<{
  uploaded: []
}>()

// composable（已在 useUpload.ts 中适配 folderId）
const { uploading, uploadProgress, uploadError, uploadMultipleFiles } = useFileUpload()

const isDragging = ref(false)
const dragCounter = ref(0)
const uploadedFiles = ref<UploadedFile[]>([])
const fileInputRef = ref<HTMLInputElement>()
const dropZoneRef = ref<HTMLElement | null>(null)

const onDragEnter = () => {
  dragCounter.value++
  isDragging.value = true
}
const onDragLeave = () => {
  dragCounter.value = Math.max(0, dragCounter.value - 1)
  if (dragCounter.value === 0) {
    isDragging.value = false
  }
}

const handleDrop = async (event: DragEvent) => {
  dragCounter.value = 0
  isDragging.value = false
  const files = Array.from(event.dataTransfer?.files || [])
  if (files.length > 0) {
    await handleFiles(files)
  }
}

const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files || [])
  if (files.length > 0) {
    await handleFiles(files)
  }
}

// 核心修改：把当前 folderId 传给上传逻辑
const handleFiles = async (files: File[]) => {
  try {
    const urls = await uploadMultipleFiles(files, {
      folderId: props.currentFolderId ?? null
    })
    
    // 添加到已上传文件列表
    const newFiles: UploadedFile[] = files.map((file, index) => ({
      name: file.name,
      url: urls[index]
    }))
    uploadedFiles.value.push(...newFiles)
    
    // 清空文件输入
    if (fileInputRef.value) fileInputRef.value.value = ''

    // 通知父级刷新列表
    emit('uploaded')
  } catch (error) {
    console.error('文件上传失败:', error)
  }
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
  } catch (error) {
    console.error('复制失败:', error)
  }
}
</script>