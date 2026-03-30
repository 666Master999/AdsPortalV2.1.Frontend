import { ref } from 'vue'
import { useChatStore } from '../stores/chatStore'

export function useReadTracker(messagesContainer, shouldTrackMessage = () => true) {
  const chatStore = useChatStore()
  const maxVisibleId = ref(null)
  let observer = null
  let debounceTimer = null
  const observedIds = new Set()

  function flushRead() {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
    const convId = chatStore.currentConversation?.id
    if (convId && maxVisibleId.value != null) {
      chatStore.markRead(convId, maxVisibleId.value)
    }
  }

  function scheduleRead(messageId) {
    const numId = Number(messageId)
    if (!numId || isNaN(numId)) return
    const current = maxVisibleId.value ? Number(maxVisibleId.value) : 0
    if (numId <= current) return
    maxVisibleId.value = numId
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(flushRead, 500)
  }

  function setupObserver() {
    disconnectObserver()
    maxVisibleId.value = null
    const root = messagesContainer.value
    if (!root) return
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const rawId = entry.target.id?.replace('message-', '')
        if (!rawId) continue
        const message = chatStore.messages.find(item => String(item.id) === String(rawId))
        const should = message ? shouldTrackMessage(message) : false
        if (message && should) scheduleRead(rawId)
      }
    }, { root, threshold: 0 })
    observeMessages()
  }

  function observeMessages() {
    if (!observer) return
    for (const msg of chatStore.messages) {
      const should = shouldTrackMessage(msg)
      if (!should) continue
      const msgId = String(msg.id)
      if (observedIds.has(msgId)) continue
      const el = document.getElementById(`message-${msgId}`)
      if (el) { observedIds.add(msgId); observer.observe(el) }
    }
  }

  function disconnectObserver() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (observer) { observer.disconnect(); observer = null }
    observedIds.clear()
  }

  function cleanup() {
    flushRead()
    disconnectObserver()
    maxVisibleId.value = null
  }

  return {
    maxVisibleId,
    setupObserver,
    observeMessages,
    disconnectObserver,
    flushRead,
    cleanup,
  }
}
