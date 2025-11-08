<template>
  <div class="fixed inset-0 z-50">
    <!-- 背景遮罩 -->
    <div class="absolute inset-0 bg-black/40" @click="handleClose"></div>

    <!-- 内容容器 -->
    <div class="absolute inset-x-0 bottom-0 sm:inset-10 sm:rounded-xl bg-white shadow-xl flex flex-col max-h-[100vh] sm:max-h-[calc(100vh-80px)]">
      <!-- 顶部栏 -->
      <div class="flex items-center justify-between px-4 py-3 border-b">
        <div class="min-w-0">
          <p class="text-sm text-gray-500">文件预览</p>
          <h3 class="text-base sm:text-lg font-medium text-gray-900 truncate">{{ file?.filename }}</h3>
        </div>

        <div class="flex items-center gap-2">
          <!-- 保存（仅文本/Markdown 且有改动时） -->
          <button
            v-if="isEditable"
            class="px-3 py-2 rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
            :disabled="!dirty || uploading"
            @click="saveText"
            title="保存覆盖当前文件"
            aria-label="保存"
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

          <!-- 替换（所有类型都可） -->
          <div class="relative">
            <button
              class="px-3 py-2 rounded-md text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:bg-indigo-50 disabled:opacity-50"
              :disabled="uploading"
              @click="replaceInputRef?.click()"
              title="用本地文件替换（覆盖原名）"
              aria-label="替换"
            >
              替换文件
            </button>
            <input ref="replaceInputRef" type="file" class="hidden" @change="handlePickReplacement" />
          </div>

          <!-- 新标签打开（图片/PDF） -->
          <a
            v-if="signedUrl && (isImage || isPdf)"
            class="px-3 py-2 rounded-md text-gray-600 hover:text-gray-800 border border-gray-200 hover:bg-gray-50"
            :href="signedUrl"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="新标签打开"
          >
            新标签打开
          </a>

          <button
            class="p-2 text-gray-600 hover:text-gray-800"
            @click="handleClose"
            aria-label="关闭"
            title="关闭"
          >
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

      <!-- 主体 -->
      <div class="flex-1 min-h-0">
        <!-- 加载状态 -->
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
            v-if="signedUrl"
            :src="cacheBustedUrl"
            class="max-w-full max-h-full object-contain"
            referrerpolicy="no-referrer"
            alt="预览"
          />
        </div>

        <!-- PDF -->
        <div v-else-if="isPdf" class="h-full w-full bg-gray-50">
          <iframe
            v-if="signedUrl"
            :src="cacheBustedUrl"
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
            {{ file?.filename.endsWith('.md') ? 'Markdown' : '纯文本' }} · 文件大小 {{ prettySize }}
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

        <!-- 其他类型的占位 -->
        <div v-else class="h-full flex items-center justify-center text-gray-500">
          暂不支持该类型预览，可尝试“新标签打开”或“下载”。
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, toRef } from 'vue'
import { FilesService } from '~/services/files.service'
import { useFileUpload } from '~/composables/useFileUpload'
import type { FileRecord } from '~/types/file-browser'

const props = defineProps<{
  file: FileRecord
  currentFolderId: number | null
  targetUserId?: number | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

// 预览状态
const signedUrl = ref<string>('')
const cacheBust = ref(0)
const loading = ref(false)
const error = ref('')

// 文本编辑
const textContent = ref('')
const originalContent = ref('')

// 上传
const targetUserIdRef = toRef(props, 'targetUserId')
const { uploading, uploadProgress, uploadFile } = useFileUpload({ targetUserId: targetUserIdRef })

// 类型判断
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
  // 纯提示：大文件文本编辑体验不佳
  const s = props.file?.fileSize ?? 0
  if (!isEditable.value) return ''
  if (s > 5 * 1024 * 1024) return '提示：文件较大（>5MB），在浏览器中编辑可能会较慢。'
  return ''
})

// 加载
const load = async () => {
  if (!props.file) return
  loading.value = true
  error.value = ''
  signedUrl.value = ''
  textContent.value = ''
  originalContent.value = ''
  try {
    // 获取签名直链
    const { success, data } = await FilesService.downloadSign(
      { fileKey: props.file.fileKey, filename: props.file.filename },
      props.targetUserId ?? null
    )
    if (!success) throw new Error('获取下载链接失败')
    signedUrl.value = data.downloadUrl
    cacheBust.value = Date.now()

    // 文本/Markdown：拉取内容
    if (isEditable.value && signedUrl.value) {
      const res = await fetch(signedUrl.value, { method: 'GET' })
      if (!res.ok) throw new Error('拉取文件内容失败')
      const text = await res.text()
      originalContent.value = text
      textContent.value = text
    }
  } catch (e: any) {
    error.value = e?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

watch(() => props.file?.id, () => load(), { immediate: true })

const cacheBustedUrl = computed(() => {
  if (!signedUrl.value) return ''
  const sep = signedUrl.value.includes('?') ? '&' : '?'
  return `${signedUrl.value}${sep}t=${cacheBust.value}`
})

const saveText = async () => {
  if (!isEditable.value || !dirty.value) return
  try {
    error.value = ''
    const type = isMd.value ? 'text/markdown' : 'text/plain'
    const blob = new Blob([textContent.value], { type })
    // 用原始文件名创建新的 File，覆盖上传
    const newFile = new File([blob], props.file.filename, { type })
    await uploadFile(newFile, {
      folderId: props.currentFolderId ?? null,
      overwrite: true
    })
    // 刷新本地状态
    originalContent.value = textContent.value
    cacheBust.value = Date.now()
    // 通知父组件刷新列表
    emit('saved')
    // 成功提示（使用你的全局 notify，如果有）
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
    // 用原文件名覆盖（不使用所选文件名）
    const sameNameFile = new File([f], props.file.filename, { type: f.type || 'application/octet-stream' })
    await uploadFile(sameNameFile, {
      folderId: props.currentFolderId ?? null,
      overwrite: true
    })
    cacheBust.value = Date.now()
    emit('saved')
    // @ts-ignore
    if (typeof notify === 'function') notify('替换成功', 'success')
  } catch (err: any) {
    error.value = err?.message || '替换失败'
  }
}

const handleClose = () => emit('close')
</script>

<style scoped>
/* iOS 安全区处理（底部抽屉样式时） */
@supports (padding: max(0px)) {
  .safe-bottom {
    padding-bottom: max(env(safe-area-inset-bottom), 16px);
  }
}
</style>