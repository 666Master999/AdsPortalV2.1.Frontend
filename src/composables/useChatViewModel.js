import { computed, shallowRef, watch } from 'vue'
import { useChatStore } from '../stores/chatStore'
import { useUserStore } from '../stores/userStore'
import { usePresenceStore } from '../stores/presenceStore'
import { useTypingStore } from '../stores/typingStore'
import { useAccessService } from '../services/accessService'
import { useProgressiveTimeAgo } from './useProgressiveTimeAgo'
import { chatTime, messageTime } from '../utils/formatDate'
import { getModerationStatusClass, getModerationStatusLabel, normalizeModerationStatus } from '../utils/moderationStatus'
import { resolveMediaUrl } from '../utils/resolveMediaUrl'

const IMG_RE = /\.(avif|bmp|gif|heic|jpeg|jpg|png|webp)$/i
const AUD_RE = /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav|weba)$/i
const VID_RE = /\.(m4v|mov|mp4|mpeg|mpg|ogv|webm)$/i

function isFileObject(obj) {
  return obj instanceof File || (obj && typeof obj === 'object' && typeof obj.name === 'string' && typeof obj.size === 'number')
}

function buildUrl(path) {
  if (!path) return null
  if (isFileObject(path)) return path._preview || null
  const rawPath = typeof path === 'string'
    ? path
    : path?.url || path?.path || path?.src || path?.filePath || path?.value || path?.contentUrl || path?.downloadUrl || null
  if (!rawPath) return null
  const normalized = String(rawPath).replace(/\\/g, '/')
  return normalized.startsWith('http') ? normalized : resolveMediaUrl(normalized)
}

function matchesType(pathOrFile, mimePrefix, extRe) {
  if (!pathOrFile) return false
  if (isFileObject(pathOrFile)) {
    return String(pathOrFile.type || '').startsWith(mimePrefix) || extRe.test(String(pathOrFile.name || ''))
  }
  if (typeof pathOrFile === 'object') {
    const typeStr = String(pathOrFile.type || pathOrFile.kind || '').toLowerCase()
    const contentTypeStr = String(
      pathOrFile.contentType ||
      pathOrFile.mimeType ||
      pathOrFile.metadata?.contentType ||
      pathOrFile.metadata?.mimeType ||
      ''
    ).toLowerCase()
    if (typeStr === 'image') return mimePrefix === 'image/'
    if (typeStr === 'video') return mimePrefix === 'video/'
    if (typeStr === 'audio') return mimePrefix === 'audio/'
    if (contentTypeStr.startsWith(mimePrefix)) return true
    const urlStr = String(pathOrFile.url || pathOrFile.path || pathOrFile.src || '')
    return extRe.test(urlStr.split('?')[0])
  }
  return extRe.test(String(pathOrFile).split('?')[0])
}

function isImageAttachment(pathOrFile) {
  return matchesType(pathOrFile, 'image/', IMG_RE)
}

function isAudioAttachment(pathOrFile) {
  return matchesType(pathOrFile, 'audio/', AUD_RE)
}

function isVideoAttachment(pathOrFile) {
  return matchesType(pathOrFile, 'video/', VID_RE)
}

function getAttachmentName(att) {
  if (isFileObject(att)) return att.name || 'Файл'
  if (att && typeof att === 'object') {
    if (att.name || att.fileName || att.filename || att.originalName) {
      return att.name || att.fileName || att.filename || att.originalName
    }
    const raw = String(att.url || att.path || att.src || att.filePath || att.value || '').split('?')[0].replace(/\\/g, '/')
    return raw.split('/').pop() || 'Файл'
  }
  const raw = String(att || '').split('?')[0].replace(/\\/g, '/')
  return raw.split('/').pop() || String(att || '')
}

function getAttachmentKey(att, index = 0) {
  try {
    if (isFileObject(att)) return `${att.name || ''}:${att.size || ''}:${att.lastModified || ''}`
    if (att && typeof att === 'object') return att.id ?? att.url ?? att.path ?? att.src ?? att.filePath ?? att.value ?? JSON.stringify(att)
    return String(att) || `index:${index}`
  } catch {
    return `index:${index}`
  }
}

