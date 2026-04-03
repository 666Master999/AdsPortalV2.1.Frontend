import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import { getApiBaseUrl } from '../config/apiBase'

const apiBase = getApiBaseUrl()

function parseJwt(token) {
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

function authHeaders(contentType = 'application/json') {
  const token = localStorage.getItem('token')
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (contentType) headers['Content-Type'] = contentType
  return headers
}

function normalizeConversation(conversation) {
  if (!conversation || typeof conversation !== 'object') return conversation

  const id = conversation.id ?? conversation.conversationId
  const companion = conversation.companion ?? conversation.opponent ?? null
  const ad = conversation.ad ?? null
  const lastMessage = conversation.lastMessage ?? conversation.last_message ?? null
  const unreadCount = conversation.unreadCount
    ?? conversation.unreadMessagesCount
    ?? (conversation.hasUnread ? 1 : 0)
  const lastMessageAt = conversation.lastMessageAt
    ?? conversation.last_message_at
    ?? conversation.lastMessageTimestamp
    ?? lastMessage?.createdAt
    ?? null
  const isClosed = conversation.isClosed ?? conversation.closed ?? false
  const isMuted = conversation.isMuted ?? conversation.muted ?? false
  const isArchived = conversation.isArchived ?? conversation.archived ?? false

  return {
    ...conversation,
    id,
    companion,
    ad: ad ?? (conversation.adId != null ? { id: conversation.adId } : null),
    lastMessage,
    firstUnreadMessageId: conversation.firstUnreadMessageId ?? conversation.firstUnreadMessage ?? null,
    lastMessageAt,
    unreadCount,
    isClosed,
    isMuted,
    isArchived,
    totalMessagesCount: conversation.totalMessagesCount ?? null,
    companionId: companion?.id ?? null,
    companionName: companion?.name ?? null,
    companionAvatar: companion?.avatar ?? null,
    adId: conversation.adId ?? ad?.id ?? conversation.relatedAdId ?? conversation.targetAdId ?? null,
    lastMessageType: lastMessage?.type ?? conversation.lastMessageType ?? conversation.last_message_type ?? null,
    lastMessageText: lastMessage?.text ?? conversation.lastMessageText ?? conversation.last_message_text ?? '',
    last_message_at: lastMessageAt,
    last_message_text: lastMessage?.text ?? conversation.lastMessageText ?? conversation.last_message_text ?? null,
    muted: isMuted,
    archived: isArchived,
  }
}

// Unwrap the backend contract { conversationId, message } → plain message with conversationId merged in.
function unwrapMsg(res) {
  if (
    res &&
    typeof res === 'object' &&
    res.message &&
    typeof res.message === 'object' &&
    'id' in res.message
  ) {
    return { ...res.message, conversationId: res.conversationId ?? res.message.conversationId }
  }
  return res
}

export function normalizeMessage(message) {
  if (!message || typeof message !== 'object') return null

  const m = unwrapMsg(message)
  if (!m || typeof m !== 'object') return null

  const id = m.id != null ? String(m.id) : null
  if (!id) return null

  const conversationId = String(m.conversationId ?? m.conversation?.id ?? '')

  const attachments = Array.isArray(m.attachments)
    ? m.attachments.filter(Boolean)
    : []

  return {
    ...m,
    id,
    conversationId,
    text: m.text ?? '',
    authorId: String(m.authorId ?? m.senderId ?? m.author?.id ?? m.sender?.id ?? m.userId ?? ''),
    createdAt: m.createdAt ?? new Date().toISOString(),
    attachments,
    status: m.status ?? 'sent',
    replyToMessageId: m.replyToMessageId ?? m.reply_to_message_id ?? null,
  }
}

function getConversationListPayload(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.data)) return data.data
  if (Array.isArray(data?.conversations)) return data.conversations
  return []
}

