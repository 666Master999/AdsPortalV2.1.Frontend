<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, onUnmounted, watch, computed, nextTick } from 'vue'
import Sortable from 'sortablejs'
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
import { createGestureManager } from '../composables/useGestureManager'
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
const chatGestureManager = createGestureManager()

// Состояние чата и редактора сообщений.
const messagesContainer = ref(null)
const messageTextarea = ref(null)
const composerMode = ref('new') // 'new' | 'edit'
const replyDraft = ref(null)
const composer = reactive({
  text: '',
  attachments: [],
  originalAttachments: null,
  messageId: null,
})
const pendingAdId = ref(null)
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)
const composerAttachmentsRef = ref(null)
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
const isMobileViewport = computed(() => viewportWidth.value < 992)
const isConversationActionsOpen = ref(false)
const isMobileDrawerOpen = ref(false)
const mobileDrawerProgress = ref(0)
const isMobileDrawerGestureActive = ref(false)
const conversationActionsProgress = ref(0)
const isConversationActionsGestureActive = ref(false)
const activeMessageSwipeId = ref('')
const activeMessageSwipeOffset = ref(0)
const isMessageSwipeGestureActive = ref(false)
const pendingConversationActionsId = ref('')
const currentUserId = computed(() => String(userStore.user?.id ?? userStore.tokenUserId ?? ''))
const isPendingConversation = computed(() => Boolean(pendingAdId.value && !chatStore.currentConversation?.id))
const selectedConversationId = computed(() => String(route.params.conversationId || ''))
const isConversationSelected = computed(() => Boolean(selectedConversationId.value || isPendingConversation.value))
const currentConv = chatVm.activeConversation
const isConversationSyncing = chatVm.isConversationSyncing
const targetUserId = computed(() => String(chatVm.companion.value?.id ?? chatVm.activeConversation.value?.companion?.id ?? ''))
const isConversationBlockedByMe = computed(() => userStore.isUserBlocked(targetUserId.value))
const isConversationBlockedByUser = computed(() => userStore.isBlockedByUser(targetUserId.value))
const messageItems = chatVm.messageItems
const isDeletingConversation = ref(false)
const isConversationSelectionBusy = ref(false)
const conversationSelectionIds = ref([])
let composerSortable = null

const rublePriceFormatter = new Intl.NumberFormat('ru-RU')

function updateViewportWidth() {
  if (typeof window === 'undefined') return
  viewportWidth.value = window.innerWidth || 1280
}

function closeConversationActions() {
  isConversationActionsOpen.value = false
  conversationActionsProgress.value = 0
  isConversationActionsGestureActive.value = false
}

function clearReplyDraft() {
  replyDraft.value = null
}

function clearConversationSelection() {
  conversationSelectionIds.value = []
}

function openConversationActions() {
  if (!currentConv.value?.id || isConversationSyncing.value || isDeletingConversation.value || isConversationSelectionMode.value) return
  closeConversationDrawer()
  pendingConversationActionsId.value = ''
  isConversationActionsOpen.value = true
  conversationActionsProgress.value = 1
}

function requestConversationActions(conversationToOpen) {
  const cid = String(conversationToOpen ?? '')
  if (!cid || isDeletingConversation.value) return

  closeConversationActions()
  closeConversationDrawer()

  if (selectedConversationId.value === cid && String(currentConv.value?.id ?? '') === cid && !isConversationSyncing.value) {
    openConversationActions()
    return
  }

  pendingConversationActionsId.value = cid
  if (selectedConversationId.value !== cid) router.push(`/chat/${cid}`)
}

function toggleConversationActions() {
  if (isConversationActionsOpen.value) {
    closeConversationActions()
    return
  }
  requestConversationActions(currentConv.value?.id)
}

function closeConversationView() {
  pendingConversationActionsId.value = ''
  closeConversationActions()
  closeConversationDrawer()
  clearConversationSelection()
  clearReplyDraft()
  router.replace('/chat')
}

function openConversationDrawer() {
  closeConversationActions()
  if (!isMobileViewport.value || !isConversationSelected.value) return
  isMobileDrawerOpen.value = true
  mobileDrawerProgress.value = 1
}

function closeConversationDrawer() {
  isMobileDrawerOpen.value = false
  mobileDrawerProgress.value = 0
  isMobileDrawerGestureActive.value = false
}

