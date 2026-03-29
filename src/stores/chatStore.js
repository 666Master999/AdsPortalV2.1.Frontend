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
    : null

  return {
    ...message,
    text: message.text ?? null,
    attachments: attachments && attachments.length ? attachments : null,
    replyToMessageId: message.replyToMessageId ?? message.reply_to_message_id ?? null,
    isRead: Boolean(message.isRead),
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

export const useChatStore = defineStore('chat', () => {
  const conversations = ref([])
  const currentConversation = ref(null)
  const messages = ref([])
  const hasMore = ref(false)
  const isLoading = ref(false)
  const error = ref(null)

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
    return { conversationId: resolvedId, message }
  }

  async function loadConversation(conversationId, options = {}) {
    currentConversation.value = null
    messages.value = []
    hasMore.value = false
    let conv = conversations.value.find(c => String(c.id) === String(conversationId))
    if (!conv && !options.skipConversationsFetch) {
      await getConversations()
      conv = conversations.value.find(c => String(c.id) === String(conversationId)) || null
    }
    currentConversation.value = conv || decorateConversation({ id: conversationId })
    await loadMessages(conversationId)
    await markRead(conversationId)
    return currentConversation.value
  }

  async function loadMessages(conversationId, options = {}) {
    const beforeId = options.before ?? null
    const url = beforeId
      ? `/conversations/${conversationId}/messages?before=${beforeId}`
      : `/conversations/${conversationId}/messages`
    const response = await fetchJSON(url, { headers: authHeaders() })

    if (response && typeof response === 'object' && Array.isArray(response.messages)) {
      hasMore.value = Boolean(response.hasMore)
      if (beforeId) {
        messages.value = [...response.messages.map(normalizeMessage), ...messages.value]
      } else {
        const rawConv = { id: conversationId, ...(response.conversation || {}) }
        const decorated = decorateConversation(rawConv, response.ad || null)
        const existing = conversations.value.find(c => String(c.id) === String(conversationId))
        currentConversation.value = {
          ...(currentConversation.value || {}),
          ...decorated,
          lastMessageType: rawConv.lastMessageType ?? rawConv.last_message_type ?? existing?.lastMessageType ?? 0,
          lastMessageText: rawConv.lastMessageText ?? rawConv.last_message_text ?? existing?.lastMessageText ?? '',
        }
        const idx = conversations.value.findIndex(c => String(c.id) === String(conversationId))
        if (idx !== -1) conversations.value[idx] = currentConversation.value
        else conversations.value.unshift(currentConversation.value)
        messages.value = response.messages.map(normalizeMessage)
      }
      return messages.value
    }
    messages.value = Array.isArray(response) ? response.map(normalizeMessage) : []
    hasMore.value = false
    return messages.value
  }

  async function loadMoreMessages() {
    const oldestId = messages.value[0]?.id ?? null
    if (!oldestId) return
    await loadMessages(currentConversation.value?.id, { before: oldestId })
  }

  async function sendMessage(conversationId, text, attachments = []) {
    const message = normalizeMessage(await postMessage(`/conversations/${conversationId}/messages`, { text, attachments }))
    upsertMessage(messages.value, message)
    await markRead(conversationId)
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

  async function markRead(conversationId) {
    if (!conversationId) return
    const cid = String(conversationId)
    await fetchJSON(`/conversations/${conversationId}/read`, { method: 'PATCH', headers: authHeaders() }).catch(() => {})
    if (String(currentConversation.value?.id ?? '') === cid) currentConversation.value.unreadCount = 0
    const conv = conversations.value.find(item => String(item.id) === cid)
    if (conv) conv.unreadCount = 0
  }

  async function mute(conversationId, isMuted = true) {
    const updated = await fetchJSON(`/conversations/${conversationId}/mute`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ mute: isMuted }),
    })
    if (currentConversation.value?.id === conversationId) currentConversation.value.muted = updated.muted ?? isMuted
    return updated
  }

  async function archive(conversationId, archived = true) {
    const updated = await fetchJSON(`/conversations/${conversationId}/archive`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ archive: archived }),
    })
    if (currentConversation.value?.id === conversationId) currentConversation.value.archived = updated.archived ?? archived
    return updated
  }

  return {
    normalizeMessage,
    conversations, currentConversation, messages, hasMore, isLoading, error,
    getConversations, findConversationByAdId, loadConversation, loadMessages, loadMoreMessages,
    sendMessage, sendAttachments, sendMessageByAdId,
    editMessage, addMessageAttachment, addMessageAttachments,
    deleteMessage, markRead, mute, archive,
  }
})