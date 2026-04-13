import { ref } from 'vue'
import { useChatStore } from '../stores/chatStore'

const VISIBILITY_DELAY = 300     // ms message must stay in view before counting
const VISIBILITY_THRESHOLD = 0.6 // 60% of message must be visible

const READ_DEBOUNCE_MS = 150

export function useReadTracker(messagesContainer, shouldTrackMessage = () => true, messagesSource = null) {
  const chatStore = useChatStore()

  // numbers only
  const visibleMessageIds = new Set()
  let lastSentId = null
  const maxVisibleId = ref(null)

  const visibilityTimers = new Map()
  let observer = null
  let debounceTimer = null
  const observedIds = new Set()

  function getMessages() {
    return messagesSource && typeof messagesSource === 'object' && 'value' in messagesSource
      ? messagesSource.value || []
      : messagesSource || chatStore.messages
  }

  function isActiveConversation() {
    return Boolean(chatStore.currentConversation?.id)
  }

  function computeMaxVisible() {
    if (!visibleMessageIds.size) return null
    let max = null
    for (const v of visibleMessageIds) {
      const n = Number(v)
      if (!Number.isFinite(n) || n <= 0) continue
      if (max === null || n > max) max = n
    }
    return max
  }

  function canSendRead(nextId) {
    if (!nextId) return false
    if (typeof document !== 'undefined' && document.hidden) return false
    if (!isActiveConversation()) return false

    const prevSent = Number(lastSentId ?? 0)
    if (prevSent && nextId <= prevSent) return false

    const currentMyLast = Number(chatStore.myLastSeenMessageId ?? 0)
    if (nextId <= currentMyLast) return false

    return true
  }

  function sendRead(messageId) {
    const convId = chatStore.currentConversation?.id
    const msgId = Number(messageId)
    if (!convId || !msgId) return

    // Send via presenceStore (lazy import to avoid cycles)
    import('../stores/presenceStore').then(({ usePresenceStore }) => {
      try { usePresenceStore().sendRead(convId, msgId) } catch {}
    }).catch(() => {})
    if (typeof chatStore.markReadRemote === 'function') {
      void chatStore.markReadRemote(convId, msgId).catch(() => {})
    }
    // Update local UI state via chatStore API so components react
    try {
      if (typeof chatStore.markReadLocal === 'function') {
        chatStore.markReadLocal(convId, msgId)
      }
    } catch {}
  }

  function scheduleReadCheck() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      const nextId = computeMaxVisible()
      if (!canSendRead(nextId)) return
      sendRead(nextId)
      lastSentId = nextId
      maxVisibleId.value = nextId
    }, READ_DEBOUNCE_MS)
  }

  function flushRead() {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
    const nextId = computeMaxVisible()
    if (!canSendRead(nextId)) return
    sendRead(nextId)
    lastSentId = nextId
    maxVisibleId.value = nextId
  }

  function setupObserver() {
    disconnectObserver()
    maxVisibleId.value = null
    const root = messagesContainer.value
    if (!root) return

    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        // prefer data attribute, fallback to id
        const rawId = entry.target.dataset?.messageId ?? entry.target.id?.replace('message-', '')
        if (!rawId) continue
        const idNum = Number(rawId)
        if (!Number.isFinite(idNum) || idNum <= 0) continue
        const message = getMessages().find(item => Number(item.id) === idNum)
        if (!message) continue
        if (!shouldTrackMessage(message)) continue

        if (entry.isIntersecting) {
          // Start short timer to confirm visibility
          if (visibilityTimers.has(idNum)) continue
          const t = setTimeout(() => {
            visibilityTimers.delete(idNum)
            visibleMessageIds.add(idNum)
            scheduleReadCheck()
          }, VISIBILITY_DELAY)
          visibilityTimers.set(idNum, t)
        } else {
          // left viewport — cancel pending timer and remove
          const t = visibilityTimers.get(idNum)
          if (t !== undefined) { clearTimeout(t); visibilityTimers.delete(idNum) }
          visibleMessageIds.delete(idNum)
        }
      }
    }, { root, threshold: VISIBILITY_THRESHOLD })

    observeMessages()
  }

  function observeMessages() {
    if (!observer) return
    for (const msg of getMessages()) {
      if (!shouldTrackMessage(msg)) continue
      const msgId = String(msg.id)
      if (observedIds.has(msgId)) continue
      const el = document.querySelector(`[data-message-id="${msgId}"]`) || document.getElementById(`message-${msgId}`)
      if (el) {
        observedIds.add(msgId)
        observer.observe(el)
      }
    }
  }

  function disconnectObserver() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    for (const timer of visibilityTimers.values()) clearTimeout(timer)
    visibilityTimers.clear()
    visibleMessageIds.clear()
    if (observer) { observer.disconnect(); observer = null }
    observedIds.clear()
  }

  function cleanup() {
    // do not force-send on init; allow explicit flush on unmount
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