function isDrawerInteractiveTarget(target) {
  return Boolean(target?.closest?.('button, a, input, textarea, label, video, audio, [role="button"], [data-no-drawer-gesture]'))
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function resetMessageSwipeGesture() {
  activeMessageSwipeId.value = ''
  activeMessageSwipeOffset.value = 0
  isMessageSwipeGestureActive.value = false
}

function getMessageSwipeOffset(messageId) {
  return activeMessageSwipeId.value === String(messageId ?? '')
    ? activeMessageSwipeOffset.value
    : 0
}

function isMessageSwipeActive(messageId) {
  return isMessageSwipeGestureActive.value && activeMessageSwipeId.value === String(messageId ?? '')
}

function getChatGestureSurface(target) {
  return String(target?.closest?.('[data-chat-gesture-surface]')?.getAttribute('data-chat-gesture-surface') || '')
}

function handleChatGesturePointerDown(event) {
  chatGestureManager.onPointerDown(event)
}

function handleChatGesturePointerMove(event) {
  chatGestureManager.onPointerMove(event)
}

function handleChatGesturePointerUp(event) {
  chatGestureManager.onPointerUp(event)
}

function handleChatGesturePointerCancel(event) {
  chatGestureManager.onPointerCancel(event)
}

function formatConversationAdPrice(ad) {
  if (!ad || typeof ad !== 'object') return { label: '', isError: false }
  if (ad.isNegotiable === true) return { label: 'Договорная', isError: false }
  if (typeof ad.price === 'number' && Number.isFinite(ad.price)) {
    if (ad.price === 0) return { label: 'Бесплатно', isError: false }
    if (ad.price > 0) return { label: `${rublePriceFormatter.format(ad.price)} рублей`, isError: false }
  }
  return { label: 'Ошибка цены', isError: true }
}

const messageListStyle = computed(() => ({
  minHeight: '0',
  background: 'linear-gradient(180deg, rgba(248,249,250,1) 0%, rgb(236, 240, 244) 100%)',
  paddingBottom: isMobileViewport.value
    ? 'calc(96px + env(safe-area-inset-bottom, 0px))'
    : 'clamp(120px, 18vh, 220px)',
  touchAction: 'pan-y',
}))

const composerPanelStyle = computed(() => ({
  position: 'sticky',
  bottom: '0',
  zIndex: '4',
  paddingBottom: isMobileViewport.value
    ? 'calc(0.75rem + env(safe-area-inset-bottom, 0px))'
    : undefined,
  boxShadow: isMobileViewport.value
    ? '0 -12px 24px rgba(15, 23, 42, 0.08)'
    : undefined,
}))

const mediaDialogStyle = computed(() => isMobileViewport.value
  ? 'max-width: 100vw; width: 100vw; margin: 0;'
  : 'max-width: min(95vw, 95vw);')

const mediaContentClass = computed(() => isMobileViewport.value
  ? 'border-0 overflow-hidden bg-transparent d-flex flex-column rounded-0'
  : 'border-0 rounded-5 overflow-hidden shadow-lg bg-transparent d-flex flex-column')

const mediaContentStyle = computed(() => isMobileViewport.value
  ? 'max-height: 100dvh; height: 100dvh;'
  : 'max-height: min(92vh, 92vh);')

const mediaCanvasStyle = computed(() => ({
  height: isMobileViewport.value ? '100dvh' : 'clamp(95vh, 66vh, 760px)',
  userSelect: 'none',
  paddingTop: isMobileViewport.value ? 'env(safe-area-inset-top, 0px)' : undefined,
}))

const mediaStageStyle = computed(() => ({
  position: 'absolute',
  inset: isMobileViewport.value
    ? '72px 0 calc(132px + env(safe-area-inset-bottom, 0px)) 0'
    : '88px 0 136px 0',
  overflow: 'hidden',
}))

const mediaThumbWrapStyle = computed(() => ({
  zIndex: '3',
  pointerEvents: 'none',
  padding: isMobileViewport.value
    ? '0.75rem 0.75rem calc(0.75rem + env(safe-area-inset-bottom, 0px))'
    : undefined,
}))

const mediaThumbRailStyle = computed(() => ({
  maxWidth: isMobileViewport.value ? '100%' : 'min(940px, 100%)',
  backdropFilter: 'blur(18px)',
  pointerEvents: 'auto',
}))

const mediaVideoToolbarStyle = computed(() => ({
  zIndex: '5',
  bottom: isMobileViewport.value
    ? 'calc(148px + env(safe-area-inset-bottom, 0px))'
    : '156px',
  pointerEvents: 'auto',
}))

const companionPresenceTone = computed(() => {
  if (companionTyping.value) return '#0d6efd'
  if (companionInDialog.value) return '#6f42c1'
  if (presenceStore.isOnline(companion.value?.id)) return '#198754'
  return '#6c757d'
})

const companionPresenceTextStyle = computed(() => ({
  color: companionPresenceTone.value,
  transition: 'color 0.25s ease, opacity 0.25s ease',
}))

const companionPresenceDotStyle = computed(() => ({
  position: 'absolute',
  right: '-2px',
  bottom: '-2px',
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  border: '2px solid #fff',
  background: companionHasDialog.value
    ? '#6f42c1'
    : presenceStore.isOnline(companion.value?.id)
      ? '#198754'
      : '#adb5bd',
  transform: companionHasDialog.value || presenceStore.isOnline(companion.value?.id)
    ? 'scale(1.15)'
    : 'scale(1)',
  transition: 'background-color 0.25s ease, transform 0.25s ease',
}))

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
    const selector = `[data-msg-id="${msg.domId || `message-${source?.id}`}"][data-att-key="${att.key}"]`
    const el = typeof document !== 'undefined' ? document.querySelector(selector) : null
    const srcFromEl = el ? (el.currentSrc || el.src || null) : null
    const rawAttachment = att.raw ?? att
    return {
      original: rawAttachment,
      src: srcFromEl || att.src || buildUrl(rawAttachment),
      node: el && !isVideoAttachment(rawAttachment) ? el : null,
      key: att.key,
    }
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

function destroyComposerSortable() {
  if (composerSortable) {
    composerSortable.destroy()
    composerSortable = null
  }
}

function initComposerSortable() {
  if (!composerAttachmentsRef.value || !composer.attachments.length || isEditing.value) {
    destroyComposerSortable()
    return
  }
  if (composerSortable) return
  composerSortable = Sortable.create(composerAttachmentsRef.value, {
    animation: 180,
    ghostClass: 'opacity-50',
    chosenClass: 'shadow-sm',
    draggable: '.composer-attachment-item',
    handle: '.composer-attachment-handle',
    delayOnTouchOnly: true,
    delay: 120,
    touchStartThreshold: 6,
    onEnd: ({ oldIndex, newIndex }) => {
      if (oldIndex == null || newIndex == null || oldIndex === newIndex) return
      const next = [...composer.attachments]
      const [moved] = next.splice(oldIndex, 1)
      next.splice(newIndex, 0, moved)
      composer.attachments = next
    },
  })
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
  if (options.clearReply !== false) clearReplyDraft()
  resizeTextarea()
}

function cleanupMessagePreviews(message) {
  const source = message?.source ?? message
  try { for (const att of source?.attachments || []) if (isFileObject(att)) revokeFilePreview(att) } catch {}
}

async function sendNewMessage() {
  const text = composer.text
  const attachments = [...composer.attachments]
  const replyToMessageId = replyDraft.value?.id != null ? Number(replyDraft.value.id) : null
  attachments.forEach(setFilePreview)
  resetComposer({ revokePreviews: false })
  scrollManager.scrollToBottom()

  if (chatStore.currentConversationId) {
    await chatStore.sendMessage(text, attachments, replyToMessageId)
  } else if (pendingAdId.value || adId.value) {
    const result = await chatStore.sendMessageByAdId(pendingAdId.value || adId.value, text, attachments, replyToMessageId)
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
  clearReplyDraft()
  composer.text = source.text || ''
  composer.attachments = getMessageAttachments(source)
  composer.originalAttachments = getMessageAttachments(source)
  composer.messageId = source.id
  nextTick(() => { autoResize(); messageTextarea.value?.focus() })
}

function startReply(message) {
  const source = message?.source ?? message
  const replyToMessageId = Number(source?.id)
  if (!Number.isFinite(replyToMessageId) || replyToMessageId <= 0) return
  if (isEditing.value) resetComposer()
  replyDraft.value = {
    id: String(replyToMessageId),
    authorName: message?.authorName || getAuthorName(source) || 'Сообщение',
    previewText: source?.text || (getMessageAttachments(source).length ? 'Вложение' : 'Сообщение'),
  }
  nextTick(() => messageTextarea.value?.focus())
}

function canRemoveComposerAttachment(attachment) {
  return !isEditing.value || isFileObject(attachment)
}

function removeAttachment(index) {
  const currentAttachment = composer.attachments[index]
  if (!canRemoveComposerAttachment(currentAttachment)) return

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
    const patch = {}
    if (textChanged) patch.text = composer.text
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
  closeConversationActions()
  if (currentConv.value?.id) await chatStore.mute(currentConv.value.id, !currentConv.value.isMuted)
}

async function toggleArchive() {
  closeConversationActions()
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

  closeConversationActions()
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

  closeConversationActions()
  const title = currentConv.value?.companion?.name || currentConv.value?.ad?.title || `#${cid}`
  if (typeof window !== 'undefined' && !window.confirm(`Удалить диалог «${title}»?`)) return

  isDeletingConversation.value = true
  try {
    const itemsToCleanup = [...(messageItems.value || [])]
    await chatStore.deleteConversation(cid)
    pendingConversationActionsId.value = ''
    clearConversationSelection()
    for (const item of itemsToCleanup) cleanupMessagePreviews(item)
    chatVm.clearConversationCache(cid)
    unreadDividerId.value = null
    scrollManager.firstUnreadId.value = null
    readTracker.disconnectObserver()
    mediaViewer.close()
    closeConversationDrawer()
    resetComposer()
    await router.replace('/chat')
  } catch (err) {
    const apiError = await handleApiError(err, { notify: false })
    chatStore.error = toPublicErrorMessage(apiError, 'Ошибка удаления диалога')
  } finally {
    isDeletingConversation.value = false
  }
}

function selectConversation(id) {
  const conversationId = String(id ?? '')
  if (!conversationId) return
  if (isConversationSelectionMode.value) {
    toggleConversationSelection(conversationId)
    return
  }
  pendingConversationActionsId.value = ''
  closeConversationActions()
  closeConversationDrawer()
  router.push(`/chat/${conversationId}`)
}

function handleConversationHold(item) {
  const conversationId = String(item?.id ?? '')
  if (!conversationId) return
  closeConversationActions()
  if (!conversationSelectionIds.value.includes(conversationId)) {
    conversationSelectionIds.value = [...conversationSelectionIds.value, conversationId]
  }
}

function toggleConversationSelection(item) {
  const conversationId = String(item?.id ?? item ?? '')
  if (!conversationId) return
  if (!isConversationSelectionMode.value) {
    conversationSelectionIds.value = [conversationId]
    return
  }

  const nextIds = conversationSelectionIds.value.includes(conversationId)
    ? conversationSelectionIds.value.filter(id => id !== conversationId)
    : [...conversationSelectionIds.value, conversationId]

  conversationSelectionIds.value = nextIds
}

function getConversationSelectionPrompt(count) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return `${count} диалог`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} диалога`
  return `${count} диалогов`
}

async function applyConversationSelectionMutation(action, nextValue) {
  const ids = [...conversationSelectionIds.value]
  if (!ids.length || isConversationSelectionBusy.value) return

  isConversationSelectionBusy.value = true
  try {
    const results = await Promise.allSettled(ids.map(id => action(id, nextValue)))
    const failedIds = ids.filter((_, index) => results[index]?.status === 'rejected')
    conversationSelectionIds.value = failedIds
    if (failedIds.length) {
      chatStore.error = 'Не удалось применить действие ко всем выбранным диалогам'
      return
    }
    chatStore.error = null
  } catch (err) {
    const apiError = await handleApiError(err, { notify: false })
    chatStore.error = toPublicErrorMessage(apiError, 'Не удалось применить действие к выбранным диалогам')
  } finally {
    isConversationSelectionBusy.value = false
  }
}

async function toggleSelectedConversationsMute() {
  await applyConversationSelectionMutation((id, nextValue) => chatStore.mute(id, nextValue), !areSelectedConversationsMuted.value)
}

async function toggleSelectedConversationsArchive() {
  await applyConversationSelectionMutation((id, nextValue) => chatStore.archive(id, nextValue), !areSelectedConversationsArchived.value)
}

async function deleteSelectedConversations() {
  const ids = [...conversationSelectionIds.value]
  if (!ids.length || isConversationSelectionBusy.value) return
  if (typeof window !== 'undefined' && !window.confirm(`Удалить ${getConversationSelectionPrompt(ids.length)}?`)) return

  isConversationSelectionBusy.value = true
  try {
    const itemsToCleanup = [...(messageItems.value || [])]
    const results = await Promise.allSettled(ids.map(id => chatStore.deleteConversation(id)))
    const deletedIds = ids.filter((_, index) => results[index]?.status === 'fulfilled')
    const failedIds = ids.filter((_, index) => results[index]?.status === 'rejected')

    deletedIds.forEach(id => chatVm.clearConversationCache(id))
    conversationSelectionIds.value = failedIds

    if (deletedIds.includes(String(currentConv.value?.id ?? chatStore.currentConversationId ?? ''))) {
      for (const item of itemsToCleanup) cleanupMessagePreviews(item)
      unreadDividerId.value = null
      scrollManager.firstUnreadId.value = null
      readTracker.disconnectObserver()
      mediaViewer.close()
      resetComposer()
      closeConversationDrawer()
      closeConversationActions()
      await router.replace('/chat')
    }

    if (!failedIds.length) {
      chatStore.error = null
      clearConversationSelection()
      return
    }

    chatStore.error = 'Не удалось удалить все выбранные диалоги'
  } catch (err) {
    const apiError = await handleApiError(err, { notify: false })
    chatStore.error = toPublicErrorMessage(apiError, 'Ошибка удаления выбранных диалогов')
  } finally {
    isConversationSelectionBusy.value = false
  }
}

async function initChat() {
  try {
    closeConversationActions()
    closeConversationDrawer()
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
        chatStore.error = 'Для вашего аккаунта отключена отправка сообщений'
      } else {
        if (targetUserId.value && !isConversationBlockedByMe.value) {
          userStore.setBlockedByUserId(targetUserId.value, true)
        }
        chatStore.error = 'Собеседник ограничил вам отправку сообщений'
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
  composer.attachments = [...(composer.attachments || []), ...files]
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

watch([() => route.params.conversationId, () => route.params.adId], () => {
  closeConversationActions()
  clearConversationSelection()
  initChat()
}, { immediate: true })

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

watch(() => composer.attachments.length, (length) => {
  if (!length) {
    destroyComposerSortable()
    return
  }
  nextTick(() => initComposerSortable())
})

watch(isEditing, (editing) => {
  if (editing) {
    destroyComposerSortable()
    return
  }

  if (composer.attachments.length) {
    nextTick(() => initComposerSortable())
  }
})

watch(isMobileViewport, (mobile) => {
  if (!mobile) {
    closeConversationDrawer()
  }
})

watch([() => currentConv.value?.id, isConversationSyncing], ([currentId, syncing]) => {
  if (!pendingConversationActionsId.value || syncing) return
  if (String(currentId ?? '') !== pendingConversationActionsId.value) return
  openConversationActions()
})

watch(selectedConversationId, (value) => {
  if (value) return
  pendingConversationActionsId.value = ''
  clearReplyDraft()
})

onMounted(() => {
  updateViewportWidth()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateViewportWidth, { passive: true })
    window.addEventListener('pointermove', handleChatGesturePointerMove)
    window.addEventListener('pointerup', handleChatGesturePointerUp)
    window.addEventListener('pointercancel', handleChatGesturePointerCancel)
  }
})

onBeforeUnmount(() => {
  const prevConvId = chatStore.currentConversationId || chatStore.currentConversation?.id
  if (prevConvId) presenceStore.leaveConversation(prevConvId)
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateViewportWidth)
    window.removeEventListener('pointermove', handleChatGesturePointerMove)
    window.removeEventListener('pointerup', handleChatGesturePointerUp)
    window.removeEventListener('pointercancel', handleChatGesturePointerCancel)
  }
  chatGestureManager.cancel()
  unregisterChatMessageGesture()
  unregisterChatDrawerGesture()
  unregisterConversationActionsGesture()
  destroyComposerSortable()
  readTracker.cleanup()
  try { delete window.__chatStore } catch {}
  for (const item of messageItems.value || []) cleanupMessagePreviews(item)
  mediaViewer.close()
  try { for (const att of composer.attachments || []) if (isFileObject(att)) revokeFilePreview(att) } catch {}
})

// Производные данные для шапки, карточки объявления и модерации.
const mobileDrawerWidth = computed(() => Math.min(Math.max(Math.round(viewportWidth.value * 0.72), 280), 420))
const isMobileDrawerShellVisible = computed(() => isMobileViewport.value && isConversationSelected.value)
const mobileDrawerOverlayStyle = computed(() => ({
  opacity: mobileDrawerProgress.value,
  pointerEvents: mobileDrawerProgress.value > 0 ? 'auto' : 'none',
  transition: isMobileDrawerGestureActive.value ? 'none' : 'opacity 220ms ease',
  background: 'rgba(15, 23, 42, 0.28)',
  zIndex: '10',
  touchAction: 'none',
}))
const mobileDrawerPanelStyle = computed(() => ({
  width: `${mobileDrawerWidth.value}px`,
  transform: `translateX(${Math.round((mobileDrawerProgress.value - 1) * mobileDrawerWidth.value)}px)`,
  transition: isMobileDrawerGestureActive.value ? 'none' : 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)',
  pointerEvents: mobileDrawerProgress.value > 0 ? 'auto' : 'none',
  zIndex: '11',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  touchAction: 'pan-y',
}))
const conversationActionsWidth = computed(() => isMobileViewport.value
  ? Math.min(Math.max(Math.round(viewportWidth.value * 0.88), 312), 420)
  : Math.min(Math.max(Math.round(viewportWidth.value * 0.36), 340), 420))
const isConversationActionsShellVisible = computed(() => Boolean(currentConv.value?.id) && isConversationSelected.value)
const conversationActionsOverlayStyle = computed(() => ({
  opacity: conversationActionsProgress.value,
  pointerEvents: conversationActionsProgress.value > 0 ? 'auto' : 'none',
  transition: isConversationActionsGestureActive.value ? 'none' : 'opacity 220ms ease',
  background: 'rgba(15, 23, 42, 0.32)',
  zIndex: '1082',
}))
const conversationActionsPanelStyle = computed(() => ({
  width: `${conversationActionsWidth.value}px`,
  maxWidth: '100%',
  transform: `translateX(${Math.round((1 - conversationActionsProgress.value) * conversationActionsWidth.value)}px)`,
  transition: isConversationActionsGestureActive.value ? 'none' : 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)',
  pointerEvents: conversationActionsProgress.value > 0 ? 'auto' : 'none',
  zIndex: '1083',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingBottom: isMobileViewport.value ? 'env(safe-area-inset-bottom, 0px)' : undefined,
  touchAction: 'pan-y',
}))
const conversationItems = chatVm.conversationItems
const isConversationSelectionMode = computed(() => conversationSelectionIds.value.length > 0)
const selectedConversationItems = computed(() => {
  const selectedIdSet = new Set(conversationSelectionIds.value.map(id => String(id)))
  return conversationItems.value.filter(item => selectedIdSet.has(String(item.id)))
})
const areSelectedConversationsMuted = computed(() => selectedConversationItems.value.length > 0 && selectedConversationItems.value.every(item => item?.isMuted))
const areSelectedConversationsArchived = computed(() => selectedConversationItems.value.length > 0 && selectedConversationItems.value.every(item => item?.isArchived))
const selectedConversationsMuteLabel = computed(() => areSelectedConversationsMuted.value ? 'Включить уведомления' : 'Выключить уведомления')
const selectedConversationsArchiveLabel = computed(() => areSelectedConversationsArchived.value ? 'Разархивировать' : 'Архивировать')
const selectedConversationsCountLabel = computed(() => getConversationSelectionPrompt(conversationSelectionIds.value.length))
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
const conversationAdPrice = computed(() => formatConversationAdPrice(currentConv.value?.ad))
const companionHandle = computed(() => {
  const raw = currentConv.value?.companion?.userLogin
    || currentConv.value?.companion?.userName
    || companion.value?.userLogin
    || companion.value?.userName
    || ''
  return String(raw || '').trim()
})
const conversationActionDetails = computed(() => ([
  { label: 'ID диалога', value: currentConv.value?.id ? `#${currentConv.value.id}` : '...' },
  { label: 'ID собеседника', value: companion.value?.id ? `#${companion.value.id}` : '...' },
  { label: 'Логин', value: companionHandle.value ? `@${companionHandle.value}` : 'Публичный логин пока не передан' },
  { label: 'Статус', value: currentConv.value ? lastSeenText.value : '...' },
  { label: 'Объявление', value: currentConv.value?.ad?.title || 'Нет привязанного объявления' },
]))
const conversationStateBadges = computed(() => {
  const badges = []
  if (currentConv.value?.isMuted) {
    badges.push({ label: 'Уведомления выключены', className: 'text-bg-light border text-secondary' })
  }
  if (currentConv.value?.isArchived) {
    badges.push({ label: 'Диалог в архиве', className: 'text-bg-light border text-secondary' })
  }
  if (isConversationBlockedByMe.value) {
    badges.push({ label: 'Вы ограничили сообщения', className: 'bg-secondary-subtle text-secondary border border-secondary-subtle' })
  }
  if (isConversationBlockedByUser.value) {
    badges.push({ label: 'Собеседник ограничил сообщения', className: 'bg-warning-subtle text-warning-emphasis border border-warning-subtle' })
  }
  return badges
})
const sendDisabledReason = computed(() => (isPendingConversation.value ? null : chatVm.sendDisabledReason.value))
const canSendMessage = computed(() => (isPendingConversation.value ? true : !isConversationSyncing.value && !sendDisabledReason.value))
const composerAccessBanner = computed(() => {
  if (isPendingConversation.value || isConversationSyncing.value) return null
  if (isConversationBlockedByMe.value) {
    return {
      wrapperClass: 'border-secondary-subtle bg-body-tertiary',
      titleClass: 'text-secondary',
      title: 'Вы ограничили этот диалог',
      description: 'Снимите блокировку, чтобы снова отправлять сообщения собеседнику.',
      actionLabel: 'Разблокировать',
    }
  }
  if (isConversationBlockedByUser.value) {
    return {
      wrapperClass: 'border-warning-subtle bg-warning-subtle',
      titleClass: 'text-warning-emphasis',
      title: 'Собеседник ограничил новые сообщения',
      description: 'Отправка в этот диалог сейчас недоступна.',
      actionLabel: '',
    }
  }
  if (access.hasRestriction('ChatBan')) {
    return {
      wrapperClass: 'border-danger-subtle bg-danger-subtle',
      titleClass: 'text-danger-emphasis',
      title: 'Отправка сообщений отключена',
      description: 'Для вашего аккаунта действует ограничение на переписку.',
      actionLabel: '',
    }
  }
  return null
})

