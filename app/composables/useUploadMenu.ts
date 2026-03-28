// ~/composables/useUploadMenu.ts
import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue'

type Options = { hideDelay?: number }

export function useUploadMenu(options: Options = {}) {
  const HIDE_DELAY_MS = options.hideDelay ?? 250

  const showUploadMenu = ref(false)
  const uploadMenuRef = ref<HTMLElement | null>(null)
  let closeTimer: number | undefined

  const openUploadMenu = () => {
    if (closeTimer) {
      clearTimeout(closeTimer)
      closeTimer = undefined
    }
    showUploadMenu.value = true
  }

  const scheduleCloseUploadMenu = (delay = HIDE_DELAY_MS) => {
    if (closeTimer) clearTimeout(closeTimer)
    closeTimer = window.setTimeout(() => {
      showUploadMenu.value = false
      closeTimer = undefined
    }, delay)
  }

  const toggleUploadMenu = () => {
    if (showUploadMenu.value) scheduleCloseUploadMenu(0)
    else openUploadMenu()
  }

  const onDocClick = (e: MouseEvent) => {
    const el = uploadMenuRef.value
    if (!el) return
    if (!el.contains(e.target as Node)) showUploadMenu.value = false
  }

  onMounted(() => {
    document.addEventListener('click', onDocClick)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('click', onDocClick)
    if (closeTimer) clearTimeout(closeTimer)
  })

  return {
    showUploadMenu,
    uploadMenuRef,
    openUploadMenu,
    scheduleCloseUploadMenu,
    toggleUploadMenu
  }
}