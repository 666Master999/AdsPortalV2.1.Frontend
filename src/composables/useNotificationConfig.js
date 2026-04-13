import { computed, unref } from 'vue'
import { timeAgo } from '../utils/formatDate'
import { notificationRenderers } from '../services/notificationRenderers'

function readValue(source) {
  return typeof source === 'function'
    ? source()
    : unref(source)
}

export function useNotificationConfig(source, compactSource = false) {
  return computed(() => {
    const entry = readValue(source) || {}
    const isCompact = Boolean(readValue(compactSource))
    const renderer = notificationRenderers[entry?.type] || notificationRenderers.__default
    const base = renderer(entry)
    const rawDate = entry?.createdAt ?? null
    const parsedDate = rawDate ? new Date(rawDate) : null

    return {
      ...base,
      isRead: Boolean(entry?.isRead),
      date: rawDate,
      timestamp: rawDate,
      formattedDate: rawDate ? timeAgo(rawDate) : '',
      fullDateTitle: parsedDate && !Number.isNaN(parsedDate.getTime())
        ? parsedDate.toLocaleString()
        : '',
      interactive: !isCompact && entry?.adId != null,
      titleClass: base.variant === 'success'
        ? 'text-success'
        : base.variant === 'danger'
          ? 'text-danger'
          : 'text-body',
      badgeClass: base.variant === 'success'
        ? 'bg-success-subtle text-success-emphasis'
        : base.variant === 'danger'
          ? 'bg-danger-subtle text-danger-emphasis'
          : 'bg-secondary-subtle text-secondary-emphasis',
      actionButtonClass: base.action?.type === 'edit'
        ? 'btn btn-sm btn-outline-danger rounded-pill px-3 fw-semibold'
        : 'btn btn-sm btn-outline-primary rounded-pill px-3 fw-semibold',
      imageAlt: base.subtitle || base.title || 'Изображение',
    }
  })
}