const unregisterChatMessageGesture = chatGestureManager.register({
  id: 'chat-message-reply',
  priority: 30,
  canStart({ session, detail }) {
    if (detail.direction !== 'left' || isConversationSyncing.value) return false
    if (isDrawerInteractiveTarget(session.startTarget)) return false
    const messageNode = session.startTarget?.closest?.('[data-message-id]')
    const messageId = String(messageNode?.getAttribute?.('data-message-id') || '')
    if (!messageId) return false
    session.data.messageId = messageId
    return true
  },
  onStart({ session }) {
    activeMessageSwipeId.value = String(session.data.messageId || '')
    activeMessageSwipeOffset.value = 0
    isMessageSwipeGestureActive.value = Boolean(activeMessageSwipeId.value)
  },
  onMove({ detail }) {
    if (!activeMessageSwipeId.value) return
    activeMessageSwipeOffset.value = clampNumber(detail.dx, -88, 0)
  },
  onEnd() {
    const messageId = activeMessageSwipeId.value
    const shouldReply = Math.abs(activeMessageSwipeOffset.value) >= 54
    const message = messageItems.value.find(item => String(item.id) === messageId) || null
    resetMessageSwipeGesture()
    if (shouldReply && message) startReply(message)
  },
  onCancel() {
    resetMessageSwipeGesture()
  },
})

