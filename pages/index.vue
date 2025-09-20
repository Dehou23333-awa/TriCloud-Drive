<template>
  <div class="min-h-screen bg-gray-50">
    <!-- 导航栏 -->
    <nav class="bg-white shadow">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex items-center">
            <h1 class="text-xl font-semibold text-gray-900">
              TriCloud Drive
            </h1>
          </div>
          <div v-if="isLoggedIn" class="flex items-center space-x-4">
            <span class="text-gray-700">
              欢迎，{{ user?.username }}
            </span>
            <button
              @click="handleLogout"
              class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              退出登录
            </button>
          </div>
          <div v-else class="flex items-center space-x-4">
            <NuxtLink
              to="/login"
              class="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
            >
              登录
            </NuxtLink>
            <NuxtLink
              to="/register"
              class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              注册
            </NuxtLink>
          </div>
        </div>
      </div>
    </nav>

    <!-- 主内容 -->
    <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div v-if="!isLoggedIn" class="px-4 py-6 sm:px-0">
        <div class="text-center">
          <h2 class="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            欢迎来到 TriCloud Drive
          </h2>
          <p class="mt-4 text-lg text-gray-600">
            不安全、不可靠的云存储解决方案（bushi
          </p>
          <div class="mt-6">
            <NuxtLink
              to="/register"
              class="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
            >
              开始使用
            </NuxtLink>
          </div>
        </div>
      </div>

      <div v-else class="px-4 py-6 sm:px-0">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <!-- 用户信息 -->
          <div class="bg-white shadow rounded-lg p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">
              账户信息
            </h3>
            <dl class="space-y-4">
              <div>
                <dt class="text-sm font-medium text-gray-500">邮箱</dt>
                <dd class="text-sm text-gray-900">{{ user?.email }}</dd>
              </div>
              <div>
                <dt class="text-sm font-medium text-gray-500">用户名</dt>
                <dd class="text-sm text-gray-900">{{ user?.username }}</dd>
              </div>
              <div>
                <dt class="text-sm font-medium text-gray-500">注册时间</dt>
                <dd class="text-sm text-gray-900">
                  {{ formatToUTC8(user?.created_at) }}
                </dd>
              </div>
              <div>
                <dt class="text-sm font-medium text-gray-500">用户ID</dt>
                <dd class="text-sm text-gray-900">{{ user?.id }}</dd>
              </div>
              <div>
                <dt class="text-sm font-medium text-gray-500">存储已使用</dt>
                <dd class="text-sm text-gray-900">{{ formatFileSize(user?.usedStorage) }}/{{ formatFileSize(user?.maxStorage) }}</dd>
              </div>
              <div>
                <dt class="text-sm font-medium text-gray-500">下载已使用</dt>
                <dd class="text-sm text-gray-900">{{ formatFileSize(user?.usedDownload) }}/{{ formatFileSize(user?.maxDownload) }}</dd>
              </div>
              <div>
                <dt class="text-sm font-medium text-gray-500">到期时间</dt>
                <dd class="text-sm text-gray-900">{{ formatToUTC8(user?.expire_at) }}</dd>
              </div>
            </dl>
          </div>
          <!-- 文件上传：把当前文件夹 ID 传进去 -->
          <FileUpload
        :current-folder-id="currentFolderId"
        @uploaded="handleFileUploaded"
         />
        </div>

        <!-- 文件列表 -->
        <FileList
         ref="fileListRef"
         @folder-change="onFolderChange"
       />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
const { user, isLoggedIn, logout } = useAuth()

const fileListRef = ref()
const currentFolderId = ref<number | null>(null)

const onFolderChange = (id: number | null) => {
  currentFolderId.value = id
}

const handleLogout = async () => { await logout() }

const handleFileUploaded = () => {
  fileListRef.value?.refreshFiles()
}
const formatFileSize = (bytes: number | undefined): string => {
  if (bytes === undefined || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

import { formatToUTC8 } from '~/server/utils/time'
definePageMeta({ layout: false })
</script>
