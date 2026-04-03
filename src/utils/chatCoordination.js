import { ref } from 'vue'

const STORAGE_PREFIX = 'adsportal:chat'
const TAB_ID_KEY = `${STORAGE_PREFIX}:tabId`
const READ_HIGH_WATER_PREFIX = `${STORAGE_PREFIX}:read-high-water`
const READ_LEASE_PREFIX = `${STORAGE_PREFIX}:read-lease`
const TYPING_STATE_PREFIX = `${STORAGE_PREFIX}:typing-state`

const READ_LEASE_TTL = 900
const TYPING_COOLDOWN_MS = 2000

const coordinationVersion = ref(0)

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (!event?.key) return
    if (
      event.key.startsWith(READ_HIGH_WATER_PREFIX)
      || event.key.startsWith(READ_LEASE_PREFIX)
      || event.key.startsWith(TYPING_STATE_PREFIX)
    ) {
      coordinationVersion.value += 1
    }
  })
}

const currentTabId = (() => {
  try {
    const existing = sessionStorage.getItem(TAB_ID_KEY)
    if (existing) return existing
    const generated = globalThis.crypto?.randomUUID?.() || `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    sessionStorage.setItem(TAB_ID_KEY, generated)
    return generated
  } catch {
    return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
})()

function readJson(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

function removeKey(key) {
  try {
    localStorage.removeItem(key)
  } catch {}
}

function toPositiveNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : 0
}

function readHighWaterKey(conversationId) {
  return `${READ_HIGH_WATER_PREFIX}:${String(conversationId ?? '')}`
}

function readLeaseKey(conversationId) {
  return `${READ_LEASE_PREFIX}:${String(conversationId ?? '')}`
}

function typingStateKey(conversationId) {
  return `${TYPING_STATE_PREFIX}:${String(conversationId ?? '')}`
}

function getReadHighWater(conversationId) {
  const cid = String(conversationId ?? '')
  if (!cid) return 0
  const stored = readJson(readHighWaterKey(cid))
  return toPositiveNumber(stored?.messageId)
}

function attemptReadEmission(conversationId, lastVisibleMessageId) {
  const cid = String(conversationId ?? '')
  const msgId = toPositiveNumber(lastVisibleMessageId)
  if (!cid || !msgId) return { status: 'invalid', messageId: 0, highWater: 0, expiresAt: 0 }

  const currentHighWater = getReadHighWater(cid)
  if (msgId <= currentHighWater) {
    return { status: 'duplicate', messageId: msgId, highWater: currentHighWater, expiresAt: 0 }
  }

  const leaseKey = readLeaseKey(cid)
  const now = Date.now()
  const existingLease = readJson(leaseKey)
  const existingExpiresAt = toPositiveNumber(existingLease?.expiresAt)
  const existingMessageId = toPositiveNumber(existingLease?.messageId)

  if (existingExpiresAt > now && existingLease?.tabId && existingLease.tabId !== currentTabId) {
    return {
      status: 'locked',
      messageId: msgId,
      highWater: currentHighWater,
      expiresAt: existingExpiresAt,
    }
  }

  if (existingExpiresAt > now && existingLease?.tabId === currentTabId && existingMessageId >= msgId) {
    return {
      status: 'locked',
      messageId: msgId,
      highWater: currentHighWater,
      expiresAt: existingExpiresAt,
    }
  }

  const expiresAt = now + READ_LEASE_TTL
  const lease = { tabId: currentTabId, messageId: msgId, expiresAt }
  if (!writeJson(leaseKey, lease)) {
    return { status: 'locked', messageId: msgId, highWater: currentHighWater, expiresAt }
  }

  const confirm = readJson(leaseKey)
  if (!confirm || confirm.tabId !== currentTabId || toPositiveNumber(confirm.messageId) !== msgId) {
    return { status: 'locked', messageId: msgId, highWater: currentHighWater, expiresAt }
  }

  return { status: 'acquired', messageId: msgId, highWater: currentHighWater, expiresAt }
}

function commitReadEmission(conversationId, lastVisibleMessageId) {
  const cid = String(conversationId ?? '')
  const msgId = toPositiveNumber(lastVisibleMessageId)
  if (!cid || !msgId) return false

  const key = readHighWaterKey(cid)
  const current = getReadHighWater(cid)
  if (msgId <= current) return true

  return writeJson(key, {
    tabId: currentTabId,
    messageId: msgId,
    updatedAt: Date.now(),
  })
}

function canEmitTyping(conversationId) {
  const cid = String(conversationId ?? '')
  if (!cid) return false

  const key = typingStateKey(cid)
  const now = Date.now()
  const state = readJson(key)
  const expiresAt = toPositiveNumber(state?.expiresAt)
  if (expiresAt > now) return false

  return writeJson(key, {
    tabId: currentTabId,
    expiresAt: now + TYPING_COOLDOWN_MS,
    updatedAt: now,
  })
}

function getTypingCooldownUntil(conversationId) {
  const cid = String(conversationId ?? '')
  if (!cid) return 0
  const state = readJson(typingStateKey(cid))
  return toPositiveNumber(state?.expiresAt)
}

function clearTypingState(conversationId) {
  const cid = String(conversationId ?? '')
  if (!cid) return
  removeKey(typingStateKey(cid))
}

function clearReadLease(conversationId) {
  const cid = String(conversationId ?? '')
  if (!cid) return
  const key = readLeaseKey(cid)
  const lease = readJson(key)
  if (!lease || lease.tabId === currentTabId) {
    removeKey(key)
  }
}

export {
  currentTabId,
  coordinationVersion,
  getReadHighWater,
  getTypingCooldownUntil,
  attemptReadEmission,
  commitReadEmission,
  clearReadLease,
  canEmitTyping,
  clearTypingState,
  READ_LEASE_TTL,
  TYPING_COOLDOWN_MS,
}