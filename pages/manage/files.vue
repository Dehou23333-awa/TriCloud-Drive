<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useAuth } from '~/composables/useAuth'
import type { FolderRecord, FileRecord } from '~/types/files'
import { formatToUTC8 } from '~/server/utils/time'
import { formatFileSize } from '~/utils/format'

definePageMeta({
  title: '管理员 - 文件总览'
})

interface UserSummary {
  id: number
  email?: string
  username?: string
  IsAdmin?: boolean
  IsSuperAdmin?: boolean
  created_at?: string
}

const { user, fetchUser } = useAuth()
await fetchUser()

const isAdmin = computed(() => {
  const u = user.value as any
  return !!(u && (u.IsSuperAdmin || u.IsAdmin || u.isSuperAdmin || u.isAdmin))
})

// 非管理员直接跳回首页（也可依赖全局 auth 中间件拦截）
if (!isAdmin.value) {
  if (process.client) navigateTo('/')
}

/* 左侧用户列表 */
const users = ref<UserSummary[]>([])
const loadingUsers = ref(false)
const userSearch = ref('')

async function fetchUsers() {
  try {
    loadingUsers.value = true
    const headers = process.server ? useRequestHeaders(['cookie']) : undefined
    const res = await $fetch<{ users: UserSummary[]; totalCount: number }>('/api/manage/listUsers', {
      params: userSearch.value ? { username: userSearch.value } : undefined,
      headers,
      credentials: 'include'
    })
    users.value = res.users ?? []
  } finally {
    loadingUsers.value = false
  }
}

const selectedUserId = ref<number | null>(null)
const selectedUser = computed(() => users.value.find(u => u.id === selectedUserId.value) || null)

function selectUser(u: UserSummary) {
  if (selectedUserId.value === u.id) return
  selectedUserId.value = u.id
  resetBrowser()
  fetchFiles()
}

/* 右侧文件浏览（只读） */
const folders = ref<FolderRecord[]>([])
const files = ref<FileRecord[]>([])
const loadingFiles = ref(false)
const currentFolderId = ref<number | null>(null)
const breadcrumbs = ref<{ id: number | null; name: string }[]>([{ id: null, name: '全部文件' }])

function resetBrowser() {
  folders.value = []
  files.value = []
  currentFolderId.value = null
  breadcrumbs.value = [{ id: null, name: '全部文件' }]
}

async function fetchFiles() {
  if (!selectedUserId.value) return
  try {
    loadingFiles.value = true
    const headers = process.server ? useRequestHeaders(['cookie']) : undefined
    const res = await $fetch<{
      success: boolean
      currentFolderId: number | null
      folders: FolderRecord[]
      files: FileRecord[]
    }>('/api/files', {
      params: {
        folderId: currentFolderId.value ?? 'root',
        // 需要后端增加对 targetUserId 的支持（见下方补丁）
        targetUserId: selectedUserId.value
      },
      headers,
      credentials: 'include'
    })
    if (res?.success) {
      folders.value = res.folders || []
      files.value = res.files || []
      currentFolderId.value = res.currentFolderId ?? null
    }
  } finally {
    loadingFiles.value = false
  }
}

function handleNavigateToFolder(folder: FolderRecord) {
  currentFolderId.value = folder.id
  breadcrumbs.value.push({ id: folder.id, name: folder.name })
  fetchFiles()
}
function goUp() {
  if (breadcrumbs.value.length <= 1) return
  breadcrumbs.value.pop()
  currentFolderId.value = breadcrumbs.value[breadcrumbs.value.length - 1].id
  fetchFiles()
}
function goToBreadcrumb(index: number) {
  if (index < 0 || index >= breadcrumbs.value.length) return
  breadcrumbs.value.splice(index + 1)
  currentFolderId.value = breadcrumbs.value[index].id
  fetchFiles()
}
function refresh() {
  fetchFiles()
}

await fetchUsers()
// 如果希望加载页面后自动选中第一个用户，可放开下行：
// if (!selectedUserId.value && users.value.length > 0) selectUser(users.value[0])

</script>