function getAttachmentKind(att) {
  if (isImageAttachment(att)) return 'image'
  if (isVideoAttachment(att)) return 'video'
  if (isAudioAttachment(att)) return 'audio'
  return 'file'
}

function getAttachmentKindLabel(att) {
  const kind = getAttachmentKind(att)
  if (kind === 'image') return 'Изображение'
  if (kind === 'video') return 'Видео'
  if (kind === 'audio') return 'Аудио'
  return 'Файл'
}

function getAttachmentKindEmoji(att) {
  const kind = getAttachmentKind(att)
  if (kind === 'image') return '🖼️'
  if (kind === 'video') return '🎬'
  if (kind === 'audio') return '🎵'
  return '📄'
}

function getInitial(name, fallback = '?') {
  const src = (name || fallback || '?')
  return src[0].toUpperCase()
}

function getAuthorName(message) {
  return message?.author?.userName || message?.author?.userLogin || message?.authorName || null
}

function getAuthorAvatar(message) {
  return buildUrl(message?.author?.avatarPath)
}

function normalizeAttachment(att, messageId, index) {
  const key = getAttachmentKey(att, index)
  const kind = getAttachmentKind(att)
  return {
    raw: att,
    key,
    src: buildUrl(att),
    name: getAttachmentName(att),
    kind,
    kindLabel: getAttachmentKindLabel(att),
    kindEmoji: getAttachmentKindEmoji(att),
    isImage: kind === 'image',
    isVideo: kind === 'video',
    isAudio: kind === 'audio',
    domId: `message-${messageId}`,
  }
}

function normalizeConversationItem(conversation, isSelected = false) {
  if (!conversation || typeof conversation !== 'object') return null

  const id = String(conversation.id ?? conversation.conversationId ?? '')
  if (!id) return null

  const lastMessage = conversation.lastMessage ?? null
  const type = String(lastMessage?.type ?? conversation.lastMessageType ?? '').toLowerCase()
  const lastMessageText = lastMessage?.text ?? conversation.lastMessageText ?? ''
  const companionDisplay = conversation.companion?.name
    || conversation.companion?.userName
    || conversation.companion?.userLogin
    || conversation.companionName
    || `Разговор #${id}`
  const companionLogin = conversation.companion?.userLogin
    || conversation.companion?.userName
    || conversation.companionLogin
    || null
  const adDisplay = conversation.ad?.title || (conversation.ad?.id != null ? `Объявление #${conversation.ad.id}` : '')
  const previewLabel = type === 'image' || type === 'photo'
    ? '📷 Вложение'
    : type === 'file' || type === 'document'
      ? '📄 Вложение'
      : lastMessageText
  const previewUrl = (type === 'image' || type === 'photo') && lastMessageText ? buildUrl(lastMessageText) : null

  return {
    id,
    selected: Boolean(isSelected),
    title: adDisplay || companionDisplay,
    subtitle: companionDisplay,
    previewLabel,
    previewUrl,
    timeLabel: chatTime(conversation.lastMessageAt),
    unreadCount: Number(conversation.unreadCount ?? 0) || 0,
    isMuted: Boolean(conversation.isMuted ?? conversation.muted),
    isArchived: Boolean(conversation.isArchived ?? conversation.archived),
    companionId: conversation.companion?.id ?? null,
    companionLogin,
    avatarUrl: buildUrl(conversation.ad?.mainImagePath || conversation.ad?.image || conversation.mainImagePath || null),
    initial: getInitial(adDisplay || companionDisplay, id),
    source: conversation,
  }
}

