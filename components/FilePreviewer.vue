<template>
  <div class="fixed inset-0 z-50 bg-white flex flex-col">
    <!-- 顶栏 -->
    <div class="flex items-center justify-between px-4 py-3 border-b">
      <div class="min-w-0">
        <p class="text-xs text-gray-500">文件预览</p>
        <h3 class="text-base sm:text-lg font-medium text-gray-900 truncate">{{ file?.filename }}</h3>
      </div>
      <div class="flex items-center gap-2">
        <!-- 保存（仅文本/Markdown 且有改动） -->
        <button
          v-if="isEditable"
          class="px-3 py-2 rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          :disabled="!dirty || uploading"
          @click="saveText"
        >
          <span v-if="!uploading">保存</span>
          <span v-else class="inline-flex items-center">
            <svg class="animate-spin h-4 w-4 mr-1" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
            保存中
          </span>
        </button>

        <!-- 替换文件（所有类型可用） -->
        <div>
          <button
            class="px-3 py-2 rounded-md text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:bg-indigo-50 disabled:opacity-50"
            :disabled="uploading"
            @click="replaceInputRef?.click()"
          >
            替换文件
          </button>
          <input ref="replaceInputRef" type="file" class="hidden" @change="handlePickReplacement" />
        </div>

        <!-- 下载（走 /api/files/download + fetch -> blob） -->
        <button
          class="px-3 py-2 rounded-md text-gray-700 hover:text-gray-900 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          :disabled="loading"
          @click="handleDownload"
        >
          下载
        </button>

        <button class="p-2 text-gray-600 hover:text-gray-800" @click="handleClose" aria-label="关闭">
          <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none">
            <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 进度条 -->
    <div v-if="uploading" class="px-4 py-2">
      <div class="flex items-center justify-between text-sm text-gray-600 mb-2">
        <span>上传中...</span>
        <span>{{ uploadProgress.percent }}%</span>
      </div>
      <div class="w-full bg-gray-200 rounded-full h-2">
        <div class="bg-indigo-600 h-2 rounded-full transition-all duration-300" :style="{ width: uploadProgress.percent + '%' }"></div>
      </div>
    </div>

    <!-- 错误 -->
    <div v-if="error" class="mx-4 my-2 rounded bg-red-50 text-red-700 px-3 py-2 text-sm">
      {{ error }}
    </div>

    <!-- 主体：全屏区域 -->
    <div class="flex-1 min-h-0">
      <!-- 加载中 -->
      <div v-if="loading" class="h-full flex items-center justify-center text-gray-600">
        <div class="inline-flex items-center">
          <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-indigo-600" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
          </svg>
          加载中...
        </div>
      </div>

      <!-- 图片 -->
      <div v-else-if="isImage" class="h-full w-full overflow-auto flex items-center justify-center bg-gray-50">
        <img
          v-if="blobUrl"
          :src="blobUrl"
          class="max-w-full max-h-full object-contain"
          referrerpolicy="no-referrer"
          alt="预览"
        />
      </div>

      <!-- PDF -->
      <div v-else-if="isPdf" class="h-full w-full bg-gray-50">
        <iframe
          v-if="blobUrl"
          :src="blobUrl"
          class="w-full h-full"
          title="PDF 预览"
        ></iframe>
        <div v-else class="h-full flex items-center justify-center text-gray-500">
          无法加载 PDF 预览
        </div>
      </div>

      <!-- 文本/Markdown 可编辑 -->
      <div v-else-if="isEditable" class="h-full flex flex-col">
        <div class="px-4 py-2 text-xs text-gray-500 border-b">
          {{ file?.filename.endsWith('.md') ? 'Markdown' : '纯文本' }} · 大小 {{ prettySize }}
        </div>
        <textarea
          v-model="textContent"
          class="flex-1 w-full p-3 sm:p-4 font-mono text-sm outline-none"
          placeholder="正在加载内容..."
        ></textarea>
        <div v-if="tooLargeHint" class="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-t border-amber-100">
          {{ tooLargeHint }}
        </div>
      </div>

      <!-- 其他类型 -->
      <div v-else class="h-full flex items-center justify-center text-gray-500">
        暂不支持该类型的在线预览，可尝试下载。
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, toRef, onBeforeUnmount } from 'vue'
import { FilesService } from '~/services/files.service'
import { useFileUpload } from '~/composables/useFileUpload'
import type { FileRecord } from '~/types/file-browser'

const props = defineProps<{
  file: FileRecord
  currentFolderId: number | null
  targetUserId?: number | null
}>()

const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>()

const targetUserIdRef = toRef(props, 'targetUserId')

const loading = ref(false)
const error = ref('')

// 文本编辑
const textContent = ref('')
const originalContent = ref('')

