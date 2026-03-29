<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, watch, computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '../stores/chatStore'
import { useUserStore } from '../stores/userStore'
import { getApiBaseUrl } from '../config/apiBase'
import { timeAgo, chatTime, messageTime } from '../utils/formatDate'

const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()
const userStore = useUserStore()

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
const outgoingMessageSeq = ref(0)
const pendingAdId = ref(null)
const lastSeenMsgId = ref(null)
let readDebounceTimer = null
let messageObserver = null
const observedMessageIds = new Set()
const mediaViewerViewport = ref(null)
const mediaViewerMessage = ref(null)
const mediaViewerAttachments = ref([])
const mediaViewerIndex = ref(0)
const mediaViewerZoom = ref(1)
const mediaViewerPanX = ref(0)
const mediaViewerPanY = ref(0)
const mediaViewerTapState = ref({
  lastTapAt: 0,
  lastTapX: 0,
  lastTapY: 0
})

const mediaViewerPointerPositions = new Map()
const mediaViewerPointerStarts = new Map()
const mediaViewerPointerMoved = new Set()
let mediaViewerGesture = null

const conversationId = computed(() => route.params.conversationId || null)
const adId = computed(() => route.params.adId || null)
const isEditing = computed(() => composerMode.value === 'edit')
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
  return extRe.test(String(pathOrFile).split('?')[0])
}

const isImageAttachment = (p) => matchesType(p, 'image/', IMG_RE)
const isAudioAttachment = (p) => matchesType(p, 'audio/', AUD_RE)
const isVideoAttachment = (p) => matchesType(p, 'video/', VID_RE)


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

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  })
}

function scrollToFirstUnread() {
  nextTick(() => {
    const fid = chatStore.firstUnreadMessageId
    if (fid) {
      const el = document.getElementById(`message-${fid}`)
      if (el) { el.scrollIntoView({ behavior: 'instant', block: 'start' }); return }
    }
    if (messagesContainer.value) messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  })
}

function disconnectMessageObserver() {
  if (messageObserver) { messageObserver.disconnect(); messageObserver = null }
  observedMessageIds.clear()
}

function flushReadUpdate() {
  if (readDebounceTimer) { clearTimeout(readDebounceTimer); readDebounceTimer = null }
  const cid = chatStore.currentConversation?.id
  const msgId = lastSeenMsgId.value
  if (cid && msgId != null) {
    lastSeenMsgId.value = null
    chatStore.markRead(cid, msgId)
  }
}

function scheduleReadUpdate(messageId) {
  const numId = Number(messageId)
  if (!numId || isNaN(numId)) return
  const current = lastSeenMsgId.value ? Number(lastSeenMsgId.value) : 0
  if (numId <= current) return
  lastSeenMsgId.value = String(messageId)
  if (readDebounceTimer) clearTimeout(readDebounceTimer)
  readDebounceTimer = setTimeout(flushReadUpdate, 500)
}

function observeCounterpartMessages() {
  if (!messageObserver) return
  for (const msg of chatStore.messages) {
    if (isMine(msg) || isOutgoingMessage(msg)) continue
    const msgId = String(msg.id)
    if (observedMessageIds.has(msgId)) continue
    const el = document.getElementById(`message-${msgId}`)
    if (el) { observedMessageIds.add(msgId); messageObserver.observe(el) }
  }
}

function setupMessageObserver() {
  disconnectMessageObserver()
  const root = messagesContainer.value
  if (!root) return
  messageObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const rawId = entry.target.id?.replace('message-', '')
      if (rawId) scheduleReadUpdate(rawId)
    }
  }, { root, threshold: 0 })
  observeCounterpartMessages()
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
  const type = String(conv.lastMessageType ?? '').toLowerCase()
  if (type === '1' || type === 'image') return '📷 Вложение'
  if (type === '2' || type === 'file') return '📄 Вложение'
  return conv.lastMessageText
}

function convPreviewUrl(conv) {
  return conv.lastMessageType === 1 && conv.lastMessageText ? buildUrl(conv.lastMessageText) : null
}

function messageDomId(message) {
  return `message-${message.id}`
}

function isMessageRead(message) {
  return message.isRead !== false
}

function getReceiptIcon(message) {
  return isMessageRead(message) ? '✓✓' : '✓'
}

function getReplyMessage(message) {
  if (!message?.replyToMessageId) return null
  return chatStore.messages.find(item => String(item.id) === String(message.replyToMessageId)) || null
}