function buildReadReceipt(message, currentUserId, myLastSeenMessageId, otherLastSeenMessageId) {
  const messageId = Number(message?.id)
  if (!Number.isFinite(messageId)) return { icon: '✓', cls: 'text-secondary' }

  const isOwn = Boolean(currentUserId && String(message?.authorId ?? '') === currentUserId)
  const boundary = isOwn ? otherLastSeenMessageId : myLastSeenMessageId
  const boundaryId = Number(boundary)
  const read = boundary != null && Number.isFinite(boundaryId) && messageId <= boundaryId
  return { icon: read ? '✓✓' : '✓', cls: read ? 'text-primary' : 'text-secondary' }
}

function buildMessageItem(message, context = {}, lookup = new Map()) {
  if (!message || typeof message !== 'object') return null

  const id = String(message.id ?? '')
  if (!id) return null

  const currentUserId = String(context.currentUserId ?? '')
  const authorId = String(message.authorId ?? message.author?.id ?? message.sender?.id ?? '')
  const isMine = Boolean(currentUserId && authorId === currentUserId)
  const status = String(message.status ?? 'sent')
  const isDraft = status === 'sending' || status === 'failed'
  const isBusy = status === 'sending' || status === 'editing'
  const attachments = Array.isArray(message.attachments) ? message.attachments.filter(Boolean) : []
  const normalizedAttachments = attachments.map((att, index) => normalizeAttachment(att, id, index))
  const mediaAttachments = normalizedAttachments.filter(item => item.isImage || item.isVideo)
  const audioAttachments = normalizedAttachments.filter(item => item.isAudio)
  const fileAttachments = normalizedAttachments.filter(item => !item.isImage && !item.isAudio && !item.isVideo)
  const replySource = message.replyToMessageId != null ? lookup.get(String(message.replyToMessageId)) ?? null : null
  const replyMessage = replySource
    ? {
        id: String(replySource.id ?? ''),
        authorName: getAuthorName(replySource) || 'Сообщение',
        previewText: replySource.text || (Array.isArray(replySource.attachments) && replySource.attachments.length ? 'Вложение' : 'Сообщение'),
      }
    : null
  const readReceipt = buildReadReceipt(message, currentUserId, context.myLastSeenMessageId, context.otherLastSeenMessageId)
  const bubbleClass = isBusy
    ? 'bg-warning-subtle text-body border-warning-subtle'
    : status === 'failed'
      ? 'bg-danger-subtle text-body border-danger-subtle'
      : isMine
        ? 'bg-white text-body border-primary-subtle'
        : 'bg-white border-white'

  return {
    id,
    domId: `message-${id}`,
    mediaKeyPrefix: `message-${id}:`,
    source: message,
    conversationId: String(message.conversationId ?? ''),
    text: message.text ?? '',
    authorId,
    authorName: getAuthorName(message),
    authorAvatarUrl: getAuthorAvatar(message),
    authorInitial: getInitial(getAuthorName(message) || authorId, '?'),
    isMine,
    isDraft,
    isBusy,
    isFailed: status === 'failed',
    status,
    deleted: Boolean(message.deleted),
    deletedAt: message.deletedAt ?? null,
    editedAt: message.editedAt ?? null,
    statusText: status === 'sending'
      ? 'Отправка...'
      : status === 'editing'
        ? 'Сохранение...'
        : status === 'failed'
          ? (message.error || 'Не удалось отправить')
          : '',
    timeLabel: messageTime(message.createdAt),
    edited: Boolean(message.edited || message.editedAt),
    bubbleClass,
    bubbleRadiusStyle: isMine
      ? 'border-bottom-right-radius: 0.2rem !important;'
      : 'border-bottom-left-radius: 0.2rem !important;',
    contentStyle: audioAttachments.length
      ? 'width: 100%; max-width: min(96vw, 520px);'
      : 'min-width: 140px; width: fit-content; max-width: min(82vw, 620px);',
    mediaAttachments,
    audioAttachments,
    fileAttachments,
    replyToMessageId: message.replyToMessageId ?? null,
    replyMessage,
    readReceipt,
    showReceipt: !isDraft,
    canEdit: !isDraft && !isBusy,
    canDelete: !isBusy,
    deleteLabel: isDraft ? 'Удалить черновик' : 'Удалить',
    actionsDisabled: Boolean(context.actionsDisabled),
  }
}

