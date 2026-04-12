import { api } from './zod'
import { ContractError, CONTRACT_ERROR_CODE, logContractError } from '../utils/contract'

const REQUEST_ENDPOINTS = Array.isArray(api?.api) ? api.api.slice() : []

function normalizeMethod(value) {
  return String(value || 'GET').trim().toUpperCase() || 'GET'
}

function normalizePath(value) {
  if (value === null || value === undefined) return ''

  const raw = String(value).trim()
  if (!raw) return ''

  if (/^https?:\/\//i.test(raw)) {
    try {
      return normalizePath(new URL(raw).pathname)
    } catch {
      return raw
    }
  }

  const withoutHash = raw.split('#')[0]
  const withoutQuery = withoutHash.split('?')[0]
  const collapsed = withoutQuery.replace(/\/+$|\s+$/g, '')

  if (!collapsed) return '/'
  return collapsed.startsWith('/') ? collapsed : `/${collapsed}`
}

function splitPathSegments(path) {
  return normalizePath(path).split('/').filter(Boolean)
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isPathParameter(segment) {
  return /^:[^/]+$/.test(segment) || /^\{[^/]+\}$/.test(segment)
}

function compilePathMatcher(pattern) {
  const patternPath = normalizePath(pattern)
  const segments = splitPathSegments(patternPath)
  const regexSource = segments
    .map((segment) => (isPathParameter(segment) ? '[^/]+' : escapeRegExp(segment)))
    .join('/')

  return new RegExp(`^/${regexSource}$`)
}

function countStaticSegments(pattern) {
  return splitPathSegments(pattern).filter(segment => !isPathParameter(segment)).length
}

function countSegments(pattern) {
  return splitPathSegments(pattern).length
}

const COMPILED_ENDPOINTS = REQUEST_ENDPOINTS.map((endpoint) => {
  const path = normalizePath(endpoint?.path)
  return {
    endpoint,
    method: normalizeMethod(endpoint?.method),
    path,
    matcher: compilePathMatcher(path),
    staticCount: countStaticSegments(path),
    segmentCount: countSegments(path),
    pathLength: path.length,
  }
})

function findRequestEndpoint(method, path) {
  const normalizedMethod = normalizeMethod(method)
  const normalizedPath = normalizePath(path)

  const matches = COMPILED_ENDPOINTS.filter(item => {
    if (item.method !== normalizedMethod) return false
    return item.matcher.test(normalizedPath)
  })

  if (!matches.length) return null

  matches.sort((left, right) => {
    if (right.staticCount !== left.staticCount) return right.staticCount - left.staticCount
    if (right.segmentCount !== left.segmentCount) return right.segmentCount - left.segmentCount
    if (right.pathLength !== left.pathLength) return right.pathLength - left.pathLength
    return left.path.localeCompare(right.path)
  })

  return matches[0]?.endpoint ?? null
}

function getBodyParameter(endpoint) {
  if (!endpoint || !Array.isArray(endpoint.parameters)) return null
  return endpoint.parameters.find(parameter => parameter?.type === 'Body') ?? null
}

function normalizeIssue(issue) {
  if (!issue || typeof issue !== 'object') return null

  const rawPath = Array.isArray(issue.path)
    ? issue.path.join('.')
    : issue.path == null
      ? ''
      : String(issue.path)

  return {
    code: String(issue.code || 'invalid_request').trim() || 'invalid_request',
    path: String(rawPath || '').trim(),
    message: String(issue.message || '').trim() || 'Invalid request payload',
  }
}

function summarizeRequestBody(body) {
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return {
      kind: 'FormData',
      keys: Array.from(new Set(Array.from(body.keys()))),
    }
  }

  if (Array.isArray(body)) {
    return {
      kind: 'Array',
      length: body.length,
    }
  }

  if (body && typeof body === 'object') {
    return {
      kind: 'Object',
      keys: Object.keys(body),
    }
  }

  return {
    kind: typeof body,
    value: body,
  }
}

export function validateApiRequestBody(method, path, body) {
  const endpoint = findRequestEndpoint(method, path)
  if (!endpoint) return body

  const bodyParameter = getBodyParameter(endpoint)
  if (!bodyParameter?.schema?.safeParse) return body

  const result = bodyParameter.schema.safeParse(body)
  if (result.success) return body

  const normalizedMethod = normalizeMethod(method)
  const normalizedPath = normalizePath(path)
  const error = new ContractError(
    CONTRACT_ERROR_CODE.INVALID_REQUEST,
    `Invalid request body for ${normalizedMethod} ${normalizedPath}`,
    {
      dto: endpoint.alias || `${normalizedMethod} ${endpoint.path}`,
      endpoint: endpoint.path,
      method: normalizedMethod,
      path: normalizedPath,
      issues: result.error.issues.map(normalizeIssue).filter(Boolean),
      bodyType: summarizeRequestBody(body).kind,
    }
  )

  logContractError(error, summarizeRequestBody(body), { soft: false })
  throw error
}

export function getRequestEndpoint(method, path) {
  return findRequestEndpoint(method, path)
}

export function getRequestBodySchema(method, path) {
  return getBodyParameter(findRequestEndpoint(method, path))?.schema ?? null
}
