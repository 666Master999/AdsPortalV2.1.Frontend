import { onUnmounted, unref, watch } from 'vue'
import * as presenceModule from '../stores/presenceStore'

const getUsePresenceStore = () => {
  if (presenceModule && typeof presenceModule.usePresenceStore === 'function') return presenceModule.usePresenceStore
  if (presenceModule && presenceModule.default && typeof presenceModule.default.usePresenceStore === 'function') return presenceModule.default.usePresenceStore
  throw new Error("Module '../stores/presenceStore' does not export 'usePresenceStore'.")
}

function normalizeUserId(userId) {
  return String(userId ?? '').trim()
}

export function usePresenceAuto(userIdSource) {
  const presenceStore = getUsePresenceStore()()
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
