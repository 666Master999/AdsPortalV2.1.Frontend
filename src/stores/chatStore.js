import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useChatStore = defineStore('chat', () => {
  const messages = ref([])

  async function loadThread(adId) {
    const token = localStorage.getItem('token')
    const response = await fetch(`/api/chat/thread/${adId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return await response.json()
  }

  async function loadMessages(threadId) {
    const token = localStorage.getItem('token')
    const response = await fetch(`/api/chat/messages/${threadId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    messages.value = await response.json()
  }

  async function sendMessage(threadId, text) {
    const token = localStorage.getItem('token')
    const response = await fetch('/api/chat/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ threadId, text }),
    })
    const message = await response.json()
    messages.value.push(message)
  }

  return { messages, loadThread, loadMessages, sendMessage }
})