function decorateConversation(conversation, ad = null) {
  const n = normalizeConversation(conversation)
  if (!n) return n
  const companion = n.companion ?? null
  const mergedAd = ad ?? n.ad ?? null
  const adTitle = mergedAd?.title ?? null
  const companionName = companion?.name ?? null
  return {
    ...n,
    ad: mergedAd,
    companion,
    companionId: companion?.id ?? null,
    companionName,
    companionAvatar: companion?.avatar ?? null,
    lastMessageType: n.lastMessage?.type ?? n.lastMessageType ?? n.last_message_type ?? null,
    lastMessageText: n.lastMessage?.text ?? n.lastMessageText ?? n.last_message_text ?? '',
    displayTitle: companionName ?? adTitle ?? null,
    displayMeta: mergedAd?.id ? `Объявление #${mergedAd.id}${adTitle ? ` · ${adTitle}` : ''}` : null,
  }
}

function sortById(a, b) {
  const ai = Number(a.id), bi = Number(b.id)
  return (Number.isFinite(ai) ? ai : Infinity) - (Number.isFinite(bi) ? bi : Infinity)
}

function computeLastKnownId(msgs) {
  let max = null
  for (const m of msgs) {
    const id = Number(m.id)
    if (!isNaN(id) && (max === null || id > max)) max = id
  }
  return max
}

