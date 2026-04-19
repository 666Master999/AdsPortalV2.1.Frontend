import { onUnmounted, unref, watch } from 'vue'
import { usePresenceStore } from '../stores/presenceStore'

function normalizeUserId(userId) {
  return String(userId ?? '').trim()
}

export function usePresenceAuto(userIdSource) {
  const presenceStore = usePresenceStore()
  let currentUserId = ''

  const stop = watch(
    () => {
      const value = typeof userIdSource === 'function' ? userIdSource() : unref(userIdSource)
      return normalizeUserId(value)
    },
    (nextUserId, prevUserId) => {
      if (prevUserId) presenceStore.untrackUser(prevUserId)
      if (nextUserId) presenceStore.trackUser(nextUserId)
      currentUserId = nextUserId
    },
    { immediate: true }
  )

  onUnmounted(() => {
    stop()
    if (currentUserId) {
      presenceStore.untrackUser(currentUserId)
      currentUserId = ''
    }
  })
}
