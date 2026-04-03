import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as signalR from '@microsoft/signalr'
import { useChatStore } from './chatStore'
import { getApiBaseUrl } from '../config/apiBase'

const apiBase = getApiBaseUrl()

export const useNotificationsStore = defineStore('notifications', () => {
  const notifications = ref([])
  // Only non-chat notifications count toward the bell badge
  const unreadCount = computed(() => notifications.value.filter(n => !n.isRead).length)

  const groupedNotifications = computed(() => {
    const groups = new Map()
    notifications.value.forEach((notification) => {
      const key = String(notification.adId ?? 'other')
      const group = groups.get(key) || { adId: notification.adId, items: [], unreadCount: 0 }
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

  function authHeaders() {
    const token = localStorage.getItem('token')
    return token
      ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' }
  }

  function normalizeNotifications(items = []) {
    return (items || []).map(item => ({ ...item, isRead: Boolean(item.isRead) }))
  }

  function applyReadState(ids = []) {
    if (ids.length === 0) {
      notifications.value.forEach(n => { n.isRead = true })
      return
    }
    const set = new Set(ids.map(String))
    notifications.value.forEach(n => {
      if (set.has(String(n.id))) n.isRead = true
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

    // Initial notification list from server
    connection.on('initNotifications', (data) => {
      notifications.value = normalizeNotifications(Array.isArray(data) ? data : [])
    })

    // Per contract §2.2: chat messages come on chat:message
    connection.on('chat:message', (data) => {
      useChatStore().applyIncomingMessage(data)
    })

    // Non-chat system notifications
    connection.on('notification', (data) => {
      const normalized = { ...data, isRead: false }
      notifications.value.unshift(normalized)
    })

    await connection.start()
    await connection.invoke('RequestNotifications')
  }

  async function disconnect() {
    if (!connection) return
    await connection.stop()
    connection = null
  }

  return { notifications, unreadCount, groupedNotifications, fetchNotifications, markRead, connect, disconnect }
})
