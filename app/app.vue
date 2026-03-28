<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup>
// 初始化时获取用户信息
const { fetchUser } = useAuth()

onMounted(() => {
  fetchUser()
})
</script>
