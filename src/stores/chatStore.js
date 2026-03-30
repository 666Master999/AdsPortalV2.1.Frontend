import { defineStore } from 'pinia'
import { ref } from 'vue'
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
  const unreadCount = conversation.unreadCount
    ?? conversation.unreadMessagesCount
    ?? (conversation.hasUnread ? 1 : 0)

  return {
    ...conversation,
    id,
    adId: conversation.adId ?? conversation.relatedAdId ?? conversation.targetAdId ?? null,
    title: conversation.title || conversation.name || `Диалог #${id}`,
    last_message_at: conversation.last_message_at ?? conversation.lastMessageAt ?? conversation.lastMessageTimestamp ?? null,
    last_message_text: conversation.last_message_text ?? conversation.lastMessageText ?? null,
    unreadCount,
    muted: conversation.muted ?? conversation.isMuted ?? false,
    archived: conversation.archived ?? conversation.isArchived ?? false,
  }
}

export function normalizeMessage(message) {
  if (!message || typeof message !== 'object') return message

  const attachments = Array.isArray(message.attachments)
    ? message.attachments.filter(Boolean)
    : []

  return {
    ...message,
    text: message.text ?? null,
    attachments,
    replyToMessageId: message.replyToMessageId ?? message.reply_to_message_id ?? null,
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
  const opponent = n.opponent ?? null
  const counterpartName = opponent?.userName ?? opponent?.userLogin ?? n.counterpartName ?? 'Собеседник'
  const adTitle = ad?.title ?? n.ad?.title ?? n.adTitle ?? null
  return {
    ...n,
    adTitle,
    me: n.me ?? n.user ?? null,
    opponent,
    counterpartId: opponent?.id ?? null,
    counterpartName,
    counterpartLastActivityAt: opponent?.lastActivityAt ?? null,
    lastMessageType: n.lastMessageType ?? n.last_message_type ?? n.type ?? 0,
    lastMessageText: n.lastMessageText ?? n.last_message_text ?? '',
    roleLabel: 'Собеседник',
    displayTitle: n.title ?? counterpartName ?? 'нет данных',
    displaySubtitle: `Собеседник: ${counterpartName ?? 'нет данных'}`,
    displayMeta: (n.adId ? `Объявление #${n.adId}` : 'нет данных') + (adTitle ? ` · ${adTitle}` : ''),
  }
}

function upsertMessage(list, message) {
  if (!message) return
  const idx = list.findIndex(item => String(item.id) === String(message.id))
  if (idx === -1) list.push(message)
  else list[idx] = { ...list[idx], ...message }
}

function updateMessage(list, messageId, patch) {
  const idx = list.findIndex(m => String(m.id) === String(messageId))
  if (idx !== -1) list[idx] = { ...list[idx], ...patch }
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
  const currentConversation = ref(null)
  const messages = ref([])
  const hasMore = ref(false)
  const isLoading = ref(false)
  const error = ref(null)
  const lastKnownId = ref(null)
  const anchorMessageId = ref(null)
  const myLastSeenMessageId = ref(null)
  const otherLastSeenMessageId = ref(null)

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
        try { return await upload(buildForm('files[]')) } catch {
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
        conversations.value = getConversationListPayload(data).map(c => decorateConversation(normalizeConversation(c)))
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
    return conversations.value.find(c => `${c.adId}` === id || `${c.relatedAdId}` === id || `${c.targetAdId}` === id) || null
  }

  async function sendMessageByAdId(adId, text, attachments = []) {
    const response = await postMessage(`/conversations/by-ad/${adId}/messages`, { text, attachments })
    const message = normalizeMessage(response?.message || response?.data || response)
    const conversationId = response?.conversationId || response?.conversation?.id || response?.conversation?.conversationId || message?.conversationId
    if (!conversationId && !message?.conversationId && !response?.conversation && !response?.conversationId) throw new Error('Invalid response from server')
    const resolvedId = conversationId || message?.conversationId || adId
    const existing = conversations.value.find(c => String(c.id) === String(resolvedId))
    if (existing) {
      currentConversation.value = existing
    } else {
      currentConversation.value = decorateConversation(response?.conversation || response?.message?.conversation || { id: resolvedId, adId, unreadCount: 0 }, response?.ad || null)
      conversations.value.unshift(currentConversation.value)
    }
    upsertMessage(messages.value, message)
    const msgId = Number(message.id)
    if (!isNaN(msgId) && (lastKnownId.value === null || msgId > lastKnownId.value)) lastKnownId.value = msgId
    return { conversationId: resolvedId, message }
  }

  async function loadConversation(conversationId, options = {}) {
    currentConversation.value = null
    const prevMessages = messages.value.slice()
    messages.value = []
    hasMore.value = false
    lastKnownId.value = null
    anchorMessageId.value = null
    myLastSeenMessageId.value = null
    otherLastSeenMessageId.value = null
    let conv = conversations.value.find(c => String(c.id) === String(conversationId))
    if (!conv && !options.skipConversationsFetch) {
      await getConversations()
      conv = conversations.value.find(c => String(c.id) === String(conversationId)) || null
    }
    currentConversation.value = conv || decorateConversation({ id: conversationId })
    await loadMessages(conversationId, { ...options, prevMessages })
    return currentConversation.value
  }

  async function loadMessages(conversationId, options = {}) {
    const beforeId = options.before ?? null
    const sinceId = options.since ?? null
    const params = []
    if (beforeId) params.push(`before=${beforeId}`)
    if (sinceId) params.push(`since=${sinceId}`)
    if (options.count) params.push(`count=${options.count}`)
    const url = `/conversations/${conversationId}/messages` + (params.length ? '?' + params.join('&') : '')
    const response = await fetchJSON(url, { headers: authHeaders() })

    if (response && typeof response === 'object' && Array.isArray(response.messages)) {
      const normalized = response.messages.map(normalizeMessage)
      if (beforeId) {
        hasMore.value = Boolean(response.hasMore)
        const existingIds = new Set(messages.value.map(m => String(m.id)))
        const fresh = normalized.filter(m => !existingIds.has(String(m.id)))
        messages.value = [...fresh, ...messages.value]
      } else if (sinceId) {
        const existingIds = new Set(messages.value.map(m => String(m.id)))
        const fresh = normalized.filter(m => !existingIds.has(String(m.id)))
        messages.value.push(...fresh)
      } else {
        hasMore.value = Boolean(response.hasMore)
        const rawConv = { id: conversationId, ...(response.conversation || {}) }
        const decorated = decorateConversation(rawConv, response.ad || null)
        const existing = conversations.value.find(c => String(c.id) === String(conversationId))
        currentConversation.value = {
          ...(currentConversation.value || {}),
          ...decorated,
          // Preserve opponent/me/ad from existing if initial response is minimal
          opponent: decorated.opponent ?? currentConversation.value?.opponent ?? null,
          me: decorated.me ?? currentConversation.value?.me ?? null,
          ad: decorated.ad ?? currentConversation.value?.ad ?? null,
          adTitle: decorated.adTitle ?? currentConversation.value?.adTitle ?? null,
          counterpartId: decorated.counterpartId ?? currentConversation.value?.counterpartId ?? null,
          counterpartName: decorated.opponent ? decorated.counterpartName : (currentConversation.value?.counterpartName ?? decorated.counterpartName),
          counterpartLastActivityAt: decorated.counterpartLastActivityAt ?? currentConversation.value?.counterpartLastActivityAt ?? null,
          lastMessageType: rawConv.lastMessageType ?? rawConv.last_message_type ?? existing?.lastMessageType ?? 0,
          lastMessageText: rawConv.lastMessageText ?? rawConv.last_message_text ?? existing?.lastMessageText ?? '',
        }
        const idx = conversations.value.findIndex(c => String(c.id) === String(conversationId))
        if (idx !== -1) conversations.value[idx] = currentConversation.value
        else conversations.value.unshift(currentConversation.value)
        // Merge server snapshot with any existing client-only messages (drafts,
        // recently injected server messages) to avoid dropping them during a
        // concurrent reload. Normalized is authoritative; extras are preserved.
        const prevMessages = options.prevMessages ?? messages.value ?? []
        const normalizedMap = new Map(normalized.map(m => [String(m.id), m]))
        const extras = prevMessages.filter(m => !normalizedMap.has(String(m.id)))
        const merged = [...normalized, ...extras]
        merged.sort((a, b) => {
          const ai = Number(a.id)
          const bi = Number(b.id)
          const nai = Number.isFinite(ai) ? ai : Number.POSITIVE_INFINITY
          const nbi = Number.isFinite(bi) ? bi : Number.POSITIVE_INFINITY
          return nai - nbi
        })
        messages.value = merged
        anchorMessageId.value = response.anchorMessageId ?? null

        // Backend may provide role-specific last-seen fields: sellerLastSeenMessageId / buyerLastSeenMessageId
        const sellerLast = response?.sellerLastSeenMessageId ?? response?.sellerLastSeenId ?? null
        const buyerLast = response?.buyerLastSeenMessageId ?? response?.buyerLastSeenId ?? null
        if (sellerLast != null && buyerLast != null) {
          // Resolve current user id from local storage or token
          let currentUserId = null
          try { const su = JSON.parse(localStorage.getItem('user') || 'null'); currentUserId = su?.id ?? su?.userId ?? null } catch {}
          if (!currentUserId) {
            const payload = parseJwt(localStorage.getItem('token'))
            currentUserId = payload?.sub ?? payload?.id ?? payload?.userId ?? null
          }

          // Try to find seller/buyer ids in the conversation payload
          const sellerId = response?.conversation?.seller?.id ?? response?.conversation?.sellerId ?? currentConversation.value?.seller?.id ?? currentConversation.value?.sellerId ?? null
          const buyerId = response?.conversation?.buyer?.id ?? response?.conversation?.buyerId ?? currentConversation.value?.buyer?.id ?? currentConversation.value?.buyerId ?? null

          if (sellerId && String(sellerId) === String(currentUserId)) {
            myLastSeenMessageId.value = Number(sellerLast)
            otherLastSeenMessageId.value = Number(buyerLast)
          } else if (buyerId && String(buyerId) === String(currentUserId)) {
            myLastSeenMessageId.value = Number(buyerLast)
            otherLastSeenMessageId.value = Number(sellerLast)
          } else {
            // Unknown mapping — fallback to explicit fields if present
            myLastSeenMessageId.value = response.myLastSeenMessageId ?? null
            otherLastSeenMessageId.value = response.otherLastSeenMessageId ?? null
          }
        } else {
          myLastSeenMessageId.value = response.myLastSeenMessageId ?? null
          otherLastSeenMessageId.value = response.otherLastSeenMessageId ?? null
        }
      }
      const maxId = computeLastKnownId(messages.value)
      if (maxId !== null) lastKnownId.value = maxId
      return messages.value
    }
    messages.value = Array.isArray(response) ? response.map(normalizeMessage) : []
    hasMore.value = false
    const maxId = computeLastKnownId(messages.value)
    if (maxId !== null) lastKnownId.value = maxId
    return messages.value
  }

  async function loadMoreMessages() {
    const oldestId = messages.value[0]?.id ?? null
    if (!oldestId) return
    await loadMessages(currentConversation.value?.id, { before: oldestId })
  }

  async function loadNewMessages(conversationId) {
    const cid = conversationId || currentConversation.value?.id
    if (!cid || !lastKnownId.value) return
    await loadMessages(cid, { since: lastKnownId.value })
  }

  async function sendMessage(conversationId, text, attachments = []) {
    const message = normalizeMessage(await postMessage(`/conversations/${conversationId}/messages`, { text, attachments }))
    upsertMessage(messages.value, message)
    const id = Number(message.id)
    if (!isNaN(id) && (lastKnownId.value === null || id > lastKnownId.value)) lastKnownId.value = id
    return message
  }

  const sendAttachments = (conversationId, files, caption = null) => sendMessage(conversationId, caption, files)

  async function editMessage(conversationId, messageId, patch = {}) {
    const updated = normalizeMessage(await fetchJSON(`/conversations/${conversationId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    }))
    updateMessage(messages.value, messageId, updated)
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
    updateMessage(messages.value, messageId, updated)
    return updated
  }

  const addMessageAttachment = (conversationId, messageId, file) => addMessageAttachments(conversationId, messageId, [file])

  async function deleteMessage(conversationId, messageId) {
    const response = await fetchJSON(`/conversations/${conversationId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    updateMessage(messages.value, messageId, {
      deleted: true,
      deletedAt: response?.deletedAt || new Date().toISOString(),
      text: '',
    })
  }

  async function markRead(conversationId, lastSeenMessageId) {
    if (!conversationId || lastSeenMessageId == null) return
    const cid = String(conversationId)
    const numId = Number(lastSeenMessageId)
    if (isNaN(numId)) return

    // Safety: do not allow marking messages as read if they belong to the current user.
    // Compute current user id from localStorage or token payload.
    let currentUserId = null
    try { const storedUser = JSON.parse(localStorage.getItem('user') || 'null'); currentUserId = storedUser?.id ?? storedUser?.userId ?? null } catch {}
    if (!currentUserId) {
      const payload = parseJwt(localStorage.getItem('token'))
      currentUserId = payload?.sub ?? payload?.id ?? payload?.userId ?? null
    }

    if (currentUserId != null) {
      let maxIncoming = null
      for (const m of messages.value) {
        const authorId = String(m.authorId ?? m.senderId ?? m.author?.id ?? '')
        if (authorId && String(authorId) !== String(currentUserId)) {
          const idNum = Number(m.id)
          if (!isNaN(idNum) && (maxIncoming === null || idNum > maxIncoming)) maxIncoming = idNum
        }
      }
      // If there are no incoming messages at all, or requested lastSeen is beyond
      // the last incoming message, block the client-side read to avoid marking own messages.
      if (maxIncoming === null || numId > maxIncoming) {
        console.warn(`Blocked markRead: lastSeen ${numId} > maxIncoming ${maxIncoming}`)
        return
      }
    }

    await fetchJSON(`/conversations/${conversationId}/read?lastSeenMessageId=${lastSeenMessageId}`, { method: 'PATCH', headers: authHeaders() }).catch(() => {})
    if (!isNaN(numId) && (myLastSeenMessageId.value === null || numId > myLastSeenMessageId.value)) {
      myLastSeenMessageId.value = numId
    }
    if (String(currentConversation.value?.id ?? '') === cid) {
      currentConversation.value.unreadCount = 0
      currentConversation.value.hasUnread = false
    }
    const conv = conversations.value.find(item => String(item.id) === cid)
    if (conv) { conv.unreadCount = 0; conv.hasUnread = false }
  }

  async function mute(conversationId, isMuted = true) {
    await fetchJSON(`/conversations/${conversationId}/mute`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ mute: isMuted }),
    })
    const cid = String(conversationId)
    if (String(currentConversation.value?.id ?? '') === cid) {
      currentConversation.value.muted = isMuted
      currentConversation.value.isMuted = isMuted
    }
    const conv = conversations.value.find(c => String(c.id) === cid)
    if (conv) { conv.muted = isMuted; conv.isMuted = isMuted }
  }

  async function archive(conversationId, archived = true) {
    await fetchJSON(`/conversations/${conversationId}/archive`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ archive: archived }),
    })
    const cid = String(conversationId)
    if (String(currentConversation.value?.id ?? '') === cid) {
      currentConversation.value.archived = archived
      currentConversation.value.isArchived = archived
    }
    const conv = conversations.value.find(c => String(c.id) === cid)
    if (conv) { conv.archived = archived; conv.isArchived = archived }
  }

  return {
    normalizeMessage,
    conversations, currentConversation, messages, hasMore, isLoading, error,
    lastKnownId, anchorMessageId, myLastSeenMessageId, otherLastSeenMessageId,
    getConversations, findConversationByAdId, loadConversation, loadMessages, loadMoreMessages, loadNewMessages,
    sendMessage, sendAttachments, sendMessageByAdId,
    editMessage, addMessageAttachment, addMessageAttachments,
    deleteMessage, markRead, mute, archive,
  }
})