// 上传
const { uploading, uploadProgress, uploadFile } = useFileUpload({ targetUserId: targetUserIdRef })

// 预览 Blob URL（避免直接暴露 CDN 链接）
const blobUrl = ref<string>('')

const ext = computed(() => {
  const n = props.file?.filename?.toLowerCase() || ''
  const i = n.lastIndexOf('.')
  return i >= 0 ? n.slice(i + 1) : ''
})
const isImage = computed(() => ['png','jpg','jpeg','gif','webp','bmp','svg','avif'].includes(ext.value))
const isPdf   = computed(() => ext.value === 'pdf')
const isText  = computed(() => ['txt','log','csv','json','xml','yml','yaml','ini','env'].includes(ext.value))
const isMd    = computed(() => ext.value === 'md' || ext.value === 'markdown')
const isEditable = computed(() => isText.value || isMd.value)

const dirty = computed(() => isEditable.value && textContent.value !== originalContent.value)
const prettySize = computed(() => {
  const s = props.file?.fileSize ?? 0
  if (s < 1024) return `${s} B`
  if (s < 1024 * 1024) return `${(s/1024).toFixed(1)} KB`
  if (s < 1024 * 1024 * 1024) return `${(s/1024/1024).toFixed(2)} MB`
  return `${(s/1024/1024/1024).toFixed(2)} GB`
})
const tooLargeHint = computed(() => {
  const s = props.file?.fileSize ?? 0
  if (!isEditable.value) return ''
  if (s > 5 * 1024 * 1024) return '提示：文件较大（>5MB），在浏览器中编辑可能会较慢。'
  return ''
})

const revokeBlob = () => {
  if (blobUrl.value) {
    URL.revokeObjectURL(blobUrl.value)
    blobUrl.value = ''
  }
}

onBeforeUnmount(() => revokeBlob())

const load = async () => {
  if (!props.file) return
  loading.value = true
  error.value = ''
  revokeBlob()
  textContent.value = ''
  originalContent.value = ''
  try {
    // 通过后端接口拿签名链接，但不直接暴露在 DOM，转为 blob URL
    const { success, data } = await FilesService.downloadSign(
      { fileKey: props.file.fileKey, filename: props.file.filename },
      props.targetUserId ?? null
    )
    if (!success) throw new Error('获取下载链接失败')

    if (isEditable.value) {
      const res = await fetch(data.downloadUrl, { method: 'GET' })
      if (!res.ok) throw new Error('拉取文件内容失败')
      const text = await res.text()
      originalContent.value = text
      textContent.value = text
    } else if (isImage.value || isPdf.value) {
      const res = await fetch(data.downloadUrl, { method: 'GET' })
      if (!res.ok) throw new Error('拉取文件预览失败')
      const blob = await res.blob()
      blobUrl.value = URL.createObjectURL(blob)
    } else {
      // 其他类型：不做预览
    }
  } catch (e: any) {
    error.value = e?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

watch(() => props.file?.id, () => load(), { immediate: true })

const saveText = async () => {
  if (!isEditable.value || !dirty.value) return
  try {
    error.value = ''
    const type = isMd.value ? 'text/markdown' : 'text/plain'
    const blob = new Blob([textContent.value], { type })
    const newFile = new File([blob], props.file.filename, { type })
    await uploadFile(newFile, {
      folderId: props.currentFolderId ?? null,
      overwrite: true
    })
    originalContent.value = textContent.value
    // 重新加载以刷新预览（blob 不缓存直链）
    await load()
    emit('saved')
    // @ts-ignore
    if (typeof notify === 'function') notify('保存成功', 'success')
  } catch (e: any) {
    error.value = e?.message || '保存失败'
  }
}

const replaceInputRef = ref<HTMLInputElement | null>(null)
const handlePickReplacement = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  try {
    error.value = ''
    const sameNameFile = new File([f], props.file.filename, { type: f.type || 'application/octet-stream' })
    await uploadFile(sameNameFile, {
      folderId: props.currentFolderId ?? null,
      overwrite: true
    })
    await load()
    emit('saved')
    // @ts-ignore
    if (typeof notify === 'function') notify('替换成功', 'success')
  } catch (err: any) {
    error.value = err?.message || '替换失败'
  }
}

const handleDownload = async () => {
  try {
    const { success, data } = await FilesService.downloadSign(
      { fileKey: props.file.fileKey, filename: props.file.filename },
      props.targetUserId ?? null
    )
    if (!success) throw new Error('获取下载链接失败')
    const res = await fetch(data.downloadUrl)
    if (!res.ok) throw new Error('下载失败')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = props.file.filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (e: any) {
    error.value = e?.message || '下载失败'
  }
}

const handleClose = () => emit('close')
</script>