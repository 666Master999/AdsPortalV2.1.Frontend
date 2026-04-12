import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import * as signalR from '@microsoft/signalr'
import { useTypingStore } from './typingStore'
import { createSignalRConnection, onSafe } from '../composables/useSignalR'

export const usePresenceStore = defineStore('presence', () => {
  let connection = null
  let pingInterval = null
  let reconnectTimer = null
  let manualDisconnect = false
  let activeConversationGroupId = null
  const subscribedRelevantUserIds = new Set()

  const RECONNECT_DELAY_MIN = 2000
  const RECONNECT_DELAY_MAX = 5000

  const onlineUsers = reactive(new Set())
  const dialogByUser = reactive(new Map())
  // Map userId -> ISO string of last activity (canonical last-seen from API)
  const lastActivityByUser = reactive(new Map())
  const isPresenceReady = ref(false)

  const isConnected = () =>
    connection?.state === signalR.HubConnectionState.Connected

  const invoke = (method, ...args) => {
    if (isConnected()) connection.invoke(method, ...args).catch(() => {})
  }

  function normalizeUserId(userId) {
    return String(userId ?? '').trim()
  }

  // Presence contract: userId MUST be a string. Numbers are not allowed.
  function isUserId(value) {
    return typeof value === 'string'
  }

  function isUserIdList(payload) {
    return Array.isArray(payload) && payload.every(v => typeof v === 'string')
  }

  function normalizeUserIdList(userIds = []) {
    const ids = []
    const seen = new Set()
    for (const userId of userIds) {
      const id = normalizeUserId(userId)
      if (!id || seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }
    return ids
  }

  function mergeOnlineUsers(userIds = []) {
    for (const userId of normalizeUserIdList(userIds)) {
      onlineUsers.add(userId)
    }
  }

  function replaceOnlineUsers(userIds = []) {
    onlineUsers.clear()
    mergeOnlineUsers(userIds)
  }

  function addOnlineUser(userId) {
    const id = normalizeUserId(userId)
    if (id) onlineUsers.add(id)
  }

  function removeOnlineUser(userId) {
    const id = normalizeUserId(userId)
    if (id) onlineUsers.delete(id)
  }

  function setUserDialog(userId, conversationId) {
    const id = normalizeUserId(userId)
    const cid = normalizeUserId(conversationId)
    if (!id || !cid) return
    dialogByUser.set(id, cid)
  }

  function clearUserDialog(userId, conversationId = null) {
    const id = normalizeUserId(userId)
    if (!id) return
    if (conversationId != null) {
      const cid = normalizeUserId(conversationId)
      if (cid && dialogByUser.get(id) !== cid) return
    }
    dialogByUser.delete(id)
  }

  function isDialogPresencePayload(payload) {
    if (!payload || typeof payload !== 'object') return false
    return isUserId(payload.userId) && isUserId(payload.conversationId)
  }

  function isPresenceOfflinePayload(payload) {
    // Contract: payload is either a string userId or object { userId, lastActivityAt? }
    if (typeof payload === 'string') return isUserId(payload)
    if (!payload || typeof payload !== 'object') return false
    // Keep validation minimal — we trust backend contract: userId is a string
    return isUserId(payload.userId)
  }

  function isOnline(userId) {
    return onlineUsers.has(normalizeUserId(userId))
  }

  function getUserDialogConversationId(userId) {
    const id = normalizeUserId(userId)
    return id ? dialogByUser.get(id) ?? null : null
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
      if (su?.id != null) return String(su.id)
    } catch {}
    try {
      const token = localStorage.getItem('token')
      if (token) {
        const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
        return String(p?.sub ?? '')
      }
    } catch {}
    return ''
  }

  async function getRelevantUserIds() {
    try {
      const { useChatStore } = await import('./chatStore')
      const chatStore = useChatStore()
      const companionId = chatStore.currentConversation?.companion?.id
      return companionId != null ? [String(companionId)] : []
    } catch {
      return []
    }
  }

  async function syncRelevantUserSubscriptions(userIds = []) {
    if (!isConnected()) return

    const nextUserIds = new Set(normalizeUserIdList(userIds))
    const toUnsubscribe = []
    for (const userId of subscribedRelevantUserIds) {
      if (!nextUserIds.has(userId)) toUnsubscribe.push(userId)
    }

    const toSubscribe = []
    for (const userId of nextUserIds) {
      if (!subscribedRelevantUserIds.has(userId)) toSubscribe.push(userId)
    }

    if (toUnsubscribe.length) {
      await connection.invoke('UnsubscribeFromUsers', toUnsubscribe)
    }

    if (toSubscribe.length) {
      await connection.invoke('SubscribeToUsers', toSubscribe)
    }

    subscribedRelevantUserIds.clear()
    for (const userId of nextUserIds) {
      subscribedRelevantUserIds.add(userId)
    }
  }

  async function refreshRelevantPresence() {
    onlineUsers.clear()
    const relevantUserIds = await getRelevantUserIds()
    await syncRelevantUserSubscriptions(relevantUserIds)

    if (!relevantUserIds.length || !isConnected()) return

    const ids = await connection.invoke('GetRelevantOnlineUsers', relevantUserIds)
    if (!Array.isArray(ids)) {
      throw new Error('GetRelevantOnlineUsers must return an array of ids')
    }
    replaceOnlineUsers(ids)
  }

  async function connect() {
    manualDisconnect = false
    clearReconnectTimer()
    if (isConnected()) return
    if (connection) {
      if (connection.state !== signalR.HubConnectionState.Disconnected) {
        manualDisconnect = true
        await connection.stop().catch(() => {})
        manualDisconnect = false
      }
      connection = null
    }

    connection = createSignalRConnection()

    onSafe(connection, 'presence:init', isUserIdList, (ids) => {
      replaceOnlineUsers(ids)
    })

    onSafe(connection, 'presence:online', isUserId, (userId) => {
      addOnlineUser(userId)
    })

    onSafe(connection, 'presence:offline', isPresenceOfflinePayload, (payload) => {
      const userId = typeof payload === 'string' ? payload : payload.userId
      if (!userId) return

      const wasOnline = onlineUsers.has(userId)

      onlineUsers.delete(userId)
      dialogByUser.delete(userId)

      if (wasOnline) {
        const last = (payload && payload.lastActivityAt) ? payload.lastActivityAt : new Date()
        setLastActivity(userId, last)
      }
    })

    onSafe(connection, 'presence:inDialog', isDialogPresencePayload, (payload) => {
      setUserDialog(payload.userId, payload.conversationId)
    })

    onSafe(connection, 'presence:leftDialog', isDialogPresencePayload, (payload) => {
      clearUserDialog(payload.userId, payload.conversationId)
    })

    // chat:typing — per-conversation typing events; front-end handles timeout
    onSafe(connection, 'chat:typing', (payload) => {
      if (!payload || typeof payload !== 'object') return false
      const cid = String(payload.conversationId ?? '')
      const uid = String(payload.userId ?? '')
      const userName = payload.userName
      if (!cid || !uid || typeof userName !== 'string') return false
      return true
    }, (payload) => {
      const cid = String(payload.conversationId)
      if (cid !== activeConversationGroupId) return
      useTypingStore().applyTypingEvent(payload, _getCurrentUserId())
    })

    // chat:read — notify that user read up to lastSeenMessageId
    // New contract: `userId` may be omitted; server may broadcast { conversationId, lastSeenMessageId }
    onSafe(connection, 'chat:read', (payload) => {
      if (!payload || typeof payload !== 'object') return false
      const cid = String(payload.conversationId ?? '')
      const msgId = Number(payload.lastSeenMessageId ?? 0)
      if (!cid || !Number.isFinite(msgId) || msgId <= 0) return false
      return true
    }, (payload) => {
      const cid = String(payload.conversationId)
      const uid = payload.userId != null ? String(payload.userId) : null
      const msgId = Number(payload.lastSeenMessageId)
      import('./chatStore').then(({ useChatStore }) => {
        useChatStore().applyRemoteRead(cid, uid, msgId)
      })
    })

    // Some servers may broadcast conversation/message events on the chat hub.
    // Ensure chat hub also forwards these to `chatStore` to avoid "No client method" warnings.
    onSafe(connection, 'chat:message', (payload) => {
      if (!payload || typeof payload !== 'object') return false
      return true
    }, (payload) => {
      import('./chatStore').then(({ useChatStore }) => {
        useChatStore().applyIncomingMessage(payload)
      })
    })

    onSafe(connection, 'chat:conversationCreated', (payload) => {
      if (!payload || typeof payload !== 'object') return false
      return true
    }, (payload) => {
      import('./chatStore').then(({ useChatStore }) => {
        useChatStore().applyConversationCreated(payload)
      })
    })

    onSafe(connection, 'chat:conversationUpdated', (payload) => {
      if (!payload || typeof payload !== 'object') return false
      return true
    }, (payload) => {
      import('./chatStore').then(({ useChatStore }) => {
        useChatStore().applyConversationUpdated(payload)
      })
    })

    // Some servers may broadcast with lowercase event name `chat:conversationupdated`.
    // Add a duplicate safe handler to ensure we receive it.
    onSafe(connection, 'chat:conversationupdated', (payload) => {
      if (!payload || typeof payload !== 'object') return false
      return true
    }, (payload) => {
      import('./chatStore').then(({ useChatStore }) => {
        useChatStore().applyConversationUpdated(payload)
      })
    })

    connection.onreconnected(async () => {
      clearReconnectTimer()
      onlineUsers.clear()
      dialogByUser.clear()
      subscribedRelevantUserIds.clear()
      await joinActiveGroup()
      await refreshRelevantPresence()
      startPing()
      isPresenceReady.value = true
    })

    connection.onclose(() => {
      isPresenceReady.value = false
      stopPing()
      subscribedRelevantUserIds.clear()
      connection = null
      scheduleReconnect()
    })

    try {
      await connection.start()
      await joinActiveGroup()
      await refreshRelevantPresence()
      isPresenceReady.value = true
      startPing()
    } catch {
      connection = null
      scheduleReconnect()
    }
  }

  function startPing() {
    stopPing()
    pingInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      invoke('Ping')
    }, 25000)
  }

  function setLastActivity(userId, isoOrDate) {
  const id = normalizeUserId(userId)
  if (!id || !isoOrDate) return

  const date = new Date(isoOrDate)
  if (isNaN(date.getTime())) return

  lastActivityByUser.set(id, date.toISOString())
}

