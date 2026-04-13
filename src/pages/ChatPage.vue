<script setup>
import { ref, reactive, onBeforeUnmount, onUnmounted, watch, computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '../stores/chatStore'
import { useUserStore } from '../stores/userStore'
import { usePresenceStore } from '../stores/presenceStore'
import { useTypingStore } from '../stores/typingStore'
import { timeAgo, chatTime, messageTime } from '../utils/formatDate'
import { useProgressiveTimeAgo } from '@/composables/useProgressiveTimeAgo'
import { useReadTracker } from '../composables/useReadTracker'
import { useScrollManager } from '../composables/useScrollManager'
import { useMediaViewer } from '../composables/useMediaViewer'
import { useAccessService } from '../services/accessService'
import { handleApiError, toPublicErrorMessage } from '../services/errorService'
import { getModerationStatusClass, getModerationStatusLabel, normalizeModerationStatus } from '@/utils/moderationStatus'
import { resolveMediaUrl } from '../utils/resolveMediaUrl'
import { useChatViewModel } from '../composables/useChatViewModel'
import ChatConversationList from '../components/chat/ChatConversationList.vue'
import MessageItem from '../components/chat/MessageItem.vue'

const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()
const userStore = useUserStore()
const presenceStore = usePresenceStore()
const typingStore = useTypingStore()
const access = useAccessService()
const chatVm = useChatViewModel()

// Состояние чата и редактора сообщений.
const messagesContainer = ref(null)
const messageTextarea = ref(null)
const composerMode = ref('new') // 'new' | 'edit'
const composer = reactive({
  text: '',
  attachments: [],
  originalAttachments: null,
  messageId: null,
})
const pendingAdId = ref(null)
const readTracker = useReadTracker(messagesContainer, (msg) => {
  const idStr = String(msg?.id ?? '')
  const isTemp = idStr.startsWith('temp-') || idStr.startsWith('local-')
  const hasServerId = !isTemp && Number.isFinite(Number(idStr))
  return !msg?.isMine && hasServerId
}, chatVm.messageItems)
const scrollManager = useScrollManager(messagesContainer)

onUnmounted(() => {
  try { chatStore.clearActiveConversation && chatStore.clearActiveConversation() } catch (e) { /* ignore */ }
})

const conversationId = computed(() => route.params.conversationId || null)
const adId = computed(() => route.params.adId || null)
const isEditing = computed(() => composerMode.value === 'edit')
const isSidebarOpen = ref(false)
const currentUserId = computed(() => String(userStore.user?.id ?? userStore.tokenUserId ?? ''))
const isPendingConversation = computed(() => Boolean(pendingAdId.value && !chatStore.currentConversation?.id))
const targetUserId = computed(() => String(chatVm.companion.value?.id ?? chatVm.activeConversation.value?.companion?.id ?? ''))
const isConversationBlockedByMe = computed(() => userStore.isUserBlocked(targetUserId.value))
const isConversationBlockedByUser = computed(() => userStore.isBlockedByUser(targetUserId.value))
const messageItems = chatVm.messageItems
const isDeletingConversation = ref(false)

// Базовые URL-утилиты и определение типов вложений.
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

const IMG_RE = /\.(avif|bmp|gif|heic|jpeg|jpg|png|webp)$/i
const AUD_RE = /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav|weba)$/i
const VID_RE = /\.(m4v|mov|mp4|mpeg|mpg|ogv|webm)$/i

