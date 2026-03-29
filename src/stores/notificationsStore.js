import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as signalR from '@microsoft/signalr'
import { useChatStore, normalizeMessage } from './chatStore'
import { getApiBaseUrl } from '../config/apiBase'

const apiBase = getApiBaseUrl()

export const useNotificationsStore = defineStore('notifications', () => {
  const notifications = ref([])
  const unreadCount = computed(() => notifications.value.filter(n => !n.isRead).length)

  const groupedNotifications = computed(() => {
    const groups = new Map()

    notifications.value.forEach((notification) => {
      const key = String(notification.adId ?? 'other')
      const group = groups.get(key) || {
        adId: notification.adId,
        items: [],
        unreadCount: 0,
      }

      group.items.push(notification)
      if (!notification.isRead) group.unreadCount += 1
      groups.set(key, group)
    })

    return [...groups.values()].sort((a, b) => {
      if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount
      return Number(b.items[0]?.id ?? 0) - Number(a.items[0]?.id ?? 0)
    })
  })

  let connection = null
  const pendingConversationRefreshes = new Map()
  const recentRealtimeMessages = new Map()

  function authHeaders() {
    const token = localStorage.getItem('token')
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
  }

  function getCurrentUserId() {
    const storedUser = JSON.parse(localStorage.getItem('user') || 'null')
    if (storedUser?.id || storedUser?.userId) return String(storedUser.id || storedUser.userId)

    const token = localStorage.getItem('token')
    if (!token) return ''

    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      return String(payload?.sub || payload?.id || payload?.userId || '')
    } catch {
      return ''
    }
  }

  function looksLikeMessagePayload(item) {
    return Boolean(
      item &&
      typeof item === 'object' &&
      (
        item.text !== undefined ||
        item.attachments !== undefined ||
        item.author !== undefined ||
        item.authorId !== undefined ||
        item.sender !== undefined ||
        item.senderId !== undefined ||
        item.replyToMessageId !== undefined ||
        item.reply_to_message_id !== undefined
      )
    )
  }

  function getIncomingMessagePayload(data) {
    if (!data || typeof data !== 'object') return null

    const candidates = [
      data.message,
      data.payload?.message,
      data.data?.message,
      data.payload,
      data.data,
      data,
    ]

    return candidates.find(looksLikeMessagePayload) || null
  }

  function getIncomingConversationId(data, message = null) {
    return String(
      message?.conversationId ??
      message?.conversation?.id ??
      message?.conversation?.conversationId ??
      data?.conversationId ??
      data?.conversation?.id ??
      data?.conversation?.conversationId ??
      data?.payload?.conversationId ??
      data?.payload?.conversation?.id ??
      data?.data?.conversationId ??
      data?.data?.conversation?.id ??
      data?.threadId ??
      message?.threadId ??
      ''
    )
  }

  function getMessageAuthorId(message) {
    return String(
      message?.authorId ??
      message?.senderId ??
      message?.author?.id ??
      message?.sender?.id ??
      message?.user?.id ??
      ''
    )
  }

  function isMessageRealtimeEvent(data) {
    if (!data || typeof data !== 'object') return false

    const type = String(data.type ?? data.notificationType ?? data.eventType ?? '').trim().toLowerCase()
    if (type === 'newmessage' || type === 'message') return true

    return Boolean(
      data.message ||
      data.payload?.message ||
      data.data?.message ||
      data.conversationId ||
      data.conversation?.id ||
      data.payload?.conversationId ||
      data.data?.conversationId
    )
  }

  function moveConversationToTop(conversations, conversationId) {
    const idx = conversations.findIndex(item => String(item.id) === String(conversationId))
    if (idx <= 0) return idx === 0 ? conversations[0] : null

    const [conversation] = conversations.splice(idx, 1)
    conversations.unshift(conversation)
    return conversation
  }

  function isDuplicateRealtimeMessage(message) {
    const messageId = String(message?.id ?? '')
    if (!messageId) return false

    const now = Date.now()
    for (const [storedId, storedAt] of recentRealtimeMessages) {
      if (now - storedAt > 30000) recentRealtimeMessages.delete(storedId)
    }

    if (recentRealtimeMessages.has(messageId)) return true

    recentRealtimeMessages.set(messageId, now)
    return false
  }

  async function refreshConversationsState(conversationId = '') {
    const chatStore = useChatStore()
    const normalizedConversationId = String(conversationId || '')

    if (normalizedConversationId && String(chatStore.currentConversation?.id || '') === normalizedConversationId) {
      await chatStore.loadMessages(normalizedConversationId).catch(() => {})
      await chatStore.markRead(normalizedConversationId).catch(() => {})
      return
    }

    await chatStore.getConversations().catch(() => {})
  }

  function getRefreshKey(conversationId = '') {
    return String(conversationId || '__all__')
  }

  function cancelScheduledConversationRefresh(conversationId = '') {
    const key = getRefreshKey(conversationId)
    const timeoutId = pendingConversationRefreshes.get(key)
    if (!timeoutId) return

    clearTimeout(timeoutId)
    pendingConversationRefreshes.delete(key)
  }

  function scheduleConversationRefresh(conversationId = '') {
    const key = getRefreshKey(conversationId)
    cancelScheduledConversationRefresh(conversationId)

    const timeoutId = setTimeout(() => {
      pendingConversationRefreshes.delete(key)
      refreshConversationsState(conversationId)
    }, 300)

    pendingConversationRefreshes.set(key, timeoutId)
  }

  async function handleIncomingMessage(data) {
    const chatStore = useChatStore()
    const payload = getIncomingMessagePayload(data)
    const message = payload ? normalizeMessage(payload) : null
    const convId = getIncomingConversationId(data, message)

    if (!convId) {
      if (isMessageRealtimeEvent(data)) scheduleConversationRefresh()
      return
    }

    cancelScheduledConversationRefresh()
    cancelScheduledConversationRefresh(convId)

    if (!message) {
      scheduleConversationRefresh(convId)
      return
    }

    if (isDuplicateRealtimeMessage(message)) return

    if (!message.conversationId) message.conversationId = convId

    const currentConvId = String(chatStore.currentConversation?.id || '')
    const currentUserId = getCurrentUserId()
    const isOwnMessage = getMessageAuthorId(message) === currentUserId

    if (currentConvId && currentConvId === convId) {
      const idx = chatStore.messages.findIndex(item => String(item.id) === String(message.id))
      if (idx !== -1) chatStore.messages[idx] = { ...chatStore.messages[idx], ...message }
      else chatStore.messages.push(message)

      updateConversationPreview(chatStore.currentConversation, message)

      const listConversation = chatStore.conversations.find(item => String(item.id) === convId)
      if (listConversation) updateConversationPreview(listConversation, message)
      moveConversationToTop(chatStore.conversations, convId)

      chatStore.markRead(convId).catch(() => {})
      return
    }

    let conversation = chatStore.conversations.find(item => String(item.id) === convId)
    let conversationsWereRefreshed = false

    if (!conversation) {
      await chatStore.getConversations().catch(() => {})
      conversationsWereRefreshed = true
      conversation = chatStore.conversations.find(item => String(item.id) === convId)
    }

    if (!conversation) return

    updateConversationPreview(conversation, message)
    moveConversationToTop(chatStore.conversations, convId)

    if (!message.isRead && !isOwnMessage && !conversationsWereRefreshed) {
      conversation.unreadCount = (Number(conversation.unreadCount) || 0) + 1
    }
  }

  function updateConversationPreview(conversation, message) {
    if (!conversation || !message) return
    conversation.lastMessageType = message.type ?? conversation.lastMessageType ?? null
    conversation.lastMessageText = message.text ?? conversation.lastMessageText ?? null
    conversation.last_message_at = message.createdAt ?? conversation.last_message_at ?? null
    conversation.lastMessageAt = message.createdAt ?? conversation.lastMessageAt ?? null
    conversation.lastMessageTimestamp = message.createdAt ?? conversation.lastMessageTimestamp ?? null
  }

  function normalizeNotifications(items = []) {
    return (items || []).map(item => ({
      ...item,
      isRead: Boolean(item.isRead),
    }))
  }

  function applyReadState(ids = []) {
    if (ids.length === 0) {
      notifications.value.forEach((notification) => {
        notification.isRead = true
      })
      return
    }

    const set = new Set(ids.map(String))
    notifications.value.forEach((notification) => {
      if (set.has(String(notification.id))) notification.isRead = true
    })
  }

  async function fetchNotifications() {
    const res = await fetch(`${apiBase}/notifications`, { headers: authHeaders() })
    if (!res.ok) return
    const data = await res.json()
    const raw = Array.isArray(data) ? data : (data?.items ?? data?.data ?? [])
    notifications.value = normalizeNotifications(raw)
  }

  async function markRead(ids = []) {
    const normalizedIds = Array.isArray(ids) ? ids : []
    applyReadState(normalizedIds)

    await fetch(`${apiBase}/notifications/read`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(normalizedIds),
    })
  }

  async function connect() {
    if (connection) return
    connection = new signalR.HubConnectionBuilder()
      .withUrl(`${apiBase}/hubs/notifications`, {
        accessTokenFactory: () => localStorage.getItem('token'),
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build()

    connection.on('initNotifications', (data) => {
      notifications.value = normalizeNotifications(Array.isArray(data) ? data : [])
    })

    connection.on('notification', (data) => {
      const normalized = { ...data, isRead: false }
      notifications.value.unshift(normalized)

      if (isMessageRealtimeEvent(data)) {
        handleIncomingMessage(data)
      }
    })

    connection.on('newMessage', (data) => {
      handleIncomingMessage(data)
    })

    await connection.start()

    await connection.invoke('RequestNotifications')
  }

  async function disconnect() {
    if (!connection) return
    await connection.stop()
    connection = null
    notifications.value = []
    recentRealtimeMessages.clear()

    for (const timeoutId of pendingConversationRefreshes.values()) {
      clearTimeout(timeoutId)
    }

    pendingConversationRefreshes.clear()
  }

  return { notifications, unreadCount, groupedNotifications, fetchNotifications, markRead, connect, disconnect }
})
