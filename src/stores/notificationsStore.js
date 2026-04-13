import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as signalR from '@microsoft/signalr'
import { useChatStore } from './chatStore'
import { getApiBaseUrl } from '../config/apiBase'
import { apiClient } from '../api/apiClient'
import { validateApiRequestBody } from '../api/requestContract'

const apiBase = getApiBaseUrl()

export const useNotificationsStore = defineStore('notifications', () => {
  const notifications = ref([])
  const unreadCount = computed(() => notifications.value.filter(n => !n.isRead).length)
  // store holds only flat notifications; grouping and UI logic belongs to components

  let connection = null

  function extractNotificationItems(data) {
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.items)) return data.items
    if (Array.isArray(data?.data)) return data.data
    return []
  }

  function toNotification(item = {}) {
    if (!item || typeof item !== 'object') return null

    const id = Number(item.id)
    const type = String(item.type ?? '').trim()
    const createdAt = String(item.createdAt ?? '').trim()

    if (!Number.isFinite(id) || !type || !createdAt) return null

    const preview = item.preview && typeof item.preview === 'object' ? { ...item.preview } : undefined
    const data = item.data && typeof item.data === 'object' ? { ...item.data } : undefined

    // Keep preview paths raw; UI layer is responsible for resolving media URLs.
    // Normalize adId to a safe numeric value or null to avoid NaN later
    const rawAdId = item.adId ?? item.data?.adId ?? null
    let adId = null
    if (rawAdId != null) {
      const num = Number(rawAdId)
      adId = Number.isFinite(num) && num > 0 ? num : null
    }

    return {
      id,
      type,
      isRead: Boolean(item.isRead),
      createdAt,
      preview,
      data,
      adId,
      reason: item.reason ?? item.data?.reason ?? null,
      adTitle: item.adTitle ?? preview?.title ?? item.data?.adTitle ?? null,
      mainImagePath: item.mainImagePath ?? preview?.mainImagePath ?? null,
      actorName: item.actorName ?? item.data?.actorName ?? null,
    }
  }

  function setNotifications(items = []) {
    notifications.value = (Array.isArray(items) ? items : [])
      .map(item => toNotification(item))
      .filter(Boolean)
  }

  function upsertNotification(item) {
    const notification = toNotification(item)
    if (!notification) return

    const key = String(notification.id)
    notifications.value = [
      notification,
      ...notifications.value.filter(existing => String(existing.id) !== key),
    ]
  }

  function setReadState(ids = []) {
    if (ids.length === 0) {
      notifications.value = notifications.value.map(notification => ({ ...notification, isRead: true }))
      return
    }

    const keySet = new Set(ids.map(id => String(id)))
    notifications.value = notifications.value.map(notification => (
      keySet.has(String(notification.id))
        ? { ...notification, isRead: true }
        : notification
    ))
  }

  async function fetchNotifications() {
    try {
      const data = await apiClient.get('/notifications', {
        errorHandlerOptions: { notify: false },
      })
      setNotifications(extractNotificationItems(data))
    } catch {
      // Keep notification panel silent when request fails.
    }
  }

  async function markRead(ids = []) {
    const normalizedIds = Array.isArray(ids)
      ? ids.map(id => Number(id)).filter(Number.isFinite)
      : []
    validateApiRequestBody('post', '/notifications/read', normalizedIds)
    setReadState(normalizedIds)
    try {
      await apiClient.post('/notifications/read', normalizedIds, {
        errorHandlerOptions: { notify: false },
      })
    } catch {
      // Keep optimistic state and avoid noisy UX on transient failures.
    }
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

    // Initial notification list from server (initNotifications event)
    connection.on('initNotifications', (data) => {
      setNotifications(extractNotificationItems(data))
    })

    // Chat events (single contract: chat:...)
    connection.on('chat:message', (data) => {
      useChatStore().applyIncomingMessage(data)
    })

    connection.on('chat:conversationCreated', (data) => {
      useChatStore().applyConversationCreated(data)
    })

    connection.on('chat:conversationUpdated', (data) => {
      useChatStore().applyConversationUpdated(data)
    })

    // Some servers may use lowercase event name `chat:conversationupdated`.
    // Register duplicate handler to avoid missing the event and related warnings.
    connection.on('chat:conversationupdated', (data) => {
      useChatStore().applyConversationUpdated(data)
    })

    // Single notification event contract: use `notificationCreated`
    connection.on('notificationCreated', (data) => {
      upsertNotification(data)
    })

    await connection.start()
    await connection.invoke('RequestNotifications')
  }

  async function disconnect() {
    if (!connection) return
    await connection.stop()
    connection = null
  }
  // Store is intentionally data-only: UI rendering logic lives in components.

  return { notifications, unreadCount, fetchNotifications, markRead, connect, disconnect }
})
