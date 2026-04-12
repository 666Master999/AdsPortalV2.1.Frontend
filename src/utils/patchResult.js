function toText(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function toIssueMessage(code, field, message) {
  if (message) return message
  if (field) {
    return code === 'skipped'
      ? `${field} not changed.`
      : field
  }
  return code || ''
}

export function normalizePatchIssue(value, defaultCode = 'skipped') {
  if (value === null || value === undefined) return null

  if (typeof value !== 'object' || Array.isArray(value)) {
    const field = toText(value)
    if (!field) return null
    return {
      code: defaultCode,
      field,
      message: toIssueMessage(defaultCode, field, ''),
    }
  }

  const code = toText(value.code) || defaultCode
  const field = toText(value.field)
  const message = toText(value.message)

  return {
    code,
    field: field || null,
    message: toIssueMessage(code, field, message),
  }
}

export function normalizePatchIssues(value, defaultCode = 'skipped') {
  const list = Array.isArray(value) ? value : value == null ? [] : [value]
  return list.map(item => normalizePatchIssue(item, defaultCode)).filter(Boolean)
}

export function serializePatchIssues(value, defaultCode = 'skipped') {
  const normalized = normalizePatchIssues(value, defaultCode)
  return normalized.length ? JSON.stringify(normalized) : ''
}

export function parsePatchIssues(value, defaultCode = 'skipped') {
  if (value === null || value === undefined || value === '') return []

  if (Array.isArray(value)) {
    return normalizePatchIssues(value, defaultCode)
  }

  const text = String(value).trim()
  if (!text) return []

  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return normalizePatchIssues(parsed, defaultCode)
    if (parsed && typeof parsed === 'object') return normalizePatchIssues([parsed], defaultCode)
  } catch {
    // fall through to CSV-style fallback
  }

  return normalizePatchIssues(
    text.split(',').map(item => item.trim()).filter(Boolean),
    defaultCode,
  )
}

export function formatPatchIssue(issue) {
  const normalized = normalizePatchIssue(issue)
  if (!normalized) return ''
  if (normalized.field && normalized.message) return `${normalized.field}: ${normalized.message}`
  return normalized.message || normalized.field || normalized.code || ''
}

export function hasPatchResultShape(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (
      'success' in value ||
      Array.isArray(value.updated) ||
      Array.isArray(value.skipped) ||
      Array.isArray(value.errors)
    )
  )
}