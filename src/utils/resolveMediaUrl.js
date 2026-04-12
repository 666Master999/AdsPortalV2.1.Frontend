import { getApiBaseUrl } from '../config/apiBase'

export function resolveMediaUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const normalized = raw.replace(/\\/g, '/')

  if (normalized.startsWith('data:') || normalized.startsWith('blob:')) {
    return normalized
  }

  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return normalized
  }

  const apiBase = getApiBaseUrl().replace(/\/$/, '')
  const trimmedPath = normalized.replace(/^\/+/, '')
  return `${apiBase}/${trimmedPath}`
}