const unregisterChatDrawerGesture = chatGestureManager.register({
  id: 'chat-drawer',
  priority: 20,
  canStart({ session, detail }) {
    if (!isMobileViewport.value || !isConversationSelected.value || isConversationActionsOpen.value) return false

    const surface = getChatGestureSurface(session.startTarget)
    if (!surface) return false

    if (detail.direction === 'right') {
      return surface === 'main' && !isDrawerInteractiveTarget(session.startTarget)
    }

    if (detail.direction === 'left') {
      if (mobileDrawerProgress.value <= 0) return false
      if (surface !== 'drawer-panel' && surface !== 'drawer-overlay') return false
      if (surface === 'drawer-panel' && isDrawerInteractiveTarget(session.startTarget)) return false
      return true
    }

    return false
  },
  onStart({ session }) {
    closeConversationActions()
    session.data.startProgress = mobileDrawerProgress.value
    isMobileDrawerGestureActive.value = true
  },
  onMove({ session, detail }) {
    const width = Math.max(mobileDrawerWidth.value, 1)
    const startProgress = clampNumber(Number(session.data.startProgress ?? mobileDrawerProgress.value), 0, 1)
    mobileDrawerProgress.value = clampNumber(startProgress + detail.dx / width, 0, 1)
  },
  onEnd() {
    isMobileDrawerGestureActive.value = false
    const shouldOpen = mobileDrawerProgress.value >= 0.42
    isMobileDrawerOpen.value = shouldOpen
    mobileDrawerProgress.value = shouldOpen ? 1 : 0
  },
  onCancel({ session }) {
    isMobileDrawerGestureActive.value = false
    const startProgress = clampNumber(Number(session?.data?.startProgress ?? (isMobileDrawerOpen.value ? 1 : 0)), 0, 1)
    const shouldOpen = startProgress >= 0.5
    isMobileDrawerOpen.value = shouldOpen
    mobileDrawerProgress.value = shouldOpen ? 1 : 0
  },
})

