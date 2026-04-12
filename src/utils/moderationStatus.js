const MODERATION_STATUS_META = {
  active: {
    label: 'Активно',
    className: 'bg-success',
  },
  pendingModeration: {
    label: 'На модерации',
    className: 'bg-warning text-dark',
  },
  rejected: {
    label: 'Отклонено',
    className: 'bg-danger',
  },
  deleted: {
    label: 'Удалено',
    className: 'bg-secondary',
  },
}

export function normalizeModerationStatus(value) {
  if (value === undefined || value === null || value === '') return null

  const normalized = String(value).trim()
  if (!normalized) return null

  const compact = normalized.toLowerCase().replace(/[^a-z0-9а-яё]/g, '')

  if (compact === 'active') return 'active'
  if (compact === 'pendingmoderation') return 'pendingModeration'
  if (compact === 'rejected') return 'rejected'
  if (compact === 'deleted') return 'deleted'

  return normalized
}

export function getModerationStatusLabel(value) {
  const status = normalizeModerationStatus(value)
  if (status === null) return ''
  return MODERATION_STATUS_META[status]?.label || status
}

export function getModerationStatusClass(value) {
  const status = normalizeModerationStatus(value)
  if (status === null) return 'bg-secondary'
  return MODERATION_STATUS_META[status]?.className || 'bg-secondary'
}