function getLastActivity(userId) {
  const id = normalizeUserId(userId)
  if (!id) return null

  const v = lastActivityByUser.get(id)
  if (!v) return null

  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

function applyUserProfileDto(payload) {
  if (!payload) return

  const profile = payload.UserProfile ?? payload
  if (!profile || (profile.Id == null && profile.id == null)) return

  const id = String(profile.Id ?? profile.id)
  const last = profile.LastActivityAt ?? profile.lastActivityAt

  if (last) setLastActivity(id, last)
}

  function applyUserProfiles(payloads = []) {
    if (!Array.isArray(payloads)) return
    for (const p of payloads) applyUserProfileDto(p)
  }

  function stopPing() {
    clearInterval(pingInterval)
    pingInterval = null
  }

  async function joinConversation(conversationId) {
    const cid = String(conversationId ?? '')
    if (!cid) return

    if (activeConversationGroupId && activeConversationGroupId !== cid) {
      await syncRelevantUserSubscriptions([])
      if (isConnected()) {
        await connection.invoke('LeaveGroup', Number(activeConversationGroupId)).catch(() => {})
      }
      useTypingStore().clearConversation(activeConversationGroupId)
      dialogByUser.clear()
    }

    activeConversationGroupId = cid
    await joinActiveGroup()
    await refreshRelevantPresence()
  }

  async function leaveConversation(conversationId) {
    const cid = String(conversationId ?? activeConversationGroupId ?? '')
    if (!cid) return

    if (activeConversationGroupId === cid) {
      activeConversationGroupId = null
    }

    useTypingStore().clearConversation(cid)
    dialogByUser.clear()
    await syncRelevantUserSubscriptions([])

    if (!isConnected()) return
    await connection.invoke('LeaveGroup', Number(cid)).catch(() => {})
  }

  function handleTypingInput(conversationId) {
    const cid = String(conversationId ?? '')
    if (!cid || cid !== activeConversationGroupId) return
    if (typeof document !== 'undefined' && document.hidden) return
    invoke('Typing', Number(cid))
  }

  // Send Read event via ChatHub per contract §2.1
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
    onlineUsers.clear()
    dialogByUser.clear()
    subscribedRelevantUserIds.clear()

    if (connection) {
      await connection.stop()
      connection = null
    }
  }

  return {
    onlineUsers,
    dialogByUser,
    lastActivityByUser,
    isPresenceReady,
    isOnline,
    getUserDialogConversationId,
    getLastActivity,
    setLastActivity,
    applyUserProfileDto,
    applyUserProfiles,
    connect,
    disconnect,
    joinConversation,
    leaveConversation,
    handleTypingInput,
    sendRead,
  }
})
