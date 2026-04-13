import { resolveMediaUrl } from '../utils/resolveMediaUrl'

export function toText(value) {
  return typeof value === 'string'
    ? value.trim()
    : value != null
      ? String(value)
      : ''
}

export function getFieldErrors(value) {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null

      const field = toText(item.field)
      const message = toText(item.message)
      if (!field && !message) return null

      return { field, message }
    })
    .filter(Boolean)
}

export const notificationRenderers = {
  AdApproved(entry) {
    const actorName = toText(entry?.actorName ?? entry?.data?.actorName)

    return {
      title: 'Объявление одобрено',
      subtitle: toText(entry?.adTitle ?? entry?.preview?.title),
      image: resolveMediaUrl(entry?.mainImagePath ?? entry?.preview?.mainImagePath),
      meta: actorName ? `Модератор: ${actorName}` : '',
      details: [],
      actionLabel: '',
      action: null,
      badgeLabel: 'Одобрено',
      variant: 'success',
    }
  },

  AdRejected(entry) {
    const actorName = toText(entry?.actorName ?? entry?.data?.actorName)
    const reason = toText(entry?.reason ?? entry?.data?.reason ?? '')
    const meta = [actorName ? `Модератор: ${actorName}` : '', reason ? `Причина: ${reason}` : '']
      .filter(Boolean)
      .join(' · ')

    return {
      title: 'Объявление отклонено',
      subtitle: toText(entry?.adTitle ?? entry?.preview?.title),
      image: resolveMediaUrl(entry?.mainImagePath ?? entry?.preview?.mainImagePath),
      meta,
      details: getFieldErrors(entry?.data?.fieldErrors),
      actionLabel: entry?.adId == null ? '' : 'Исправить',
      action: entry?.adId == null ? null : { type: 'edit', payload: { adId: entry?.adId } },
      badgeLabel: 'Отклонено',
      variant: 'danger',
    }
  },

  UserBanned() {
    return {
      title: 'Аккаунт заблокирован',
      subtitle: '',
      image: '',
      meta: '',
      details: [],
      actionLabel: '',
      action: null,
      badgeLabel: 'Блокировка',
      variant: 'danger',
    }
  },

  __default(entry) {
    return {
      title: 'Уведомление',
      subtitle: toText(entry?.adTitle ?? entry?.preview?.title),
      image: resolveMediaUrl(entry?.mainImagePath ?? entry?.preview?.mainImagePath),
      meta: entry?.type ? `Тип: ${entry.type}` : '',
      details: [],
      actionLabel: '',
      action: null,
      badgeLabel: 'Уведомление',
      variant: 'default',
    }
  },
}