const unregisterConversationActionsGesture = chatGestureManager.register({
  id: 'chat-actions-panel',
  priority: 10,
  canStart({ session, detail }) {
    if (!isConversationActionsShellVisible.value || detail.direction !== 'right') return false
    if (getChatGestureSurface(session.startTarget) !== 'actions-panel') return false
    return !isDrawerInteractiveTarget(session.startTarget)
  },
  onStart({ session }) {
    session.data.startProgress = conversationActionsProgress.value
    isConversationActionsGestureActive.value = true
  },
  onMove({ session, detail }) {
    const width = Math.max(conversationActionsWidth.value, 1)
    const startProgress = clampNumber(Number(session.data.startProgress ?? conversationActionsProgress.value), 0, 1)
    conversationActionsProgress.value = clampNumber(startProgress - detail.dx / width, 0, 1)
  },
  onEnd() {
    isConversationActionsGestureActive.value = false
    const shouldOpen = conversationActionsProgress.value >= 0.58
    isConversationActionsOpen.value = shouldOpen
    conversationActionsProgress.value = shouldOpen ? 1 : 0
  },
  onCancel({ session }) {
    isConversationActionsGestureActive.value = false
    const startProgress = clampNumber(Number(session?.data?.startProgress ?? (isConversationActionsOpen.value ? 1 : 0)), 0, 1)
    const shouldOpen = startProgress >= 0.5
    isConversationActionsOpen.value = shouldOpen
    conversationActionsProgress.value = shouldOpen ? 1 : 0
  },
})

function onTextareaInput(e) {
  autoResize(e)
  const cid = chatStore.currentConversationId || chatStore.currentConversation?.id
  if (cid) presenceStore.handleTypingInput(cid)
}

</script>

