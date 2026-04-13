import { useUserStore } from '../stores/userStore'

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase()
}

export function mapRestrictionToBlockedReason(type) {
  const normalized = normalizeRole(type)
  if (normalized === 'postban') return 'post-ban'
  if (normalized === 'chatban' || normalized === 'commentban') return 'chat-ban'
  if (normalized === 'loginban') return 'login-ban'
  return 'access-denied'
}

export function createAccessService(userStore) {
  const store = userStore

  function isAuthenticated() {
    return Boolean(store?.token || localStorage.getItem('token'))
  }

  function hasRole(role) {
    return Boolean(store?.hasRole?.(role))
  }

  function hasAnyRole(roles = []) {
    return Boolean(store?.hasAnyRole?.(roles))
  }

  function hasPermission(permission) {
    return Boolean(store?.hasPermission?.(permission))
  }

  function hasAnyPermission(permissions = []) {
    return Boolean(store?.hasAnyPermission?.(permissions))
  }

  function hasRestriction(restrictionType) {
    return Boolean(store?.hasRestriction?.(restrictionType))
  }

  function isUserBlocked(targetUserId) {
    return Boolean(store?.isUserBlocked?.(targetUserId))
  }

  function isBlockedByUser(targetUserId) {
    return Boolean(store?.isBlockedByUser?.(targetUserId))
  }

  function getRestrictionReason(restrictionType, fallback = '') {
    const reason = store?.getRestriction?.(restrictionType)?.reason
    return String(reason || fallback).trim()
  }

  function canAccessAdmin() {
    if (!store) return false
    if (store.canAccessAdmin !== undefined) return Boolean(store.canAccessAdmin)

    return hasAnyRole(['Admin', 'SuperAdmin'])
  }

  function canModerate() {
    if (!store) return false
    if (store.canModerateAds !== undefined) return Boolean(store.canModerateAds)

    return hasAnyRole(['Moderator', 'Admin', 'SuperAdmin'])
  }

  function canCreateAd() {
    return !hasRestriction('PostBan')
  }

  function getCreateAdBlockedReason() {
    if (!hasRestriction('PostBan')) return ''
    return getRestrictionReason('PostBan', 'Создание объявлений ограничено (PostBan).')
  }

  function isAccountBlocked() {
    return hasRestriction('LoginBan')
  }

  function isRateLimited() {
    return Boolean(store?.rateLimitState)
  }

  function getRateLimitSeconds() {
    const seconds = Number(store?.rateLimitState?.retryAfterSeconds)
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 0
  }

  function getRateLimitReason() {
    if (!isRateLimited()) return ''

    const message = String(store?.rateLimitState?.message || 'Слишком много запросов. Повторите позже.').trim()
    const retryAfter = getRateLimitSeconds()
    if (retryAfter > 0) return `${message} Повторите через ${retryAfter} сек.`
    return message
  }

  function canSendMessage(targetUserId) {
    return !getSendMessageBlockedReason(targetUserId)
  }

  function getSendMessageBlockedReason(targetUserId) {
    const rateLimitReason = getRateLimitReason()
    if (rateLimitReason) return rateLimitReason

    if (hasRestriction('ChatBan')) {
      return 'Вам запрещено отправлять сообщения'
    }

    if (isUserBlocked(targetUserId)) {
      return 'Вы заблокировали пользователя'
    }

    if (isBlockedByUser(targetUserId)) {
      return 'Пользователь заблокировал вас'
    }

    return ''
  }

  function getAuthState() {
    return String(store?.authState || (isAuthenticated() ? 'authenticated' : 'unauthenticated'))
  }

  return {
    getAuthState,
    isAuthenticated,
    hasRole,
    hasAnyRole,
    hasPermission,
    hasAnyPermission,
    hasRestriction,
    isUserBlocked,
    isBlockedByUser,
    canCreateAd,
    canSendMessage,
    canModerate,
    canAccessAdmin,
    isAccountBlocked,
    isRateLimited,
    getRateLimitSeconds,
    getRateLimitReason,
    getCreateAdBlockedReason,
    getSendMessageBlockedReason,
    mapRestrictionToBlockedReason,
  }
}

export function useAccessService() {
  const userStore = useUserStore()
  return createAccessService(userStore)
}