function scrollToMessage(messageId) {
  const element = document.getElementById(messageDomId({ id: messageId }))
  if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function getMessageAttachments(msg) {
  return Array.isArray(msg?.attachments) ? msg.attachments.filter(Boolean) : []
}

function isOutgoingMessage(msg) {
  return msg?.clientStatus === 'sending' || msg?.clientStatus === 'failed'
}

function isMessageBusy(msg) {
  return msg?.clientStatus === 'sending' || msg?.clientStatus === 'editing'
}

function getMessageBubbleClass(msg) {
  if (msg?.clientStatus === 'sending' || msg?.clientStatus === 'editing')
    return 'bg-warning-subtle text-body border-warning-subtle'
  if (msg?.clientStatus === 'failed')
    return 'bg-danger-subtle text-body border-danger-subtle'
  return isMine(msg) ? 'bg-white text-body border-primary-subtle' : 'bg-white border-white'
}

function getMessagePreviewLabel(msg) {
  if (msg?.clientStatus === 'sending') return 'Отправка...'
  if (msg?.clientStatus === 'editing') return 'Сохранение...'
  if (msg?.clientStatus === 'failed') return msg.clientError || 'Не удалось отправить'
  return ''
}

function getMediaAttachments(msg) {
  return getMessageAttachments(msg).filter(att => {
    const type = String(att?.type || '').toLowerCase()
    return type === 'image' || type === 'video' || isImageAttachment(att) || isVideoAttachment(att)
  })
}

function isHeroImageAttachment(msg, index) {
  const count = getMediaAttachments(msg).length
  return count === 1 || (count === 3 && index === 0)
}

function getAudioAttachments(msg) {
  return getMessageAttachments(msg).filter(isAudioAttachment)
}

function getFileAttachments(msg) {
  return getMessageAttachments(msg).filter(p => !isImageAttachment(p) && !isAudioAttachment(p) && !isVideoAttachment(p))
}

function getAttachmentName(path) {
  if (isFileObject(path)) return path.name || 'Файл'
  if (path && typeof path === 'object') return path.name || path.fileName || path.filename || path.originalName || path.url || path.path || 'Файл'
  return String(path || '').replace(/\\/g, '/').split('/').pop() || String(path || '')
}

function getAttachmentSrc(att) {
  return isFileObject(att) ? (att._preview || '') : buildUrl(att)
}

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

// Геометрия и управление просмотрщиком изображений.
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getMediaViewerRect() {
  return mediaViewerViewport.value?.getBoundingClientRect() || null
}

function resetMediaViewerTransform() {
  mediaViewerZoom.value = 1
  mediaViewerPanX.value = 0
  mediaViewerPanY.value = 0
}

function resetViewerPointerState() {
  mediaViewerPointerPositions.clear()
  mediaViewerPointerStarts.clear()
  mediaViewerPointerMoved.clear()
  mediaViewerGesture = null
  mediaViewerTapState.value = { lastTapAt: 0, lastTapX: 0, lastTapY: 0 }
}

function isMediaViewerCentered() {
  return mediaViewerZoom.value <= 1
}

function clampMediaViewerPan(x, y, zoom) {
  const rect = getMediaViewerRect()
  if (!rect) return { x, y }
  const lx = Math.max(0, (rect.width * (zoom - 1)) / 2)
  const ly = Math.max(0, (rect.height * (zoom - 1)) / 2)
  return { x: clamp(x, -lx, lx), y: clamp(y, -ly, ly) }
}

function getViewerRelativePoint(event) {
  const rect = getMediaViewerRect()
  if (!rect) return null

  return {
    x: event.clientX - rect.left - rect.width / 2,
    y: event.clientY - rect.top - rect.height / 2
  }
}

function openMediaViewer(message, index = 0) {
  const media = getMediaAttachments(message)
  if (!media.length) return
  mediaViewerMessage.value = message
  mediaViewerAttachments.value = media
  mediaViewerIndex.value = clamp(index, 0, media.length - 1)
  resetViewerPointerState()
  resetMediaViewerTransform()
}

function closeMediaViewer() {
  mediaViewerMessage.value = null
  mediaViewerAttachments.value = []
  mediaViewerIndex.value = 0
  resetViewerPointerState()
  resetMediaViewerTransform()
}

function switchMedia(delta) {
  const next = mediaViewerIndex.value + delta
  if (next < 0 || next >= mediaViewerAttachments.value.length) return
  mediaViewerIndex.value = next
  resetViewerPointerState()
  resetMediaViewerTransform()
}
const previousMedia = () => switchMedia(-1)
const nextMedia = () => switchMedia(1)

function zoomMediaViewerTo(targetZoom, anchorPoint = null) {
  const nextZoom = clamp(targetZoom, 1, 4)
  if (nextZoom === 1) return resetMediaViewerTransform()
  const anchor = anchorPoint || { x: 0, y: 0 }
  const zoomRatio = nextZoom / mediaViewerZoom.value
  const bounded = clampMediaViewerPan(
    anchor.x - (anchor.x - mediaViewerPanX.value) * zoomRatio,
    anchor.y - (anchor.y - mediaViewerPanY.value) * zoomRatio,
    nextZoom
  )
  mediaViewerZoom.value = nextZoom
  mediaViewerPanX.value = bounded.x
  mediaViewerPanY.value = bounded.y
}

function handleMediaViewerDoubleTap(point) {
  if (!point) return
  isMediaViewerCentered() ? zoomMediaViewerTo(2.25, point) : resetMediaViewerTransform()
}

function handleViewerWheel(event) {
  if (!mediaViewerMessage.value) return
  event.preventDefault()
  if (!event.ctrlKey && !event.metaKey) {
    if (event.deltaY > 0) nextMedia(); else if (event.deltaY < 0) previousMedia()
    return
  }
  const rect = getMediaViewerRect()
  if (!rect) return
  const nextZoom = clamp(mediaViewerZoom.value * (event.deltaY < 0 ? 1.12 : 0.88), 1, 4)
  if (nextZoom === 1) return resetMediaViewerTransform()
  const cx = event.clientX - rect.left - rect.width / 2
  const cy = event.clientY - rect.top - rect.height / 2
  const zoomRatio = nextZoom / mediaViewerZoom.value
  const bounded = clampMediaViewerPan(cx - (cx - mediaViewerPanX.value) * zoomRatio, cy - (cy - mediaViewerPanY.value) * zoomRatio, nextZoom)
  mediaViewerZoom.value = nextZoom
  mediaViewerPanX.value = bounded.x
  mediaViewerPanY.value = bounded.y
}

function handleViewerClick(event) {
  if (!mediaViewerMessage.value) return
  const ts = mediaViewerTapState.value
  const now = Date.now()
  if (ts.lastTapAt && now - ts.lastTapAt < 280) {
    mediaViewerTapState.value = { lastTapAt: 0, lastTapX: 0, lastTapY: 0 }
    handleMediaViewerDoubleTap(getViewerRelativePoint(event))
    return
  }
  const point = getViewerRelativePoint(event)
  mediaViewerTapState.value = { lastTapAt: now, lastTapX: point?.x ?? 0, lastTapY: point?.y ?? 0 }
}

function handleViewerPointerDown(event) {
  if (!mediaViewerMessage.value) return
  const position = getViewerRelativePoint(event)
  if (!position) return
  mediaViewerPointerPositions.set(event.pointerId, position)
  mediaViewerPointerStarts.set(event.pointerId, position)
  mediaViewerPointerMoved.delete(event.pointerId)
  if (mediaViewerPointerPositions.size === 1 && mediaViewerZoom.value > 1) {
    mediaViewerGesture = { type: 'pan', pointerId: event.pointerId, startX: position.x, startY: position.y, startPanX: mediaViewerPanX.value, startPanY: mediaViewerPanY.value }
  }
  if (mediaViewerPointerPositions.size >= 2) {
    const [fId, sId] = Array.from(mediaViewerPointerPositions.keys())
    const f = mediaViewerPointerPositions.get(fId), s = mediaViewerPointerPositions.get(sId)
    if (!f || !s) return
    mediaViewerGesture = { type: 'pinch', pointerIds: [fId, sId], startDistance: Math.hypot(f.x - s.x, f.y - s.y) || 1, startZoom: mediaViewerZoom.value, startPanX: mediaViewerPanX.value, startPanY: mediaViewerPanY.value }
  }
  event.currentTarget.setPointerCapture?.(event.pointerId)
}

function handleViewerPointerMove(event) {
  if (!mediaViewerMessage.value || !mediaViewerPointerPositions.has(event.pointerId)) return
  const position = getViewerRelativePoint(event)
  if (!position) return
  mediaViewerPointerPositions.set(event.pointerId, position)
  const startPos = mediaViewerPointerStarts.get(event.pointerId)
  if (startPos && Math.hypot(position.x - startPos.x, position.y - startPos.y) > 8) mediaViewerPointerMoved.add(event.pointerId)

  if (mediaViewerGesture?.type === 'pinch') {
    const [fId, sId] = mediaViewerGesture.pointerIds
    const f = mediaViewerPointerPositions.get(fId), s = mediaViewerPointerPositions.get(sId)
    if (!f || !s) return
    const dist = Math.hypot(f.x - s.x, f.y - s.y) || 1
    const nextZoom = clamp(mediaViewerGesture.startZoom * (dist / mediaViewerGesture.startDistance), 1, 4)
    if (nextZoom === 1) return resetMediaViewerTransform()
    const cx = (f.x + s.x) / 2, cy = (f.y + s.y) / 2
    const ratio = nextZoom / mediaViewerGesture.startZoom
    const bounded = clampMediaViewerPan(cx - (cx - mediaViewerGesture.startPanX) * ratio, cy - (cy - mediaViewerGesture.startPanY) * ratio, nextZoom)
    mediaViewerZoom.value = nextZoom
    mediaViewerPanX.value = bounded.x
    mediaViewerPanY.value = bounded.y
    return
  }
  if (mediaViewerGesture?.type === 'pan' && mediaViewerGesture.pointerId === event.pointerId) {
    const bounded = clampMediaViewerPan(mediaViewerGesture.startPanX + (position.x - mediaViewerGesture.startX), mediaViewerGesture.startPanY + (position.y - mediaViewerGesture.startY), mediaViewerZoom.value)
    mediaViewerPanX.value = bounded.x
    mediaViewerPanY.value = bounded.y
  }
}

function handleViewerPointerEnd(event) {
  if (!mediaViewerMessage.value) return
  mediaViewerPointerPositions.delete(event.pointerId)
  mediaViewerPointerStarts.delete(event.pointerId)
  mediaViewerPointerMoved.delete(event.pointerId)
  event.currentTarget.releasePointerCapture?.(event.pointerId)
  if (!mediaViewerPointerPositions.size) { mediaViewerGesture = null; return }
  if (mediaViewerPointerPositions.size === 1) {
    const [rid, rpos] = mediaViewerPointerPositions.entries().next().value
    mediaViewerGesture = mediaViewerZoom.value > 1
      ? { type: 'pan', pointerId: rid, startX: rpos.x, startY: rpos.y, startPanX: mediaViewerPanX.value, startPanY: mediaViewerPanY.value }
      : null
  }
}
const handleViewerPointerCancel = handleViewerPointerEnd

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

function removeLocalMessage(messageId) {
  const idx = chatStore.messages.findIndex(item => String(item.id) === String(messageId))
  if (idx !== -1) {
    cleanupMessagePreviews(chatStore.messages[idx])
    chatStore.messages.splice(idx, 1)
  }
}

async function sendNewMessage() {
  const draft = createOutgoingMessageDraft({
    text: composer.text, attachments: [...composer.attachments],
    conversationId: chatStore.currentConversation?.id || null,
    adId: pendingAdId.value || adId.value,
  })
  chatStore.messages.push(draft)
  scrollToBottom()
  resetComposer({ revokePreviews: false })
  await sendOutgoingMessageDraft(draft)
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

function createOutgoingMessageDraft({ text, attachments, conversationId, adId, retryFromId = null }) {
  const messageId = `local-${Date.now()}-${++outgoingMessageSeq.value}`
  const authorId = currentUserId.value || userStore.tokenUserId || userStore.user?.id || null
  return {
    id: retryFromId || messageId, authorId, senderId: authorId, author: userStore.user || null,
    text: text ?? '', attachments: Array.isArray(attachments) ? attachments : [],
    createdAt: new Date().toISOString(), isRead: false, clientStatus: 'sending', clientError: null,
    clientDraft: { text: text ?? '', attachments: Array.isArray(attachments) ? attachments : [], conversationId: conversationId ?? null, adId: adId ?? null },
  }
}

async function sendOutgoingMessageDraft(message) {
  if (!message?.clientDraft) return false
  const draft = message.clientDraft
  const attachments = Array.isArray(draft.attachments) ? draft.attachments : []
  const cid = draft.conversationId ?? chatStore.currentConversation?.id ?? null
  const adIdVal = draft.adId ?? pendingAdId.value ?? adId.value
  message.clientStatus = 'sending'
  message.clientError = null
  try {
    const result = cid
      ? (attachments.length ? await chatStore.sendAttachments(cid, attachments, draft.text) : await chatStore.sendMessage(cid, draft.text, []))
      : await chatStore.sendMessageByAdId(adIdVal, draft.text, attachments)
    cleanupMessagePreviews(message)
    removeLocalMessage(message.id)
    if (result?.conversationId && !cid) {
      pendingAdId.value = null
      await router.replace(`/chat/${result.conversationId}`)
    }
    scrollToBottom()
    return true
  } catch (err) {
    message.clientStatus = 'failed'
    message.clientError = err?.message || 'Ошибка отправки сообщения'
    return false
  }
}

async function retryPendingMessage(message) {
  if (!message?.clientDraft || message.clientStatus === 'sending') return
  await sendOutgoingMessageDraft(message)
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
  const setStatus = (s, err = null) => {
    const m = chatStore.messages.find(m => String(m.id) === editId)
    if (m) { m.clientStatus = s; m.clientError = err }
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
    setStatus(null)
    resetComposer()
  } catch (err) {
    setStatus(null)
    throw err
  }
}

const cancelEdit = () => resetComposer()

async function removeMessage(message) {
  if (isOutgoingMessage(message)) return removeLocalMessage(message.id)
  await chatStore.deleteMessage(chatStore.currentConversation.id, message.id)
}

async function toggleMute() {
  if (chatStore.currentConversation?.id) await chatStore.mute(chatStore.currentConversation.id, !chatStore.currentConversation.muted)
}

async function toggleArchive() {
  if (chatStore.currentConversation?.id) await chatStore.archive(chatStore.currentConversation.id, !chatStore.currentConversation.archived)
}

function selectConversation(id) { if (id) router.push(`/chat/${id}`) }

async function initChat() {
  try {
    flushReadUpdate()
    disconnectMessageObserver()
    closeMediaViewer()
    for (const m of chatStore.messages || []) cleanupMessagePreviews(m)
    if (!chatStore.conversations.length) await chatStore.getConversations()
    if (conversationId.value) {
      pendingAdId.value = null
      await chatStore.loadConversation(conversationId.value, { skipConversationsFetch: true })
      scrollToFirstUnread()
      nextTick(() => setupMessageObserver())
      return
    }
    if (adId.value) {
      pendingAdId.value = null
      const existing = await chatStore.findConversationByAdId(adId.value)
      if (existing?.id) return router.replace(`/chat/${existing.id}`)
      pendingAdId.value = adId.value
      chatStore.currentConversation = { id: null, adId: adId.value, title: `Чат по объявлению ${adId.value}` }
      chatStore.messages = []
      return
    }
    pendingAdId.value = null
    chatStore.currentConversation = null
    chatStore.messages = []
  } catch (err) {
    chatStore.error = err?.message || 'Ошибка загрузки чата'
  }
}

async function onSubmit() {
  try {
    isEditing.value ? await confirmEdit() : await sendNewMessage()
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

onMounted(initChat)
watch(() => route.params.conversationId, initChat)
watch(() => route.params.adId, initChat)

function handleViewerKeydown(event) {
  if (!mediaViewerMessage.value) return
  if (event.key === 'Escape') closeMediaViewer()
  if (event.key === 'ArrowLeft') previousMedia()
  if (event.key === 'ArrowRight') nextMedia()
}

watch(mediaViewerMessage, (current) => {
  if (current) window.addEventListener('keydown', handleViewerKeydown)
  else window.removeEventListener('keydown', handleViewerKeydown)
})

watch(() => chatStore.messages.length, () => {
  nextTick(() => observeCounterpartMessages())
})

onBeforeUnmount(() => {
  flushReadUpdate()
  disconnectMessageObserver()
  window.removeEventListener('keydown', handleViewerKeydown)
  for (const m of chatStore.messages || []) cleanupMessagePreviews(m)
  resetViewerPointerState()
  try { for (const att of composer.attachments || []) if (isFileObject(att)) revokeFilePreview(att) } catch {}
})

// Производные данные для шапки, карточки объявления и модерации.
const currentConv = computed(() => chatStore.currentConversation)
const selectedConversationId = computed(() => String(route.params.conversationId || ''))
const isConversationSelected = computed(() => Boolean(selectedConversationId.value || isPendingConversation.value))

const adImageUrl = computed(() => buildUrl(currentConv.value?.ad?.mainImagePath))
const adLink = computed(() => currentConv.value?.ad?.id ? `/ads/${currentConv.value.ad.id}` : null)
const mediaViewerCurrentAttachment = computed(() => mediaViewerAttachments.value[mediaViewerIndex.value] || null)
const mediaViewerCurrentUrl = computed(() => buildUrl(mediaViewerCurrentAttachment.value))
const mediaViewerCurrentIsVideo = computed(() => isVideoAttachment(mediaViewerCurrentAttachment.value) || String(mediaViewerCurrentAttachment.value?.type || '').toLowerCase() === 'video')
const mediaViewerImageStyle = computed(() => ({
  transform: `translate(-50%, -50%) translate3d(${mediaViewerPanX.value}px, ${mediaViewerPanY.value}px, 0) scale(${mediaViewerZoom.value})`,
  cursor: mediaViewerZoom.value > 1 ? 'grab' : 'zoom-in'
}))

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

const counterpart = computed(() => {
  const o = currentConv.value?.opponent
  if (!o) return null
  return { id: o.id, name: o.userName || o.userLogin || 'Собеседник', avatar: buildUrl(o.avatarPath), lastActivityAt: o.lastActivityAt || null }
})

</script>

<template>
  <div class="container-fluid px-3 px-lg-4 py-3 py-lg-4">
    <div class="mx-auto rounded-5 border bg-body-tertiary shadow-lg overflow-hidden" style="max-width: 1280px; height: calc(100vh - 90px); min-height: 540px;">
      <div class="d-flex flex-column flex-lg-row h-100 gap-3 p-3 p-lg-4" style="min-height: 0;">
        <!-- Список диалогов слева. -->
        <aside
          class="d-flex flex-column bg-white rounded-4 shadow-sm overflow-hidden"
          style="flex: 0 0 34%; min-width: 320px; max-width: 420px; min-height: 0;"
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
                    v-if="conv.ad?.mainImagePath"
                    v-intersect-lazy="buildUrl(conv.ad.mainImagePath)"
                    alt="ad"
                    class="w-100 h-100"
                    style="object-fit: cover;"
                  />
                  <div
                    v-else
                    class="w-100 h-100 d-flex align-items-center justify-content-center fw-semibold text-primary"
                  >
                    {{ getInitial(conv.displayTitle || conv.counterpartName || conv.title, conv.id) }}
                  </div>
                </div>

                <div class="flex-grow-1 min-w-0">
                  <div class="d-flex align-items-start justify-content-between gap-2 mb-1">
                    <span class="fw-semibold text-truncate">{{ conv.counterpartName || conv.displayTitle || conv.title || `Разговор #${conv.id}` }}</span>
                    <small class="text-secondary flex-shrink-0">{{ chatTime(conv.last_message_at || conv.lastMessageAt || conv.lastMessageTimestamp) }}</small>
                  </div>
                  <div class="small text-secondary text-truncate">{{ conv.adTitle || conv.displayMeta || `Объявление #${conv.adId}` }}</div>
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
              <component :is="counterpart?.id ? 'router-link' : 'div'" :to="counterpart?.id ? `/profile/${counterpart.id}` : null" class="d-flex align-items-center gap-3 text-decoration-none text-body min-w-0">
                <div class="rounded-circle overflow-hidden flex-shrink-0 bg-body-secondary border d-flex align-items-center justify-content-center" style="width: 44px; height: 44px;">
                  <img v-if="counterpart?.avatar" v-intersect-lazy="counterpart.avatar" class="w-100 h-100" style="object-fit: cover;" alt="">
                  <span v-else class="fw-semibold text-secondary">{{ getInitial(counterpart?.name, '') }}</span>
                </div>
                <div class="min-w-0">
                  <div class="fw-semibold text-truncate">{{ counterpart?.name }}</div>
                  <div class="small text-secondary text-truncate">{{ counterpart?.lastActivityAt ? timeAgo(counterpart.lastActivityAt, { prefix: 'Был(а) в сети ' }) : 'Был(а) в сети неизвестно' }}</div>
                </div>
              </component>

              <div class="dropdown flex-shrink-0">
                <button class="btn btn-link p-0 text-secondary text-decoration-none" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Действия">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
                  </svg>
                </button>
                <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0">
                  <li><button class="dropdown-item" type="button" @click="toggleMute">{{ currentConv?.muted ? 'Включить уведомления' : 'Выключить уведомления' }}</button></li>
                  <li><button class="dropdown-item" type="button" @click="toggleArchive">{{ currentConv?.archived ? 'Разархивировать' : 'Архивировать' }}</button></li>
                </ul>
              </div>
            </div>

            <!-- Карточка объявления, если чат привязан к ad. -->
            <div v-if="currentConv?.adTitle" class="bg-white border-bottom px-3 px-lg-4 py-3 d-flex align-items-center gap-3">
              <component :is="adLink ? 'router-link' : 'div'" :to="adLink" class="rounded-4 overflow-hidden bg-body-secondary border flex-shrink-0 text-decoration-none" style="width: 52px; height: 52px;">
                <img v-if="adImageUrl" v-intersect-lazy="adImageUrl" class="w-100 h-100" style="object-fit: cover;" alt="item">
              </component>
              <div class="min-w-0 flex-grow-1 d-flex align-items-center justify-content-between gap-3">
                <div class="min-w-0">
                  <component :is="adLink ? 'router-link' : 'div'" :to="adLink" class="d-block fw-semibold text-truncate text-body text-decoration-none">{{ currentConv.adTitle }}</component>
                  <div class="small text-secondary">{{ currentConv.ad?.price != null ? currentConv.ad.price + ' р.' : 'Цена не указана' }}</div>
                </div>
                <span class="badge rounded-pill" :class="moderation.cls">{{ moderation.label }}</span>
              </div>
            </div>

            <!-- Лента сообщений и вложений. -->
            <div ref="messagesContainer" class="flex-grow-1 overflow-auto p-3 p-lg-4" style="min-height: 0; background: linear-gradient(180deg, rgba(248,249,250,1) 0%, rgb(236, 240, 244) 100%);">
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

              <div v-for="msg in chatStore.messages" :key="msg.id" :id="'message-' + msg.id" class="d-flex mb-3" :class="isMine(msg) ? 'justify-content-end' : 'justify-content-start'">
                <!-- Аватар второго участника. -->
                <div v-if="!isMine(msg)" class="rounded-circle flex-shrink-0 me-2 align-self-end overflow-hidden bg-secondary-subtle border d-flex align-items-center justify-content-center text-secondary" style="width: 30px; height: 30px; font-size: 0.75rem; font-weight: 600;">
                  <img v-if="getAuthorAvatar(msg)" v-intersect-lazy="getAuthorAvatar(msg)" class="w-100 h-100" style="object-fit: cover;" alt="">
                  <span v-else>{{ getInitial(getAuthorName(msg), '?') }}</span>
                </div>

                <!-- Пузырь сообщения и его содержимое. -->
                <div class="d-inline-block" style="max-width: min(72%, 620px);">
                  <div v-if="!isMine(msg)" class="small text-secondary mb-1 ms-1">{{ getAuthorName(msg) ?? msg.authorId ?? msg.senderId ?? 'нет данных' }}</div>
                  <div class="px-3 py-2 px-lg-4 py-lg-3 rounded-4 shadow-sm border position-relative"
                    :class="[
                      getMessageBubbleClass(msg),
                      msg.deleted || msg.deletedAt ? 'opacity-50' : '',
                      msg.clientStatus === 'sending' || msg.clientStatus === 'editing' ? 'opacity-75' : ''
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
                        <button type="button" class="btn btn-link p-0 small text-decoration-none" @click="scrollToMessage(msg.replyToMessageId)">Перейти к сообщению</button>
                      </div>

                      <!-- Универсальная галерея (картинки + видео) -->
                      <div
                        v-if="getMediaAttachments(msg).length"
                        class="d-flex flex-wrap gap-2"
                        style="justify-content: flex-start;"
                      >
                        <button
                          v-for="(att, i) in getMediaAttachments(msg)"
                          :key="`${msg.id}-${att}-${i}`"
                          type="button"
                          class="btn p-0 border border-white border-opacity-10 shadow-sm"
                          :style="{ width: '150px', flexShrink: 0 }"
                          @click="openMediaViewer(msg, i)"
                        >
                          <div
                            :class="[
                              'ratio',
                              isHeroImageAttachment(msg, i) ? 'ratio-16x9' : 'ratio-4x3'
                            ]"
                            style="width: 150px;"
                          >
                            <!-- Картинка -->
                            <img
                              v-if="att.type === 'image' || isImageAttachment(att)"
                              v-intersect-lazy="buildUrl(att)"
                              class="w-100 h-100"
                              style="object-fit: cover;"
                              decoding="async"
                            />

                            <!-- Видео -->
                            <video
                              v-else-if="att.type === 'video' || isVideoAttachment(att)"
                              preload="metadata"
                              playsinline
                              class="w-100 h-100"
                              style="object-fit: cover; background: black;"
                            >
                              <source :src="buildUrl(att)" />
                            </video>
                          </div>
                        </button>
                      </div>

                      <!-- Аудио-вложения сообщения. -->
                      <template v-if="getAudioAttachments(msg).length">
                        <div class="d-flex flex-column gap-2 mt-2">
                          <div
                            v-for="(att, i) in getAudioAttachments(msg)"
                            :key="`${msg.id}-audio-${i}`"
                            class="rounded-4 border bg-body-tertiary p-2 p-lg-3"
                          >
                            <div class="small text-secondary text-truncate mb-2">{{ getAttachmentName(att) }}</div>
                            <audio class="w-100" controls preload="metadata" :src="buildUrl(att)">
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
                            class="text-decoration-none text-primary"
                          >📎 {{ getAttachmentName(att) }}</a>
                        </div>
                      </template>

                      <!-- Текст сообщения -->
                      <p
                        v-if="msg.text"
                        class="mb-0 text-break"
                        :class="getMessageAttachments(msg).length ? 'mt-2' : ''"
                        style="white-space: pre-wrap;"
                      >{{ msg.text }}</p>

                      <div v-if="isMessageBusy(msg) || msg.clientStatus === 'failed'" class="d-flex align-items-center justify-content-between gap-2 flex-wrap mt-2 small">
                        <span v-if="isMessageBusy(msg)" class="text-secondary d-inline-flex align-items-center gap-2">
                          <span class="spinner-border spinner-border-sm" style="width: 0.7rem; height: 0.7rem;" role="status" aria-hidden="true"></span>
                          {{ getMessagePreviewLabel(msg) }}
                        </span>
                        <span v-else class="text-danger">{{ getMessagePreviewLabel(msg) }}</span>
                        <button v-if="msg.clientStatus === 'failed'" type="button" class="btn btn-link btn-sm p-0 text-primary text-decoration-none" @click="retryPendingMessage(msg)">Повторить</button>
                      </div>
                    </div>

                    <div v-if="!isOutgoingMessage(msg)" class="d-flex align-items-center justify-content-end gap-1 mt-2">
                      <small :class="isMessageRead(msg) ? 'text-primary' : 'text-secondary'" style="font-size: 0.72rem;">{{ getReceiptIcon(msg) }}</small>
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
            </div>

            <!-- Панель отправки и редактирования сообщения. -->
            <div class="bg-white border-top p-3 p-lg-4">
              <div v-if="composerMode === 'edit'" class="d-flex align-items-center justify-content-between gap-3 rounded-4 border bg-warning-subtle px-3 py-2 mb-3 small">
                <span class="text-secondary">✏️ Редактирование сообщения</span>
                <button type="button" class="btn-close btn-sm" @click="cancelEdit"></button>
              </div>
              <div v-if="composer.attachments.length" class="d-flex flex-wrap gap-2 mb-3">
                <template v-for="(att, index) in composer.attachments" :key="`${index}-${(att && att.name) || att}`">
                  <div v-if="isImageAttachment(att)" class="position-relative overflow-hidden border border-white border-opacity-10 shadow-sm" style="width: 104px; aspect-ratio: 1 / 1; border-radius: 1rem; background: linear-gradient(180deg, rgba(15, 16, 18, 1) 0%, rgba(8, 9, 11, 1) 100%);">
                    <img :src="getAttachmentSrc(att)" class="w-100 h-100 d-block" style="object-fit: cover;" alt="">
                    <button type="button" class="btn btn-dark btn-sm position-absolute top-0 end-0 m-2 rounded-circle border-0 d-inline-flex align-items-center justify-content-center shadow-sm" style="width: 26px; height: 26px; line-height: 1; font-size: 0.8rem;" @click="removeAttachment(index)" title="Удалить изображение">×</button>
                  </div>
                  <div v-else-if="isVideoAttachment(att)" class="position-relative overflow-hidden border bg-body-tertiary rounded-3 shadow-sm" style="width: 180px; height: 120px;">
                    <video :src="getAttachmentSrc(att)" class="w-100 h-100" controls preload="metadata" playsinline style="border-radius: .6rem; object-fit: cover; background: #000"></video>
                    <button type="button" class="btn btn-dark btn-sm position-absolute top-0 end-0 m-2 rounded-circle border-0 d-inline-flex align-items-center justify-content-center shadow-sm" style="width: 26px; height: 26px; line-height: 1; font-size: 0.8rem;" @click="removeAttachment(index)" title="Удалить видео">×</button>
                  </div>
                  <div v-else-if="isAudioAttachment(att)" class="rounded-4 border bg-body-tertiary p-2 d-flex align-items-center gap-2" style="min-width: 240px;">
                    <audio :src="getAttachmentSrc(att)" controls preload="metadata" class="flex-grow-1"></audio>
                    <button type="button" class="btn btn-sm p-0 border-0 text-secondary" @click="removeAttachment(index)" title="Удалить аудио">×</button>
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
                  @input="autoResize"
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

  <div
    v-if="mediaViewerMessage && mediaViewerAttachments.length"
    class="modal d-block"
    tabindex="-1"
    style="background: rgba(10, 15, 25, 0.68); backdrop-filter: blur(12px);"
    @click.self="closeMediaViewer"
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
                <div class="h6 mb-0 text-white text-truncate">{{ getAuthorName(mediaViewerMessage) || 'Сообщение' }}</div>
              </div>
              <div style="pointer-events: auto;">
                <button type="button" class="btn-close btn-close-white" @click="closeMediaViewer" aria-label="Закрыть"></button>
              </div>
            </div>
            <!-- Слой для жестов, масштабирования и переключения кадров. -->
            <div
              ref="mediaViewerViewport"
              class="position-absolute top-0 start-0 w-100 h-100"
              style="touch-action: none;"
              @wheel.prevent="handleViewerWheel"
              @click="handleViewerClick"
              @pointerdown="handleViewerPointerDown"
              @pointermove="handleViewerPointerMove"
              @pointerup="handleViewerPointerEnd"
              @pointercancel="handleViewerPointerCancel"
            ></div>

            <!-- Текущее медиа в увеличенном просмотре. -->
            <template v-if="mediaViewerCurrentUrl">
              <img
                v-if="!mediaViewerCurrentIsVideo"
                :src="mediaViewerCurrentUrl"
                class="position-absolute top-50 start-50 d-block"
                :style="[
                  mediaViewerImageStyle,
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
                :src="mediaViewerCurrentUrl"
                class="position-absolute top-50 start-50 d-block"
                :style="[
                  mediaViewerImageStyle,
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
              @click="previousMedia"
              :disabled="mediaViewerIndex === 0"
              aria-label="Предыдущее"
            >
              <span class="btn btn-dark border-0 rounded-circle shadow-sm d-inline-flex align-items-center justify-content-center ms-3 ms-lg-4" style="width: 42px; height: 42px; pointer-events: none;">‹</span>
            </button>

            <!-- Правая зона навигации по медиа. -->
            <button
              type="button"
              class="btn position-absolute top-0 end-0 bottom-0 border-0 p-0 d-flex align-items-center justify-content-end"
              style="width: clamp(72px, 22%, 180px); z-index: 2; background: linear-gradient(270deg, rgba(10, 15, 25, 0.32), rgba(10, 15, 25, 0));"
              @click="nextMedia"
              :disabled="mediaViewerIndex === mediaViewerAttachments.length - 1"
              aria-label="Следующее"
            >
              <span class="btn btn-dark border-0 rounded-circle shadow-sm d-inline-flex align-items-center justify-content-center me-3 me-lg-4" style="width: 42px; height: 42px; pointer-events: none;">›</span>
            </button>

            <!-- Нижняя галерея миниатюр для быстрого выбора медиа. -->
            <div class="position-absolute start-0 end-0 bottom-0 p-3 p-lg-4" style="z-index: 3; pointer-events: none;">
              <div class="d-flex align-items-center gap-3 rounded-5 border border-white border-opacity-10 bg-dark bg-opacity-50 px-3 py-3 shadow-lg mx-auto" style="max-width: min(940px, 100%); backdrop-filter: blur(18px); pointer-events: auto;">
                <div class="badge bg-white text-dark rounded-4 flex-shrink-0 px-3 py-2">{{ mediaViewerIndex + 1 }} / {{ mediaViewerAttachments.length }}</div>
                <div class="d-flex align-items-center justify-content-center flex-nowrap gap-2 overflow-x-auto overflow-y-hidden flex-grow-1 min-w-0 py-1" style="scrollbar-width: thin; white-space: nowrap;">
                  <button
                    v-for="(att, index) in mediaViewerAttachments"
                    :key="`${mediaViewerMessage?.id}-${att}-${index}`"
                    type="button"
                    class="p-0 border-0 rounded-4 overflow-hidden flex-shrink-0 shadow-sm"
                    :class="index === mediaViewerIndex ? 'border border-2 border-primary' : 'border border-white border-opacity-10'"
                    @click="mediaViewerIndex = index"
                    style="width: 66px; height: 66px; background: linear-gradient(180deg, rgba(15, 16, 18, 1) 0%, rgba(8, 9, 11, 1) 100%);"
                  >
                    <img
                      v-if="!isVideoAttachment(att) && String(att?.type || '').toLowerCase() !== 'video'"
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
</template>