function buildMessageItems(messages = [], context = {}) {
  const lookup = new Map()
  for (const message of messages) {
    if (message && message.id != null) lookup.set(String(message.id), message)
  }

  const cacheKey = `${String(context.currentUserId ?? '')}:${context.actionsDisabled ? '1' : '0'}`
  const items = []
  const itemMap = new Map()
  for (const message of messages) {
    const id = String(message?.id ?? '')
    const previousItem = context.previousItemMap instanceof Map ? context.previousItemMap.get(id) : null
    const item = previousItem && previousItem.source === message && previousItem._cacheKey === cacheKey
      ? previousItem
      : buildMessageItem(message, context, lookup)
    if (item && item._cacheKey !== cacheKey) item._cacheKey = cacheKey
    if (item) items.push(item)
    if (item) itemMap.set(String(item.id), item)
  }

  return { items, lookup, itemMap }
}

function syncMessageReadReceipts(items = [], context = {}) {
  const currentUserId = String(context.currentUserId ?? '')
  const myLastSeenMessageId = context.myLastSeenMessageId ?? null
  const otherLastSeenMessageId = context.otherLastSeenMessageId ?? null
  let changed = false
  const nextItems = items.slice()

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (!item) continue
    const nextReceipt = buildReadReceipt(item.source, currentUserId, myLastSeenMessageId, otherLastSeenMessageId)
    if (!item.readReceipt || item.readReceipt.icon !== nextReceipt.icon || item.readReceipt.cls !== nextReceipt.cls) {
      nextItems[index] = { ...item, readReceipt: nextReceipt }
      changed = true
    }
  }

  return changed ? nextItems : items
}

