<template>
  <div
    class="bg-white rounded-lg shadow p-6 transition-colors"
    @dragover.prevent
    @dragenter.prevent="onDragEnter"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="handleDrop"
    :class="{ 'border-2 border-dashed border-indigo-400 bg-indigo-50': isDragging }"
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
        <h3 class="text-lg font-medium text-gray-900">{{ title || '我的文件' }}</h3>
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
        <div class="relative" ref="uploadMenuRef" @mouseenter="openUploadMenu" @mouseleave="scheduleCloseUploadMenu">
          <button class="text-sm px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700" @click.stop="toggleUploadMenu">
            上传
          </button>
          <transition name="fade-slide">
            <div
              v-show="showUploadMenu"
              class="absolute right-0 mt-2 w-44 z-20 bg-white border border-gray-200 rounded-md shadow-lg"
              @mouseenter="openUploadMenu"
              @mouseleave="scheduleCloseUploadMenu"
            >
              <button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" @click="fileInputRef?.click()">
                上传文件
              </button>
              <button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" @click="folderInputRef?.click()">
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
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
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
      <div
        v-for="folder in folders"
        :key="'folder-' + folder.id"
        class="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
      >
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
      <div
        v-for="file in files"
        :key="'file-' + file.id"
        class="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
      >
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
import { toRef, watch } from 'vue'
import { formatToUTC8 } from '~/server/utils/time'
import { useFileBrowser } from '~/composables/useFileBrowser'
import { useDualSelection } from '~/composables/useDualSelection'
import { useBulkActions } from '~/composables/useBulkActions'
import { formatFileSize } from '~/utils/format'
import { useFileUpload } from '~/composables/useFileUpload'
import type { FolderRecord, FileRecord } from '~/types/file-browser'
import { useClipboard } from '~/composables/useClipboard'
import { useUploadMenu } from '~/composables/useUploadMenu'
import { useNameEditing } from '~/composables/useNameEditing'
import { useFolderDownload } from '~/composables/useFolderDownload'
import { useDnDUpload } from '~/composables/useDnDUpload'

const props = defineProps<{
  targetUserId?: number | null
  title?: string
}>()
const targetUserIdRef = toRef(props, 'targetUserId')

/* 列表/导航 */
const {
  folders, files, loading, hasItems,
  currentFolderId, breadcrumbs,
  fetchFiles, navigateToFolder, goUp, goToBreadcrumb
} = useFileBrowser({ targetUserId: targetUserIdRef })

/* 选择/全选 */
const {
  masterCheckboxRef,
  selectedFolderIds, selectedFileIds,
  selectedCount, isAllSelected,
  toggleSelectAll, toggleSelectFolder, toggleSelectFile,
  clearSelection, reconcileSelection
} = useDualSelection(folders, files)

/* 批量操作&单项文件/文件夹操作 */
const {
  bulkDeleting, bulkDownloading, downloadingFolderId,
  downloadFile, deleteFile, deleteFolder,
  deleteSelected, downloadSelected
} = useBulkActions(folders, files, selectedFolderIds, selectedFileIds, { targetUserId: targetUserIdRef })

/* 上传相关 */
const { uploading, uploadProgress, uploadError, uploadMultipleFiles } = useFileUpload({ targetUserId: targetUserIdRef })

/* 上传悬浮菜单 */
const { showUploadMenu, uploadMenuRef, openUploadMenu, scheduleCloseUploadMenu, toggleUploadMenu } = useUploadMenu()

/* 剪贴板（剪贴/复制/粘贴） */
const {
  clipboard, pasting, hasClipboard, clipboardCount,
  clipboardActionLabel, pasteBtnText,
  clipSelection, copySelection, clipFolder, copyFolder, clipFile, copyFile, pasteClipboard
} = useClipboard(
  { selectedFolderIds, selectedFileIds, selectedCount, currentFolderId, fetchFiles, clearSelection },
  { targetUserId: targetUserIdRef }
)

/* 新建/重命名 */
const { createFolder, renameFolder, renameFile } = useNameEditing(
  folders, files, breadcrumbs, currentFolderId, fetchFiles,
  { targetUserId: targetUserIdRef }
)

/* 文件夹打包下载 */
const { downloadingFolderId: downloadingFolderId2, downloadFolder } = useFolderDownload({ targetUserId: targetUserIdRef })

/* 拖拽/选择上传 */
const {
  isDragging, onDragEnter, onDragLeave,
  fileInputRef, folderInputRef, overwriteExisting,
  handleDrop, handleFileSelect, handleFolderSelect
} = useDnDUpload(currentFolderId, uploadMultipleFiles, fetchFiles, clearSelection, { targetUserId: targetUserIdRef })

/* 保持选择状态与列表同步 */
watch([folders, files], () => reconcileSelection())

/* 导航封装 */
const handleNavigateToFolder = (folder: FolderRecord) => { clearSelection(); navigateToFolder(folder) }
const handleGoUp = () => { clearSelection(); goUp() }
const handleGoToBreadcrumb = (index: number) => { clearSelection(); goToBreadcrumb(index) }

/* 向父组件暴露/事件 */
const emit = defineEmits<{ 'folder-change': [number | null] }>()
watch(currentFolderId, (id) => emit('folder-change', id), { immediate: true })

defineExpose({
  fetchFiles,
  currentFolderId,
  breadcrumbs
})
</script>