function matchesType(pathOrFile, mimePrefix, extRe) {
  if (!pathOrFile) return false
  if (isFileObject(pathOrFile))
    return String(pathOrFile.type || '').startsWith(mimePrefix) || extRe.test(String(pathOrFile.name || ''))
  // Handle { url, type } attachment objects from API
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

const isImageAttachment = (p) => matchesType(p, 'image/', IMG_RE)
const isAudioAttachment = (p) => matchesType(p, 'audio/', AUD_RE)
const isVideoAttachment = (p) => matchesType(p, 'video/', VID_RE)
const mediaViewer = useMediaViewer({ buildUrl, isVideoAttachment })
const brokenMedia = reactive({})
const movedNodes = new Map()

function getMediaErrorKey(message, attachment, index = 0) {
  const messagePrefix = message?.mediaKeyPrefix || `message-${message?.id ?? message?.source?.id ?? 'message'}:`
  const rawValue = attachment?.key
    ?? (isFileObject(attachment)
      ? `${attachment.name || ''}:${attachment.size || ''}:${attachment.lastModified || ''}`
      : attachment?.id ?? attachment?.url ?? attachment?.path ?? attachment?.src ?? attachment?.filePath ?? attachment?.value ?? attachment ?? '')
  return `${messagePrefix}${String(rawValue || index)}`
}

function markMediaBroken(message, attachment, index = 0) {
  brokenMedia[getMediaErrorKey(message, attachment, index)] = true
}

function clearBrokenMedia(message, attachment, index = 0) {
  delete brokenMedia[getMediaErrorKey(message, attachment, index)]
}

function isMediaBroken(message, attachment, index = 0) {
  return Boolean(brokenMedia[getMediaErrorKey(message, attachment, index)])
}


function getInitial(name, fallback = '?') {
  const src = (name || fallback || '?')
  return src[0].toUpperCase()
}

function autoResize(e) {
  const el = e?.target || messageTextarea.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

function resizeTextarea() {
  nextTick(() => autoResize())
}

function isMessageRead(msg) {
  const messageId = Number(msg?.id)
  if (Number.isNaN(messageId)) return false

  const boundary = isMine(msg)
    ? chatStore.otherLastSeenMessageId
    : chatStore.myLastSeenMessageId

  const boundaryId = Number(boundary)
  return boundary != null && !Number.isNaN(boundaryId) && messageId <= boundaryId
}

function getReceipt(msg) {
  const read = isMessageRead(msg)
  return { icon: read ? '✓✓' : '✓', cls: read ? 'text-primary' : 'text-secondary' }
}

const unreadDividerId = ref(null)

function findFirstUnreadIncomingMessageId(lastSeenMessageId = chatStore.myLastSeenMessageId, list = messageItems.value) {
  if (lastSeenMessageId == null) return null

  const lastSeenNum = Number(lastSeenMessageId)
  if (Number.isNaN(lastSeenNum)) return null

  for (const msg of list || []) {
    const messageId = Number(msg?.id)
    if (Number.isNaN(messageId) || msg?.isMine) continue
    if (messageId > lastSeenNum) return msg.id
  }

  return null
}

function captureUnreadDivider() {
  const id = findFirstUnreadIncomingMessageId()
  unreadDividerId.value = id
  scrollManager.firstUnreadId.value = id
}

function isMine(msg) {
  const msgAuthorId = String(msg.authorId ?? '')
  return currentUserId.value && msgAuthorId === currentUserId.value
}

function getAuthorName(msg) {
  return msg.author?.userName || msg.author?.userLogin || msg.authorName || null
}

function getAuthorAvatar(msg) {
  return buildUrl(msg.author?.avatarPath)
}

function convLastLabel(conv) {
  const lastMessage = conv?.lastMessage ?? null
  const type = String(lastMessage?.type ?? conv?.lastMessageType ?? '').toLowerCase()
  if (type === 'image' || type === 'photo') return '📷 Вложение'
  if (type === 'file' || type === 'document') return '📄 Вложение'
  return lastMessage?.text ?? conv?.lastMessageText ?? ''
}

function convPreviewUrl(conv) {
  const lastMessage = conv?.lastMessage ?? null
  const type = String(lastMessage?.type ?? conv?.lastMessageType ?? '').toLowerCase()
  const source = lastMessage?.text ?? conv?.lastMessageText ?? ''
  return (type === 'image' || type === 'photo') && source ? buildUrl(source) : null
}

function getReplyMessage(message) {
  if (!message?.replyToMessageId) return null
  return chatStore.messages.find(item => String(item.id) === String(message.replyToMessageId)) || null
}

function getMessageAttachments(msg) {
  return Array.isArray(msg?.attachments) ? msg.attachments.filter(Boolean) : []
}

function isOutgoingMessage(msg) {
  return msg?.status === 'sending' || msg?.status === 'failed'
}

function isMessageBusy(msg) {
  return msg?.status === 'sending' || msg?.status === 'editing'
}

function getMessageBubbleClass(msg) {
  if (msg?.status === 'sending' || msg?.status === 'editing')
    return 'bg-warning-subtle text-body border-warning-subtle'
  if (msg?.status === 'failed')
    return 'bg-danger-subtle text-body border-danger-subtle'
  return isMine(msg) ? 'bg-white text-body border-primary-subtle' : 'bg-white border-white'
}

function getMessagePreviewLabel(msg) {
  if (msg?.status === 'sending') return 'Отправка...'
  if (msg?.status === 'editing') return 'Сохранение...'
  if (msg?.status === 'failed') return msg.error || 'Не удалось отправить'
  return ''
}

function getMediaAttachments(msg) {
  return getMessageAttachments(msg).filter(att => isImageAttachment(att) || isVideoAttachment(att))
}

function getAudioAttachments(msg) {
  return getMessageAttachments(msg).filter(isAudioAttachment)
}

function getFileAttachments(msg) {
  return getMessageAttachments(msg).filter(att => !isImageAttachment(att) && !isAudioAttachment(att) && !isVideoAttachment(att))
}

function getAttachmentName(att) {
  if (isFileObject(att)) return att.name || 'Файл'
  if (att && typeof att === 'object') {
    if (att.name || att.fileName || att.filename || att.originalName)
      return att.name || att.fileName || att.filename || att.originalName
    const raw = String(att.url || att.path || att.src || att.filePath || att.value || '').split('?')[0].replace(/\\/g, '/')
    return raw.split('/').pop() || 'Файл'
  }
  const raw = String(att || '').split('?')[0].replace(/\\/g, '/')
  return raw.split('/').pop() || String(att || '')
}

function attachmentKey(att, index = 0) {
  try {
    if (isFileObject(att)) return `${att.name || ''}:${att.size || ''}:${att.lastModified || ''}`
    if (att && typeof att === 'object') return att.id ?? att.url ?? att.path ?? att.src ?? att.filePath ?? att.value ?? JSON.stringify(att)
    return String(att) || `index:${index}`
  } catch (e) {
    return `index:${index}`
  }
}

function getMessageContentStyle(msg) {
  return getAudioAttachments(msg).length ? 'width: 100%; max-width: min(96vw, 520px);' : 'min-width: 140px; width: fit-content; max-width: min(72%, 620px);'
}

const ATTACHMENT_META = { image: ['Изображение', '🖼️'], video: ['Видео', '🎬'], audio: ['Аудио', '🎵'], file: ['Файл', '📄'] }

function getAttachmentKind(att) {
  if (isImageAttachment(att)) return 'image'
  if (isVideoAttachment(att)) return 'video'
  if (isAudioAttachment(att)) return 'audio'
  return 'file'
}

function getAttachmentKindLabel(att) { return ATTACHMENT_META[getAttachmentKind(att)][0] }
function getAttachmentKindEmoji(att) { return ATTACHMENT_META[getAttachmentKind(att)][1] }

function setFilePreview(file) {
  try { if (file && !file._preview) file._preview = URL.createObjectURL(file) } catch {}
}

function revokeFilePreview(file) {
  try {
    if (file?._preview) {
      URL.revokeObjectURL(file._preview)
      try { delete file._preview } catch {}
    }
  } catch {}
}

function openMediaViewer(msg, index = 0) {
  const source = msg?.source ?? msg
  const media = Array.isArray(msg?.mediaAttachments) ? msg.mediaAttachments.map((att) => {
    const selector = `[data-msg-id="${msg.domId || `message-${source?.id}`}"] [data-att-key="${att.key}"]`
    const el = typeof document !== 'undefined' ? document.querySelector(selector) : null
    const srcFromEl = el ? (el.currentSrc || el.src || null) : null
    return { original: att.raw ?? att, src: srcFromEl || att.src || buildUrl(att.raw ?? att), node: el, key: att.key }
  }) : []
  mediaViewer.open(source, media, index)
  nextTick(() => {
    try {
      for (const m of media) {
        if (m.node && m.key) moveNodeToViewer(m.node, m.key)
      }
    } catch (e) { /* ignore */ }
  })
}

function moveNodeToViewer(node, key) {
  if (!node || !key) return
  try {
    if (movedNodes.has(key)) return
    const parent = node.parentNode
    const next = node.nextSibling
    const placeholder = document.createComment(`placeholder-${key}`)
    parent.insertBefore(placeholder, node)
    // find target slide container inside modal
    const modal = document.querySelector('.modal.d-block')
    const target = modal ? modal.querySelector(`[data-slide-key="${key}"]`) : null
    if (target) {
      target.appendChild(node)
      movedNodes.set(key, { node, parent, next, placeholder })
    } else {
      // fallback: leave in place and remove placeholder
      try { placeholder.remove() } catch {}
    }
  } catch (e) {
    // noop
  }
}

function restoreMovedNodes() {
  for (const [key, info] of Array.from(movedNodes.entries())) {
    try {
      const { node, parent, next, placeholder } = info
      if (!node) { movedNodes.delete(key); continue }
      if (next && next.parentNode === parent) parent.insertBefore(node, next)
      else parent.appendChild(node)
      try { placeholder.remove() } catch {}
    } catch (e) { /* ignore */ }
    movedNodes.delete(key)
  }
}

// restore nodes when viewer closes
watch(() => mediaViewer.message.value, (v, old) => {
  if (!v && old) {
    nextTick(() => restoreMovedNodes())
  }
})

function attachmentsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return a === b
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function resetComposer(options = {}) {
  composerMode.value = 'new'
  composer.text = ''
  if (options.revokePreviews !== false) {
    try { for (const att of composer.attachments || []) if (isFileObject(att)) revokeFilePreview(att) } catch {}
  }
  composer.attachments = []
  composer.originalAttachments = null
  composer.messageId = null
  resizeTextarea()
}

function cleanupMessagePreviews(message) {
  const source = message?.source ?? message
  try { for (const att of source?.attachments || []) if (isFileObject(att)) revokeFilePreview(att) } catch {}
}

async function sendNewMessage() {
  const text = composer.text
  const attachments = [...composer.attachments]
  attachments.forEach(setFilePreview)
  resetComposer({ revokePreviews: false })
  scrollManager.scrollToBottom()

  if (chatStore.currentConversationId) {
    await chatStore.sendMessage(text, attachments)
  } else if (pendingAdId.value || adId.value) {
    const result = await chatStore.sendMessageByAdId(pendingAdId.value || adId.value, text, attachments)
    if (result?.conversationId) {
      pendingAdId.value = null
      await router.replace(`/chat/${result.conversationId}`)
    }
  }
  scrollManager.scrollToBottom()
}

function startEdit(message) {
  const source = message?.source ?? message
  composerMode.value = 'edit'
  composer.text = source.text || ''
  composer.attachments = getMessageAttachments(source)
  composer.originalAttachments = getMessageAttachments(source)
  composer.messageId = source.id
  nextTick(() => { autoResize(); messageTextarea.value?.focus() })
}

function removeAttachment(index) {
  const [removed] = composer.attachments.splice(index, 1)
  if (isFileObject(removed)) revokeFilePreview(removed)
  resizeTextarea()
}

async function confirmEdit() {
  if (composerMode.value !== 'edit') return
  const cid = currentConv.value?.id || chatStore.currentConversationId
  if (!cid || !composer.messageId) return
  const original = chatVm.getMessageById(composer.messageId)?.source || chatVm.getMessageById(composer.messageId)
  const textChanged = composer.text !== (original?.text || '')
  const attachmentsChanged = !attachmentsEqual(composer.originalAttachments || [], composer.attachments)
  if (!textChanged && !attachmentsChanged) return resetComposer()

  const editId = String(composer.messageId)
  const setStatus = (s) => {
    chatStore.updateMessage(editId, { status: s })
  }
  setStatus('editing')
  try {
    const newFiles = (composer.attachments || []).filter(isFileObject)
    const serverAtts = (composer.attachments || []).filter(a => !isFileObject(a))
    const patch = {}
    if (textChanged) patch.text = composer.text
    if (!attachmentsEqual(composer.originalAttachments || [], serverAtts)) patch.attachments = serverAtts
    if (Object.keys(patch).length) await chatStore.editMessage(cid, composer.messageId, patch)
    if (newFiles.length) {
      await chatStore.addMessageAttachments(cid, composer.messageId, newFiles)
      newFiles.forEach(revokeFilePreview)
    }
    setStatus('sent')
    resetComposer()
  } catch (err) {
    setStatus('sent')
    throw err
  }
}

const cancelEdit = () => resetComposer()

async function retryMessage(message) {
  const source = message?.source ?? message
  if (source.status !== 'failed') return
  const result = await chatStore.retryMessage(source.id)
  if (result?.conversationId) {
    pendingAdId.value = null
    await router.replace(`/chat/${result.conversationId}`)
  }
  scrollManager.scrollToBottom()
}

async function removeMessage(message) {
  const source = message?.source ?? message
  if (source.status === 'sending' || source.status === 'failed') {
    cleanupMessagePreviews(source)
    return chatStore.removeMessage(source.id)
  }
  await chatStore.deleteMessage(currentConv.value?.id || chatStore.currentConversation?.id, source.id)
}

async function toggleMute() {
  if (currentConv.value?.id) await chatStore.mute(currentConv.value.id, !currentConv.value.isMuted)
}

async function toggleArchive() {
  if (currentConv.value?.id) await chatStore.archive(currentConv.value.id, !currentConv.value.isArchived)
}

async function syncCompanionBlockState() {
  const targetId = targetUserId.value
  if (!targetId) return

  if (isConversationBlockedByMe.value) return

  try {
    await userStore.fetchPublicProfile(targetId)
    userStore.setBlockedByUserId(targetId, false)
  } catch (err) {
    const apiError = await handleApiError(err, { notify: false, redirect: false })
    if (apiError?.status === 404 && !isConversationBlockedByMe.value) {
      userStore.setBlockedByUserId(targetId, true)
    }
  }
}

async function toggleBlockUser() {
  const targetId = targetUserId.value
  if (!targetId || isConversationSyncing.value || isDeletingConversation.value) return

  try {
    if (isConversationBlockedByMe.value) {
      await userStore.unblockUser(targetId)
    } else {
      await userStore.blockUser(targetId)
    }
    await syncCompanionBlockState()
  } catch (err) {
    const apiError = await handleApiError(err, { notify: false, redirect: false })
    chatStore.error = toPublicErrorMessage(apiError, isConversationBlockedByMe.value ? 'Ошибка разблокировки пользователя' : 'Ошибка блокировки пользователя')
  }
}

async function deleteConversation() {
  const cid = currentConv.value?.id || chatStore.currentConversationId
  if (!cid || isConversationSyncing.value || isDeletingConversation.value) return

  const title = currentConv.value?.companion?.name || currentConv.value?.ad?.title || `#${cid}`
  if (typeof window !== 'undefined' && !window.confirm(`Удалить диалог «${title}»?`)) return

  isDeletingConversation.value = true
  try {
    const itemsToCleanup = [...(messageItems.value || [])]
    await chatStore.deleteConversation(cid)
    for (const item of itemsToCleanup) cleanupMessagePreviews(item)
    chatVm.clearConversationCache(cid)
    unreadDividerId.value = null
    scrollManager.firstUnreadId.value = null
    readTracker.disconnectObserver()
    mediaViewer.close()
    resetComposer()
    await router.replace('/chat')
  } catch (err) {
    const apiError = await handleApiError(err, { notify: false })
    chatStore.error = toPublicErrorMessage(apiError, 'Ошибка удаления диалога')
  } finally {
    isDeletingConversation.value = false
  }
}

function selectConversation(id) { if (id) router.push(`/chat/${id}`) }

async function initChat() {
  try {
    const prevConvId = chatStore.currentConversationId || chatStore.currentConversation?.id
    if (prevConvId) await presenceStore.leaveConversation(prevConvId)
    unreadDividerId.value = null
    scrollManager.firstUnreadId.value = null
    readTracker.disconnectObserver()
    mediaViewer.close()
    if (!chatStore.conversations.length) await chatStore.getConversations()
    if (conversationId.value) {
      pendingAdId.value = null
      await chatStore.loadConversation(conversationId.value, { skipConversationsFetch: true })
      await syncCompanionBlockState()
      captureUnreadDivider()
      await presenceStore.joinConversation(conversationId.value)
      scrollManager.scrollToAnchorOrBottom(chatStore.anchorMessageId)
      // Expose store for quick debugging in DevTools console.
      try { window.__chatStore = chatStore } catch {}
      nextTick(() => readTracker.setupObserver())
      return
    }
    if (adId.value) {
      pendingAdId.value = null
      const existing = await chatStore.findConversationByAdId(adId.value)
      if (existing?.id) return router.replace(`/chat/${existing.id}`)
      pendingAdId.value = adId.value
      unreadDividerId.value = null
      scrollManager.firstUnreadId.value = null
      chatStore.currentConversation = { id: null, ad: { id: adId.value }, companion: null, lastMessage: null, lastMessageAt: null, unreadCount: 0, firstUnreadMessageId: null, isClosed: false, isMuted: false, isArchived: false, totalMessagesCount: 0 }
      chatStore.currentConversationId = null
      chatStore.clearMessages()
      return
    }
    pendingAdId.value = null
    chatStore.currentConversation = null
    chatStore.currentConversationId = null
    chatStore.clearMessages()
  } catch (err) {
    const apiError = await handleApiError(err, { notify: false })
    chatStore.error = toPublicErrorMessage(apiError, 'Ошибка загрузки чата')
  }
}

async function onSubmit() {
  if (!canSendMessage.value) {
    chatStore.error = sendDisabledReason.value || 'Отправка сообщений недоступна.'
    return
  }

  try {
    if (isEditing.value) {
      await confirmEdit()
    } else {
      await sendNewMessage()
    }
    chatStore.error = null
  } catch (err) {
    const apiError = await handleApiError(err, { notify: false })
    if (apiError?.status === 403) {
      const errorText = String(apiError?.message || apiError?.details || '').toLowerCase()
      if (userStore.isChatBanned || errorText.includes('chat_banned') || errorText.includes('chatban')) {
        chatStore.error = 'Вам запрещено отправлять сообщения'
      } else {
        if (targetUserId.value && !isConversationBlockedByMe.value) {
          userStore.setBlockedByUserId(targetUserId.value, true)
        }
        chatStore.error = 'Нельзя отправить сообщение — пользователь заблокирован'
      }
      return
    }
    chatStore.error = toPublicErrorMessage(apiError, 'Ошибка отправки сообщения')
  }
}

async function onAttach(e) {
  if (!canSendMessage.value) return

  const files = Array.from(e.target.files || [])
  try { e.target.value = '' } catch {}
  if (!files.length) return
  files.forEach(setFilePreview)
  composer.attachments = composerMode.value === 'edit' ? [...(composer.attachments || []), ...files] : files
  resizeTextarea()
}

async function loadMore() {
  const container = messagesContainer.value
  const prevH = container?.scrollHeight ?? 0
  try {
    await chatStore.loadMoreMessages()
  } catch (err) {
    const apiError = await handleApiError(err, { notify: false })
    chatStore.error = toPublicErrorMessage(apiError, 'Ошибка загрузки чата')
    return
  }
  await nextTick()
  if (container) container.scrollTop = container.scrollHeight - prevH
}

watch([() => route.params.conversationId, () => route.params.adId], initChat, { immediate: true })

watch(() => messageItems.value.length, () => {
  nextTick(() => readTracker.observeMessages())
})

watch(() => chatStore.lastKnownId, (newId, oldId) => {
  if (newId && oldId && Number(newId) > Number(oldId)) {
    nextTick(() => {
      const newestMessage = messageItems.value[messageItems.value.length - 1] || null
      const isOwn = newestMessage ? newestMessage.isMine : true
      scrollManager.onNewMessageArrived(newestMessage?.id, isOwn)
      if (!scrollManager.isAtBottom.value && !unreadDividerId.value && newestMessage && !isOwn) {
        unreadDividerId.value = newestMessage.id
      }
    })
  }
})

onBeforeUnmount(() => {
  const prevConvId = chatStore.currentConversationId || chatStore.currentConversation?.id
  if (prevConvId) presenceStore.leaveConversation(prevConvId)
  readTracker.cleanup()
  try { delete window.__chatStore } catch {}
  for (const item of messageItems.value || []) cleanupMessagePreviews(item)
  mediaViewer.close()
  try { for (const att of composer.attachments || []) if (isFileObject(att)) revokeFilePreview(att) } catch {}
})

// Производные данные для шапки, карточки объявления и модерации.
const currentConv = chatVm.activeConversation
const selectedConversationId = computed(() => String(route.params.conversationId || ''))
const isConversationSelected = computed(() => Boolean(selectedConversationId.value || isPendingConversation.value))
const conversationItems = chatVm.conversationItems
const adImageUrl = chatVm.adImageUrl
const adLink = chatVm.adLink
const moderation = chatVm.moderation
const companion = chatVm.companion
const companionTyping = chatVm.companionTyping
const companionDialogConversationId = chatVm.companionDialogConversationId
const companionInDialog = chatVm.companionInDialog
const companionHasDialog = chatVm.companionHasDialog
const typingIndicatorText = chatVm.typingIndicatorText
const lastSeenText = chatVm.lastSeenText
const lastSeenClass = chatVm.lastSeenClass
const isConversationSyncing = chatVm.isConversationSyncing
const sendDisabledReason = computed(() => (isPendingConversation.value ? null : chatVm.sendDisabledReason.value))
const canSendMessage = computed(() => (isPendingConversation.value ? true : !isConversationSyncing.value && !sendDisabledReason.value))

function onTextareaInput(e) {
  autoResize(e)
  const cid = chatStore.currentConversationId || chatStore.currentConversation?.id
  if (cid) presenceStore.handleTypingInput(cid)
}

</script>

<template>
  <div class="h-100 d-flex flex-column" style="min-height: 0;">
  <div class="container-fluid px-3 px-lg-4 py-3 py-lg-4 d-flex flex-column" style="flex: 1; min-height: 0;">
    <div class="mx-auto w-100 rounded-5 border bg-body-tertiary shadow-lg d-flex flex-column" style="max-width: 1280px; flex: 1; min-height: 0;">
      <div class="d-flex flex-column flex-lg-row flex-grow-1 gap-3 p-3 p-lg-4" style="min-height: 0;">
        <!-- Список диалогов слева. -->
        <aside
          class="d-flex flex-column bg-white rounded-4 shadow-sm overflow-hidden"
          style="flex: 0 0 100%; min-width: 320px; max-width: 420px; min-height: 0;"
          :class="isConversationSelected ? 'd-none d-lg-flex' : 'd-flex'"
        >
          <!-- Заголовок и счётчик чатов. -->
          <div class="px-3 px-lg-4 py-3 border-bottom bg-white d-flex align-items-center justify-content-between ">
            <div>
              <div class="small text-uppercase text-secondary fw-semibold mb-1 ">Messages</div>
              <h1 class="h5 mb-0">Чаты</h1>
            </div>
            <span class="badge rounded-pill text-bg-light border text-secondary">{{ chatStore.conversations.length }}</span>
          </div>

          <ChatConversationList
            class="flex-grow-1"
            :items="conversationItems"
            :loading="chatStore.isLoading"
            :error="chatStore.error || ''"
            @select="selectConversation"
          />
        </aside>

        <section
          class="d-flex flex-column bg-white rounded-4 shadow-sm flex-grow-1 overflow-hidden"
          style="min-width: 0; min-height: 0;"
          :class="isConversationSelected ? 'd-flex' : 'd-none d-lg-flex'"
        >
          <!-- Активный диалог или заглушка без выбранного чата. -->
          <div v-show="currentConv || isPendingConversation" class="d-flex flex-column h-100">
            <!-- Шапка диалога с собеседником и действиями. -->
            <div v-if="currentConv" class="bg-white border-bottom px-3 px-lg-4 py-3 d-flex align-items-start justify-content-between gap-3">
              <button class="btn d-lg-none me-2" type="button" @click="isSidebarOpen = true">☰</button>
              <component :is="companion?.id ? 'router-link' : 'div'" :to="companion?.id ? `/users/${companion.id}` : null" class="d-flex align-items-center gap-3 text-decoration-none text-body min-w-0">
                <div class="rounded-circle overflow-visible flex-shrink-0 bg-body-secondary border d-flex align-items-center justify-content-center" style="width: 44px; height: 44px; position: relative;">
                  <img v-if="companion?.avatar" v-intersect-lazy="companion.avatar" class="w-100 h-100" style="object-fit: cover;" alt="">
                  <span v-else class="fw-semibold text-secondary">{{ getInitial(companion?.name, '') }}</span>
                    <span
                      :style="{
                        position: 'absolute',
                        right: '-2px',
                        bottom: '-2px',
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        border: '2px solid #fff',
                        background: companionHasDialog
                          ? '#6f42c1'      // фиолетовый — в диалоге
                          : presenceStore.isOnline(companion?.id)
                            ? '#198754'    // зелёный — онлайн
                            : '#adb5bd',    // серый — оффлайн
                        transform: companionHasDialog || presenceStore.isOnline(companion?.id)
                          ? 'scale(1.15)'    // чуть увеличивается когда активный
                          : 'scale(1)',
                        transition: 'background-color 0.25s ease, transform 0.25s ease'
                      }"
                    ></span>

                </div>
                <div class="min-w-0">
                  <div class="fw-semibold text-truncate">{{ companion?.name }}</div>
                  <div class="small text-truncate" :class="lastSeenClass">{{ lastSeenText }}</div>
                </div>
              </component>

              <div class="dropdown flex-shrink-0">
                <button class="btn btn-link p-0 text-secondary text-decoration-none" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Действия">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
                  </svg>
                </button>
                <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0">
                  <li><button class="dropdown-item" type="button" :disabled="isConversationSyncing" @click="toggleMute">{{ currentConv?.isMuted ? 'Включить уведомления' : 'Выключить уведомления' }}</button></li>
                  <li><button class="dropdown-item" type="button" :disabled="isConversationSyncing" @click="toggleArchive">{{ currentConv?.isArchived ? 'Разархивировать' : 'Архивировать' }}</button></li>
                  <li><button class="dropdown-item text-danger" type="button" :disabled="isConversationSyncing || isDeletingConversation || !targetUserId" @click="toggleBlockUser">{{ isConversationBlockedByMe ? 'Разблокировать пользователя' : 'Заблокировать пользователя' }}</button></li>
                  <li><hr class="dropdown-divider"></li>
                  <li><button class="dropdown-item text-danger" type="button" :disabled="isConversationSyncing || isDeletingConversation" @click="deleteConversation">Удалить диалог</button></li>
                </ul>
              </div>
            </div>

            <!-- Карточка объявления, если чат привязан к ad. -->
            <div v-if="currentConv?.ad?.title" class="bg-white border-bottom px-3 px-lg-4 py-3 d-flex align-items-center gap-3">
              <component :is="adLink ? 'router-link' : 'div'" :to="adLink" class="rounded-4 overflow-hidden bg-body-secondary border flex-shrink-0 text-decoration-none" style="width: 52px; height: 52px;">
                <img v-if="adImageUrl" v-intersect-lazy="adImageUrl" class="w-100 h-100" style="object-fit: cover;" alt="item">
              </component>
              <div class="min-w-0 flex-grow-1 d-flex align-items-center justify-content-between gap-3">
                <div class="min-w-0">
                  <component :is="adLink ? 'router-link' : 'div'" :to="adLink" class="d-block fw-semibold text-truncate text-body text-decoration-none">{{ currentConv?.ad?.title }}</component>
                  <div class="small text-secondary">{{ currentConv?.ad?.price != null ? currentConv?.ad?.price + ' р.' : 'Цена не указана' }}</div>
                </div>
                <span class="badge rounded-pill" :class="moderation.cls">{{ moderation.label }}</span>
              </div>
            </div>

            <!-- Лента сообщений и вложений. -->
            <div ref="messagesContainer" @scroll.passive="scrollManager.updateScrollState" class="flex-grow-1 overflow-auto p-3 p-lg-4" style="min-height: 0; background: linear-gradient(180deg, rgba(248,249,250,1) 0%, rgb(236, 240, 244) 100%); padding-bottom: clamp(120px, 18vh, 220px);">
              <div v-if="chatStore.error" class="alert alert-danger mb-3">{{ chatStore.error }}</div>
              <div v-if="chatStore.hasMore" class="text-center mb-3">
                <button class="btn btn-outline-secondary btn-sm rounded-pill px-3" :disabled="chatStore.isLoading" @click="loadMore">
                  <span v-if="chatStore.isLoading" class="spinner-border spinner-border-sm me-1" role="status"></span>
                  Загрузить ещё
                </button>
              </div>

              <div v-if="isConversationSyncing && !messageItems.length" class="h-100 d-flex align-items-center justify-content-center text-center text-secondary py-5">
                <div>
                  <div class="spinner-border text-secondary mb-3" role="status"></div>
                  <div class="small">Загрузка...</div>
                </div>
              </div>

              <div v-else-if="!messageItems.length" class="h-100 d-flex align-items-center justify-content-center text-center text-secondary">
                <div v-show="!(currentConv || isPendingConversation)" class="d-flex align-items-center justify-content-center text-center text-secondary px-4">
                  <div class="bg-white border rounded-5 shadow-sm p-4 p-lg-5" style="max-width: 440px;">
                    <div class="fw-semibold h6 mb-2">Выберите диалог</div>
                    <p class="mb-0 small text-secondary">Слева отображается список чатов. Нажмите на любой диалог, чтобы открыть переписку.</p>
                  </div>
                </div>
              </div>

              <template v-else>
                <template v-for="msg in messageItems" :key="msg.id">
                  <div v-if="String(msg.id) === String(unreadDividerId)" class="d-flex align-items-center gap-2 mb-3">
                    <div class="flex-grow-1" style="border-top: 2px solid var(--bs-primary);"></div>
                    <small class="text-primary fw-semibold flex-shrink-0">Новые сообщения</small>
                    <div class="flex-grow-1" style="border-top: 2px solid var(--bs-primary);"></div>
                  </div>
                  <MessageItem
                    :msg="msg"
                    :broken-media="brokenMedia"
                    :actions-disabled="isConversationSyncing"
                    @open-media="({ message, index }) => openMediaViewer(message, index)"
                    @jump-to-reply="scrollManager.scrollToMessage"
                    @retry="retryMessage"
                    @edit="startEdit"
                    @delete="removeMessage"
                    @media-loaded="clearBrokenMedia($event.message, $event.attachment)"
                    @media-error="markMediaBroken($event.message, $event.attachment)"
                  />
                </template>
              </template>

              <div v-if="scrollManager.hasNewBelow.value || !scrollManager.isAtBottom.value" class="text-center" style="position: sticky; bottom: 8px; z-index: 5;">
                <button type="button" class="btn btn-primary btn-sm rounded-pill shadow px-3" @click="scrollManager.scrollToUnreadOrBottom()">
                  ↓ {{ scrollManager.hasNewBelow.value ? 'Новые сообщения' : 'Вниз' }}
                </button>
              </div>
            </div>

            <!-- Панель отправки и редактирования сообщения. -->
            <div v-show="currentConv" class="bg-white border-top p-3 p-lg-4" style="position: sticky; bottom: 0; z-index: 4;">
              <div v-if="companionTyping" class="small text-primary mb-2 d-flex align-items-center gap-2">
                <span class="spinner-grow spinner-grow-sm" style="width: 0.5rem; height: 0.5rem;" role="status"></span>
                {{ typingIndicatorText }}
              </div>
              <div v-if="sendDisabledReason" class="alert alert-warning py-2 px-3 mb-3">
                {{ sendDisabledReason }}
              </div>
              <div v-if="composerMode === 'edit'" class="d-flex align-items-center justify-content-between gap-3 rounded-4 border bg-warning-subtle px-3 py-2 mb-3 small">
                <span class="text-secondary">✏️ Редактирование сообщения</span>
                <button type="button" class="btn-close btn-sm" @click="cancelEdit"></button>
              </div>
              <div v-if="composer.attachments.length" class="d-flex flex-wrap gap-2 mb-3" style="max-height: clamp(120px, 30vh, 320px); overflow:auto;">
                <template v-for="(att, index) in composer.attachments" :key="attachmentKey(att, index)">
                  <div v-if="isImageAttachment(att)" class="position-relative overflow-hidden border border-white border-opacity-10 shadow-sm" style="width: 104px; aspect-ratio: 1 / 1; border-radius: 1rem; background: linear-gradient(180deg, rgba(15, 16, 18, 1) 0%, rgba(8, 9, 11, 1) 100%);">
                    <img :src="buildUrl(att)" class="w-100 h-100 d-block" style="object-fit: cover;" alt="">
                    <button type="button" class="btn btn-dark btn-sm position-absolute top-0 end-0 m-2 rounded-circle border-0 d-inline-flex align-items-center justify-content-center shadow-sm" style="width: 26px; height: 26px; line-height: 1; font-size: 0.8rem;" @click="removeAttachment(index)" title="Удалить изображение">×</button>
                  </div>
                  <div v-else-if="isVideoAttachment(att)" class="position-relative overflow-hidden border bg-body-tertiary rounded-3 shadow-sm" style="width: 180px; height: 120px;">
                    <video :src="buildUrl(att)" class="w-100 h-100" controls preload="metadata" playsinline style="border-radius: .6rem; object-fit: cover; background: #000"></video>
                    <button type="button" class="btn btn-dark btn-sm position-absolute top-0 end-0 m-2 rounded-circle border-0 d-inline-flex align-items-center justify-content-center shadow-sm" style="width: 26px; height: 26px; line-height: 1; font-size: 0.8rem;" @click="removeAttachment(index)" title="Удалить видео">×</button>
                  </div>
                  <div v-else-if="isAudioAttachment(att)" class="w-100 min-w-0 overflow-hidden bg-white border border-light-subtle rounded-5 p-2 shadow-sm d-flex flex-column gap-2">
                    <div class="d-flex align-items-center gap-2 min-w-0 overflow-hidden">
                      <span class="flex-shrink-0 rounded-circle bg-primary-subtle text-primary d-inline-flex align-items-center justify-content-center border-0 shadow-sm" style="width: 40px; height: 40px; opacity: 0.7">{{ getAttachmentKindEmoji(att) }}</span>
                      <div class="min-w-0 flex-grow-1 overflow-hidden">
                        <div class="fw-semibold text-truncate d-block" :title="getAttachmentName(att)">{{ getAttachmentName(att) }}</div>
                        <div class="small text-secondary text-truncate d-block">{{ getAttachmentKindLabel(att) }}</div>
                      </div>
                      <button type="button" class="btn btn-sm btn-outline-secondary rounded-circle flex-shrink-0 d-inline-flex align-items-center justify-content-center" style="width: 28px; height: 28px;" @click="removeAttachment(index)" title="Удалить аудио">×</button>
                    </div>
                    <audio :src="buildUrl(att)" controls preload="metadata" class="w-100 d-block"></audio>
                  </div>
                  <div v-else class="badge text-bg-light border text-body rounded-pill d-inline-flex align-items-center gap-2 px-3 py-2">
                    <span class="text-truncate" style="max-width: 180px;">{{ getAttachmentName(att) }}</span>
                    <button type="button" class="btn btn-sm p-0 border-0 text-secondary" @click="removeAttachment(index)" title="Удалить файл">×</button>
                  </div>
                </template>
              </div>

              <form @submit.prevent="onSubmit" class="d-flex align-items-end gap-2 gap-lg-3">
                <label
                  class="btn btn-light border rounded-circle flex-shrink-0 mb-0 d-inline-flex align-items-center justify-content-center"
                  :class="!canSendMessage ? 'disabled opacity-50' : ''"
                  :title="!canSendMessage ? sendDisabledReason : (isEditing ? 'Прикрепить изображение' : 'Прикрепить файл')"
                  style="width: 44px; height: 44px;"
                >
                  📎
                  <input type="file" multiple @change="onAttach" class="d-none" :disabled="!canSendMessage" />
                </label>
                <textarea
                  ref="messageTextarea"
                  v-model="composer.text"
                  class="form-control bg-body-tertiary border-0 rounded-4 flex-grow-1 px-3 py-2"
                  rows="1"
                  :placeholder="canSendMessage ? 'Написать сообщение...' : 'Отправка недоступна'"
                  style="resize: none; overflow-y: auto; min-height: 44px; max-height: 140px;"
                  @keydown.enter.exact.prevent="onSubmit"
                  @input="onTextareaInput"
                  :disabled="!canSendMessage"
                ></textarea>
                <button
                  type="submit"
                  class="btn btn-primary rounded-circle flex-shrink-0 d-inline-flex align-items-center justify-content-center"
                  style="width: 44px; height: 44px;"
                  :disabled="!canSendMessage"
                >
                  &#10148;
                </button>
              </form>
            </div>
          </div>
          
        </section>
      </div>
    </div>
  </div>

  <div class="d-lg-none">
    <div
      v-if="isSidebarOpen"
      class="position-fixed top-0 start-0 w-100 h-100"
      style="background: rgba(0,0,0,0.35); z-index: 1040;"
      @click="isSidebarOpen = false"
    ></div>

    <div
      class="position-fixed top-0 start-0 h-100 bg-white shadow d-flex flex-column"
      :style="{
        width: '280px',
        zIndex: 1050,
        transform: isSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease'
      }"
    >
      <div class="px-3 py-3 border-bottom d-flex align-items-center justify-content-between">
        <div class="fw-semibold">Чаты</div>
        <button class="btn-close" type="button" @click="isSidebarOpen = false"></button>
      </div>

      <ChatConversationList
        class="flex-grow-1"
        :items="conversationItems"
        :loading="chatStore.isLoading"
        :error="chatStore.error || ''"
        @select="(id) => { selectConversation(id); isSidebarOpen = false }"
      />
    </div>
  </div>

  <div
    v-if="mediaViewer.message.value && mediaViewer.attachments.value.length"
    class="modal d-block"
    tabindex="-1"
    style="background: rgba(10, 15, 25, 0.68); backdrop-filter: blur(12px);"
    @click.self="mediaViewer.close"
  >
    <!-- Модальное окно просмотра изображения. -->
    <div class="modal-dialog modal-dialog-centered modal-xl" style="max-width: min(95vw, 95vw);">
      <div class="modal-content border-0 rounded-5 overflow-hidden shadow-lg bg-transparent d-flex flex-column" style="max-height: min(92vh, 92vh);">
          <!-- Холст просмотра и панель управления. -->
          <div class="position-relative rounded-5 overflow-hidden bg-black shadow-sm mx-auto w-100" style="height: clamp(95vh, 66vh, 760px); user-select: none;">
            <!-- Верхняя панель с заголовком и закрытием. -->
            <div class="position-absolute top-0 start-0 end-0 d-flex align-items-start justify-content-between px-3 px-lg-4 pt-3 pb-0" style="z-index: 4; pointer-events: none;">
              <div style="pointer-events: auto; min-width: 0;">
                <div class="small text-uppercase text-white-50 fw-semibold mb-1">Просмотр медиа</div>
                <div class="h6 mb-0 text-white text-truncate">{{ getAuthorName(mediaViewer.message.value) || 'Сообщение' }}</div>
              </div>
              <div style="pointer-events: auto;">
                <button type="button" class="btn-close btn-close-white" @click="mediaViewer.close" aria-label="Закрыть"></button>
              </div>
            </div>
            <!-- Слой для жестов, масштабирования и переключения кадров. -->
            <div
              :ref="el => mediaViewer.viewport.value = el"
              class="position-absolute top-0 start-0 w-100 h-100"
              style="touch-action: none; z-index: 6; pointer-events: none;"
            ></div>

            <!-- Media track: render slides side-by-side and translateX the track to avoid re-creating elements -->
            <template v-if="mediaViewer.message.value">
              <div class="w-100 h-100" style="position:absolute; inset:0; overflow:hidden;">
                <div
                  class="d-flex h-100"
                  :style="{ width: `${mediaViewer.attachments.value.length * 100}%`, transform: `translateX(-${mediaViewer.index.value * (100 / mediaViewer.attachments.value.length)}%)`, transition: 'transform 280ms ease' }">
                    <div v-for="(att, vidIdx) in mediaViewer.attachments.value" :key="att.key" class="h-100" :style="{ flex: `0 0 ${100 / (mediaViewer.attachments.value.length || 1)}%` }">
                        <div class="d-flex align-items-center justify-content-center h-100 w-100" style="position:relative;">
                      <div v-if="att.node" class="slide-content w-100 h-100" :data-slide-key="att.key" style="display:flex;align-items:center;justify-content:center;"></div>
                          <template v-else>
                            <img v-if="!isVideoAttachment(att.original || att)"
                              :src="att.src || buildUrl(att.original || att)"
                              class="d-block"
                              :style="[mediaViewer.slideStyle.value, { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', willChange: 'transform', pointerEvents: 'none' }]"
                              alt="Изображение"
                              draggable="false"
                              @dragstart.prevent
                              loading="eager"
                              decoding="async"
                            />
                            <video v-else
                              :src="att.src || buildUrl(att.original || att)"
                              class="d-block"
                              :style="[mediaViewer.slideStyle.value, { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', background: 'black', willChange: 'transform' }]"
                              controls
                              preload="metadata"
                              playsinline
                            ></video>
                          </template>
                        </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Левая зона навигации по медиа (центрированная, не перекрывает нижние контролы). -->
            <button
              type="button"
              class="btn position-absolute start-0 border-0 p-0 d-flex align-items-center justify-content-start"
              style="left: 0; top: 50%; transform: translateY(-50%); width: clamp(72px, 22%, 180px); z-index: 6; background: linear-gradient(90deg, rgba(10, 15, 25, 0.32), rgba(10, 15, 25, 0)); pointer-events: auto;"
              @click="mediaViewer.previous"
              :disabled="mediaViewer.index.value === 0"
              aria-label="Предыдущее"
            >
              <span class="btn btn-dark border-0 rounded-circle shadow-sm d-inline-flex align-items-center justify-content-center ms-3 ms-lg-4" style="width: 42px; height: 42px; pointer-events: none;">‹</span>
            </button>

            <!-- Правая зона навигации по медиа (центрированная, не перекрывает нижние контролы). -->
            <button
              type="button"
              class="btn position-absolute end-0 border-0 p-0 d-flex align-items-center justify-content-end"
              style="right: 0; top: 50%; transform: translateY(-50%); width: clamp(72px, 22%, 180px); z-index: 6; background: linear-gradient(270deg, rgba(10, 15, 25, 0.32), rgba(10, 15, 25, 0)); pointer-events: auto;"
              @click="mediaViewer.next"
              :disabled="mediaViewer.index.value === mediaViewer.attachments.value.length - 1"
              aria-label="Следующее"
            >
              <span class="btn btn-dark border-0 rounded-circle shadow-sm d-inline-flex align-items-center justify-content-center me-3 me-lg-4" style="width: 42px; height: 42px; pointer-events: none;">›</span>
            </button>

            <!-- Нижняя галерея миниатюр для быстрого выбора медиа. -->
            <div class="position-absolute start-0 end-0 bottom-0 p-3 p-lg-4" style="z-index: 3; pointer-events: none;">
              <div class="d-flex align-items-center gap-3 rounded-5 border border-white border-opacity-10 bg-dark bg-opacity-50 px-3 py-3 shadow-lg mx-auto" style="max-width: min(940px, 100%); backdrop-filter: blur(18px); pointer-events: auto;">
                <div class="badge bg-white text-dark rounded-4 flex-shrink-0 px-3 py-2">{{ mediaViewer.index.value + 1 }} / {{ mediaViewer.attachments.value.length }}</div>
                <div class="d-flex align-items-center justify-content-center flex-nowrap gap-2 overflow-x-auto overflow-y-hidden flex-grow-1 min-w-0 py-1" style="scrollbar-width: thin; white-space: nowrap;">
                  <button
                    v-for="(att, idx) in mediaViewer.attachments.value"
                    :key="att.key"
                    type="button"
                    class="p-0 border-0 rounded-4 overflow-hidden flex-shrink-0 shadow-sm"
                    :class="idx === mediaViewer.index.value ? 'border border-2 border-primary' : 'border border-white border-opacity-10'"
                    @click="mediaViewer.index.value = idx"
                    style="width: 66px; height: 66px; background: linear-gradient(180deg, rgba(15, 16, 18, 1) 0%, rgba(8, 9, 11, 1) 100%);"
                  >
                    <img
                      v-if="!isVideoAttachment(att.original || att)"
                      :src="att.src || buildUrl(att.original || att)"
                      class="w-100 h-100 d-block"
                      style="object-fit: cover;"
                      alt=""
                    >
                    <video
                      v-else
                      :src="att.src || buildUrl(att.original || att)"
                      class="w-100 h-100 d-block"
                      muted
                      playsinline
                      preload="metadata"
                      style="object-fit: cover; background: black;"
                    ></video>
                  </button>
                </div>
              </div>
            </div>
          </div>
      </div>
    </div>
  </div>
  </div>
</template>

<style scoped>
/* Purple color for "в диалоге" status to match presence dot */
.text-dialog {
  color: #6f42c1 !important;
}
</style>