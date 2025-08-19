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
              欢迎，{{ user?.email }}
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
            安全、可靠的云存储解决方案
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
            <dl class="space-y-3">
              <div>
                <dt class="text-sm font-medium text-gray-500">邮箱</dt>
                <dd class="text-sm text-gray-900">{{ user?.email }}</dd>
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
            </dl>
          </div>

          <!-- 文件上传 -->
          <FileUpload @uploaded="handleFileUploaded" />
        </div>

        <!-- 文件列表 -->
        <FileList ref="fileListRef" />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
const { user, isLoggedIn, logout } = useAuth()

const fileListRef = ref()

const handleLogout = async () => {
  await logout()
}

const handleFileUploaded = () => {
  // 当文件上传完成后，刷新文件列表
  if (fileListRef.value) {
    fileListRef.value.refreshFiles()
  }
}

import { formatToUTC8 } from '~/server/utils/time'

definePageMeta({
  layout: false
})
</script>