<template>
  <AppNavbar>
    <template #extra>
      <NuxtLink
        to="/"
        class="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
      >
        返回首页
      </NuxtLink>
    </template>
  </AppNavbar>
  <div class="p-6">
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-xl font-semibold">文件管理（管理员）</h1>
      <div class="text-xs text-gray-500">只读浏览</div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
      <!-- 左侧：用户列表 -->
      <aside class="md:col-span-1">
        <div class="bg-white rounded-lg shadow p-4">
          <div class="flex gap-2 mb-3">
            <input
              v-model="userSearch"
              placeholder="按用户名搜索"
              class="flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              class="px-3 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              :disabled="loadingUsers"
              @click="fetchUsers"
            >
              搜索
            </button>
          </div>

          <div class="text-sm text-gray-500 mb-2">用户列表（{{ users.length }}）</div>

          <div v-if="loadingUsers" class="text-sm text-gray-500">加载用户...</div>
          <ul v-else class="divide-y divide-gray-100 max-h-[70vh] overflow-auto">
            <li
              v-for="u in users"
              :key="u.id"
              @click="selectUser(u)"
              class="p-3 cursor-pointer rounded-md hover:bg-gray-50 flex items-center justify-between"
              :class="{ 'bg-indigo-50 ring-1 ring-indigo-200': u.id===selectedUserId }"
            >
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-semibold">
                  {{ (u.username || u.email || 'U').slice(0,1).toUpperCase() }}
                </div>
                <div>
                  <div class="text-sm font-medium text-gray-900">{{ u.username || u.email }}</div>
                  <div class="text-xs text-gray-500">ID: {{ u.id }}</div>
                </div>
              </div>
              <div class="flex items-center gap-1">
                <span v-if="u.IsSuperAdmin" class="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">超管</span>
                <span v-else-if="u.IsAdmin" class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">管理员</span>
              </div>
            </li>
          </ul>
        </div>
      </aside>

      <!-- 右侧：文件浏览 -->
      <main class="md:col-span-3">
        <div class="bg-white rounded-lg shadow p-6 min-h-[70vh]">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <h2 class="text-lg font-medium text-gray-900">
                {{ selectedUser ? `用户：${selectedUser.username || selectedUser.email}（ID: ${selectedUser.id}）` : '请选择左侧用户' }}
              </h2>
              <nav v-if="selectedUser" class="text-sm text-gray-500">
                <span v-for="(crumb, idx) in breadcrumbs" :key="String(crumb.id) + '-' + idx">
                  <span v-if="idx > 0" class="mx-1">/</span>
                  <button
                    class="hover:text-indigo-600"
                    :disabled="!selectedUser || idx === breadcrumbs.length - 1"
                    @click="goToBreadcrumb(idx)"
                  >
                    {{ crumb.name }}
                  </button>
                </span>
              </nav>
            </div>
            <div class="flex items-center gap-3">
              <button
                class="text-sm text-gray-600 hover:text-gray-800"
                v-if="selectedUser && breadcrumbs.length > 1"
                @click="goUp"
              >
                返回上一级
              </button>
              <button
                class="text-sm text-indigo-600 hover:text-indigo-500"
                :disabled="!selectedUser"
                @click="refresh"
              >
                刷新
              </button>
            </div>
          </div>

          <div v-if="!isAdmin" class="rounded-md bg-red-50 text-red-700 text-sm p-3">
            您没有管理员权限，无法访问此页面。
          </div>

          <div v-else-if="!selectedUser" class="text-center py-16 text-sm text-gray-500">
            从左侧选择一个用户以浏览其文件。
          </div>

          <div v-else>
            <!-- 加载中 -->
            <div v-if="loadingFiles" class="text-center py-8">
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
            <div v-else-if="(folders.length + files.length) > 0" class="space-y-3">
              <!-- 文件夹 -->
              <div
                v-for="folder in folders"
                :key="'folder-' + folder.id"
                class="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <div class="flex items-center space-x-3">
                  <div class="flex-shrink-0 cursor-pointer" @click="handleNavigateToFolder(folder)">
                    <svg class="h-8 w-8 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 6a2 2 0 012-2h3l2 2h7a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0 cursor-pointer" @click="handleNavigateToFolder(folder)">
                    <p class="text-sm font-medium text-gray-900 truncate">{{ folder.name }}</p>
                    <p class="text-sm text-gray-500">{{ formatToUTC8(folder.createdAt) }}</p>
                  </div>
                </div>
                <div class="flex items-center space-x-1 text-sm text-gray-400 cursor-pointer" @click="handleNavigateToFolder(folder)">
                  进入
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>

              <!-- 文件 -->
              <div
                v-for="file in files"
                :key="'file-' + file.id"
                class="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <div class="flex items-center space-x-3">
                  <div class="flex-shrink-0">
                    <svg class="h-8 w-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd"
                        d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                        clip-rule="evenodd" />
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 truncate">{{ file.filename }}</p>
                    <p class="text-sm text-gray-500">{{ formatFileSize(file.fileSize) }} • {{ formatToUTC8(file.createdAt) }}</p>
                  </div>
                </div>
                <div class="text-xs text-gray-400">只读</div>
              </div>
            </div>

            <!-- 空状态 -->
            <div v-else class="text-center py-16 text-sm text-gray-500">
              该目录为空
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all .15s ease;
}
.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}
</style>