export function useChatViewModel() {
  const chatStore = useChatStore()
  const userStore = useUserStore()
  const presenceStore = usePresenceStore()
  const typingStore = useTypingStore()
  const access = useAccessService()

  const activeConversationId = computed(() => String(chatStore.currentConversationId ?? ''))
  const currentUserId = computed(() => String(userStore.user?.id ?? userStore.tokenUserId ?? ''))
  const activeConversation = shallowRef(null)
  const displayedConversationId = shallowRef('')
  const messageItems = shallowRef([])
  const messageLookup = shallowRef(new Map())
  let previousMessageItemMap = new Map()
  const conversationCache = new Map()
  const messageCache = new Map()
  const myLastSeenMessageId = computed(() => chatStore.myLastSeenMessageId)
  const otherLastSeenMessageId = computed(() => chatStore.otherLastSeenMessageId)

  const conversationItems = computed(() => chatStore.conversations.map((conversation) => normalizeConversationItem(
    conversation,
    String(conversation?.id ?? '') === activeConversationId.value,
  )).filter(Boolean))

  const isConversationSyncing = computed(() => Boolean(activeConversationId.value) && displayedConversationId.value !== activeConversationId.value)

  watch(activeConversationId, () => {
    previousMessageItemMap = new Map()
  }, { immediate: true })

  watch(
    [activeConversationId, () => chatStore.currentConversation, () => chatStore.messages, () => chatStore.isLoading, currentUserId],
    () => {
      const cid = activeConversationId.value
      if (!cid) {
        displayedConversationId.value = ''
        activeConversation.value = null
        messageItems.value = []
        messageLookup.value = new Map()
        previousMessageItemMap = new Map()
        return
      }

      const currentConversation = chatStore.currentConversation
      const sameConversation = Boolean(currentConversation && String(currentConversation.id ?? '') === cid)
      const normalized = buildMessageItems(chatStore.messages, {
        currentUserId: currentUserId.value,
        myLastSeenMessageId: myLastSeenMessageId.value,
        otherLastSeenMessageId: otherLastSeenMessageId.value,
        actionsDisabled: displayedConversationId.value !== cid,
        previousItemMap: previousMessageItemMap,
      })
      const hasMessages = normalized.items.length > 0

      if (sameConversation && (hasMessages || !chatStore.isLoading)) {
        conversationCache.set(cid, currentConversation)
        messageCache.set(cid, normalized)
        displayedConversationId.value = cid
        activeConversation.value = currentConversation
        messageItems.value = normalized.items
        messageLookup.value = normalized.lookup
        previousMessageItemMap = normalized.itemMap
        return
      }

      const cachedConversation = conversationCache.get(cid) || chatStore.getConversationById(cid) || null
      const cachedMessages = messageCache.get(cid) || null
      if (cachedConversation && cachedMessages) {
        displayedConversationId.value = cid
        activeConversation.value = cachedConversation
        messageItems.value = cachedMessages.items
        messageLookup.value = cachedMessages.lookup
        previousMessageItemMap = cachedMessages.itemMap ?? new Map(cachedMessages.items.map(item => [String(item.id), item]))
        return
      }

      if (!sameConversation && cachedMessages) {
        displayedConversationId.value = cid
        activeConversation.value = cachedConversation
        messageItems.value = cachedMessages.items
        messageLookup.value = cachedMessages.lookup
        previousMessageItemMap = cachedMessages.itemMap ?? new Map(cachedMessages.items.map(item => [String(item.id), item]))
        return
      }

      if (sameConversation && !chatStore.isLoading && !hasMessages) {
        conversationCache.set(cid, currentConversation)
        messageCache.set(cid, normalized)
        displayedConversationId.value = cid
        activeConversation.value = currentConversation
        messageItems.value = []
        messageLookup.value = new Map()
        previousMessageItemMap = new Map()
      }
    },
    { immediate: true },
  )

  watch(
    [myLastSeenMessageId, otherLastSeenMessageId, currentUserId],
    () => {
      if (!messageItems.value.length) return
      if (displayedConversationId.value !== activeConversationId.value) return
      const nextItems = syncMessageReadReceipts(messageItems.value, {
        currentUserId: currentUserId.value,
        myLastSeenMessageId: myLastSeenMessageId.value,
        otherLastSeenMessageId: otherLastSeenMessageId.value,
      })
      if (nextItems !== messageItems.value) {
        messageItems.value = nextItems
        const currentCid = displayedConversationId.value
        const currentLookup = messageLookup.value
        const currentItemMap = new Map(nextItems.map(item => [String(item.id), item]))
        previousMessageItemMap = currentItemMap
        if (currentCid) {
          messageCache.set(currentCid, {
            items: nextItems,
            lookup: currentLookup,
            itemMap: currentItemMap,
          })
        }
      }
    },
    { immediate: true },
  )

  const displayedCompanion = computed(() => activeConversation.value?.companion ?? null)
  const companion = computed(() => {
    const user = displayedCompanion.value
    if (!user) return null
    return {
      id: user.id,
      name: user.name ?? user.userName ?? user.userLogin ?? null,
      avatar: buildUrl(user.avatarPath),
      userName: user.userName ?? null,
      userLogin: user.userLogin ?? null,
      lastActivityAt: user.lastActivityAt ? new Date(Date.parse(user.lastActivityAt) + 3 * 3600 * 1000).toISOString() : null,
      isOnline: user.isOnline ?? null,
    }
  })

  const adImageUrl = computed(() => buildUrl(activeConversation.value?.ad?.mainImagePath))
  const adLink = computed(() => activeConversation.value?.ad?.id ? `/ads/${activeConversation.value.ad.id}` : null)
  const moderation = computed(() => {
    const value = normalizeModerationStatus(activeConversation.value?.ad?.moderationStatus ?? activeConversation.value?.moderationStatus)
    return {
      label: getModerationStatusLabel(value) || 'не указан',
      cls: getModerationStatusClass(value),
    }
  })

  const typingUsers = computed(() => typingStore.getTypingUsers(displayedConversationId.value))
  const companionTyping = computed(() => typingUsers.value.length > 0)
  const companionDialogConversationId = computed(() => presenceStore.getUserDialogConversationId(companion.value?.id))
  const companionInDialog = computed(() => {
    const dialogConversationId = companionDialogConversationId.value
    const currentConversationId = String(displayedConversationId.value ?? '')
    return Boolean(dialogConversationId && currentConversationId && String(dialogConversationId) === currentConversationId)
  })
  const companionHasDialog = computed(() => Boolean(companionDialogConversationId.value))

  const companionLast = computed(() => presenceStore.getLastActivity(companion.value?.id) ?? companion.value?.lastActivityAt)
  const companionLastLabel = useProgressiveTimeAgo(companionLast, {
    prefix: 'Был(а) в сети ',
    strategy: 'messenger',
    online: computed(() => presenceStore.isOnline(companion.value?.id)),
    localLastSeen: computed(() => presenceStore.isOnline(companion.value?.id) ? null : presenceStore.getLastActivity(companion.value?.id)),
  })

  const lastSeenText = computed(() => {
    if (!presenceStore.isPresenceReady) return '...'
    if (companionTyping.value) return typingIndicatorText.value
    if (companionInDialog.value) return 'в диалоге'
    if (presenceStore.isOnline(companion.value?.id)) return 'в сети'
    const last = companionLast.value
    if (!last) return 'был(а) давно'
    return companionLastLabel.value
  })

  const lastSeenClass = computed(() => {
    if (!presenceStore.isPresenceReady) return 'text-secondary'
    if (companionTyping.value) return 'text-primary'
    if (companionInDialog.value) return ''
    if (presenceStore.isOnline(companion.value?.id)) return 'text-success'
    return 'text-secondary'
  })

  const typingIndicatorText = computed(() => {
    if (!typingUsers.value.length) return '8888'

    const names = typingUsers.value
      .map(item => String(item.userName ?? item.userId ?? '').trim())
      .filter(Boolean)

    if (!names.length) return '88888'
    if (names.length === 1) return `${names[0]} печатает...`
    return `${names.join(', ')} печатают...`
  })

  const targetUserId = computed(() => companion.value?.id ?? activeConversation.value?.companion?.id ?? null)
  const sendDisabledReason = computed(() => access.getSendMessageBlockedReason(targetUserId.value))

  function getMessageById(messageId) {
    return messageLookup.value.get(String(messageId ?? '')) ?? null
  }

  function getMessageItemById(messageId) {
    return getMessageById(messageId)
  }

  function getConversationItemById(conversationId) {
    return conversationCache.get(String(conversationId ?? '')) || chatStore.getConversationById(conversationId)
  }

  function clearConversationCache(conversationId) {
    const cid = String(conversationId ?? '')
    if (!cid) return false

    conversationCache.delete(cid)
    messageCache.delete(cid)

    if (String(displayedConversationId.value ?? '') === cid || String(activeConversationId.value ?? '') === cid) {
      displayedConversationId.value = ''
      activeConversation.value = null
      messageItems.value = []
      messageLookup.value = new Map()
      previousMessageItemMap = new Map()
    }

    return true
  }

  return {
    activeConversationId,
    activeConversation,
    displayedConversationId,
    isConversationSyncing,
    conversationItems,
    messageItems,
    messageLookup,
    companion,
    adImageUrl,
    adLink,
    moderation,
    typingUsers,
    companionTyping,
    companionDialogConversationId,
    companionInDialog,
    companionHasDialog,
    companionLast,
    companionLastLabel,
    lastSeenText,
    lastSeenClass,
    typingIndicatorText,
    sendDisabledReason,
    getMessageById,
    getMessageItemById,
    getConversationItemById,
    clearConversationCache,
  }
}

export {
  buildUrl,
  isFileObject,
  isImageAttachment,
  isAudioAttachment,
  isVideoAttachment,
  getAttachmentKey,
  getAttachmentName,
  getAttachmentKindLabel,
  getAttachmentKindEmoji,
  getInitial,
  normalizeConversationItem,
  buildMessageItem,
  buildMessageItems,
}
