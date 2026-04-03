<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, watch, computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '../stores/chatStore'
import { useUserStore } from '../stores/userStore'
import { usePresenceStore } from '../stores/presenceStore'
import { useTypingStore } from '../stores/typingStore'
import { getApiBaseUrl } from '../config/apiBase'
import { timeAgo, chatTime, messageTime } from '../utils/formatDate'
import { useReadTracker } from '../composables/useReadTracker'
import { useScrollManager } from '../composables/useScrollManager'
import { useMediaViewer } from '../composables/useMediaViewer'

const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()
const userStore = useUserStore()
const presenceStore = usePresenceStore()
const typingStore = useTypingStore()

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
  return !isMine(msg) && hasServerId
})
const scrollManager = useScrollManager(messagesContainer)

const conversationId = computed(() => route.params.conversationId || null)
const adId = computed(() => route.params.adId || null)
const isEditing = computed(() => composerMode.value === 'edit')
const isSidebarOpen = ref(false)
const currentUserId = computed(() => String(userStore.tokenUserId || userStore.user?.id || ''))
const isPendingConversation = computed(() => Boolean(pendingAdId.value && !chatStore.currentConversation?.id))

const apiBase = getApiBaseUrl()

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
  return normalized.startsWith('http') ? normalized : `${apiBase}/${normalized.replace(/^\//, '')}`
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

