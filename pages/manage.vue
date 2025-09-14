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
            <NuxtLink
              to="/"
              class="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
            >
              返回首页
            </NuxtLink>
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
      <!-- 未登录 -->
      <div v-if="!isLoggedIn" class="px-4 py-6 sm:px-0">
        <div class="text-center">
          <h2 class="text-2xl font-bold text-gray-900">请先登录</h2>
          <div class="mt-4">
            <NuxtLink
              to="/login"
              class="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
            >
              去登录
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- 已登录但无权限 -->
      <div v-else-if="!canManage" class="px-4 py-6 sm:px-0">
        <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div class="flex">
            <div class="ml-3">
              <p class="text-sm text-yellow-700">
                当前账号没有访问“用户管理”的权限，请联系管理员。
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- 管理页面 -->
      <div v-else class="px-4 py-6 sm:px-0">
        <!-- 顶部工具栏 -->
        <div class="mb-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <h2 class="text-2xl font-bold text-gray-900">用户管理</h2>
          <div class="flex flex-wrap items-center gap-3">
            <div class="relative">
              <input
                v-model="filters.username"
                @keyup.enter="fetchUsers"
                type="text"
                placeholder="按用户名搜索"
                class="w-72 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
              />
            </div>
            <button
              @click="fetchUsers"
              class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              :disabled="loading"
            >
              搜索
            </button>
            <button
              @click="resetFilters"
              class="bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-md text-sm border"
              :disabled="loading"
            >
              重置
            </button>
            <button
              @click="fetchUsers"
              class="bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-md text-sm border"
              :disabled="loading"
            >
              刷新
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <!-- 添加用户 -->
          <div class="bg-white shadow rounded-lg p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">添加用户</h3>
            <form @submit.prevent="handleAddUser" class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700">邮箱</label>
                <input
                  v-model="addEmail"
                  type="email"
                  autocomplete="off"
                  class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">用户名</label>
                <input
                  v-model="addUsername"
                  type="text"
                  autocomplete="off"
                  class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  placeholder="只能包含大小写字母和数字"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">密码</label>
                <input
                  v-model="addPassword"
                  type="password"
                  autocomplete="new-password"
                  class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  placeholder="至少8位，包含字母和数字"
                />
              </div>
              <div class="flex items-center gap-3">
                <button
                  type="submit"
                  class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                  :disabled="addLoading"
                >
                  {{ addLoading ? '创建中...' : '创建用户' }}
                </button>
                <p v-if="addMessage" class="text-sm text-green-600">{{ addMessage }}</p>
                <p v-if="addError" class="text-sm text-red-600">{{ addError }}</p>
              </div>
            </form>
          </div>

          <!-- 简要统计 -->
          <div class="bg-white shadow rounded-lg p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">概览</h3>
            <dl class="space-y-3">
              <div>
                <dt class="text-sm font-medium text-gray-500">用户总数</dt>
                <dd class="text-2xl font-semibold text-gray-900">{{ totalCount }}</dd>
              </div>
              <div v-if="loading" class="text-sm text-gray-500">正在加载用户数据...</div>
              <div v-else class="text-sm text-gray-500">最近刷新：{{ lastRefreshed ? formatToUTC8(lastRefreshed) : '—' }}</div>
            </dl>
          </div>
        </div>

        <!-- 用户列表 -->
        <div class="bg-white shadow rounded-lg overflow-hidden">
          <div class="px-6 py-4 border-b">
            <h3 class="text-lg font-medium text-gray-900">用户列表</h3>
          </div>

          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">邮箱</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">用户名</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">注册时间</th>
                  <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">管理员</th>
                  <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">超级管理员</th>
                  <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">容量限制</th>
                  <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">容量已使用</th>
                  <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">下载限制</th>
                  <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">下载已使用</th>
                  <th class="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-if="loading">
                  <td colspan="11" class="px-6 py-8 text-center text-sm text-gray-500">载入中...</td>
                </tr>
                <tr v-else-if="users.length === 0">
                  <td colspan="11" class="px-6 py-8 text-center text-sm text-gray-500">暂无数据</td>
                </tr>
                <tr v-for="u in users" :key="u.id">
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ u.id }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ u.email }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ u.username }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ formatToUTC8(u.created_at) }}</td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex justify-center">
                      <input
                        type="checkbox"
                        v-model="u.IsAdmin"
                        :disabled="updatingId === u.id"
                        class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                      />
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex justify-center">
                      <input
                        type="checkbox"
                        v-model="u.IsSuperAdmin"
                        :disabled="updatingId === u.id"
                        class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                      />
                    </div>
                  </td>

                  <!-- 容量限制（可编辑） -->
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <input
                      type="number"
                      v-model.number="u.maxStorage"
                      min="0"
                      step="1"
                      :disabled="updatingId === u.id"
                      class="w-32 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                  </td>

                  <!-- 容量已使用（可编辑） -->
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <input
                      type="number"
                      v-model.number="u.usedStorage"
                      min="0"
                      step="1"
                      :disabled="updatingId === u.id"
                      class="w-32 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                  </td>

                  <!-- 下载限制（可编辑） -->
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <input
                      type="number"
                      v-model.number="u.maxDownload"
                      min="0"
                      step="1"
                      :disabled="updatingId === u.id"
                      class="w-32 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                  </td>

                  <!-- 下载已使用（可编辑） -->
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <input
                      type="number"
                      v-model.number="u.usedDownload"
                      min="0"
                      step="1"
                      :disabled="updatingId === u.id"
                      class="w-32 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                  </td>

                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                    <button
                      @click="saveUser(u)"
                      :disabled="updatingId === u.id"
                      class="bg-white hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-md text-sm border"
                    >
                      {{ updatingId === u.id ? '保存中...' : '保存' }}
                    </button>

                    <button
                      @click="deleteUser(u)"
                      :disabled="deletingId === u.id || disableDeleteFor(u)"
                      class="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md text-sm"
                    >
                      {{ deletingId === u.id ? '删除中...' : '删除' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { formatToUTC8 } from '~/server/utils/time'

type DbUser = {
  id: number
  email: string
  username: string
  created_at: string
  IsAdmin: number | boolean
  IsSuperAdmin: number | boolean
  usedStorage: number
  maxStorage: number
  usedDownload: number
  maxDownload: number
}


const { user, isLoggedIn, logout, register, isAdminOrSuperAdmin } = useAuth()

const handleLogout = async () => {
  await logout()
}

const users = ref<DbUser[]>([])
const totalCount = ref(0)
const loading = ref(false)
const lastRefreshed = ref<string | null>(null)

const filters = reactive({
  email: '',
  username: ''
})

// 添加用户表单
const addEmail = ref('')
const addUsername = ref('')
const addPassword = ref('')
const addLoading = ref(false)
const addMessage = ref('')
const addError = ref('')

const updatingId = ref<number | null>(null)

const canManage = ref(false)

// 删除相关状态
const deletingId = ref<number | null>(null)

// 当前登录用户角色（用于前端控制按钮状态；最终以服务端为准）
const isSuper = computed(() => !!user.value?.IsSuperAdmin)
const isAdminOnly = computed(() => !!user.value?.IsAdmin && !isSuper.value)

// 前端禁用删除的规则（仅前端保护，服务端仍严格校验）
const disableDeleteFor = (u: DbUser) => {
  // 禁止删自己
  if (u.id === user.value?.id) return true
  // 普通管理员不能删管理员或超管
  if (isAdminOnly.value && (u.IsAdmin || u.IsSuperAdmin)) return true
  return false
}

const deleteUser = async (u: DbUser) => {
  if (disableDeleteFor(u)) return
  const ok = window.confirm(`确认删除用户「${u.username}」及其全部文件吗？此操作不可恢复！`)
  if (!ok) return

  deletingId.value = u.id
  try {
    await $fetch('/api/manage/deleteUser', {
      method: 'POST',
      body: { id: u.id }
    })
    // 刷新列表
    await fetchUsers()
  } catch (err: any) {
    const msg = err?.data?.statusMessage || '删除失败'
    alert(msg)
  } finally {
    deletingId.value = null
  }
}
//console.log('manage mounted2')
onMounted(async () => {
    //console.log('manage mounted')
  canManage.value = await isAdminOrSuperAdmin()
  return canManage.value
})

const fetchUsers = async () => {
  loading.value = true
  try {
    const resp = await $fetch<{ users: DbUser[]; totalCount: number }>('/api/manage/listUsers', {
      query: filters.username ? { username: filters.username } : {}
    })
    users.value = (resp.users || []).map((u) => ({
      ...u,
      IsAdmin: !!u.IsAdmin,
      IsSuperAdmin: !!u.IsSuperAdmin,
      usedStorage: Number(u.usedStorage ?? 0),
      maxStorage: Number(u.maxStorage ?? 0),
      usedDownload: Number(u.usedDownload ?? 0),
      maxDownload: Number(u.maxDownload ?? 0)
    }))
    totalCount.value = resp.totalCount || 0
    lastRefreshed.value = new Date().toISOString()
  } catch (err) {
    console.error('获取用户失败:', err)
  } finally {
    loading.value = false
  }
}

onMounted(fetchUsers)

const resetFilters = () => {
  filters.email = '',
  filters.username = '',
  fetchUsers()
}

const handleAddUser = async () => {
  addError.value = ''
  addMessage.value = ''

  if (!addEmail.value || !addPassword.value) {
    addError.value = '请输入邮箱和密码'
    return
  }

  addLoading.value = true
  try {
    await register(addEmail.value, addUsername.value, addPassword.value)
    addMessage.value = '用户创建成功'
    addEmail.value = ''
    addUsername.value = ''
    addPassword.value = ''
    await fetchUsers()
  } catch (err: any) {
    addError.value = err?.data?.statusMessage || '创建失败'
  } finally {
    addLoading.value = false
  }
}

const saveUser = async (u: DbUser) => {
  try {
    updatingId.value = u.id

    // 简单防御：不为负数
    const payload = {
      id: u.id,
      IsAdmin: u.IsAdmin ? 1 : 0,
      IsSuperAdmin: u.IsSuperAdmin ? 1 : 0,
      maxStorage: Math.max(0, Number(u.maxStorage) || 0),
      usedStorage: Math.max(0, Number(u.usedStorage) || 0),
      maxDownload: Math.max(0, Number(u.maxDownload) || 0),
      usedDownload: Math.max(0, Number(u.usedDownload) || 0)
    }

    await $fetch('/api/manage/updateUser', {
      method: 'POST',
      body: payload
    })
  } catch (err) {
    console.error('更新用户失败:', err)
    // 回滚
    await fetchUsers()
  } finally {
    updatingId.value = null
  }
}

definePageMeta({
  layout: false
})
</script>