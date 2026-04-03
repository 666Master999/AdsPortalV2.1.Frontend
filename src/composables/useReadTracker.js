import { ref } from 'vue'
import { useChatStore } from '../stores/chatStore'

const VISIBILITY_DELAY = 300     // ms message must stay in view before counting
const VISIBILITY_THRESHOLD = 0.6 // 60% of message must be visible

const NEAR_BOTTOM_THRESHOLD = 200 // px from bottom = "reading zone"

export function useReadTracker(messagesContainer, shouldTrackMessage = () => true) {
  const chatStore = useChatStore()

  // candidateVisible: started intersecting, timer pending
  const candidateVisible = new Set()
  // confirmedVisible: stayed visible long enough — these are actually "read"
  const confirmedVisible = new Set()

  const visibilityTimers = new Map()
  const justMounted = new Set()
  const maxVisibleId = ref(null)
  let observer = null
  let debounceTimer = null
  const observedIds = new Set()

  function isNearBottom() {
    const el = messagesContainer.value
    if (!el) return false
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD
  }

  function trackMounted(msgId) {
    justMounted.add(msgId)
    setTimeout(() => justMounted.delete(msgId), 300)
  }

  function getConfirmedMaxId() {
    if (!confirmedVisible.size) return null
    const sorted = [...confirmedVisible]
      .map(id => Number(id))
      .filter(n => Number.isFinite(n) && n > 0)
      .sort((a, b) => b - a)
    return sorted[0] ?? null
  }

  function tryMarkRead() {
    // Guard: only mark read when user is near the bottom of the conversation
    if (!isNearBottom()) return

    const convId = chatStore.currentConversation?.id
    if (!convId) return

    const maxId = getConfirmedMaxId()
    if (maxId == null) return

    const current = chatStore.myLastSeenMessageId != null ? Number(chatStore.myLastSeenMessageId) : 0
    if (maxId <= current) return

    chatStore.markRead(convId, maxId)
    maxVisibleId.value = maxId
  }

  function scheduleRead() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(tryMarkRead, 500)
  }

  function flushRead() {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
    tryMarkRead()
  }

  function setupObserver() {
    disconnectObserver()
    maxVisibleId.value = null
    const root = messagesContainer.value
    if (!root) return
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const rawId = entry.target.id?.replace('message-', '')
        if (!rawId) continue
        const message = chatStore.messages.find(item => String(item.id) === String(rawId))
        if (!message) continue
        if (!shouldTrackMessage(message)) continue

        if (entry.isIntersecting) {
          // Ignore first-render burst
          if (justMounted.has(rawId)) continue

          candidateVisible.add(rawId)

          visibilityTimers.set(rawId, setTimeout(() => {
            visibilityTimers.delete(rawId)
            // Only confirm if still in candidate set (user didn't scroll away)
            if (candidateVisible.has(rawId)) {
              confirmedVisible.add(rawId)
              scheduleRead()
            }
          }, VISIBILITY_DELAY))
        } else {
          // User scrolled away — cancel timer and remove from both sets
          candidateVisible.delete(rawId)
          confirmedVisible.delete(rawId)

          const timer = visibilityTimers.get(rawId)
          if (timer !== undefined) {
            clearTimeout(timer)
            visibilityTimers.delete(rawId)
          }
        }
      }
    }, { root, threshold: VISIBILITY_THRESHOLD })
    observeMessages()
  }

  function observeMessages() {
    if (!observer) return
    for (const msg of chatStore.messages) {
      if (!shouldTrackMessage(msg)) continue
      const msgId = String(msg.id)
      if (observedIds.has(msgId)) continue
      const el = document.getElementById(`message-${msgId}`)
      if (el) {
        observedIds.add(msgId)
        trackMounted(msgId)
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
    candidateVisible.clear()
    confirmedVisible.clear()
    justMounted.clear()
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
