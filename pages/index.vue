<!-- pages/index.vue -->
<template>
  <div class="min-h-screen bg-gray-50">
    <AppNavbar />
    <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div v-if="!isLoggedIn" class="px-4 py-6 sm:px-0">
        <div class="text-center">
          <h2 class="text-3xl font-extrabold text-gray-900 sm:text-4xl">欢迎来到 TriCloud Drive</h2>
          <p class="mt-4 text-lg text-gray-600">不安全、不可靠的云存储解决方案（bushi</p>
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
        <!-- 上传区已合并到文件列表区域 -->
        <FileList
          ref="fileListRef"
          @folder-change="onFolderChange"
        />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
const { isLoggedIn } = useAuth()

const fileListRef = ref()
const currentFolderId = ref<number | null>(null)

const onFolderChange = (id: number | null) => {
  currentFolderId.value = id
}

definePageMeta({ layout: false })
</script>