function getMediaErrorKey(message, attachment, index = 0) {
  const rawValue = isFileObject(attachment)
    ? `${attachment.name || ''}:${attachment.size || ''}:${attachment.lastModified || ''}`
    : attachment?.id ?? attachment?.url ?? attachment?.path ?? attachment?.src ?? attachment?.filePath ?? attachment?.value ?? attachment ?? ''
  return `${message?.id ?? 'message'}:${index}:${String(rawValue)}`
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

function findFirstUnreadIncomingMessageId(lastSeenMessageId = chatStore.myLastSeenMessageId, list = chatStore.messages) {
  if (lastSeenMessageId == null) return null

  const lastSeenNum = Number(lastSeenMessageId)
  if (Number.isNaN(lastSeenNum)) return null

  for (const msg of list || []) {
    const messageId = Number(msg?.id)
    if (Number.isNaN(messageId) || isMine(msg)) continue
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
  const msgAuthorId = String(msg.authorId ?? msg.senderId ?? '')
  return currentUserId.value && msgAuthorId === currentUserId.value
}

function getAuthorName(msg) {
  return msg.author?.userName || msg.author?.userLogin || msg.authorName || msg.senderName || msg.userName || null
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
  mediaViewer.open(msg, getMediaAttachments(msg), index)
}

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
  try { for (const att of message?.attachments || []) if (isFileObject(att)) revokeFilePreview(att) } catch {}
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
  composerMode.value = 'edit'
  composer.text = message.text || ''
  composer.attachments = getMessageAttachments(message)
  composer.originalAttachments = getMessageAttachments(message)
  composer.messageId = message.id
  nextTick(() => { autoResize(); messageTextarea.value?.focus() })
}

function removeAttachment(index) {
  const [removed] = composer.attachments.splice(index, 1)
  if (isFileObject(removed)) revokeFilePreview(removed)
  resizeTextarea()
}

async function confirmEdit() {
  if (composerMode.value !== 'edit') return
  const cid = chatStore.currentConversation?.id
  if (!cid || !composer.messageId) return
  const original = chatStore.messages.find(m => m.id === composer.messageId)
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
  if (message.status !== 'failed') return
  const result = await chatStore.retryMessage(message.id)
  if (result?.conversationId) {
    pendingAdId.value = null
    await router.replace(`/chat/${result.conversationId}`)
  }
  scrollManager.scrollToBottom()
}

async function removeMessage(message) {
  if (isOutgoingMessage(message)) {
    cleanupMessagePreviews(message)
    return chatStore.removeMessage(message.id)
  }
  await chatStore.deleteMessage(chatStore.currentConversation.id, message.id)
}

async function toggleMute() {
  if (chatStore.currentConversation?.id) await chatStore.mute(chatStore.currentConversation.id, !chatStore.currentConversation.isMuted)
}

async function toggleArchive() {
  if (chatStore.currentConversation?.id) await chatStore.archive(chatStore.currentConversation.id, !chatStore.currentConversation.isArchived)
}

function selectConversation(id) { if (id) router.push(`/chat/${id}`) }

async function initChat() {
  try {
    const prevConvId = chatStore.currentConversation?.id
    if (prevConvId) await presenceStore.leaveGroup(prevConvId)
    unreadDividerId.value = null
    scrollManager.firstUnreadId.value = null
    readTracker.disconnectObserver()
    mediaViewer.close()
    for (const m of chatStore.messages || []) cleanupMessagePreviews(m)
    if (!chatStore.conversations.length) await chatStore.getConversations()
    if (conversationId.value) {
      pendingAdId.value = null
      await chatStore.loadConversation(conversationId.value, { skipConversationsFetch: true })
      captureUnreadDivider()
      await presenceStore.joinGroup(conversationId.value)
      const companion = chatStore.currentConversation?.companion ?? null
      if (companion?.id != null && companion?.isOnline) presenceStore.seedOnlineUsers(conversationId.value, [String(companion.id)])
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
    chatStore.error = err?.message || 'Ошибка загрузки чата'
  }
}

async function onSubmit() {
  try {
    if (isEditing.value) {
      await confirmEdit()
    } else {
      await sendNewMessage()
    }
    chatStore.error = null
  } catch (err) {
    chatStore.error = err?.message || 'Ошибка отправки сообщения'
  }
}

async function onAttach(e) {
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
  await chatStore.loadMoreMessages()
  await nextTick()
  if (container) container.scrollTop = container.scrollHeight - prevH
}

onMounted(() => {
  initChat()
})
watch(() => route.params.conversationId, initChat)
watch(() => route.params.adId, initChat)

watch(() => chatStore.messages.length, () => {
  nextTick(() => readTracker.observeMessages())
})

watch(() => chatStore.lastKnownId, (newId, oldId) => {
  if (newId && oldId && Number(newId) > Number(oldId)) {
    nextTick(() => {
      const newestMessage = chatStore.messages[chatStore.messages.length - 1] || null
      const isOwn = newestMessage ? isMine(newestMessage) : true
      scrollManager.onNewMessageArrived(newestMessage?.id, isOwn)
      if (!scrollManager.isAtBottom.value && !unreadDividerId.value && newestMessage && !isOwn) {
        unreadDividerId.value = newestMessage.id
      }
    })
  }
})

onBeforeUnmount(() => {
  const prevConvId = chatStore.currentConversation?.id
  if (prevConvId) presenceStore.leaveGroup(prevConvId)
  readTracker.cleanup()
  try { delete window.__chatStore } catch {}
  for (const m of chatStore.messages || []) cleanupMessagePreviews(m)
  mediaViewer.close()
  try { for (const att of composer.attachments || []) if (isFileObject(att)) revokeFilePreview(att) } catch {}
})

// Производные данные для шапки, карточки объявления и модерации.
const currentConv = computed(() => chatStore.currentConversation)
const selectedConversationId = computed(() => String(route.params.conversationId || ''))
const isConversationSelected = computed(() => Boolean(selectedConversationId.value || isPendingConversation.value))

const adImageUrl = computed(() => buildUrl(currentConv.value?.ad?.image ?? currentConv.value?.ad?.mainImagePath))
const adLink = computed(() => currentConv.value?.ad?.id ? `/ads/${currentConv.value.ad.id}` : null)

const moderation = computed(() => {
  const key = String(currentConv.value?.ad?.moderationStatus ?? currentConv.value?.moderationStatus ?? '').trim().toLowerCase()
  const map = {
    '0': ['На модерации', 'bg-warning text-dark'], 'pending': ['На модерации', 'bg-warning text-dark'],
    '1': ['Одобрено', 'bg-success'],              'approved': ['Одобрено', 'bg-success'],
    '2': ['Отклонено', 'bg-danger'],              'rejected': ['Отклонено', 'bg-danger'],
    '3': ['Скрыто', 'bg-secondary'],              'hidden':   ['Скрыто', 'bg-secondary'],
  }
  const [label, cls] = map[key] || [key || 'не указан', 'bg-secondary']
  return { label, cls }
})

const companion = computed(() => {
  const user = currentConv.value?.companion
  if (!user) return null
  return { id: user.id, name: user.name ?? user.userName ?? user.userLogin ?? null, avatar: buildUrl(user.avatar), lastActivityAt: user.lastActivityAt ?? null, isOnline: user.isOnline ?? null }
})

const typingUsers = computed(() => typingStore.getTypingUsers(conversationId.value))
const companionTyping = computed(() => typingUsers.value.length > 0)

const typingIndicatorText = computed(() => {
  if (!typingUsers.value.length) return '8888'

  const names = typingUsers.value
    .map(item => String(item.userName ?? item.userId ?? '').trim())
    .filter(Boolean)

  if (!names.length) return '88888'
  if (names.length === 1) return `${names[0]} печатает...`
  return `${names.join(', ')} печатают...`
})

const lastSeenText = computed(() => {
  if (!presenceStore.isPresenceReady) return '...'
  if (companionTyping.value) return typingIndicatorText.value
  if (presenceStore.isOnline(conversationId.value, companion.value?.id)) return 'в сети'
  const last = companion.value?.lastActivityAt
  if (!last) return 'был(а) давно'
  return timeAgo(last, { prefix: 'Был(а) в сети ' })
})

const lastSeenClass = computed(() => {
  if (!presenceStore.isPresenceReady) return 'text-secondary'
  if (companionTyping.value) return 'text-primary'
  if (presenceStore.isOnline(conversationId.value, companion.value?.id)) return 'text-success'
  return 'text-secondary'
})

function onTextareaInput(e) {
  autoResize(e)
  const cid = chatStore.currentConversation?.id
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

          <div v-if="chatStore.error && !chatStore.currentConversation" class="m-3 alert alert-danger mb-0">{{ chatStore.error }}</div>

          <div v-if="chatStore.isLoading && !chatStore.conversations.length" class="flex-grow-1 d-flex align-items-center justify-content-center text-center text-secondary py-5">
            <div>
              <div class="spinner-border text-secondary mb-3" role="status"></div>
              <div class="small">Загрузка...</div>
            </div>
          </div>

          <div v-else-if="!chatStore.conversations.length" class="flex-grow-1 d-flex align-items-center justify-content-center text-center text-secondary px-4 py-5">
            <div>
              <div class="fw-semibold mb-1">Нет активных чатов</div>
              <div class="small">Здесь появятся разговоры по вашим объявлениям.</div>
            </div>
          </div>

          <div v-else class="flex-grow-1 overflow-auto p-2 p-lg-3" style="min-height: 0;">
            <button
              v-for="conv in chatStore.conversations"
              :key="conv.id"
              type="button"
              class="btn w-100 text-start border rounded-4 p-3 mb-2 bg-white shadow-sm"
              :class="String(conv.id) === selectedConversationId ? 'border-primary bg-primary-subtle' : 'border-white'"
              @click="selectConversation(conv.id)"
            >
              <div class="d-flex align-items-start gap-3">
                <div class="rounded-circle overflow-hidden flex-shrink-0 bg-body-secondary border d-flex align-items-center justify-content-center" style="width: 48px; height: 48px;">
                  <img
                    v-if="conv.ad?.image || conv.ad?.mainImagePath"
                    v-intersect-lazy="buildUrl(conv.ad.image ?? conv.ad.mainImagePath)"
                    alt="ad"
                    class="w-100 h-100"
                    style="object-fit: cover;"
                  />
                  <div
                    v-else
                    class="w-100 h-100 d-flex align-items-center justify-content-center fw-semibold text-primary"
                  >
                    {{ getInitial(conv.companion?.name || conv.ad?.title, conv.id) }}
                  </div>
                </div>

                <div class="flex-grow-1 min-w-0">
                  <div class="d-flex align-items-start justify-content-between gap-2 mb-1">
                    <span class="fw-semibold text-truncate">{{ conv.ad?.title || conv.companion?.name }}</span>
                    <small class="text-secondary flex-shrink-0">{{ chatTime(conv.lastMessageAt) }}</small>
                  </div>
                  <div class="small text-secondary text-truncate">{{ conv.ad?.title || `Объявление #${conv.ad?.id}` }}</div>
                  <div class="d-flex align-items-center justify-content-between gap-2 mt-2">
                    <small class="text-secondary text-truncate">{{ convLastLabel(conv) }}</small>
                    <span v-if="conv.unreadCount" class="badge rounded-pill text-bg-primary flex-shrink-0">{{ conv.unreadCount }}</span>
                  </div>
                  <div v-if="convPreviewUrl(conv)" class="mt-2 rounded-3 overflow-hidden border bg-body-secondary" style="max-width: 86px; height: 48px;">
                    <img v-intersect-lazy="convPreviewUrl(conv)" class="w-100 h-100" style="object-fit: cover;" alt="Preview" />
                  </div>
                </div>
              </div>
            </button>
          </div>
        </aside>

        <section
          class="d-flex flex-column bg-white rounded-4 shadow-sm flex-grow-1 overflow-hidden"
          style="min-width: 0; min-height: 0;"
          :class="isConversationSelected ? 'd-flex' : 'd-none d-lg-flex'"
        >
          <!-- Активный диалог или заглушка без выбранного чата. -->
          <div v-if="chatStore.currentConversation || isPendingConversation" class="d-flex flex-column h-100">
            <!-- Шапка диалога с собеседником и действиями. -->
            <div class="bg-white border-bottom px-3 px-lg-4 py-3 d-flex align-items-start justify-content-between gap-3">
              <button class="btn d-lg-none me-2" type="button" @click="isSidebarOpen = true">☰</button>
              <component :is="companion?.id ? 'router-link' : 'div'" :to="companion?.id ? `/profile/${companion.id}` : null" class="d-flex align-items-center gap-3 text-decoration-none text-body min-w-0">
                <div class="rounded-circle overflow-hidden flex-shrink-0 bg-body-secondary border d-flex align-items-center justify-content-center" style="width: 44px; height: 44px;">
                  <img v-if="companion?.avatar" v-intersect-lazy="companion.avatar" class="w-100 h-100" style="object-fit: cover;" alt="">
                  <span v-else class="fw-semibold text-secondary">{{ getInitial(companion?.name, '') }}</span>
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
                  <li><button class="dropdown-item" type="button" @click="toggleMute">{{ currentConv?.isMuted ? 'Включить уведомления' : 'Выключить уведомления' }}</button></li>
                  <li><button class="dropdown-item" type="button" @click="toggleArchive">{{ currentConv?.isArchived ? 'Разархивировать' : 'Архивировать' }}</button></li>
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
                  <component :is="adLink ? 'router-link' : 'div'" :to="adLink" class="d-block fw-semibold text-truncate text-body text-decoration-none">{{ currentConv.ad.title }}</component>
                  <div class="small text-secondary">{{ currentConv.ad?.price != null ? currentConv.ad.price + ' р.' : 'Цена не указана' }}</div>
                </div>
                <span class="badge rounded-pill" :class="moderation.cls">{{ moderation.label }}</span>
              </div>
            </div>

            <!-- Лента сообщений и вложений. -->
            <div ref="messagesContainer" @scroll.passive="scrollManager.updateScrollState" class="flex-grow-1 overflow-auto p-3 p-lg-4" style="min-height: 0; background: linear-gradient(180deg, rgba(248,249,250,1) 0%, rgb(236, 240, 244) 100%);">
              <div v-if="chatStore.error" class="alert alert-danger mb-3">{{ chatStore.error }}</div>
              <div v-if="chatStore.hasMore" class="text-center mb-3">
                <button class="btn btn-outline-secondary btn-sm rounded-pill px-3" :disabled="chatStore.isLoading" @click="loadMore">
                  <span v-if="chatStore.isLoading" class="spinner-border spinner-border-sm me-1" role="status"></span>
                  Загрузить ещё
                </button>
              </div>

              <div v-if="!chatStore.messages.length" class="d-flex align-items-center justify-content-center text-center text-secondary py-5">
                <div>
                  <div class="fw-semibold mb-1">Начните переписку</div>
                  <div class="small">Напишите первое сообщение, чтобы открыть диалог.</div>
                </div>
              </div>

              <template v-for="msg in chatStore.messages" :key="msg.id">
                <div v-if="String(msg.id) === String(unreadDividerId)" class="d-flex align-items-center gap-2 mb-3">
                  <div class="flex-grow-1" style="border-top: 2px solid var(--bs-primary);"></div>
                  <small class="text-primary fw-semibold flex-shrink-0">Новые сообщения</small>
                  <div class="flex-grow-1" style="border-top: 2px solid var(--bs-primary);"></div>
                </div>
                <div :id="'message-' + msg.id" :data-message-id="msg.id" class="d-flex mb-3" :class="isMine(msg) ? 'justify-content-end' : 'justify-content-start'">
                <!-- Аватар второго участника. -->
                <div v-if="!isMine(msg)" class="rounded-circle flex-shrink-0 me-2 align-self-end overflow-hidden bg-secondary-subtle border d-flex align-items-center justify-content-center text-secondary" style="width: 30px; height: 30px; font-size: 0.75rem; font-weight: 600;">
                  <img v-if="getAuthorAvatar(msg)" v-intersect-lazy="getAuthorAvatar(msg)" class="w-100 h-100" style="object-fit: cover;" alt="">
                  <span v-else>{{ getInitial(getAuthorName(msg), '?') }}</span>
                </div>

                <!-- Пузырь сообщения и его содержимое. -->
                <div class="d-inline-block min-w-0" :style="getMessageContentStyle(msg)">
                  <div v-if="!isMine(msg)" class="small text-secondary mb-1 ms-1">{{ getAuthorName(msg) ?? msg.authorId ?? msg.senderId ?? 'нет данных' }}</div>
                  <div class="px-3 py-2 px-lg-4 py-lg-3 rounded-4 shadow-sm border position-relative"
                    :class="[
                      getMessageBubbleClass(msg),
                      msg.deleted || msg.deletedAt ? 'opacity-50' : '',
                      msg.status === 'sending' || msg.status === 'editing' ? 'opacity-75' : ''
                    ]"
                    :style="isMine(msg)
                      ? 'border-bottom-right-radius: 0.2rem !important;'
                      : 'border-bottom-left-radius: 0.2rem !important;'"
                  >

                    <div v-if="msg.deleted || msg.deletedAt" class="fst-italic small">Сообщение удалено</div>
                    <div v-else>
                      <!-- Ответ на другое сообщение. -->
                      <div v-if="msg.replyToMessageId" class="mb-2 rounded-3 border-start border-3 border-secondary-subtle bg-body-tertiary px-2 py-1 small">
                        <template v-if="getReplyMessage(msg)">
                          <div class="fw-semibold text-truncate">{{ getAuthorName(getReplyMessage(msg)) || 'Сообщение' }}</div>
                          <div class="text-truncate">{{ getReplyMessage(msg)?.text || (getReplyMessage(msg)?.attachments?.length ? 'Вложение' : 'Сообщение') }}</div>
                        </template>
                        <template v-else>
                          <div class="fw-semibold text-truncate">Ответ на сообщение #{{ msg.replyToMessageId }}</div>
                        </template>
                        <button type="button" class="btn btn-link p-0 small text-decoration-none" @click="scrollManager.scrollToMessage(msg.replyToMessageId)">Перейти к сообщению</button>
                      </div>

                      <!-- ГАЛЕРЕЯ -->
                      <div v-if="getMediaAttachments(msg).length" class="mt-2 w-100">

  <!-- 1 — на всю ширину, ограничена по высоте -->
  <div v-if="getMediaAttachments(msg).length === 1">
    <button class="btn p-0 border border-primary-subtle rounded-4 overflow-hidden bg-white w-100" @click="openMediaViewer(msg, 0)">
      <img v-if="isImageAttachment(getMediaAttachments(msg)[0])" :src="buildUrl(getMediaAttachments(msg)[0])" class="w-100 d-block" style="max-height: 320px; object-fit: cover;" />
      <div v-else class="position-relative w-100">
        <div v-if="isMediaBroken(msg, getMediaAttachments(msg)[0], 0)" class="w-100 d-flex justify-content-center align-items-center" style="aspect-ratio:16/9;">
          <span class="small text-muted">Видео недоступно</span>
        </div>
        <template v-else>
          <video class="w-100 d-block" style="max-height: 320px; background:#000;" preload="metadata" playsinline @loadeddata="clearBrokenMedia(msg, getMediaAttachments(msg)[0], 0)" @error="markMediaBroken(msg, getMediaAttachments(msg)[0], 0)">
            <source :src="buildUrl(getMediaAttachments(msg)[0])" />
          </video>
          <div class="position-absolute top-50 start-50 translate-middle" style="width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.75);backdrop-filter:blur(4px);box-shadow:0 0 0 2px rgba(0,180,255,.4);pointer-events:none;display:flex;align-items:center;justify-content:center;">
            <div style="width:0;height:0;border-left:12px solid #000;border-top:8px solid transparent;border-bottom:8px solid transparent;margin-left:3px;"></div>
          </div>
        </template>
      </div>
    </button>
  </div>

  <!-- 2+ — тайловая сетка, aspect-ratio фиксирует высоту пропорционально ширине -->
  <div v-else class="d-flex flex-wrap gap-1" style="min-width:0;">
    <button
      v-for="(att, i) in getMediaAttachments(msg)"
      :key="i"
      class="btn p-0 border border-primary-subtle rounded-3 overflow-hidden bg-white flex-fill"
      :style="getMediaAttachments(msg).length === 2
        ? 'min-width:0; flex-basis: calc(50% - 4px); max-width: calc(50% - 4px);'
        : getMediaAttachments(msg).length === 3
          ? (i === 0 ? 'min-width:0; flex-basis:100%; max-width:100%;' : 'min-width:0; flex-basis:calc(50% - 4px); max-width:calc(50% - 4px);')
          : getMediaAttachments(msg).length === 4
            ? 'min-width:0; flex-basis:calc(50% - 4px); max-width:calc(50% - 4px);'
            : 'min-width:0; flex-basis:calc(33.333% - 5px); max-width:calc(33.333% - 5px);'
      "
      @click="openMediaViewer(msg, i)"
    >
      <img
        v-if="isImageAttachment(att)"
        :src="buildUrl(att)"
        class="w-100 d-block"
        :style="getMediaAttachments(msg).length === 3 && i === 0
          ? 'aspect-ratio:16/9; object-fit:cover;'
          : 'aspect-ratio:1/1; object-fit:cover;'"
      />
      <div v-else class="position-relative w-100">
        <div v-if="isMediaBroken(msg, att, i)" class="w-100 d-flex justify-content-center align-items-center" :style="getMediaAttachments(msg).length === 3 && i === 0 ? 'aspect-ratio:16/9;' : 'aspect-ratio:1/1;'">
          <span class="small text-muted">Видео недоступно</span>
        </div>
        <template v-else>
          <video
            class="w-100 d-block"
            :style="(getMediaAttachments(msg).length === 3 && i === 0 ? 'aspect-ratio:16/9;' : 'aspect-ratio:1/1;') + ' object-fit:cover; background:#000;'"
            preload="metadata"
            playsinline
            @loadeddata="clearBrokenMedia(msg, att, i)"
            @error="markMediaBroken(msg, att, i)"
          >
            <source :src="buildUrl(att)" />
          </video>
          <div class="position-absolute top-50 start-50 translate-middle" style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.75);backdrop-filter:blur(4px);box-shadow:0 0 0 2px rgba(0,180,255,.4);pointer-events:none;display:flex;align-items:center;justify-content:center;">
            <div style="width:0;height:0;border-left:10px solid #000;border-top:6px solid transparent;border-bottom:6px solid transparent;margin-left:2px;"></div>
          </div>
        </template>
      </div>
    </button>
  </div>

</div>
                      

                      <!-- Аудио-вложения сообщения. -->
                      <template v-if="getAudioAttachments(msg).length">
                        <div class="d-flex flex-column gap-2 mt-2">
                          <div
                            v-for="(att, i) in getAudioAttachments(msg)"
                            :key="`${msg.id}-audio-${i}`"
                            class="w-100 min-w-0 overflow-hidden bg-white border border-light-subtle rounded-5 p-2 shadow-sm"
                          >
                            <div class="d-flex align-items-center gap-2 mb-3 min-w-0 overflow-hidden">
                              <span class="flex-shrink-0 rounded-circle bg-primary-subtle text-primary d-inline-flex align-items-center justify-content-center border-0 shadow-sm" style="width: 40px; height: 40px; opacity: 0.7">{{ getAttachmentKindEmoji(att) }}</span>
                              <div class="min-w-0 flex-grow-1 overflow-hidden">
                                <div class="fw-semibold text-truncate d-block" :title="getAttachmentName(att)">{{ getAttachmentName(att) }}</div>
                                <div class="small text-secondary text-truncate d-block">{{ getAttachmentKindLabel(att) }}</div>
                              </div>
                            </div>
                            <audio class="w-100 d-block" controls preload="metadata" :src="buildUrl(att)">
                              Ваш браузер не поддерживает воспроизведение аудио.
                            </audio>
                          </div>
                        </div>
                      </template>

                      <!-- Файлы, которые не распознаны как медиа -->
                      <template v-if="getFileAttachments(msg).length">
                        <div class="d-flex flex-column gap-1 mt-2">
                          <a
                            v-for="(att, i) in getFileAttachments(msg)"
                            :key="`${msg.id}-file-${i}`"
                            :href="buildUrl(att)"
                            target="_blank"
                            rel="noopener"
                            class="text-decoration-none"
                          >
                            <div class="d-flex align-items-center gap-3 rounded-4 border bg-body-tertiary px-3 py-2 shadow-sm">
                              <div class="rounded-circle bg-white border d-inline-flex align-items-center justify-content-center flex-shrink-0" style="width: 42px; height: 42px;">
                                <span>{{ getAttachmentKindEmoji(att) }}</span>
                              </div>
                              <div class="min-w-0 flex-grow-1">
                                <div class="fw-semibold text-body text-truncate">{{ getAttachmentName(att) }}</div>
                                <div class="small text-secondary text-truncate">{{ getAttachmentKindLabel(att) }}</div>
                              </div>
                              <span class="badge rounded-pill text-bg-light border text-secondary flex-shrink-0">Открыть</span>
                            </div>
                          </a>
                        </div>
                      </template>

                      <!-- Текст сообщения -->
                      <p
                        v-if="msg.text"
                        class="mb-0 text-break"
                        :class="getMessageAttachments(msg).length ? 'mt-2' : ''"
                        style="white-space: pre-wrap;"
                      >{{ msg.text }}</p>

                      <div v-if="isMessageBusy(msg) || msg.status === 'failed'" class="d-flex align-items-center justify-content-between gap-2 flex-wrap mt-2 small">
                        <span v-if="isMessageBusy(msg)" class="text-secondary d-inline-flex align-items-center gap-2">
                          <span class="spinner-border spinner-border-sm" style="width: 0.7rem; height: 0.7rem;" role="status" aria-hidden="true"></span>
                          {{ getMessagePreviewLabel(msg) }}
                        </span>
                        <span v-else class="text-danger">{{ getMessagePreviewLabel(msg) }}</span>
                        <button v-if="msg.status === 'failed'" type="button" class="btn btn-link btn-sm p-0 text-primary text-decoration-none" @click="retryMessage(msg)">Повторить</button>
                      </div>
                    </div>

                    <div v-if="!isOutgoingMessage(msg)" class="d-flex align-items-center justify-content-end gap-1 mt-2">
                      <small :class="getReceipt(msg).cls" style="font-size: 0.72rem;">{{ getReceipt(msg).icon }}</small>
                      <small class="text-secondary" style="font-size: 0.72rem;">{{ messageTime(msg.createdAt) }}</small>
                      <small v-if="msg.edited || msg.editedAt" class="text-secondary" style="font-size: 0.72rem;">· изм.</small>
                    </div>
                    <div v-else class="d-flex align-items-center justify-content-end gap-1 mt-2">
                      <small class="text-secondary" style="font-size: 0.72rem;">{{ messageTime(msg.createdAt) }}</small>
                    </div>
                  </div>
                  <div class="d-flex justify-content-end gap-2 mt-1 px-1">
                    <button v-if="!isOutgoingMessage(msg) && !isMessageBusy(msg)" class="btn btn-link btn-sm p-0 text-secondary text-decoration-none" style="font-size: 0.74rem;" @click="startEdit(msg)">Изменить</button>
                    <button v-if="!isMessageBusy(msg)" class="btn btn-link btn-sm p-0 text-danger text-decoration-none" style="font-size: 0.74rem;" @click="removeMessage(msg)">{{ isOutgoingMessage(msg) ? 'Удалить черновик' : 'Удалить' }}</button>
                  </div>
                </div>
              </div>
              </template>

              <div v-if="scrollManager.hasNewBelow.value || !scrollManager.isAtBottom.value" class="text-center" style="position: sticky; bottom: 8px; z-index: 5;">
                <button type="button" class="btn btn-primary btn-sm rounded-pill shadow px-3" @click="scrollManager.scrollToUnreadOrBottom()">
                  ↓ {{ scrollManager.hasNewBelow.value ? 'Новые сообщения' : 'Вниз' }}
                </button>
              </div>
            </div>

            <!-- Панель отправки и редактирования сообщения. -->
            <div class="bg-white border-top p-3 p-lg-4">
              <div v-if="companionTyping" class="small text-primary mb-2 d-flex align-items-center gap-2">
                <span class="spinner-grow spinner-grow-sm" style="width: 0.5rem; height: 0.5rem;" role="status"></span>
                {{ typingIndicatorText }}
              </div>
              <div v-if="composerMode === 'edit'" class="d-flex align-items-center justify-content-between gap-3 rounded-4 border bg-warning-subtle px-3 py-2 mb-3 small">
                <span class="text-secondary">✏️ Редактирование сообщения</span>
                <button type="button" class="btn-close btn-sm" @click="cancelEdit"></button>
              </div>
              <div v-if="composer.attachments.length" class="d-flex flex-wrap gap-2 mb-3">
                <template v-for="(att, index) in composer.attachments" :key="`${index}-${(att && att.name) || att}`">
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
                <label class="btn btn-light border rounded-circle flex-shrink-0 mb-0 d-inline-flex align-items-center justify-content-center" :title="isEditing ? 'Прикрепить изображение' : 'Прикрепить файл'" style="width: 44px; height: 44px;">
                  📎
                  <input type="file" multiple @change="onAttach" class="d-none" />
                </label>
                <textarea
                  ref="messageTextarea"
                  v-model="composer.text"
                  class="form-control bg-body-tertiary border-0 rounded-4 flex-grow-1 px-3 py-2"
                  rows="1"
                  placeholder="Написать сообщение..."
                  style="resize: none; overflow-y: auto; min-height: 44px; max-height: 140px;"
                  @keydown.enter.exact.prevent="onSubmit"
                  @input="onTextareaInput"
                ></textarea>
                <button
                  type="submit"
                  class="btn btn-primary rounded-circle flex-shrink-0 d-inline-flex align-items-center justify-content-center"
                  style="width: 44px; height: 44px;"
                >
                  &#10148;
                </button>
              </form>
            </div>
          </div>

          <!-- Заглушка, когда диалог не выбран. -->
          <div v-else class="h-100 d-flex align-items-center justify-content-center text-center text-secondary px-4">
            <div class="bg-white border rounded-5 shadow-sm p-4 p-lg-5" style="max-width: 440px;">
              <div class="fw-semibold h6 mb-2">Выберите диалог</div>
              <p class="mb-0 small text-secondary">Слева отображается список чатов. Нажмите на любой диалог, чтобы открыть переписку.</p>
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

      <div v-if="chatStore.error && !chatStore.currentConversation" class="m-3 alert alert-danger mb-0">{{ chatStore.error }}</div>

      <div v-if="chatStore.isLoading && !chatStore.conversations.length" class="flex-grow-1 d-flex align-items-center justify-content-center text-center text-secondary py-5">
        <div>
          <div class="spinner-border text-secondary mb-3" role="status"></div>
          <div class="small">Загрузка...</div>
        </div>
      </div>

      <div v-else-if="!chatStore.conversations.length" class="flex-grow-1 d-flex align-items-center justify-content-center text-center text-secondary px-4 py-5">
        <div>
          <div class="fw-semibold mb-1">Нет активных чатов</div>
          <div class="small">Здесь появятся разговоры по вашим объявлениям.</div>
        </div>
      </div>

      <div v-else class="flex-grow-1 overflow-auto p-2">
        <button
          v-for="conv in chatStore.conversations"
          :key="conv.id"
          type="button"
          class="btn w-100 text-start border rounded-4 p-3 mb-2 bg-white shadow-sm"
          :class="String(conv.id) === selectedConversationId ? 'border-primary bg-primary-subtle' : 'border-white'"
          @click="selectConversation(conv.id); isSidebarOpen = false"
        >
          <div class="d-flex align-items-start gap-3">
            <div class="rounded-circle overflow-hidden flex-shrink-0 bg-body-secondary border d-flex align-items-center justify-content-center" style="width: 48px; height: 48px;">
              <img
                v-if="conv.ad?.image || conv.ad?.mainImagePath"
                v-intersect-lazy="buildUrl(conv.ad.image ?? conv.ad.mainImagePath)"
                alt="ad"
                class="w-100 h-100"
                style="object-fit: cover;"
              />
              <div
                v-else
                class="w-100 h-100 d-flex align-items-center justify-content-center fw-semibold text-primary"
              >
                {{ getInitial(conv.companion?.name || conv.ad?.title, conv.id) }}
              </div>
            </div>

            <div class="flex-grow-1 min-w-0">
              <div class="d-flex align-items-start justify-content-between gap-2 mb-1">
                <span class="fw-semibold text-truncate">{{ conv.companion?.name || conv.ad?.title || `Разговор #${conv.id}` }}</span>
                <small class="text-secondary flex-shrink-0">{{ chatTime(conv.lastMessageAt) }}</small>
              </div>
              <div class="small text-secondary text-truncate">{{ conv.ad?.title || `Объявление #${conv.ad?.id}` }}</div>
              <div class="d-flex align-items-center justify-content-between gap-2 mt-2">
                <small class="text-secondary text-truncate">{{ convLastLabel(conv) }}</small>
                <span v-if="conv.unreadCount" class="badge rounded-pill text-bg-primary flex-shrink-0">{{ conv.unreadCount }}</span>
              </div>
              <div v-if="convPreviewUrl(conv)" class="mt-2 rounded-3 overflow-hidden border bg-body-secondary" style="max-width: 86px; height: 48px;">
                <img v-intersect-lazy="convPreviewUrl(conv)" class="w-100 h-100" style="object-fit: cover;" alt="Preview" />
              </div>
            </div>
          </div>
        </button>
      </div>
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
              style="touch-action: none;"
              @wheel.prevent="mediaViewer.onWheel"
              @click="mediaViewer.onClick"
              @pointerdown="mediaViewer.onPointerDown"
              @pointermove="mediaViewer.onPointerMove"
              @pointerup="mediaViewer.onPointerEnd"
              @pointercancel="mediaViewer.onPointerCancel"
            ></div>

            <!-- Текущее медиа в увеличенном просмотре. -->
            <template v-if="mediaViewer.currentUrl.value">
              <img
                v-if="!mediaViewer.currentIsVideo.value"
                :src="mediaViewer.currentUrl.value"
                class="position-absolute top-50 start-50 d-block"
                :style="[
                  mediaViewer.imageStyle.value,
                  {
                    maxWidth: '100%',
                    maxHeight: '100%',
                    width: 'auto',
                    height: 'auto',
                    transformOrigin: 'center center',
                    willChange: 'transform',
                    pointerEvents: 'none'
                  }
                ]"
                alt="Изображение"
                draggable="false"
                @dragstart.prevent
                loading="eager"
                decoding="async"
              >

              <video
                v-else
                :src="mediaViewer.currentUrl.value"
                class="position-absolute top-50 start-50 d-block"
                :style="[
                  mediaViewer.imageStyle.value,
                  {
                    maxWidth: '100%',
                    maxHeight: '100%',
                    width: 'auto',
                    height: 'auto',
                    transformOrigin: 'center center',
                    willChange: 'transform',
                    pointerEvents: 'auto',
                    background: 'black'
                  }
                ]"
                controls
                preload="metadata"
                playsinline
              ></video>
            </template>

            <!-- Левая зона навигации по медиа. -->
            <button
              type="button"
              class="btn position-absolute top-0 start-0 bottom-0 border-0 p-0 d-flex align-items-center justify-content-start"
              style="width: clamp(72px, 22%, 180px); z-index: 2; background: linear-gradient(90deg, rgba(10, 15, 25, 0.32), rgba(10, 15, 25, 0));"
              @click="mediaViewer.previous"
              :disabled="mediaViewer.index.value === 0"
              aria-label="Предыдущее"
            >
              <span class="btn btn-dark border-0 rounded-circle shadow-sm d-inline-flex align-items-center justify-content-center ms-3 ms-lg-4" style="width: 42px; height: 42px; pointer-events: none;">‹</span>
            </button>

            <!-- Правая зона навигации по медиа. -->
            <button
              type="button"
              class="btn position-absolute top-0 end-0 bottom-0 border-0 p-0 d-flex align-items-center justify-content-end"
              style="width: clamp(72px, 22%, 180px); z-index: 2; background: linear-gradient(270deg, rgba(10, 15, 25, 0.32), rgba(10, 15, 25, 0));"
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
                    :key="`${mediaViewer.message.value?.id}-${att}-${idx}`"
                    type="button"
                    class="p-0 border-0 rounded-4 overflow-hidden flex-shrink-0 shadow-sm"
                    :class="idx === mediaViewer.index.value ? 'border border-2 border-primary' : 'border border-white border-opacity-10'"
                    @click="mediaViewer.index.value = idx"
                    style="width: 66px; height: 66px; background: linear-gradient(180deg, rgba(15, 16, 18, 1) 0%, rgba(8, 9, 11, 1) 100%);"
                  >
                    <img
                      v-if="!isVideoAttachment(att)"
                      :src="buildUrl(att)"
                      class="w-100 h-100 d-block"
                      style="object-fit: cover;"
                      alt=""
                    >
                    <video
                      v-else
                      :src="buildUrl(att)"
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