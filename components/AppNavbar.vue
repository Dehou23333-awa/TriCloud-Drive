<!-- components/AppNavbar.vue -->
<template>
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

          <!-- 可选：已登录时额外的右侧内容（例如：返回首页按钮等） -->
          <slot name="extra" />

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
</template>

<script setup lang="ts">
const { user, isLoggedIn, logout } = useAuth()
const handleLogout = async () => { await logout() }
</script>