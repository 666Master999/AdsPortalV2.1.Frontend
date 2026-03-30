import { ref, nextTick } from 'vue'

export function useScrollManager(messagesContainer) {
  const isAtBottom = ref(true)
  const hasNewBelow = ref(false)

  function checkIsAtBottom() {
    const el = messagesContainer.value
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 80
  }

  function updateScrollState() {
    isAtBottom.value = checkIsAtBottom()
    if (isAtBottom.value) hasNewBelow.value = false
  }

  function scrollToBottom() {
    nextTick(() => {
      const el = messagesContainer.value
      if (el) {
        el.scrollTop = el.scrollHeight
        isAtBottom.value = true
        hasNewBelow.value = false
      }
    })
  }

  function scrollToAnchorOrBottom(anchorMessageId) {
    nextTick(() => {
      if (anchorMessageId) {
        const el = document.getElementById(`message-${anchorMessageId}`)
        if (el) {
          el.scrollIntoView({ behavior: 'instant', block: 'center' })
          return
        }
      }
      const container = messagesContainer.value
      if (container) container.scrollTop = container.scrollHeight
    })
  }

  return {
    isAtBottom,
    hasNewBelow,
    updateScrollState,
    scrollToBottom,
    scrollToAnchorOrBottom,
  }
}