<template>
  <div class="h-100 d-flex flex-column overflow-hidden position-relative" style="min-height: 0;" @pointerdown.capture="handleChatGesturePointerDown">
  <div class="container-fluid d-flex flex-column overflow-hidden" :class="isMobileViewport ? 'px-0 py-0' : 'px-3 px-lg-4 py-3 py-lg-4'" style="flex: 1; min-height: 0;">
    <div class="mx-auto w-100 d-flex flex-column overflow-hidden" :class="isMobileViewport ? 'bg-white' : 'rounded-5 border bg-body-tertiary shadow-lg'" style="max-width: 1280px; flex: 1; min-height: 0;">
      <div class="d-flex flex-column flex-lg-row flex-grow-1 overflow-hidden" :class="isMobileViewport ? 'gap-0 p-0' : 'gap-3 p-3 p-lg-4'" style="min-height: 0;">
        <!-- Список диалогов слева. -->
        <aside
          class="d-flex flex-column bg-white overflow-hidden flex-shrink-0"
          :style="{ width: isMobileViewport ? '100%' : 'min(100%, 420px)', minWidth: '0', minHeight: '0' }"
          :class="[isConversationSelected ? 'd-none d-lg-flex' : 'd-flex', isMobileViewport ? 'rounded-0 shadow-none border-end border-light-subtle' : 'rounded-4 shadow-sm']"
        >
          <!-- Заголовок и счётчик чатов. -->
          <div class="px-3 px-lg-4 py-3 border-bottom bg-white d-flex align-items-center justify-content-between ">
            <div>
              <div class="small text-uppercase text-secondary fw-semibold mb-1 ">Messages</div>
              <h1 class="h5 mb-0">{{ isConversationSelectionMode ? 'Выбор диалогов' : 'Чаты' }}</h1>
            </div>
            <div v-if="isConversationSelectionMode" class="d-flex align-items-center gap-2 flex-wrap justify-content-end">
              <span class="badge rounded-pill text-bg-primary">{{ selectedConversationsCountLabel }}</span>
              <button type="button" class="btn btn-light border rounded-pill px-3 py-2" :disabled="isConversationSelectionBusy" @click="toggleSelectedConversationsMute">{{ selectedConversationsMuteLabel }}</button>
              <button type="button" class="btn btn-light border rounded-pill px-3 py-2" :disabled="isConversationSelectionBusy" @click="toggleSelectedConversationsArchive">{{ selectedConversationsArchiveLabel }}</button>
              <button type="button" class="btn btn-light border rounded-pill px-3 py-2 text-danger" :disabled="isConversationSelectionBusy" @click="deleteSelectedConversations">Удалить</button>
              <button type="button" class="btn btn-outline-secondary rounded-pill px-3 py-2" :disabled="isConversationSelectionBusy" @click="clearConversationSelection">Отмена</button>
            </div>
            <span v-else class="badge rounded-pill text-bg-light border text-secondary">{{ chatStore.conversations.length }}</span>
          </div>

          <ChatConversationList
            class="flex-grow-1"
            :items="conversationItems"
            :loading="chatStore.isLoading"
            :error="chatStore.error || ''"
            :selection-mode="isConversationSelectionMode"
            :selected-ids="conversationSelectionIds"
            @select="selectConversation"
            @hold="handleConversationHold"
            @toggle-selection="toggleConversationSelection"
          />
        </aside>

        <section
          class="d-flex flex-column bg-white flex-grow-1 overflow-hidden"
          style="min-width: 0; min-height: 0; flex: 1 1 0;"
          :class="[isConversationSelected ? 'd-flex' : 'd-none d-lg-flex', isMobileViewport ? 'rounded-0 shadow-none' : 'rounded-4 shadow-sm']"
        >
          <!-- Активный диалог или заглушка без выбранного чата. -->
          <div class="d-flex flex-column flex-grow-1 overflow-hidden" style="min-height: 0; touch-action: pan-y;" data-chat-gesture-surface="main">
            <!-- Шапка диалога с собеседником и действиями. -->
            <div v-if="currentConv || isPendingConversation" class="bg-white border-bottom" :class="isMobileViewport ? 'px-3 py-2' : 'px-3 px-lg-4 py-3'">
              <div class="d-flex align-items-start justify-content-between gap-3">
                <div class="d-flex align-items-center gap-2 min-w-0 flex-grow-1">
                  <button class="btn btn-light border rounded-circle d-lg-none flex-shrink-0 d-inline-flex align-items-center justify-content-center" type="button" style="width: 40px; height: 40px;" @click="openConversationDrawer" aria-label="Открыть список диалогов">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg">
                      <path d="M4 7h16"/>
                      <path d="M4 12h16"/>
                      <path d="M4 17h10"/>
                    </svg>
                  </button>
                  <component :is="companion?.id ? 'router-link' : 'div'" :to="companion?.id ? `/users/${companion.id}` : null" class="d-flex align-items-center gap-3 text-decoration-none text-body min-w-0 flex-grow-1">
                    <div class="rounded-circle overflow-visible flex-shrink-0 bg-body-secondary border d-flex align-items-center justify-content-center" :style="{ width: isMobileViewport ? '40px' : '44px', height: isMobileViewport ? '40px' : '44px', position: 'relative' }">
                      <div class="w-100 h-100 rounded-circle overflow-hidden d-flex align-items-center justify-content-center">
                        <img v-if="companion?.avatar" v-intersect-lazy="companion.avatar" class="w-100 h-100 d-block" style="object-fit: cover;" alt="">
                        <span v-else class="fw-semibold text-secondary">{{ getInitial(companion?.name || 'D', '') }}</span>
                      </div>
                      <span v-if="currentConv" :style="companionPresenceDotStyle"></span>
                    </div>
                    <div class="min-w-0">
                      <div class="fw-semibold text-truncate">{{ companion?.name || 'Новый диалог' }}</div>
                      <div class="small text-truncate" :class="currentConv ? lastSeenClass : 'text-secondary'" :style="currentConv ? companionPresenceTextStyle : null">{{ currentConv ? lastSeenText : 'Диалог будет создан после первого сообщения' }}</div>
                    </div>
                  </component>
                </div>

                <div v-if="currentConv?.id" class="flex-shrink-0">
                  <div class="d-flex align-items-center gap-2">
                    <button class="btn btn-light border rounded-circle d-inline-flex align-items-center justify-content-center text-secondary" type="button" title="Закрыть диалог" :style="{ width: isMobileViewport ? '40px' : '44px', height: isMobileViewport ? '40px' : '44px' }" @click="closeConversationView">×</button>
                    <button class="btn btn-light border rounded-circle d-inline-flex align-items-center justify-content-center text-secondary" type="button" :aria-expanded="isConversationActionsOpen" title="Действия" :style="{ width: isMobileViewport ? '40px' : '44px', height: isMobileViewport ? '40px' : '44px' }" @click="toggleConversationActions">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Карточка объявления, если чат привязан к ad. -->
            <div v-if="currentConv?.ad?.title" class="bg-white border-bottom" :class="isMobileViewport ? 'px-3 py-2' : 'px-3 px-lg-4 py-3'">
              <div class="d-flex align-items-center gap-3">
                <component :is="adLink ? 'router-link' : 'div'" :to="adLink" class="rounded-4 overflow-hidden bg-body-secondary border flex-shrink-0 text-decoration-none" :style="{ width: isMobileViewport ? '44px' : '52px', height: isMobileViewport ? '44px' : '52px' }">
                  <img v-if="adImageUrl" v-intersect-lazy="adImageUrl" class="w-100 h-100" style="object-fit: cover;" alt="item">
                </component>
                <div class="min-w-0 flex-grow-1 d-flex align-items-center justify-content-between gap-3">
                  <div class="min-w-0">
                    <component :is="adLink ? 'router-link' : 'div'" :to="adLink" class="d-block fw-semibold text-truncate text-body text-decoration-none">{{ currentConv?.ad?.title }}</component>
                    <div class="small text-truncate" :class="conversationAdPrice.isError ? 'text-danger' : 'text-secondary'">{{ conversationAdPrice.label }}</div>
                  </div>
                  <span class="badge rounded-pill flex-shrink-0" :class="moderation.cls">{{ moderation.label }}</span>
                </div>
              </div>
            </div>

            <!-- Лента сообщений и вложений. -->
            <div ref="messagesContainer" @scroll.passive="scrollManager.updateScrollState" class="flex-grow-1 overflow-auto" :class="isMobileViewport ? 'p-2' : 'p-3 p-lg-4'" :style="messageListStyle">
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

              <div v-else-if="!messageItems.length" class="h-100 d-flex align-items-center justify-content-center text-center text-secondary px-4">
                <div class="bg-white border rounded-5 shadow-sm p-4 p-lg-5" style="max-width: 440px;">
                  <div class="fw-semibold h6 mb-2">{{ isPendingConversation ? 'Напишите первое сообщение' : (currentConv ? 'Сообщений пока нет' : 'Выберите диалог') }}</div>
                  <p class="mb-0 small text-secondary">{{ isPendingConversation ? 'Диалог будет создан после отправки первого сообщения.' : (currentConv ? 'Начните переписку, отправив первое сообщение.' : 'Слева отображается список чатов. Нажмите на любой диалог, чтобы открыть переписку.') }}</p>
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
                    :swipe-offset="getMessageSwipeOffset(msg.id)"
                    :swipe-active="isMessageSwipeActive(msg.id)"
                    @open-media="({ message, index }) => openMediaViewer(message, index)"
                    @jump-to-reply="scrollManager.scrollToMessage"
                    @reply="startReply"
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
            <div v-show="currentConv || isPendingConversation" class="bg-white border-top flex-shrink-0" :class="isMobileViewport ? 'p-2' : 'p-3 p-lg-4'" :style="composerPanelStyle">
              <div v-if="companionTyping" class="small text-primary mb-2 d-flex align-items-center gap-2">
                <span class="spinner-grow spinner-grow-sm" style="width: 0.5rem; height: 0.5rem;" role="status"></span>
                {{ typingIndicatorText }}
              </div>
              <div v-if="composerMode === 'edit'" class="d-flex align-items-center justify-content-between gap-3 rounded-4 border bg-warning-subtle px-3 py-2 mb-3 small">
                <span class="text-secondary">✏️ Редактирование сообщения</span>
                <button type="button" class="btn-close btn-sm" @click="cancelEdit"></button>
              </div>
              <div v-if="replyDraft" class="d-flex align-items-center justify-content-between gap-3 rounded-4 border bg-primary-subtle px-3 py-2 mb-3 small">
                <div class="min-w-0">
                  <div class="fw-semibold text-primary mb-1">Ответ на сообщение</div>
                  <div class="text-body text-truncate">{{ replyDraft.authorName }}: {{ replyDraft.previewText }}</div>
                </div>
                <button type="button" class="btn-close btn-sm" @click="clearReplyDraft"></button>
              </div>
              <div v-if="composerAccessBanner" class="rounded-4 border px-3 py-3 d-flex align-items-start justify-content-between gap-3" :class="composerAccessBanner.wrapperClass">
                <div class="min-w-0">
                  <div class="fw-semibold mb-1" :class="composerAccessBanner.titleClass">{{ composerAccessBanner.title }}</div>
                  <div class="small text-secondary mb-0">{{ composerAccessBanner.description }}</div>
                </div>
                <button v-if="composerAccessBanner.actionLabel" type="button" class="btn btn-outline-secondary btn-sm rounded-pill flex-shrink-0" @click="toggleBlockUser">{{ composerAccessBanner.actionLabel }}</button>
              </div>
              <template v-else>
                <div v-if="sendDisabledReason" class="alert alert-warning py-2 px-3 mb-3">
                  {{ sendDisabledReason }}
                </div>
                <div v-if="composer.attachments.length > 1 && !isEditing" class="small text-secondary mb-2 px-1">Перетаскивайте вложения за маркер, чтобы изменить порядок.</div>
                <div v-else-if="composer.attachments.length && isEditing" class="small text-secondary mb-2 px-1">Редактирование меняет текст сообщения. Новые файлы можно добавить отдельно, текущие вложения остаются только для просмотра.</div>
                <div v-if="composer.attachments.length" ref="composerAttachmentsRef" class="d-flex flex-wrap gap-2 mb-3" style="max-height: clamp(120px, 30vh, 320px); overflow:auto;">
                  <template v-for="(att, index) in composer.attachments" :key="attachmentKey(att, index)">
                    <div v-if="isImageAttachment(att)" class="composer-attachment-item position-relative overflow-hidden border border-white border-opacity-10 shadow-sm flex-shrink-0" style="width: 104px; aspect-ratio: 1 / 1; border-radius: 1rem; background: linear-gradient(180deg, rgba(15, 16, 18, 1) 0%, rgba(8, 9, 11, 1) 100%);">
                      <img :src="buildUrl(att)" class="w-100 h-100 d-block" style="object-fit: cover;" alt="">
                      <button v-if="!isEditing" type="button" class="composer-attachment-handle btn btn-light btn-sm position-absolute top-0 start-0 m-2 rounded-circle border-0 d-inline-flex align-items-center justify-content-center shadow-sm" style="width: 26px; height: 26px; line-height: 1; font-size: 0.72rem; touch-action: none; cursor: grab;" title="Перетащить изображение">⋮⋮</button>
                      <button type="button" class="btn btn-dark btn-sm position-absolute top-0 end-0 m-2 rounded-circle border-0 d-inline-flex align-items-center justify-content-center shadow-sm" style="width: 26px; height: 26px; line-height: 1; font-size: 0.8rem;" :disabled="!canRemoveComposerAttachment(att)" @click="removeAttachment(index)" title="Удалить изображение">×</button>
                    </div>
                    <div v-else-if="isVideoAttachment(att)" class="composer-attachment-item position-relative overflow-hidden border bg-body-tertiary rounded-3 shadow-sm flex-shrink-0" style="width: 180px; height: 120px;">
                      <video :src="buildUrl(att)" class="w-100 h-100" controls preload="metadata" playsinline style="border-radius: .6rem; object-fit: cover; background: #000"></video>
                      <button v-if="!isEditing" type="button" class="composer-attachment-handle btn btn-light btn-sm position-absolute top-0 start-0 m-2 rounded-circle border-0 d-inline-flex align-items-center justify-content-center shadow-sm" style="width: 26px; height: 26px; line-height: 1; font-size: 0.72rem; touch-action: none; cursor: grab;" title="Перетащить видео">⋮⋮</button>
                      <button type="button" class="btn btn-dark btn-sm position-absolute top-0 end-0 m-2 rounded-circle border-0 d-inline-flex align-items-center justify-content-center shadow-sm" style="width: 26px; height: 26px; line-height: 1; font-size: 0.8rem;" :disabled="!canRemoveComposerAttachment(att)" @click="removeAttachment(index)" title="Удалить видео">×</button>
                    </div>
                    <div v-else-if="isAudioAttachment(att)" class="composer-attachment-item w-100 min-w-0 overflow-hidden bg-white border border-light-subtle rounded-5 p-2 shadow-sm d-flex flex-column gap-2">
                      <div class="d-flex align-items-center gap-2 min-w-0 overflow-hidden">
                        <button v-if="!isEditing" type="button" class="composer-attachment-handle btn btn-sm btn-light rounded-circle flex-shrink-0 d-inline-flex align-items-center justify-content-center" style="width: 32px; height: 32px; touch-action: none; cursor: grab;" title="Перетащить аудио">⋮⋮</button>
                        <span class="flex-shrink-0 rounded-circle bg-primary-subtle text-primary d-inline-flex align-items-center justify-content-center border-0 shadow-sm" style="width: 40px; height: 40px; opacity: 0.7">{{ getAttachmentKindEmoji(att) }}</span>
                        <div class="min-w-0 flex-grow-1 overflow-hidden">
                          <div class="fw-semibold text-truncate d-block" :title="getAttachmentName(att)">{{ getAttachmentName(att) }}</div>
                          <div class="small text-secondary text-truncate d-block">{{ getAttachmentKindLabel(att) }}</div>
                        </div>
                        <button type="button" class="btn btn-sm btn-outline-secondary rounded-circle flex-shrink-0 d-inline-flex align-items-center justify-content-center" style="width: 28px; height: 28px;" :disabled="!canRemoveComposerAttachment(att)" @click="removeAttachment(index)" title="Удалить аудио">×</button>
                      </div>
                      <audio :src="buildUrl(att)" controls preload="metadata" class="w-100 d-block"></audio>
                    </div>
                    <div v-else class="composer-attachment-item badge text-bg-light border text-body rounded-pill d-inline-flex align-items-center gap-2 px-3 py-2">
                      <button v-if="!isEditing" type="button" class="composer-attachment-handle btn btn-sm p-0 border-0 text-secondary d-inline-flex align-items-center justify-content-center" style="width: 18px; height: 18px; touch-action: none; cursor: grab;" title="Перетащить файл">⋮⋮</button>
                      <span class="text-truncate" style="max-width: 180px;">{{ getAttachmentName(att) }}</span>
                      <button type="button" class="btn btn-sm p-0 border-0 text-secondary" :disabled="!canRemoveComposerAttachment(att)" @click="removeAttachment(index)" title="Удалить файл">×</button>
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
              </template>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>

  <div v-show="isMobileDrawerShellVisible" class="position-absolute top-0 start-0 w-100 h-100" :style="mobileDrawerOverlayStyle" data-chat-gesture-surface="drawer-overlay" @click="closeConversationDrawer"></div>

  <aside v-show="isMobileDrawerShellVisible" class="position-absolute top-0 start-0 h-100 bg-white border-end shadow-lg d-flex flex-column overflow-hidden" :style="mobileDrawerPanelStyle" data-chat-gesture-surface="drawer-panel">
    <div class="px-3 pt-3 pb-2 border-bottom bg-white d-flex align-items-center justify-content-between gap-3">
      <div>
        <div class="small text-uppercase text-secondary fw-semibold mb-1">Messages</div>
        <div class="fw-semibold">{{ isConversationSelectionMode ? 'Выбор диалогов' : 'Чаты' }}</div>
      </div>
      <div class="d-flex align-items-center gap-2 flex-wrap justify-content-end">
        <span v-if="isConversationSelectionMode" class="badge rounded-pill text-bg-primary">{{ selectedConversationsCountLabel }}</span>
        <button v-if="isConversationSelectionMode" type="button" class="btn btn-light border rounded-pill px-3 py-2" :disabled="isConversationSelectionBusy" @click="toggleSelectedConversationsMute">{{ selectedConversationsMuteLabel }}</button>
        <button v-if="isConversationSelectionMode" type="button" class="btn btn-light border rounded-pill px-3 py-2" :disabled="isConversationSelectionBusy" @click="toggleSelectedConversationsArchive">{{ selectedConversationsArchiveLabel }}</button>
        <button v-if="isConversationSelectionMode" type="button" class="btn btn-light border rounded-pill px-3 py-2 text-danger" :disabled="isConversationSelectionBusy" @click="deleteSelectedConversations">Удалить</button>
        <button v-if="isConversationSelectionMode" type="button" class="btn btn-outline-secondary rounded-pill px-3 py-2" :disabled="isConversationSelectionBusy" @click="clearConversationSelection">Отмена</button>
        <button type="button" class="btn btn-light border rounded-circle d-inline-flex align-items-center justify-content-center" style="width: 38px; height: 38px;" @click="closeConversationDrawer" aria-label="Закрыть список диалогов">×</button>
      </div>
    </div>
    <ChatConversationList
      class="flex-grow-1"
      :items="conversationItems"
      :loading="chatStore.isLoading"
      :error="chatStore.error || ''"
      :selection-mode="isConversationSelectionMode"
      :selected-ids="conversationSelectionIds"
      @select="selectConversation"
      @hold="handleConversationHold"
      @toggle-selection="toggleConversationSelection"
    />
  </aside>

  <div v-show="isConversationActionsShellVisible" class="position-absolute top-0 start-0 w-100 h-100" :style="conversationActionsOverlayStyle" @click="closeConversationActions"></div>

  <aside v-show="isConversationActionsShellVisible" class="position-absolute top-0 end-0 h-100 bg-white border-start shadow-lg d-flex flex-column overflow-hidden" :class="isMobileViewport ? 'rounded-0' : 'rounded-start-5'" :style="conversationActionsPanelStyle" data-chat-gesture-surface="actions-panel">
    <div class="px-3 pt-3 pb-2 border-bottom bg-white d-flex align-items-start justify-content-between gap-3">
      <div class="d-flex align-items-center gap-3 min-w-0 flex-grow-1">
        <div class="rounded-circle overflow-visible flex-shrink-0 bg-body-secondary border d-flex align-items-center justify-content-center" style="width: 48px; height: 48px; position: relative;">
          <div class="w-100 h-100 rounded-circle overflow-hidden d-flex align-items-center justify-content-center">
            <img v-if="companion?.avatar" v-intersect-lazy="companion.avatar" class="w-100 h-100 d-block" style="object-fit: cover;" alt="">
            <span v-else class="fw-semibold text-secondary">{{ getInitial(companion?.name || 'D', '') }}</span>
          </div>
          <span :style="companionPresenceDotStyle"></span>
        </div>
        <div class="min-w-0 flex-grow-1">
          <div class="small text-uppercase text-secondary fw-semibold mb-1">Диалог</div>
          <div class="fw-semibold text-truncate">{{ companion?.name || 'Собеседник' }}</div>
          <div class="small text-truncate" :class="lastSeenClass" :style="companionPresenceTextStyle">{{ lastSeenText }}</div>
        </div>
      </div>
      <button type="button" class="btn btn-light border rounded-circle d-inline-flex align-items-center justify-content-center flex-shrink-0" style="width: 38px; height: 38px;" aria-label="Закрыть действия" data-no-drawer-gesture="true" @click="closeConversationActions">×</button>
    </div>

    <div class="flex-grow-1 overflow-auto p-3 p-lg-4 d-flex flex-column gap-3" style="min-height: 0;">
      <div class="rounded-4 border bg-body-tertiary p-3">
        <div class="small text-uppercase text-secondary fw-semibold mb-2">О собеседнике</div>
        <div class="d-grid gap-2">
          <div v-for="detail in conversationActionDetails" :key="detail.label" class="d-flex align-items-start justify-content-between gap-3">
            <span class="small text-secondary flex-shrink-0">{{ detail.label }}</span>
            <span class="small text-end text-body">{{ detail.value }}</span>
          </div>
        </div>
      </div>

      <div v-if="conversationStateBadges.length" class="d-flex flex-wrap gap-2">
        <span v-for="badge in conversationStateBadges" :key="badge.label" class="badge rounded-pill px-3 py-2" :class="badge.className">{{ badge.label }}</span>
      </div>

      <div v-if="currentConv?.ad?.title" class="rounded-4 border p-3">
        <div class="small text-uppercase text-secondary fw-semibold mb-2">Объявление</div>
        <div class="d-flex align-items-center gap-3">
          <component :is="adLink ? 'router-link' : 'div'" :to="adLink" class="rounded-4 overflow-hidden bg-body-secondary border flex-shrink-0 text-decoration-none" style="width: 56px; height: 56px;">
            <img v-if="adImageUrl" v-intersect-lazy="adImageUrl" class="w-100 h-100" style="object-fit: cover;" alt="item">
          </component>
          <div class="min-w-0 flex-grow-1">
            <component :is="adLink ? 'router-link' : 'div'" :to="adLink" class="d-block fw-semibold text-truncate text-body text-decoration-none">{{ currentConv?.ad?.title }}</component>
            <div class="small text-truncate" :class="conversationAdPrice.isError ? 'text-danger' : 'text-secondary'">{{ conversationAdPrice.label }}</div>
          </div>
        </div>
      </div>

      <div class="rounded-4 border bg-body-tertiary p-3">
        <div class="small text-uppercase text-secondary fw-semibold mb-2">Скоро здесь</div>
        <div class="small text-secondary mb-0">Отзывы, общие объявления и дополнительные сведения профиля будут подтягиваться в этот блок по публичному профилю собеседника.</div>
      </div>

      <div>
        <div class="small text-uppercase text-secondary fw-semibold mb-2">Действия</div>
        <div class="d-grid gap-2">
          <button class="btn btn-light text-start rounded-4 px-3 py-3" type="button" :disabled="isConversationSyncing" @click="toggleMute">{{ currentConv?.isMuted ? 'Включить уведомления' : 'Выключить уведомления' }}</button>
          <button class="btn btn-light text-start rounded-4 px-3 py-3" type="button" :disabled="isConversationSyncing" @click="toggleArchive">{{ currentConv?.isArchived ? 'Разархивировать' : 'Архивировать' }}</button>
          <button class="btn btn-light text-start rounded-4 px-3 py-3 text-danger" type="button" :disabled="isConversationSyncing || isDeletingConversation || !targetUserId" @click="toggleBlockUser">{{ isConversationBlockedByMe ? 'Разблокировать пользователя' : 'Заблокировать пользователя' }}</button>
          <button class="btn btn-light text-start rounded-4 px-3 py-3 text-danger" type="button" :disabled="isConversationSyncing || isDeletingConversation" @click="deleteConversation">Удалить диалог</button>
        </div>
      </div>
    </div>
  </aside>

  <div
    v-if="mediaViewer.message.value && mediaViewer.attachments.value.length"
    class="modal d-block"
    tabindex="-1"
    style="background: rgba(10, 15, 25, 0.68); backdrop-filter: blur(12px);"
    @click.self="mediaViewer.close"
  >
    <!-- Модальное окно просмотра изображения. -->
    <div class="modal-dialog modal-dialog-centered modal-xl" :style="mediaDialogStyle">
      <div class="modal-content" :class="mediaContentClass" :style="mediaContentStyle">
          <!-- Холст просмотра и панель управления. -->
          <div class="position-relative overflow-hidden bg-black shadow-sm mx-auto w-100" :class="isMobileViewport ? 'rounded-0' : 'rounded-5'" :style="mediaCanvasStyle">
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
              <div class="w-100" :style="mediaStageStyle">
                <div class="d-flex h-100" :style="mediaViewer.trackStyle.value">
                    <div v-for="(att, vidIdx) in mediaViewer.attachments.value" :key="att.key" class="h-100" :style="{ flex: `0 0 ${100 / (mediaViewer.attachments.value.length || 1)}%` }">
                        <div class="d-flex align-items-center justify-content-center h-100 w-100 px-3" style="position:relative;">
                      <div v-if="att.node" class="slide-content w-100 h-100" :data-slide-key="att.key" style="display:flex;align-items:center;justify-content:center;"></div>
                          <template v-else>
                            <img v-if="!isVideoAttachment(att.original || att)"
                              :src="att.src || buildUrl(att.original || att)"
                              :ref="el => mediaViewer.setMediaElement(att.key, el)"
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
                              :ref="el => mediaViewer.setMediaElement(att.key, el)"
                              class="d-block"
                              :style="[mediaViewer.slideStyle.value, { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', background: 'black', willChange: 'transform' }]"
                              controls
                              preload="metadata"
                              playsinline
                              @loadedmetadata="mediaViewer.syncCurrentVideoState"
                              @play="mediaViewer.syncCurrentVideoState"
                              @pause="mediaViewer.syncCurrentVideoState"
                              @ended="mediaViewer.syncCurrentVideoState"
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

            <div v-if="mediaViewer.currentIsVideo.value" class="position-absolute start-50 translate-middle-x d-flex align-items-center gap-2" :style="mediaVideoToolbarStyle">
              <button type="button" class="btn btn-dark border-0 rounded-pill px-3 py-2 shadow-sm" @click="mediaViewer.seekCurrentVideo(-10)">-10с</button>
              <button type="button" class="btn btn-light border-0 rounded-circle d-inline-flex align-items-center justify-content-center shadow-sm" :style="{ width: isMobileViewport ? '52px' : '48px', height: isMobileViewport ? '52px' : '48px' }" @click="mediaViewer.toggleCurrentVideoPlayback">
                {{ mediaViewer.isCurrentVideoPaused.value ? '▶' : '❚❚' }}
              </button>
              <button type="button" class="btn btn-dark border-0 rounded-pill px-3 py-2 shadow-sm" @click="mediaViewer.seekCurrentVideo(10)">+10с</button>
            </div>

            <!-- Нижняя галерея миниатюр для быстрого выбора медиа. -->
            <div class="position-absolute start-0 end-0 bottom-0" :style="mediaThumbWrapStyle">
              <div class="d-flex align-items-center gap-3 rounded-5 border border-white border-opacity-10 bg-dark bg-opacity-50 px-3 py-3 shadow-lg mx-auto" :style="mediaThumbRailStyle">
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