export const useChatStore = defineStore('chat', () => {
  const conversations = ref([])

  // Per §4.1 — per-conversation Maps are the canonical state
  // myLastSeenByConversation: Map<cid(string), number>
  // otherLastSeenByConversation: Map<cid(string), number>
  // unreadByConversation: Map<cid(string), number>
  const myLastSeenByConversation = reactive(new Map())
  const otherLastSeenByConversation = reactive(new Map())
  const unreadByConversation = reactive(new Map())

  // badge = sum of all unread counts
  const unreadCount = computed(() => {
    let total = 0
    for (const v of unreadByConversation.values()) total += (Number(v) || 0)
    return total
  })

  const currentConversation = ref(null)
  const messagesMap = reactive(new Map())
  const messages = computed(() => Array.from(messagesMap.values()).sort(sortById))
  const currentConversationId = ref(null)
  const hasMore = ref(false)
  const isLoading = ref(false)
  const error = ref(null)
  const lastKnownId = ref(null)
  const anchorMessageId = ref(null)

  // Dedup set for realtime messages (30s window)
  const _seenMessageIds = new Map()

  function _isDuplicate(msgId) {
    const id = String(msgId ?? '')
    if (!id) return false
    const now = Date.now()
    for (const [k, t] of _seenMessageIds) {
      if (now - t > 30000) _seenMessageIds.delete(k)
    }
    if (_seenMessageIds.has(id)) return true
    _seenMessageIds.set(id, now)
    return false
  }

  // Convenience getters for current conversation read state
  const myLastSeenMessageId = computed(() => myLastSeenByConversation.get(String(currentConversationId.value ?? '')) ?? null)
  const otherLastSeenMessageId = computed(() => otherLastSeenByConversation.get(String(currentConversationId.value ?? '')) ?? null)

  function _getCurrentUserId() {
    try {
      const stored = JSON.parse(localStorage.getItem('user') || 'null')
      if (stored?.id || stored?.userId) return String(stored.id || stored.userId)
    } catch {}
    const payload = parseJwt(localStorage.getItem('token'))
    return String(payload?.sub || payload?.id || payload?.userId || '')
  }

  function getConversationById(conversationId) {
    const cid = String(conversationId ?? '')
    if (!cid) return null
    return conversations.value.find(item => String(item.id) === cid) ||
      (String(currentConversation.value?.id ?? '') === cid ? currentConversation.value : null)
  }

  function moveConversationToTop(conversationId) {
    const cid = String(conversationId ?? '')
    if (!cid) return null
    const index = conversations.value.findIndex(item => String(item.id) === cid)
    if (index <= 0) return index === 0 ? conversations.value[0] : null
    const [conversation] = conversations.value.splice(index, 1)
    conversations.value.unshift(conversation)
    return conversation
  }

  function updateConversationPreview(conversation, message) {
    if (!conversation || !message) return
    conversation.lastMessage = message
    conversation.lastMessageType = message.type ?? conversation.lastMessageType ?? null
    conversation.lastMessageText = message.text ?? conversation.lastMessageText ?? null
    conversation.lastMessageAt = message.createdAt ?? conversation.lastMessageAt ?? null
    conversation.firstUnreadMessageId = conversation.firstUnreadMessageId ?? null
    conversation.last_message_at = conversation.lastMessageAt
    conversation.last_message_text = conversation.lastMessageText
  }

  // Called by notificationsStore on chat:message event
  function applyIncomingMessage(rawMessage) {
    const normalized = normalizeMessage(rawMessage)
    if (!normalized) return null

    const cid = String(normalized.conversationId ?? '')
    if (!cid) return null

    // Dedup by message id
    if (_isDuplicate(normalized.id)) return normalized

    const activeCid = String(currentConversationId.value ?? '')
    const myId = _getCurrentUserId()
    const isFromMe = normalized.authorId && normalized.authorId === myId
    const isActive = activeCid === cid

    // Append to messages if this is the active conversation
    if (isActive) {
      setMessage(normalized)
      // Advance lastKnownId
      const numId = Number(normalized.id)
      if (!isNaN(numId) && (lastKnownId.value === null || numId > lastKnownId.value)) {
        lastKnownId.value = numId
      }
      // If incoming (not mine), send Read via hub and update local state
      if (!isFromMe) {
        const numMsgId = Number(normalized.id)
        if (!isNaN(numMsgId)) {
          _sendReadForActiveConversation(cid, numMsgId)
        }
      }
    } else {
      // Not active conversation
      const numId = Number(normalized.id)
      // Unread: only increment for incoming messages (not mine)
      if (!isFromMe) {
        const prev = Number(unreadByConversation.get(cid) ?? 0)
        unreadByConversation.set(cid, prev + 1)
      }
      // Advance lastKnownId for this conversation regardless
      if (!isNaN(numId)) {
        // We don't track per-conv lastKnownId separately; just skip for non-active
      }
    }

    // Update conversation list preview
    const conversation = getConversationById(cid)
    if (conversation) {
      updateConversationPreview(conversation, normalized)
      // Sync unreadCount field on conversation object from our Map
      const unread = Number(unreadByConversation.get(cid) ?? 0)
      conversation.unreadCount = unread
      conversation.hasUnread = unread > 0
      moveConversationToTop(cid)
    }
    if (String(currentConversation.value?.id ?? '') === cid) {
      updateConversationPreview(currentConversation.value, normalized)
    }

    return normalized
  }

  // Called by presenceStore on chat:read event (other party read something)
  function applyRemoteRead(conversationId, userId, lastSeenMessageId) {
    const cid = String(conversationId ?? '')
    const uid = String(userId ?? '')
    const msgId = Number(lastSeenMessageId)
    if (!cid || !uid || !msgId) return

    const myId = _getCurrentUserId()
    if (uid === myId) {
      // This is our own read confirmed by server — advance myLastSeen
      const prev = Number(myLastSeenByConversation.get(cid) ?? 0)
      if (msgId > prev) myLastSeenByConversation.set(cid, msgId)
    } else {
      // Other party read — advance otherLastSeen (only forward)
      const prev = Number(otherLastSeenByConversation.get(cid) ?? 0)
      if (msgId > prev) otherLastSeenByConversation.set(cid, msgId)
    }
  }

  // Internal: send Read via OnlineHub (lazy import to avoid circular dep)
  function _sendReadForActiveConversation(cid, msgId) {
    import('./presenceStore').then(({ usePresenceStore }) => {
      usePresenceStore().sendRead(cid, msgId)
    })
    // Update local myLastSeen immediately (optimistic, only forward)
    const prev = Number(myLastSeenByConversation.get(cid) ?? 0)
    if (msgId > prev) {
      myLastSeenByConversation.set(cid, msgId)
      // Zero out unread for active conversation
      unreadByConversation.set(cid, 0)
      const conv = getConversationById(cid)
      if (conv) { conv.unreadCount = 0; conv.hasUnread = false }
    }
  }

  // Public: trigger a read mark for the active conversation up to msgId
  // Called from useReadTracker and from ChatPage on scroll-to-bottom
  function markReadLocal(conversationId, lastReadMessageId) {
    const cid = String(conversationId ?? '')
    const numId = Number(lastReadMessageId)
    if (!cid || isNaN(numId)) return
    const prev = Number(myLastSeenByConversation.get(cid) ?? 0)
    if (numId <= prev) return // only forward
    _sendReadForActiveConversation(cid, numId)
  }

  // Legacy alias used by useReadTracker — wraps markReadLocal (no HTTP call)
  function markRead(conversationId, lastReadMessageId) {
    markReadLocal(conversationId, lastReadMessageId)
  }

  function setMessage(msg) {
    if (!msg) return
    if (currentConversationId.value && String(msg.conversationId) !== String(currentConversationId.value)) return
    if (!msg.text && (!msg.attachments || !msg.attachments.length)) return
    const existing = messagesMap.get(msg.id)
    if (existing && (existing.status === 'sending' || existing.status === 'failed' || existing.status === 'editing')) {
      return // don't overwrite optimistic local messages
    }
    messagesMap.set(msg.id, existing ? { ...existing, ...msg } : msg)
  }

  function hasMessage(msgId) {
    return messagesMap.has(String(msgId))
  }

  function updateMessage(messageId, patch) {
    const key = String(messageId)
    const existing = messagesMap.get(key)
    if (!existing) return
    messagesMap.set(key, { ...existing, ...patch })
  }

  function removeMessage(messageId) {
    messagesMap.delete(String(messageId))
  }

  function clearMessages() {
    messagesMap.clear()
  }

  function setMessages(arr) {
    messagesMap.clear()
    for (const m of arr) if (m) messagesMap.set(String(m.id), m)
  }

  async function fetchJSON(url, options = {}) {
    isLoading.value = true
    error.value = null
    const controller = new AbortController()
    const timeoutMs = options.timeoutMs ?? (options.body instanceof FormData ? 120000 : 20000)
    const timeoutId = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null
    try {
      const response = await fetch(`${apiBase}${url}`, {
        ...options,
        signal: options.signal ?? controller.signal,
      })
      const rawBody = await response.text()
      let parsedBody = null
      if (rawBody.trim()) {
        if (response.headers.get('content-type')?.includes('application/json')) {
          try { parsedBody = JSON.parse(rawBody) } catch { parsedBody = rawBody }
        } else {
          parsedBody = rawBody
        }
      }
      if (!response.ok) {
        const data = parsedBody
        const serverMessage = typeof data === 'object' && data !== null
          ? data.error || data.message || data.detail || JSON.stringify(data)
          : data
        throw new Error(serverMessage || response.statusText || `HTTP ${response.status}`)
      }
      return parsedBody
    } catch (err) {
      error.value = err?.name === 'AbortError'
        ? `Превышено время ожидания ответа (${Math.round(timeoutMs / 1000)}s)`
        : err.message
      throw err
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      isLoading.value = false
    }
  }

  async function postMessage(url, { text = null, attachments = [], replyToMessageId = null } = {}) {
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0
    const hasReply = replyToMessageId != null

    if (hasAttachments) {
      const buildForm = (nameVariant, textFields = ['text', 'Text']) => {
        const f = new FormData()
        if (text != null) textFields.forEach(n => f.append(n, text))
        if (hasReply) f.append('ReplyToMessageId', replyToMessageId)
        attachments.forEach(file => f.append(nameVariant, file))
        return f
      }
      const upload = (form) => fetchJSON(url, { method: 'POST', headers: authHeaders(null), body: form })

      try { return await upload(buildForm('files')) } catch (err) {
        if (err instanceof TypeError || err?.name === 'AbortError') throw err
        try { return await upload(buildForm('files[]')) } catch (err2) {
          if (err2 instanceof TypeError || err2?.name === 'AbortError') throw err2
          const legacyUrl = url.replace(/\/messages$/i, '/attachments')
          if (legacyUrl !== url) {
            try { return await upload(buildForm('files', ['text', 'Text', 'caption'])) } catch {}
          }
          throw err
        }
      }
    }

    return fetchJSON(url, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ type: 'Text', text: text ?? '', replyToMessageId: hasReply ? replyToMessageId : null }),
    })
  }

  let _getConversationsPromise = null

  async function getConversations() {
    if (_getConversationsPromise) return _getConversationsPromise
    _getConversationsPromise = (async () => {
      try {
        const data = await fetchJSON('/conversations', { headers: authHeaders() })
        const incoming = getConversationListPayload(data).map(c => decorateConversation(normalizeConversation(c), c?.ad ?? null))
        // Seed unreadByConversation from server (initial load only — do NOT downgrade if realtime already set higher)
        for (const conv of incoming) {
          const cid = String(conv.id ?? '')
          if (!cid) continue
          const serverUnread = Number(conv.unreadCount) || 0
          const localUnread = Number(unreadByConversation.get(cid) ?? -1)
          if (localUnread < 0) {
            // First time — accept server value
            unreadByConversation.set(cid, serverUnread)
          } else {
            // Already have local value — take max (never downgrade)
            unreadByConversation.set(cid, Math.max(localUnread, serverUnread))
          }
          // Sync the unreadCount field on the conv object
          conv.unreadCount = unreadByConversation.get(cid)
        }
        conversations.value = incoming
        return conversations.value
      } finally {
        _getConversationsPromise = null
      }
    })()
    return _getConversationsPromise
  }

  async function findConversationByAdId(adId) {
    if (!conversations.value.length) await getConversations()
    const id = `${adId}`
    return conversations.value.find(c => `${c.ad?.id ?? c.adId ?? c.relatedAdId ?? c.targetAdId ?? ''}` === id) || null
  }

  async function sendMessageByAdId(adIdVal, text, attachments = []) {
    const tempId = `temp-${Date.now()}-${++_tempSeq}`
    const myUserId = _getCurrentUserId()

    const optimistic = {
      id: tempId,
      conversationId: '',
      text: text ?? '',
      authorId: myUserId,
      createdAt: new Date().toISOString(),
      attachments: Array.isArray(attachments) ? attachments : [],
      status: 'sending',
      ad: adIdVal != null ? { id: adIdVal } : null,
      _adId: adIdVal,
    }

    let shown = false
    const timer = setTimeout(() => {
      messagesMap.set(tempId, optimistic)
      shown = true
    }, OPTIMISTIC_DELAY)

    try {
      const response = await postMessage(`/conversations/by-ad/${adIdVal}/messages`, { text, attachments })
      const message = normalizeMessage(response)
      const conversationId = message?.conversationId || response?.conversation?.id || response?.conversation?.conversationId
      if (!conversationId) throw new Error('Invalid response from server')

      clearTimeout(timer)
      if (shown) messagesMap.delete(tempId)

      const existing = conversations.value.find(c => String(c.id) === String(conversationId))
      if (existing) {
        currentConversation.value = existing
      } else {
        currentConversation.value = decorateConversation(response?.conversation || { id: conversationId, ad: adIdVal != null ? { id: adIdVal } : null, unreadCount: 0 }, response?.ad || null)
        conversations.value.unshift(currentConversation.value)
      }
      currentConversationId.value = String(conversationId)
      if (message) setMessage(message)

      const msgId = Number(message?.id)
      if (!isNaN(msgId) && (lastKnownId.value === null || msgId > lastKnownId.value)) lastKnownId.value = msgId
      return { conversationId, message }
    } catch (err) {
      clearTimeout(timer)
      error.value = null
      if (!shown) messagesMap.set(tempId, optimistic)
      const ex = messagesMap.get(tempId)
      if (ex) messagesMap.set(tempId, { ...ex, status: 'failed', error: err?.message || 'Ошибка отправки' })
      return null
    }
  }

  async function retryMessage(msgId) {
    const msg = messagesMap.get(String(msgId))
    if (!msg || msg.status !== 'failed') return null

    messagesMap.set(msg.id, { ...msg, status: 'sending', error: null })

    const adIdVal = msg._adId
    const cid = msg.conversationId || currentConversationId.value

    try {
      let response
      if (adIdVal && !cid) {
        response = await postMessage(`/conversations/by-ad/${adIdVal}/messages`, { text: msg.text, attachments: msg.attachments })
        const real = normalizeMessage(response)
        const conversationId = real?.conversationId || response?.conversation?.id
        messagesMap.delete(msg.id)
        if (conversationId) {
          currentConversationId.value = String(conversationId)
          const existing = conversations.value.find(c => String(c.id) === String(conversationId))
          if (existing) {
            currentConversation.value = existing
          } else {
            currentConversation.value = decorateConversation(response?.conversation || { id: conversationId, ad: adIdVal != null ? { id: adIdVal } : null, unreadCount: 0 }, response?.ad || null)
            conversations.value.unshift(currentConversation.value)
          }
        }
        if (real) setMessage(real)
        const id = real ? Number(real.id) : NaN
        if (!isNaN(id) && (lastKnownId.value === null || id > lastKnownId.value)) lastKnownId.value = id
        return conversationId ? { conversationId } : null
      } else {
        response = await postMessage(`/conversations/${cid}/messages`, { text: msg.text, attachments: msg.attachments })
        const real = normalizeMessage(response)
        messagesMap.delete(msg.id)
        if (real) setMessage(real)
        const id = real ? Number(real.id) : NaN
        if (!isNaN(id) && (lastKnownId.value === null || id > lastKnownId.value)) lastKnownId.value = id
        return null
      }
    } catch (err) {
      error.value = null
      const existing = messagesMap.get(msg.id)
      if (existing) messagesMap.set(msg.id, { ...existing, status: 'failed', error: err?.message || 'Ошибка отправки' })
      return null
    }
  }

  async function loadConversation(conversationId, options = {}) {
    const cid = String(conversationId)
    currentConversationId.value = cid
    currentConversation.value = null
    clearMessages()
    hasMore.value = false
    lastKnownId.value = null
    anchorMessageId.value = null
    // Do NOT clear myLastSeenByConversation / otherLastSeenByConversation / unreadByConversation
    // — they may already have realtime data
    let conv = conversations.value.find(c => String(c.id) === cid)
    if (!conv && !options.skipConversationsFetch) {
      await getConversations()
      conv = conversations.value.find(c => String(c.id) === cid) || null
    }
    currentConversation.value = conv || normalizeConversation({ id: conversationId })
    await loadMessages(conversationId, options)
    return currentConversation.value
  }

  async function loadMessages(conversationId, options = {}) {
    const requestedCid = String(conversationId)

    const beforeId = options.before ?? null
    const sinceId = options.since ?? null
    const params = []
    if (beforeId) params.push(`before=${beforeId}`)
    if (sinceId) params.push(`since=${sinceId}`)
    if (options.count) params.push(`count=${options.count}`)
    const url = `/conversations/${conversationId}/messages` + (params.length ? '?' + params.join('&') : '')
    const response = await fetchJSON(url, { headers: authHeaders() })

    if (currentConversationId.value !== requestedCid) return messages.value

    if (response && typeof response === 'object' && Array.isArray(response.messages)) {
      const normalized = response.messages.map(normalizeMessage).filter(Boolean)
      if (beforeId) {
        hasMore.value = Boolean(response.hasMore)
        for (const m of normalized) setMessage(m)
      } else if (sinceId) {
        // Append-only — never touch read state
        for (const m of normalized) setMessage(m)
      } else {
        // Initial load — full replace of messages but preserve realtime read state
        hasMore.value = Boolean(response.hasMore)
        const rawConv = normalizeConversation({ id: conversationId, ...(response.conversation || {}), ...(response.ad ? { ad: response.ad } : {}) })
        const existing = conversations.value.find(c => String(c.id) === String(conversationId))
        currentConversation.value = {
          ...(currentConversation.value || {}),
          ...rawConv,
          companion: rawConv.companion ?? currentConversation.value?.companion ?? existing?.companion ?? null,
          ad: rawConv.ad ?? currentConversation.value?.ad ?? existing?.ad ?? null,
          lastMessage: rawConv.lastMessage ?? currentConversation.value?.lastMessage ?? existing?.lastMessage ?? null,
          lastMessageAt: rawConv.lastMessageAt ?? currentConversation.value?.lastMessageAt ?? existing?.lastMessageAt ?? null,
          firstUnreadMessageId: rawConv.firstUnreadMessageId ?? currentConversation.value?.firstUnreadMessageId ?? existing?.firstUnreadMessageId ?? null,
          isClosed: rawConv.isClosed ?? currentConversation.value?.isClosed ?? existing?.isClosed ?? false,
          isMuted: rawConv.isMuted ?? currentConversation.value?.isMuted ?? existing?.isMuted ?? false,
          isArchived: rawConv.isArchived ?? currentConversation.value?.isArchived ?? existing?.isArchived ?? false,
          totalMessagesCount: rawConv.totalMessagesCount ?? currentConversation.value?.totalMessagesCount ?? existing?.totalMessagesCount ?? null,
        }
        const idx = conversations.value.findIndex(c => String(c.id) === String(conversationId))
        if (idx !== -1) conversations.value[idx] = currentConversation.value
        else conversations.value.unshift(currentConversation.value)
        if (currentConversationId.value !== requestedCid) return messages.value
        setMessages(normalized)
        anchorMessageId.value = response.anchorMessageId ?? null

        // Seed initial read state from HTTP — only if realtime hasn't set it yet
        _seedReadState(requestedCid, response)

        // Seed initial online state from HTTP (companion.isOnline, companion.lastActivityAt)
        const companion = response.conversation?.companion ?? rawConv.companion ?? null
        if (companion?.id != null) {
          import('./presenceStore').then(({ usePresenceStore }) => {
            const initialOnlineIds = companion.isOnline ? [String(companion.id)] : []
            usePresenceStore().seedOnlineUsers(requestedCid, initialOnlineIds)
          })
        }
      }
      const maxId = computeLastKnownId(messages.value)
      if (maxId !== null) lastKnownId.value = maxId
      return messages.value
    }
    if (currentConversationId.value !== requestedCid) return messages.value
    setMessages(Array.isArray(response) ? response.map(normalizeMessage) : [])
    hasMore.value = false
    const maxId = computeLastKnownId(messages.value)
    if (maxId !== null) lastKnownId.value = maxId
    return messages.value
  }

  // Seed myLastSeen / otherLastSeen from initial HTTP response — only move forward, never back
  function _seedReadState(cid, response) {
    const sellerLast = response?.sellerLastSeenMessageId ?? response?.sellerLastSeenId ?? null
    const buyerLast = response?.buyerLastSeenMessageId ?? response?.buyerLastSeenId ?? null

    let myHttp = null
    let otherHttp = null

    if (sellerLast != null && buyerLast != null) {
      let currentUserId = null
      try { const su = JSON.parse(localStorage.getItem('user') || 'null'); currentUserId = su?.id ?? su?.userId ?? null } catch {}
      if (!currentUserId) {
        const payload = parseJwt(localStorage.getItem('token'))
        currentUserId = payload?.sub ?? payload?.id ?? payload?.userId ?? null
      }
      const sellerId = response?.conversation?.seller?.id ?? response?.conversation?.sellerId ?? currentConversation.value?.seller?.id ?? currentConversation.value?.sellerId ?? null
      const buyerId = response?.conversation?.buyer?.id ?? response?.conversation?.buyerId ?? currentConversation.value?.buyer?.id ?? currentConversation.value?.buyerId ?? null

      if (sellerId && String(sellerId) === String(currentUserId)) {
        myHttp = Number(sellerLast); otherHttp = Number(buyerLast)
      } else if (buyerId && String(buyerId) === String(currentUserId)) {
        myHttp = Number(buyerLast); otherHttp = Number(sellerLast)
      }
    }
    if (myHttp == null) myHttp = Number(response?.myLastSeenMessageId ?? 0)
    if (otherHttp == null) otherHttp = Number(response?.otherLastSeenMessageId ?? 0)

    // Seed only forward
    const prevMy = Number(myLastSeenByConversation.get(cid) ?? 0)
    if (myHttp > prevMy) myLastSeenByConversation.set(cid, myHttp)

    const prevOther = Number(otherLastSeenByConversation.get(cid) ?? 0)
    if (otherHttp > prevOther) otherLastSeenByConversation.set(cid, otherHttp)

    // Unread count from HTTP — seed only if not yet set
    const serverUnread = Number(response?.conversation?.unreadCount ?? 0)
    if (!unreadByConversation.has(cid)) {
      unreadByConversation.set(cid, serverUnread)
    }
  }

  async function loadMoreMessages() {
    const oldestId = messages.value[0]?.id ?? null
    if (!oldestId) return
    await loadMessages(currentConversation.value?.id, { before: oldestId })
  }

  let _tempSeq = 0
  const OPTIMISTIC_DELAY = 120

  async function sendMessage(text, attachments = []) {
    const cid = currentConversationId.value
    if (!cid) throw new Error('No active conversation')

    const tempId = `temp-${Date.now()}-${++_tempSeq}`
    const myUserId = _getCurrentUserId()

    const optimistic = {
      id: tempId,
      conversationId: String(cid),
      text: text ?? '',
      authorId: myUserId,
      createdAt: new Date().toISOString(),
      attachments: Array.isArray(attachments) ? attachments : [],
      status: 'sending',
    }

    let shown = false
    const timer = setTimeout(() => {
      messagesMap.set(tempId, optimistic)
      shown = true
    }, OPTIMISTIC_DELAY)

    try {
      const response = await postMessage(`/conversations/${cid}/messages`, { text, attachments })
      const real = normalizeMessage(response)

      clearTimeout(timer)
      if (shown) messagesMap.delete(tempId)

      if (real) setMessage(real)

      const id = real ? Number(real.id) : NaN
      if (!isNaN(id) && (lastKnownId.value === null || id > lastKnownId.value)) lastKnownId.value = id
      return real
    } catch (err) {
      clearTimeout(timer)
      error.value = null
      if (!shown) messagesMap.set(tempId, optimistic)
      const existing = messagesMap.get(tempId)
      if (existing) messagesMap.set(tempId, { ...existing, status: 'failed', error: err?.message || 'Ошибка отправки' })
    }
  }

  async function editMessage(conversationId, messageId, patch = {}) {
    const updated = normalizeMessage(await fetchJSON(`/conversations/${conversationId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    }))
    updateMessage(messageId, updated)
    return updated
  }

  async function addMessageAttachments(conversationId, messageId, files) {
    if (!Array.isArray(files) || !files.length) return null
    const upload = async (fieldName) => {
      const form = new FormData()
      files.forEach(f => form.append(fieldName, f))
      return normalizeMessage(await fetchJSON(`/conversations/${conversationId}/messages/${messageId}/attachments`, {
        method: 'POST',
        headers: authHeaders(null),
        body: form,
      }))
    }
    let updated
    try { updated = await upload('files') }
    catch (err) {
      try { updated = await upload('files[]') }
      catch { throw err }
    }
    updateMessage(messageId, updated)
    return updated
  }

  const addMessageAttachment = (conversationId, messageId, file) => addMessageAttachments(conversationId, messageId, [file])

  async function deleteMessage(conversationId, messageId) {
    const response = await fetchJSON(`/conversations/${conversationId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    const deletedMsg = unwrapMsg(response)
    updateMessage(messageId, {
      deleted: true,
      deletedAt: deletedMsg?.deletedAt || new Date().toISOString(),
      text: '',
    })
  }

  async function mute(conversationId, isMuted = true) {
    await fetchJSON(`/conversations/${conversationId}/mute`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ mute: isMuted }),
    })
    const cid = String(conversationId)
    if (String(currentConversation.value?.id ?? '') === cid) {
      currentConversation.value.isMuted = isMuted
      currentConversation.value.muted = isMuted
    }
    const conv = conversations.value.find(c => String(c.id) === cid)
    if (conv) { conv.isMuted = isMuted; conv.muted = isMuted }
  }

  async function archive(conversationId, archived = true) {
    await fetchJSON(`/conversations/${conversationId}/archive`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ archive: archived }),
    })
    const cid = String(conversationId)
    if (String(currentConversation.value?.id ?? '') === cid) {
      currentConversation.value.isArchived = archived
      currentConversation.value.archived = archived
    }
    const conv = conversations.value.find(c => String(c.id) === cid)
    if (conv) { conv.isArchived = archived; conv.archived = archived }
  }

  return {
    conversations,
    unreadCount,
    currentConversation,
    messages,
    hasMore,
    isLoading,
    error,
    lastKnownId,
    anchorMessageId,
    // Read state as computed refs for current conversation
    myLastSeenMessageId,
    otherLastSeenMessageId,
    // Per-conversation Maps (for components that need cross-conv data)
    myLastSeenByConversation,
    otherLastSeenByConversation,
    unreadByConversation,
    currentConversationId,
    // Message operations
    setMessage, updateMessage, removeMessage, clearMessages, setMessages, hasMessage,
    // Realtime handlers
    applyIncomingMessage,
    applyRemoteRead,
    markRead,
    markReadLocal,
    // Conversation operations
    getConversationById,
    getConversations, findConversationByAdId, loadConversation, loadMessages, loadMoreMessages,
    // Message send/edit/delete
    sendMessage, sendMessageByAdId, retryMessage,
    editMessage, addMessageAttachment, addMessageAttachments,
    deleteMessage,
    // Conversation settings
    mute, archive,
  }
})
