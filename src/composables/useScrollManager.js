import { ref, nextTick } from 'vue'

export function useScrollManager(messagesContainer) {
  const isAtBottom = ref(true)
  const hasNewBelow = ref(false)
  const firstUnreadId = ref(null)

  function checkIsAtBottom() {
    const el = messagesContainer.value
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 80
  }

  function updateScrollState() {
    isAtBottom.value = checkIsAtBottom()
    if (isAtBottom.value) {
      hasNewBelow.value = false
      firstUnreadId.value = null
    }
  }

  function scrollToBottom() {
    nextTick(() => {
      const el = messagesContainer.value
      if (el) {
        el.scrollTop = el.scrollHeight
        isAtBottom.value = true
        hasNewBelow.value = false
        firstUnreadId.value = null
      }
    })
  }

  function scrollToMessage(messageId) {
    const el = document.getElementById(`message-${messageId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  function scrollToUnreadOrBottom() {
    if (hasNewBelow.value && firstUnreadId.value) {
      scrollToMessage(firstUnreadId.value)
    } else {
      scrollToBottom()
    }
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

  function onNewMessageArrived(messageId, isOwn) {
    if (isAtBottom.value) {
      scrollToBottom()
    } else {
      hasNewBelow.value = true
      if (!firstUnreadId.value && !isOwn) {
        firstUnreadId.value = messageId
      }
    }
  }

  return {
    isAtBottom,
    hasNewBelow,
    firstUnreadId,
    updateScrollState,
    scrollToBottom,
    scrollToMessage,
    scrollToUnreadOrBottom,
    scrollToAnchorOrBottom,
    onNewMessageArrived,
  }
}
