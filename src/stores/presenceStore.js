import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import * as signalR from '@microsoft/signalr'
import { useTypingStore } from './typingStore'
import { getApiBaseUrl } from '../config/apiBase'

const apiBase = getApiBaseUrl()

export const usePresenceStore = defineStore('presence', () => {
  let connection = null
  let pingInterval = null
  let reconnectTimer = null
  let manualDisconnect = false
  let activeConversationGroupId = null

  const RECONNECT_DELAY_MIN = 2000
  const RECONNECT_DELAY_MAX = 5000

  // onlineUsersByConversation: Map<conversationId(string), Set<userId(string)>>
  const onlineUsersByConversation = reactive(new Map())
  const isPresenceReady = ref(false)

  const isConnected = () =>
    connection?.state === signalR.HubConnectionState.Connected

  const invoke = (method, ...args) => {
    if (isConnected()) connection.invoke(method, ...args).catch(() => {})
  }

  function isOnline(conversationId, userId) {
    return onlineUsersByConversation.get(String(conversationId ?? ''))?.has(String(userId ?? '')) ?? false
  }

  function clearOnlineForConversation(cid) {
    onlineUsersByConversation.delete(String(cid ?? ''))
  }

  function clearReconnectTimer() {
    if (!reconnectTimer) return
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  function scheduleReconnect() {
    if (manualDisconnect || reconnectTimer) return
    const delay = Math.floor(
      RECONNECT_DELAY_MIN + Math.random() * (RECONNECT_DELAY_MAX - RECONNECT_DELAY_MIN + 1)
    )
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null
      if (manualDisconnect) return
      await connect().catch(() => {})
    }, delay)
  }

  async function joinActiveGroup() {
    if (!activeConversationGroupId || !isConnected()) return
    await connection.invoke('JoinGroup', Number(activeConversationGroupId)).catch(() => {})
  }

  function _getCurrentUserId() {
    try {
      const su = JSON.parse(localStorage.getItem('user') || 'null')
      if (su?.id || su?.userId) return String(su.id ?? su.userId)
    } catch {}
    try {
      const token = localStorage.getItem('token')
      if (token) {
        const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
        return String(p?.sub ?? p?.id ?? p?.userId ?? '')
      }
    } catch {}
    return ''
  }

  async function connect() {
    manualDisconnect = false
    clearReconnectTimer()
    if (connection && connection.state === signalR.HubConnectionState.Disconnected) {
      connection = null
    }
    if (connection) return

    connection = new signalR.HubConnectionBuilder()
      .withUrl(`${apiBase}/hubs/online`, {
        accessTokenFactory: () => localStorage.getItem('token'),
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build()

    connection.on('chat:onlineUsers', (payload) => {
      const cid = String(payload?.conversationId ?? '')
      if (!cid) return
      const ids = (payload?.users ?? [])
        .map(u => String(u.userId ?? u.id ?? ''))
        .filter(Boolean)
      onlineUsersByConversation.set(cid, new Set(ids))
    })

    connection.on('chat:typing', (payload) => {
      const cid = String(payload?.conversationId ?? '')
      if (!cid || cid !== activeConversationGroupId) return
      useTypingStore().applyTypingEvent(payload, _getCurrentUserId())
    })

    connection.on('chat:read', (payload) => {
      const cid = String(payload?.conversationId ?? '')
      const uid = String(payload?.userId ?? '')
      const msgId = Number(payload?.lastSeenMessageId ?? payload?.messageId ?? 0)
      if (!cid || !uid || !msgId) return
      // Lazy import to avoid circular dep
      import('./chatStore').then(({ useChatStore }) => {
        useChatStore().applyRemoteRead(cid, uid, msgId)
      })
    })

    connection.onreconnected(async () => {
      clearReconnectTimer()
      // Per ТЗ §5.3: do NOT reset messages/read/unread. Clear online for active conv only.
      if (activeConversationGroupId) {
        clearOnlineForConversation(activeConversationGroupId)
      }
      await joinActiveGroup()
      isPresenceReady.value = true
    })

    connection.onclose(() => {
      isPresenceReady.value = false
      stopPing()
      connection = null
      scheduleReconnect()
    })

    try {
      await connection.start()
      await joinActiveGroup()
      isPresenceReady.value = true
      startPing()
    } catch {
      connection = null
      scheduleReconnect()
    }
  }

  function startPing() {
    stopPing()
    pingInterval = setInterval(() => invoke('Ping'), 20000)
  }

  function stopPing() {
    clearInterval(pingInterval)
    pingInterval = null
  }

  async function joinGroup(conversationId) {
    const cid = String(conversationId ?? '')
    if (!cid) return

    if (activeConversationGroupId && activeConversationGroupId !== cid) {
      if (isConnected()) {
        await connection.invoke('LeaveGroup', Number(activeConversationGroupId)).catch(() => {})
      }
      useTypingStore().clearConversation(activeConversationGroupId)
      clearOnlineForConversation(activeConversationGroupId)
    }

    activeConversationGroupId = cid
    // Clear online for new conv — will be repopulated by chat:onlineUsers
    clearOnlineForConversation(cid)
    await joinActiveGroup()
  }

  async function leaveGroup(conversationId) {
    const cid = String(conversationId ?? activeConversationGroupId ?? '')
    if (!cid) return

    if (activeConversationGroupId === cid) {
      activeConversationGroupId = null
    }

    useTypingStore().clearConversation(cid)
    clearOnlineForConversation(cid)

    if (!isConnected()) return
    await connection.invoke('LeaveGroup', Number(cid)).catch(() => {})
  }

  // Seed initial online state from HTTP — only if realtime hasn't populated it yet
  function seedOnlineUsers(conversationId, userIds = []) {
    const cid = String(conversationId ?? '')
    if (!cid || onlineUsersByConversation.has(cid)) return
    onlineUsersByConversation.set(cid, new Set(userIds.map(String).filter(Boolean)))
  }

  function handleTypingInput(conversationId) {
    const cid = String(conversationId ?? '')
    if (!cid || cid !== activeConversationGroupId) return
    if (typeof document !== 'undefined' && document.hidden) return
    invoke('Typing', Number(cid))
  }

  // Send Read event via OnlineHub per contract §2.1
  function sendRead(conversationId, lastSeenMessageId) {
    const cid = Number(conversationId)
    const msgId = Number(lastSeenMessageId)
    if (!cid || !msgId) return
    invoke('Read', cid, msgId)
  }

  async function disconnect() {
    manualDisconnect = true
    clearReconnectTimer()
    isPresenceReady.value = false
    stopPing()
    activeConversationGroupId = null
    onlineUsersByConversation.clear()

    if (connection) {
      await connection.stop()
      connection = null
    }
  }

  return {
    onlineUsersByConversation,
    isPresenceReady,
    isOnline,
    connect,
    disconnect,
    joinGroup,
    leaveGroup,
    seedOnlineUsers,
    handleTypingInput,
    sendRead,
  }
})
