import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import { toPublicErrorMessage } from '../services/errorService'
import { apiClient } from '../api/apiClient'
import { validateApiRequestBody } from '../api/requestContract'
import { validateConversationDto, validateConversationListDto, validateConversationMessagesDto, validateMessageDto } from '../utils/apiContract'

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

let _clientTagSeq = 0

function createClientTag() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `client-${Date.now()}-${++_clientTagSeq}`
}

function normalizeConversation(conversation) {
  if (!conversation || typeof conversation !== 'object') return conversation

  const id = conversation.id ?? conversation.conversationId
  const companionRaw = conversation.companion ?? null
  const companion = companionRaw && typeof companionRaw === 'object'
    ? {
        ...companionRaw,
        name: companionRaw.name ?? null,
        avatarPath: companionRaw.avatarPath ?? null,
        avatar: companionRaw.avatarPath ?? null,
      }
    : null
  const adRaw = conversation.ad ?? null
  const ad = adRaw && typeof adRaw === 'object'
    ? {
        ...adRaw,
        mainImagePath: adRaw.mainImagePath ?? null,
        image: adRaw.mainImagePath ?? null,
      }
    : null
  const lastMessage = conversation.lastMessage ?? null
  const unreadCount = conversation.unreadCount ?? 0
  const lastMessageAt = conversation.lastMessageAt
    ?? lastMessage?.createdAt
    ?? conversation.updatedAt
    ?? null
  const updatedAt = conversation.updatedAt ?? lastMessageAt ?? null
  const isClosed = conversation.isClosed ?? false
  const isMuted = conversation.isMuted ?? false
  const isArchived = conversation.isArchived ?? false

  return {
    ...conversation,
    id,
    companion,
    ad,
    lastMessage,
    firstUnreadMessageId: conversation.firstUnreadMessageId ?? null,
    lastMessageAt,
    updatedAt,
    unreadCount,
    isClosed,
    isMuted,
    isArchived,
    totalMessagesCount: conversation.totalMessagesCount ?? null,
    companionId: companion?.id ?? null,
    companionName: companion?.name ?? null,
    companionAvatar: companion?.avatar ?? null,
    adId: ad?.id ?? null,
    lastMessageType: lastMessage?.type ?? null,
    lastMessageText: lastMessage?.text ?? '',
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
    authorId: String(m.authorId ?? m.author?.id ?? m.sender?.id ?? ''),
    createdAt: m.createdAt ?? new Date().toISOString(),
    attachments,
    clientTag: m.clientTag != null ? String(m.clientTag) : null,
    status: m.status ?? 'sent',
    replyToMessageId: m.replyToMessageId ?? null,
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
  const mergedAd = normalizeConversation({ ad: ad ?? n.ad ?? null })?.ad ?? n.ad ?? null
  const adTitle = mergedAd?.title ?? null
  const companionName = companion?.name ?? null
  return {
    ...n,
    ad: mergedAd,
    companion,
    companionId: companion?.id ?? null,
    companionName,
    companionAvatar: companion?.avatar ?? null,
    lastMessageType: n.lastMessage?.type ?? n.lastMessageType ?? null,
    lastMessageText: n.lastMessage?.text ?? n.lastMessageText ?? '',
    displayTitle: companionName ?? adTitle ?? null,
    displayMeta: mergedAd?.id ? `Объявление #${mergedAd.id}${adTitle ? ` · ${adTitle}` : ''}` : null,
  }
}

function sortById(a, b) {
  const ai = Number(a.id), bi = Number(b.id)
  return (Number.isFinite(ai) ? ai : Infinity) - (Number.isFinite(bi) ? bi : Infinity)
}

function getConversationTimestamp(value) {
  const timestamp = value?.updatedAt ?? value?.lastMessageAt ?? value?.lastMessage?.createdAt ?? null
  const parsed = timestamp ? Date.parse(timestamp) : Number.NaN
  return Number.isNaN(parsed) ? 0 : parsed
}

function mergeConversationByFreshness(existingConversation, incomingConversation) {
  if (!existingConversation) return incomingConversation
  if (!incomingConversation) return existingConversation

  const existingTimestamp = getConversationTimestamp(existingConversation)
  const incomingTimestamp = getConversationTimestamp(incomingConversation)
  const preferred = incomingTimestamp >= existingTimestamp ? incomingConversation : existingConversation
  const fallback = preferred === incomingConversation ? existingConversation : incomingConversation

  return {
    ...fallback,
    ...preferred,
    companion: preferred.companion ?? fallback.companion ?? null,
    ad: preferred.ad ?? fallback.ad ?? null,
    lastMessage: preferred.lastMessage ?? fallback.lastMessage ?? null,
  }
}

function findMessageKeyByClientTag(messageMap, clientTag) {
  const tag = String(clientTag ?? '')
  if (!tag) return null

  if (!messageMap || typeof messageMap.entries !== 'function') return null

  for (const [key, value] of messageMap.entries()) {
    if (String(value?.clientTag ?? '') === tag) {
      return key
    }
  }

  return null
}

function sortConversationsByLastMessage(list = []) {
  return [...list].sort((left, right) => {
    const diff = getConversationTimestamp(right) - getConversationTimestamp(left)
    if (diff !== 0) return diff
    return Number(right?.id ?? 0) - Number(left?.id ?? 0)
  })
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
      if (stored?.id != null) return String(stored.id)
    } catch {}
    const payload = parseJwt(localStorage.getItem('token'))
    return String(payload?.sub || '')
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
    const nextTimestamp = message.createdAt ?? conversation.updatedAt ?? conversation.lastMessageAt ?? null
    conversation.updatedAt = nextTimestamp
    conversation.lastMessageAt = message.createdAt ?? conversation.lastMessageAt ?? nextTimestamp
    conversation.firstUnreadMessageId = conversation.firstUnreadMessageId ?? null
  }

  function syncConversationAfterMessage(cid, message) {
    const conv = getConversationById(cid)

    if (conv) {
      updateConversationPreview(conv, message)

      const unread = Number(unreadByConversation.get(cid) ?? 0)
      conv.unreadCount = unread
      conv.hasUnread = unread > 0

      moveConversationToTop(cid)
    }

    if (String(currentConversation.value?.id ?? '') === String(cid)) {
      updateConversationPreview(currentConversation.value, message)
    }
  }

  // Called by notificationsStore on SignalREvents.message event
  function applyIncomingMessage(rawMessage) {
    const validated = validateMessageDto(rawMessage, { strict: false })
    if (!validated) return null

    const normalized = normalizeMessage(validated)
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
      // NOTE: do NOT send read here eagerly — read sending is handled by useReadTracker
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
      syncConversationAfterMessage(cid, normalized)
    } else {
      // Conversation not present in the list — try to refresh conversations (deduped)
      // and, if still absent, create a lightweight preview so UI updates without full reload.
      ;(async () => {
        try {
          await getConversations()
          const convAfter = getConversationById(cid)
          if (convAfter) {
            syncConversationAfterMessage(cid, normalized)
            return
          }
        } catch (e) {
          // ignore failures to fetch conversations
        }

        // If still not found, insert a minimal conversation preview so the list shows it
        try {
          const unread = Number(unreadByConversation.get(cid) ?? 0)
          const preview = decorateConversation({ id: cid, lastMessage: normalized, unreadCount: unread })
          // avoid duplicating if another tab/process inserted it concurrently
          if (!conversations.value.find(c => String(c.id) === String(cid))) {
            conversations.value.unshift(preview)
          }
        } catch (err) {
          // swallow any error — non-fatal
        }
      })()
    }

    return normalized
  }

  // Called by presenceStore on SignalREvents.read event (other party read something)
  // New contract: payload may omit `userId` (server implies actor).
  // If `userId` is missing, treat it as server confirmation for the current user.
  function applyRemoteRead(conversationId, userId, lastSeenMessageId) {
    const cid = String(conversationId ?? '')
    const uid = userId != null ? String(userId) : null
    const msgId = Number(lastSeenMessageId)
    if (!cid || !Number.isFinite(msgId) || msgId <= 0) return

    const myId = _getCurrentUserId()
    if (uid === null || uid === myId) {
      // Either server didn't include userId (assume confirmation for us)
      // or the event explicitly belongs to current user.
      const prev = Number(myLastSeenByConversation.get(cid) ?? 0)
      if (msgId > prev) myLastSeenByConversation.set(cid, msgId)
      // When current user confirmed read, clear unread for active conv
      const prevUnread = Number(unreadByConversation.get(cid) ?? 0)
      if (prevUnread > 0) unreadByConversation.set(cid, 0)
    } else {
      // Other party read — advance otherLastSeen (only forward)
      const prev = Number(otherLastSeenByConversation.get(cid) ?? 0)
      if (msgId > prev) otherLastSeenByConversation.set(cid, msgId)
    }
  }

  // Internal: send Read via ChatHub (lazy import to avoid circular dep)
  function _sendReadForActiveConversation(cid, msgId) {
    // Sending to presence hub is now centralized in useReadTracker.
    // Keep optimistic local update here but do NOT call presenceStore.sendRead()
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

  // NOTE: no aliasing; use `markReadLocal` as canonical API

  function setMessage(msg) {
    if (!msg) return
    if (currentConversationId.value && String(msg.conversationId) !== String(currentConversationId.value)) return
    if (!msg.text && (!msg.attachments || !msg.attachments.length)) return
    const normalized = normalizeMessage(msg)
    if (!normalized) return

    const clientTag = normalized.clientTag != null ? String(normalized.clientTag) : null
    if (clientTag) {
      const key = findMessageKeyByClientTag(messagesMap, clientTag)
      if (key && key !== normalized.id) {
        const existing = messagesMap.get(key)
        messagesMap.delete(key)
        messagesMap.set(normalized.id, existing ? { ...existing, ...normalized } : normalized)
        return
      }
    }

    const existing = messagesMap.get(normalized.id)
    if (existing && (existing.status === 'sending' || existing.status === 'failed' || existing.status === 'editing')) {
      if (clientTag && String(existing.clientTag ?? '') === clientTag) {
        messagesMap.set(normalized.id, { ...existing, ...normalized })
      }
      return // don't overwrite optimistic local messages without a clientTag match
    }

    messagesMap.set(normalized.id, existing ? { ...existing, ...normalized } : normalized)
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

    const {
      timeoutMs: customTimeoutMs,
      signal: externalSignal = null,
      ...requestOptions
    } = options

    const controller = new AbortController()
    const timeoutMs = customTimeoutMs ?? (requestOptions.body instanceof FormData ? 120000 : 20000)
    const timeoutId = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null

    try {
      return await apiClient.request(url, {
        ...requestOptions,
        signal: externalSignal ?? controller.signal,
      })
    } catch (err) {
      error.value = err?.name === 'AbortError'
        ? `Превышено время ожидания ответа (${Math.round(timeoutMs / 1000)}s)`
        : toPublicErrorMessage(err, 'Ошибка загрузки чата')
      throw err
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      isLoading.value = false
    }
  }

  async function postMessage(url, { text = null, attachments = [], replyToMessageId = null, clientTag = null } = {}) {
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0
    const hasReply = replyToMessageId != null

    if (hasAttachments) {
      const multipartUrl = url.endsWith('/upload') ? url : `${url}/upload`
      const requestBody = {
        text: text ?? '',
        replyToMessageId: hasReply ? replyToMessageId : 0,
        clientTag: clientTag ?? undefined,
        files: attachments,
      }

      validateApiRequestBody('post', multipartUrl, requestBody)

      const buildForm = (nameVariant) => {
        const f = new FormData()
        if (text != null) {
          f.append('text', text)
        }
        f.append('replyToMessageId', String(hasReply ? replyToMessageId : 0))
        if (clientTag != null) f.append('clientTag', String(clientTag))
        attachments.forEach(file => f.append(nameVariant, file))
        return f
      }
      return fetchJSON(multipartUrl, { method: 'POST', headers: authHeaders(null), body: buildForm('files') })
    }

    const payload = validateApiRequestBody('post', url, {
      type: 'text',
      text: text ?? '',
      replyToMessageId: hasReply ? replyToMessageId : 0,
      clientTag: clientTag ?? undefined,
    })
    return fetchJSON(url, {
      method: 'POST',
      headers: authHeaders(),
      body: payload,
    })
  }

  let _getConversationsPromise = null

  async function getConversations() {
    if (_getConversationsPromise) return _getConversationsPromise
    _getConversationsPromise = (async () => {
      try {
        const data = await fetchJSON('/conversations', { headers: authHeaders() })
        const incoming = validateConversationListDto(data, { strict: true }).map(c => decorateConversation(c, c?.ad ?? null))
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
        conversations.value = sortConversationsByLastMessage(incoming)
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
    const clientTag = createClientTag()
    const myUserId = _getCurrentUserId()

    const optimistic = {
      id: tempId,
      conversationId: '',
      text: text ?? '',
      authorId: myUserId,
      createdAt: new Date().toISOString(),
      attachments: Array.isArray(attachments) ? attachments : [],
      status: 'sending',
      clientTag,
      ad: adIdVal != null ? { id: adIdVal } : null,
      _adId: adIdVal,
    }

    let shown = false
    const timer = setTimeout(() => {
      if (!findMessageKeyByClientTag(messagesMap, clientTag)) {
        messagesMap.set(tempId, optimistic)
        shown = true
      }
    }, OPTIMISTIC_DELAY)

    try {
      const response = await postMessage(`/conversations/by-ad/${adIdVal}/messages`, { text, attachments, clientTag })
      const message = normalizeMessage(validateMessageDto(response, { strict: false }))
      const conversationId = message?.conversationId || response?.conversation?.id || response?.conversation?.conversationId
      if (!conversationId) throw new Error('Invalid response from server')

      clearTimeout(timer)

      const existing = conversations.value.find(c => String(c.id) === String(conversationId))
      if (existing) {
        currentConversation.value = existing
      } else {
        currentConversation.value = decorateConversation(response?.conversation || { id: conversationId, ad: adIdVal != null ? { id: adIdVal } : null, unreadCount: 0 }, response?.ad || null)
        conversations.value.unshift(currentConversation.value)
      }
      currentConversationId.value = String(conversationId)
      if (message) {
        setMessage(message)
        try { syncConversationAfterMessage(conversationId, message) } catch {}
      }

      if (shown) messagesMap.delete(tempId)

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

    const clientTag = msg.clientTag ?? createClientTag()
    messagesMap.set(msg.id, { ...msg, clientTag, status: 'sending', error: null })

    const adIdVal = msg._adId
    const cid = msg.conversationId || currentConversationId.value

    try {
      let response
      if (adIdVal && !cid) {
        response = await postMessage(`/conversations/by-ad/${adIdVal}/messages`, { text: msg.text, attachments: msg.attachments, clientTag })
        const real = normalizeMessage(validateMessageDto(response, { strict: false }))
        const conversationId = real?.conversationId || response?.conversation?.id
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
        if (real) {
          setMessage(real)
          try { syncConversationAfterMessage(conversationId, real) } catch {}
        }
        if (msg.id !== real?.id) {
          messagesMap.delete(msg.id)
        }
        const id = real ? Number(real.id) : NaN
        if (!isNaN(id) && (lastKnownId.value === null || id > lastKnownId.value)) lastKnownId.value = id
        return conversationId ? { conversationId } : null
      } else {
        response = await postMessage(`/conversations/${cid}/messages`, { text: msg.text, attachments: msg.attachments, clientTag })
        const real = normalizeMessage(validateMessageDto(response, { strict: false }))
        if (real) {
          setMessage(real)
          try { syncConversationAfterMessage(cid, real) } catch {}
        }
        if (msg.id !== real?.id) {
          messagesMap.delete(msg.id)
        }
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

  // Clear active conversation (used on page unmount, logout, etc.)
  function clearActiveConversation() {
    currentConversationId.value = null
    currentConversation.value = null
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
    const response = validateConversationMessagesDto(await fetchJSON(url, { headers: authHeaders() }), { strict: true })

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
          companion: rawConv.companion ?? null,
          ad: rawConv.ad ?? null,
          lastMessage: rawConv.lastMessage ?? null,
          lastMessageAt: rawConv.lastMessageAt ?? null,
          firstUnreadMessageId: rawConv.firstUnreadMessageId ?? null,
          isClosed: rawConv.isClosed ?? false,
          isMuted: rawConv.isMuted ?? false,
          isArchived: rawConv.isArchived ?? false,
          totalMessagesCount: rawConv.totalMessagesCount ?? null,
        }
        const idx = conversations.value.findIndex(c => String(c.id) === String(conversationId))
        if (idx !== -1) conversations.value[idx] = currentConversation.value
        else conversations.value.unshift(currentConversation.value)
        if (currentConversationId.value !== requestedCid) return messages.value
        setMessages(normalized)
        anchorMessageId.value = response.anchorMessageId ?? null

        // Seed initial read state from HTTP — only if realtime hasn't set it yet
        _seedReadState(requestedCid, response)
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
    const sellerLast = response?.sellerLastSeenMessageId ?? null
    const buyerLast = response?.buyerLastSeenMessageId ?? null

    let myHttp = null
    let otherHttp = null

    if (sellerLast != null && buyerLast != null) {
      let currentUserId = null
      try { const su = JSON.parse(localStorage.getItem('user') || 'null'); currentUserId = su?.id ?? null } catch {}
      if (!currentUserId) {
        const payload = parseJwt(localStorage.getItem('token'))
        currentUserId = payload?.sub ?? null
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

  function applyConversationUpdated(payload) {
    const conversationSource = payload?.conversation ?? payload
    const validated = validateConversationDto(conversationSource, { strict: false })
    if (!validated) return null

    const normalized = decorateConversation(validated, validated?.ad ?? null)
    const cid = String(payload?.conversationId ?? normalized?.id ?? '')
    if (!normalized || !cid) return null

    normalized.id = normalized.id ?? cid

    const index = conversations.value.findIndex(item => String(item.id) === cid)
    const existingConversation = index === -1
      ? (String(currentConversation.value?.id ?? '') === cid ? currentConversation.value : null)
      : conversations.value[index]
    const merged = mergeConversationByFreshness(existingConversation, normalized) || normalized

    const existingUnread = unreadByConversation.get(cid)
    if (existingUnread != null) {
      merged.unreadCount = Number(existingUnread) || 0
      merged.hasUnread = merged.unreadCount > 0
    }

    if (index === -1) {
      conversations.value = sortConversationsByLastMessage([merged, ...conversations.value])
    } else {
      const next = [...conversations.value]
      next[index] = merged
      conversations.value = sortConversationsByLastMessage(next)
    }

    if (String(currentConversation.value?.id ?? '') === cid) {
      currentConversation.value = mergeConversationByFreshness(currentConversation.value, merged)
      if (existingUnread != null && currentConversation.value) {
        currentConversation.value.unreadCount = Number(existingUnread) || 0
        currentConversation.value.hasUnread = currentConversation.value.unreadCount > 0
      }
    }

    return conversations.value.find(item => String(item.id) === cid) || merged
  }

  function applyConversationCreated(payload) {
    return applyConversationUpdated(payload)
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
    const clientTag = createClientTag()
    const myUserId = _getCurrentUserId()

    const optimistic = {
      id: tempId,
      conversationId: String(cid),
      text: text ?? '',
      authorId: myUserId,
      createdAt: new Date().toISOString(),
      attachments: Array.isArray(attachments) ? attachments : [],
      status: 'sending',
      clientTag,
    }

    let shown = false
    const timer = setTimeout(() => {
      if (!findMessageKeyByClientTag(messagesMap, clientTag)) {
        messagesMap.set(tempId, optimistic)
        shown = true
      }
    }, OPTIMISTIC_DELAY)

    try {
      const response = await postMessage(`/conversations/${cid}/messages`, { text, attachments, clientTag })
      const real = normalizeMessage(validateMessageDto(response, { strict: false }))

      clearTimeout(timer)

      if (real) {
        setMessage(real)
        // Update conversation preview so conversations list reflects our sent message
        try { syncConversationAfterMessage(cid, real) } catch {}
      }

      if (shown) messagesMap.delete(tempId)

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
    const requestBody = validateApiRequestBody('patch', `/conversations/${conversationId}/messages/${messageId}`, patch)

    const updated = normalizeMessage(validateMessageDto(await fetchJSON(`/conversations/${conversationId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: authHeaders(),
      //body: JSON.stringify(requestBody),
    }), { strict: true }))
    updateMessage(messageId, updated)
    return updated
  }

  async function addMessageAttachments(conversationId, messageId, files) {
    if (!Array.isArray(files) || !files.length) return null
    const requestBody = validateApiRequestBody('post', `/conversations/${conversationId}/messages/${messageId}/attachments`, { files })
    const form = new FormData()
    requestBody.files.forEach(file => form.append('files', file))
    const updated = normalizeMessage(validateMessageDto(await fetchJSON(`/conversations/${conversationId}/messages/${messageId}/attachments`, {
      method: 'POST',
      headers: authHeaders(null),
      body: form,
    }), { strict: true }))
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
    })
    const cid = String(conversationId)
    if (String(currentConversation.value?.id ?? '') === cid) {
      currentConversation.value.isArchived = archived
      currentConversation.value.archived = archived
    }
    const conv = conversations.value.find(c => String(c.id) === cid)
    if (conv) { conv.isArchived = archived; conv.archived = archived }
  }

  async function markReadRemote(conversationId, lastSeenMessageId) {
    const cid = String(conversationId ?? '')
    const msgId = Number(lastSeenMessageId)
    if (!cid || !Number.isFinite(msgId) || msgId <= 0) return null

    return apiClient.patch(`/conversations/${cid}/read?lastSeenMessageId=${encodeURIComponent(String(msgId))}`, null, {
      errorHandlerOptions: { notify: false },
    })
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
    clearActiveConversation,
    // Message operations
    setMessage, updateMessage, removeMessage, clearMessages, setMessages, hasMessage,
    // Realtime handlers
    applyIncomingMessage,
    applyRemoteRead,
    applyConversationUpdated,
    applyConversationCreated,
    markReadLocal,
    markReadRemote,
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
