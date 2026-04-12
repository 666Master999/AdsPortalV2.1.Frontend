const isDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)

export const CONTRACT_ERROR_CODE = Object.freeze({
  INVALID_OBJECT: 'INVALID_OBJECT',
  INVALID_ARRAY: 'INVALID_ARRAY',
  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_TYPE: 'INVALID_TYPE',
  INVALID_ENUM: 'INVALID_ENUM',
  INVALID_DATE: 'INVALID_DATE',
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_MAIN_IMAGE: 'INVALID_MAIN_IMAGE',
  INVALID_AD_DETAILS: 'INVALID_AD_DETAILS',
  INVALID_AD_CATEGORY: 'INVALID_AD_CATEGORY',
  INVALID_AD_OWNER: 'INVALID_AD_OWNER',
  INVALID_IMAGE: 'INVALID_IMAGE',
  INVALID_USER: 'INVALID_USER',
  INVALID_USER_PROFILE: 'INVALID_USER_PROFILE',
  INVALID_CONVERSATION: 'INVALID_CONVERSATION',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  INVALID_AUTH_RESPONSE: 'INVALID_AUTH_RESPONSE',
  INVALID_CONTRACT: 'INVALID_CONTRACT',
})

const CONTRACT_UI_MESSAGE_BY_CODE = Object.freeze({
  [CONTRACT_ERROR_CODE.INVALID_REQUEST]: 'Некорректные данные запроса.',
  [CONTRACT_ERROR_CODE.INVALID_MAIN_IMAGE]: 'Ошибка изображения объявления',
  [CONTRACT_ERROR_CODE.INVALID_AD_DETAILS]: 'Ошибка данных объявления',
  [CONTRACT_ERROR_CODE.INVALID_AD_CATEGORY]: 'Ошибка данных объявления',
  [CONTRACT_ERROR_CODE.INVALID_AD_OWNER]: 'Ошибка данных объявления',
  [CONTRACT_ERROR_CODE.INVALID_IMAGE]: 'Ошибка данных объявления',
  [CONTRACT_ERROR_CODE.INVALID_CONVERSATION]: 'Ошибка данных чата',
  [CONTRACT_ERROR_CODE.INVALID_MESSAGE]: 'Ошибка данных чата',
  [CONTRACT_ERROR_CODE.INVALID_USER]: 'Ошибка профиля пользователя',
  [CONTRACT_ERROR_CODE.INVALID_USER_PROFILE]: 'Ошибка профиля пользователя',
  [CONTRACT_ERROR_CODE.INVALID_AUTH_RESPONSE]: 'Ошибка данных авторизации',
})

export class ContractError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'ContractError'
    this.code = code || CONTRACT_ERROR_CODE.INVALID_CONTRACT
    this.details = details

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ContractError)
    }
  }
}

export function isContractError(error) {
  return error instanceof ContractError || error?.name === 'ContractError'
}

function getMonitoringReporter() {
  const candidates = [
    globalThis?.__CONTRACT_ERROR_REPORTER__,
    globalThis?.__contractErrorReporter,
    globalThis?.__MONITORING__?.captureException,
    globalThis?.Sentry?.captureException,
  ]

  return candidates.find(candidate => typeof candidate === 'function') || null
}

function reportContractErrorToMonitoring(payload) {
  const reporter = getMonitoringReporter()
  if (!reporter) return false

  reporter(payload)
  return true
}

export function logContractError(error, data, { soft = false } = {}) {
  const payload = {
    code: error?.code || CONTRACT_ERROR_CODE.INVALID_CONTRACT,
    message: error?.message || 'Contract violation',
    details: error?.details ?? null,
    data,
    soft: Boolean(soft),
  }

  error.__contractLogged = true

  if (isDev) {
    const logger = soft ? console.warn : console.error
    logger('Contract violation:', payload)
    if (payload.details !== null && payload.details !== undefined) {
      logger('Contract violation details:', payload.details)
    }
    return
  }

  if (!reportContractErrorToMonitoring(payload) && typeof console !== 'undefined') {
    console.error('Contract violation:', payload)
  }
}

function failApiContract(code, message, details = {}) {
  throw new ContractError(code, message, details)
}

function isObjectLike(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function unwrapEnvelope(value) {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object' || Array.isArray(value)) return value
  if (Object.prototype.hasOwnProperty.call(value, 'data')) return value.data
  return value
}

function unwrapObjectPayload(value, keys = []) {
  const source = unwrapEnvelope(value)
  if (!isObjectLike(source)) return source

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && isObjectLike(source[key])) {
      return source[key]
    }
  }

  return source
}

function getOptionalField(obj, field) {
  if (!isObjectLike(obj)) return undefined
  return Object.prototype.hasOwnProperty.call(obj, field) ? obj[field] : undefined
}

export function freezeDto(value, seen = new WeakSet()) {
  if (value === null || value === undefined || typeof value !== 'object' || seen.has(value)) {
    return value
  }

  seen.add(value)

  for (const child of Object.values(value)) {
    freezeDto(child, seen)
  }

  return Object.freeze(value)
}

export function assertObject(value, objectName = 'API object') {
  if (!isObjectLike(value)) {
    failApiContract(CONTRACT_ERROR_CODE.INVALID_OBJECT, `${objectName} must be an object`, {
      objectName,
      receivedType: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
    })
  }

  return value
}

export function assertField(obj, field, options = {}) {
  const objectName = options.objectName || 'API object'
  const allowNull = Boolean(options.allowNull)
  const target = assertObject(obj, objectName)

  if (!(field in target)) {
    failApiContract(CONTRACT_ERROR_CODE.MISSING_FIELD, `Missing field: ${field}`, {
      objectName,
      field,
      availableFields: Object.keys(target),
    })
  }

  const value = target[field]
  if (value === undefined || (!allowNull && value === null)) {
    failApiContract(CONTRACT_ERROR_CODE.MISSING_FIELD, `Missing field: ${field}`, {
      objectName,
      field,
      availableFields: Object.keys(target),
      receivedValue: value,
    })
  }

  return value
}

export function assertArray(value, arrayName = 'API array') {
  if (!Array.isArray(value)) {
    failApiContract(CONTRACT_ERROR_CODE.INVALID_ARRAY, `${arrayName} must be an array`, {
      arrayName,
      receivedType: value === null ? 'null' : value === undefined ? 'undefined' : typeof value,
    })
  }

  return value
}

export function assertFound(value, message, details = {}, code = CONTRACT_ERROR_CODE.INVALID_CONTRACT) {
  if (!value) {
    failApiContract(code, message, details)
  }

  return value
}

function assertStringValue(value, objectName, field, { allowNull = false, nonEmpty = false } = {}) {
  if (value === null) {
    if (allowNull) return null
    failApiContract(CONTRACT_ERROR_CODE.MISSING_FIELD, `Missing field: ${field}`, {
      objectName,
      field,
      receivedValue: value,
    })
  }

  if (typeof value !== 'string') {
    failApiContract(CONTRACT_ERROR_CODE.INVALID_TYPE, `${objectName}.${field} must be a string`, {
      objectName,
      field,
      receivedType: typeof value,
      receivedValue: value,
    })
  }

  if (nonEmpty && !value.trim()) {
    failApiContract(CONTRACT_ERROR_CODE.INVALID_TYPE, `${objectName}.${field} must be a non-empty string`, {
      objectName,
      field,
      receivedValue: value,
    })
  }

  return value
}

function assertNumberValue(value, objectName, field, { allowNull = false, integer = false } = {}) {
  if (value === null) {
    if (allowNull) return null
    failApiContract(CONTRACT_ERROR_CODE.MISSING_FIELD, `Missing field: ${field}`, {
      objectName,
      field,
      receivedValue: value,
    })
  }

  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    failApiContract(CONTRACT_ERROR_CODE.INVALID_TYPE, `${objectName}.${field} must be a number`, {
      objectName,
      field,
      receivedType: typeof value,
      receivedValue: value,
    })
  }

  if (integer && !Number.isInteger(value)) {
    failApiContract(CONTRACT_ERROR_CODE.INVALID_TYPE, `${objectName}.${field} must be an integer`, {
      objectName,
      field,
      receivedValue: value,
    })
  }

  return value
}

function assertIdentifierValue(value, objectName, field, { allowNull = false } = {}) {
  if (value === null) {
    if (allowNull) return null
    failApiContract(CONTRACT_ERROR_CODE.MISSING_FIELD, `Missing field: ${field}`, {
      objectName,
      field,
      receivedValue: value,
    })
  }

  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      failApiContract(CONTRACT_ERROR_CODE.INVALID_TYPE, `${objectName}.${field} must be an integer`, {
        objectName,
        field,
        receivedValue: value,
      })
    }
    return value
  }

  if (typeof value === 'string') {
    if (!value.trim()) {
      failApiContract(CONTRACT_ERROR_CODE.INVALID_TYPE, `${objectName}.${field} must be a non-empty string`, {
        objectName,
        field,
        receivedValue: value,
      })
    }
    return value
  }

  failApiContract(CONTRACT_ERROR_CODE.INVALID_TYPE, `${objectName}.${field} must be an integer or string`, {
    objectName,
    field,
    receivedType: typeof value,
    receivedValue: value,
  })
}

function assertBooleanValue(value, objectName, field, { allowNull = false } = {}) {
  if (value === null) {
    if (allowNull) return null
    failApiContract(CONTRACT_ERROR_CODE.MISSING_FIELD, `Missing field: ${field}`, {
      objectName,
      field,
      receivedValue: value,
    })
  }

  if (typeof value !== 'boolean') {
    failApiContract(CONTRACT_ERROR_CODE.INVALID_TYPE, `${objectName}.${field} must be a boolean`, {
      objectName,
      field,
      receivedType: typeof value,
      receivedValue: value,
    })
  }

  return value
}

function assertDateTimeValue(value, objectName, field, { allowNull = false } = {}) {
  const text = assertStringValue(value, objectName, field, { allowNull })
  if (text === null) return null

  const parsed = Date.parse(text)
  if (Number.isNaN(parsed)) {
    failApiContract(CONTRACT_ERROR_CODE.INVALID_DATE, `${objectName}.${field} must be an ISO-8601 date string`, {
      objectName,
      field,
      receivedValue: text,
    })
  }

  return text
}

function assertEnumValue(value, objectName, field, allowedValues, { allowNull = false } = {}) {
  const text = assertStringValue(value, objectName, field, { allowNull })
  if (text === null) return null

  if (!allowedValues.has(text)) {
    failApiContract(CONTRACT_ERROR_CODE.INVALID_ENUM, `${objectName}.${field} has invalid value`, {
      objectName,
      field,
      receivedValue: text,
      allowedValues: [...allowedValues],
    })
  }

  return text
}

function runValidator(value, dtoName, strict, validator) {
  try {
    const validated = validator()
    return freezeDto(validated)
  } catch (error) {
    if (!isContractError(error)) {
      throw error
    }

    const details = isObjectLike(error.details) ? error.details : {}
    if (!details.dto) {
      error.details = { dto: dtoName, ...details }
    }

    if (!error.__contractLogged) {
      logContractError(error, value, { soft: !strict })
    }

    if (strict) {
      throw error
    }

    return null
  }
}

const AD_STATUS_VALUES = new Set(['active', 'pendingModeration', 'rejected', 'deleted'])
const LOCATION_TYPE_VALUES = new Set(['region', 'city', 'district'])

function validateLocationRef(value, objectName = 'LocationRef') {
  return runValidator(value, objectName, true, () => {
    const location = assertObject(value, objectName)
    assertEnumValue(assertField(location, 'type', { objectName }), objectName, 'type', LOCATION_TYPE_VALUES)
    assertNumberValue(assertField(location, 'id', { objectName }), objectName, 'id', { integer: true })
    assertStringValue(assertField(location, 'name', { objectName, allowNull: true }), objectName, 'name', { allowNull: true })
    return location
  })
}

function validateAdCategoryDto(value, objectName = 'AdCategoryDto') {
  return runValidator(value, objectName, true, () => {
    const category = assertObject(value, objectName)
    assertNumberValue(assertField(category, 'id', { objectName }), objectName, 'id', { integer: true })
    assertStringValue(assertField(category, 'name', { objectName }), objectName, 'name', { nonEmpty: true })
    assertNumberValue(assertField(category, 'parentId', { objectName, allowNull: true }), objectName, 'parentId', { allowNull: true, integer: true })
    return category
  })
}

function validateUserProfileCoreDto(value, objectName, { requireRoles = true } = {}) {
  const user = assertObject(value, objectName)
  assertIdentifierValue(assertField(user, 'id', { objectName }), objectName, 'id')
  assertStringValue(assertField(user, 'userLogin', { objectName }), objectName, 'userLogin', { nonEmpty: true })
  assertStringValue(assertField(user, 'userName', { objectName, allowNull: true }), objectName, 'userName', { allowNull: true })
  assertStringValue(assertField(user, 'userEmail', { objectName, allowNull: true }), objectName, 'userEmail', { allowNull: true })
  assertStringValue(assertField(user, 'userPhoneNumber', { objectName, allowNull: true }), objectName, 'userPhoneNumber', { allowNull: true })
  assertStringValue(assertField(user, 'avatarPath', { objectName, allowNull: true }), objectName, 'avatarPath', { allowNull: true })
  assertDateTimeValue(assertField(user, 'createdAt', { objectName }), objectName, 'createdAt')
  assertDateTimeValue(assertField(user, 'lastActivityAt', { objectName, allowNull: true }), objectName, 'lastActivityAt', { allowNull: true })

  if (requireRoles || Object.prototype.hasOwnProperty.call(user, 'roles')) {
    const roles = assertArray(assertField(user, 'roles', { objectName }), `${objectName}.roles`)
    roles.forEach((role, index) => {
      assertStringValue(role, `${objectName}.roles[${index}]`, 'value', { nonEmpty: true })
    })
  }

  const permissions = getOptionalField(user, 'permissions')
  if (permissions !== undefined) {
    assertArray(permissions, `${objectName}.permissions`).forEach((permission, index) => {
      assertStringValue(permission, `${objectName}.permissions[${index}]`, 'value', { nonEmpty: true })
    })
  }

  const ads = getOptionalField(user, 'ads')
  if (ads !== undefined) {
    assertArray(ads, `${objectName}.ads`)
  }

  const favorites = getOptionalField(user, 'favorites')
  if (favorites !== undefined) {
    assertArray(favorites, `${objectName}.favorites`)
  }

  return user
}

function validateAdOwnerDto(value, objectName = 'AdOwnerDto') {
  return runValidator(value, objectName, true, () => {
    const owner = assertObject(value, objectName)
    assertIdentifierValue(assertField(owner, 'id', { objectName }), objectName, 'id')
    assertStringValue(assertField(owner, 'userLogin', { objectName }), objectName, 'userLogin', { nonEmpty: true })
    assertStringValue(assertField(owner, 'userName', { objectName, allowNull: true }), objectName, 'userName', { allowNull: true })
    assertStringValue(assertField(owner, 'userEmail', { objectName, allowNull: true }), objectName, 'userEmail', { allowNull: true })
    assertStringValue(assertField(owner, 'userPhoneNumber', { objectName, allowNull: true }), objectName, 'userPhoneNumber', { allowNull: true })
    assertStringValue(assertField(owner, 'avatarPath', { objectName, allowNull: true }), objectName, 'avatarPath', { allowNull: true })
    assertDateTimeValue(assertField(owner, 'createdAt', { objectName }), objectName, 'createdAt')
    assertDateTimeValue(assertField(owner, 'lastActivityAt', { objectName, allowNull: true }), objectName, 'lastActivityAt', { allowNull: true })

    const roles = getOptionalField(owner, 'roles')
    if (roles !== undefined) {
      assertArray(roles, `${objectName}.roles`).forEach((role, index) => {
        assertStringValue(role, `${objectName}.roles[${index}]`, 'value', { nonEmpty: true })
      })
    }

    const permissions = getOptionalField(owner, 'permissions')
    if (permissions !== undefined) {
      assertArray(permissions, `${objectName}.permissions`).forEach((permission, index) => {
        assertStringValue(permission, `${objectName}.permissions[${index}]`, 'value', { nonEmpty: true })
      })
    }

    return owner
  })
}

function validateConversationParticipantDto(value, objectName = 'ConversationParticipantDto') {
  return runValidator(value, objectName, true, () => {
    const participant = assertObject(value, objectName)
    assertIdentifierValue(assertField(participant, 'id', { objectName }), objectName, 'id')
    assertStringValue(assertField(participant, 'name', { objectName }), objectName, 'name', { nonEmpty: true })
    assertStringValue(assertField(participant, 'avatarPath', { objectName, allowNull: true }), objectName, 'avatarPath', { allowNull: true })

    const userLogin = getOptionalField(participant, 'userLogin')
    if (userLogin !== undefined) {
      assertStringValue(userLogin, objectName, 'userLogin', { allowNull: true })
    }

    const isOnline = getOptionalField(participant, 'isOnline')
    if (isOnline !== undefined) {
      assertBooleanValue(isOnline, objectName, 'isOnline', { allowNull: true })
    }

    const lastActivityAt = getOptionalField(participant, 'lastActivityAt')
    if (lastActivityAt !== undefined) {
      assertDateTimeValue(lastActivityAt, objectName, 'lastActivityAt', { allowNull: true })
    }

    return participant
  })
}

function validateConversationAdDto(value, objectName = 'ConversationAdDto') {
  return runValidator(value, objectName, true, () => {
    const ad = assertObject(value, objectName)
    assertIdentifierValue(assertField(ad, 'id', { objectName }), objectName, 'id')
    assertStringValue(assertField(ad, 'title', { objectName }), objectName, 'title', { nonEmpty: true })

    const imageFields = ['mainImagePath', 'image', 'mainImageUrl']
    for (const field of imageFields) {
      const imageValue = getOptionalField(ad, field)
      if (imageValue !== undefined) {
        assertStringValue(imageValue, objectName, field, { allowNull: true })
      }
    }

    return ad
  })
}

function validateMessageActorDto(value, objectName = 'MessageActorDto') {
  return runValidator(value, objectName, true, () => {
    const actor = assertObject(value, objectName)
    assertIdentifierValue(assertField(actor, 'id', { objectName }), objectName, 'id')

    const possibleNameFields = ['name', 'userName', 'userLogin']
    for (const field of possibleNameFields) {
      const fieldValue = getOptionalField(actor, field)
      if (fieldValue !== undefined) {
        assertStringValue(fieldValue, objectName, field, { allowNull: true })
      }
    }

    const avatarPath = getOptionalField(actor, 'avatarPath')
    if (avatarPath !== undefined) {
      assertStringValue(avatarPath, objectName, 'avatarPath', { allowNull: true })
    }

    const isOnline = getOptionalField(actor, 'isOnline')
    if (isOnline !== undefined) {
      assertBooleanValue(isOnline, objectName, 'isOnline', { allowNull: true })
    }

    const lastActivityAt = getOptionalField(actor, 'lastActivityAt')
    if (lastActivityAt !== undefined) {
      assertDateTimeValue(lastActivityAt, objectName, 'lastActivityAt', { allowNull: true })
    }

    return actor
  })
}

function validateMessagePreviewDto(value, objectName = 'MessagePreviewDto') {
  return runValidator(value, objectName, true, () => {
    const message = assertObject(value, objectName)

    const id = getOptionalField(message, 'id')
    if (id !== undefined && id !== null) {
      assertIdentifierValue(id, objectName, 'id')
    }

    const conversationId = getOptionalField(message, 'conversationId')
    if (conversationId !== undefined && conversationId !== null) {
      assertIdentifierValue(conversationId, objectName, 'conversationId')
    }

    const authorId = getOptionalField(message, 'authorId')
    if (authorId !== undefined && authorId !== null) {
      assertIdentifierValue(authorId, objectName, 'authorId')
    }

    const senderId = getOptionalField(message, 'senderId')
    if (senderId !== undefined && senderId !== null) {
      assertIdentifierValue(senderId, objectName, 'senderId')
    }

    const type = getOptionalField(message, 'type')
    if (type !== undefined) {
      assertStringValue(type, objectName, 'type', { allowNull: true })
    }

    const text = getOptionalField(message, 'text')
    if (text !== undefined) {
      assertStringValue(text, objectName, 'text', { allowNull: true })
    }

    const createdAt = getOptionalField(message, 'createdAt')
    if (createdAt !== undefined) {
      assertDateTimeValue(createdAt, objectName, 'createdAt', { allowNull: true })
    }

    const clientTag = getOptionalField(message, 'clientTag')
    if (clientTag !== undefined) {
      assertStringValue(clientTag, objectName, 'clientTag', { allowNull: true })
    }

    const attachments = getOptionalField(message, 'attachments')
    if (attachments !== undefined) {
      assertArray(attachments, `${objectName}.attachments`)
    }

    const author = getOptionalField(message, 'author')
    if (author !== undefined && author !== null) {
      validateMessageActorDto(author, `${objectName}.author`)
    }

    const sender = getOptionalField(message, 'sender')
    if (sender !== undefined && sender !== null) {
      validateMessageActorDto(sender, `${objectName}.sender`)
    }

    return message
  })
}

export function validateUserDto(value, options = {}) {
  const { strict = true } = options
  return runValidator(value, 'UserProfileDto', strict, () => {
    const source = unwrapObjectPayload(value, ['userProfile', 'profile', 'user'])
    return validateUserProfileCoreDto(source, 'UserProfileDto', { requireRoles: true })
  })
}

export function validateAuthDto(value, options = {}) {
  const { strict = true } = options
  return runValidator(value, 'AuthDto', strict, () => {
    const source = unwrapEnvelope(value)
    const auth = assertObject(source, 'AuthDto')
    assertStringValue(assertField(auth, 'accessToken', { objectName: 'AuthDto' }), 'AuthDto', 'accessToken', { nonEmpty: true })
    assertStringValue(assertField(auth, 'refreshToken', { objectName: 'AuthDto' }), 'AuthDto', 'refreshToken', { nonEmpty: true })
    return auth
  })
}

export function validateMessageDto(value, options = {}) {
  const {
    strict = true,
    objectName = 'MessageDto',
    allowMissingConversationId = false,
    allowMissingAuthorId = false,
  } = options

  return runValidator(value, objectName, strict, () => {
    const source = unwrapObjectPayload(value, ['message'])
    const message = assertObject(source, objectName)

    assertIdentifierValue(assertField(message, 'id', { objectName }), objectName, 'id')

    const conversationId = getOptionalField(message, 'conversationId') ?? message.conversation?.id ?? null
    if (conversationId === null || conversationId === undefined) {
      if (!allowMissingConversationId) {
        failApiContract(CONTRACT_ERROR_CODE.INVALID_MESSAGE, `${objectName}.conversationId must be present`, {
          objectName,
          field: 'conversationId',
        })
      }
    } else {
      assertIdentifierValue(conversationId, objectName, 'conversationId')
    }

    const authorId = getOptionalField(message, 'authorId') ?? message.author?.id ?? message.sender?.id ?? null
    if (authorId === null || authorId === undefined) {
      if (!allowMissingAuthorId) {
        failApiContract(CONTRACT_ERROR_CODE.INVALID_MESSAGE, `${objectName}.authorId must be present`, {
          objectName,
          field: 'authorId',
        })
      }
    } else {
      assertIdentifierValue(authorId, objectName, 'authorId')
    }

    const type = assertField(message, 'type', { objectName })
    assertStringValue(type, objectName, 'type', { nonEmpty: true })

    const text = assertField(message, 'text', { objectName, allowNull: true })
    if (text !== null) {
      assertStringValue(text, objectName, 'text')
    }

    assertDateTimeValue(assertField(message, 'createdAt', { objectName }), objectName, 'createdAt')

    const attachments = assertArray(assertField(message, 'attachments', { objectName }), `${objectName}.attachments`)
    attachments.forEach((attachment, index) => {
      if (attachment === null || attachment === undefined) {
        failApiContract(CONTRACT_ERROR_CODE.INVALID_ARRAY, `${objectName}.attachments[${index}] must be a value`, {
          objectName: `${objectName}.attachments[${index}]`,
          field: 'attachments',
        })
      }
    })

    const replyToMessageId = getOptionalField(message, 'replyToMessageId')
    if (replyToMessageId !== undefined && replyToMessageId !== null) {
      assertIdentifierValue(replyToMessageId, objectName, 'replyToMessageId')
    }

    const status = getOptionalField(message, 'status')
    if (status !== undefined) {
      assertStringValue(status, objectName, 'status', { allowNull: true })
    }

    const clientTag = getOptionalField(message, 'clientTag')
    if (clientTag !== undefined) {
      assertStringValue(clientTag, objectName, 'clientTag', { allowNull: true })
    }

    const author = getOptionalField(message, 'author')
    if (author !== undefined && author !== null) {
      validateMessageActorDto(author, `${objectName}.author`)
    }

    const sender = getOptionalField(message, 'sender')
    if (sender !== undefined && sender !== null) {
      validateMessageActorDto(sender, `${objectName}.sender`)
    }

    return message
  })
}

function validateConversationDtoUnsafe(value, objectName = 'ConversationDto') {
  const source = unwrapObjectPayload(value, ['conversation'])
  const conversation = assertObject(source, objectName)

  assertIdentifierValue(assertField(conversation, 'id', { objectName }), objectName, 'id')
  validateConversationParticipantDto(assertField(conversation, 'companion', { objectName }), `${objectName}.companion`)
  validateConversationAdDto(assertField(conversation, 'ad', { objectName }), `${objectName}.ad`)

  const lastMessage = assertField(conversation, 'lastMessage', { objectName, allowNull: true })
  if (lastMessage !== null) {
    validateMessagePreviewDto(lastMessage, `${objectName}.lastMessage`)
  }

  const unreadCount = assertField(conversation, 'unreadCount', { objectName })
  assertNumberValue(unreadCount, objectName, 'unreadCount', { integer: true })
  if (unreadCount < 0) {
    failApiContract(CONTRACT_ERROR_CODE.INVALID_CONVERSATION, `${objectName}.unreadCount must be >= 0`, {
      objectName,
      field: 'unreadCount',
      receivedValue: unreadCount,
    })
  }

  assertBooleanValue(assertField(conversation, 'isClosed', { objectName }), objectName, 'isClosed')
  assertBooleanValue(assertField(conversation, 'isMuted', { objectName }), objectName, 'isMuted')
  assertBooleanValue(assertField(conversation, 'isArchived', { objectName }), objectName, 'isArchived')

  const lastMessageAt = getOptionalField(conversation, 'lastMessageAt')
  if (lastMessageAt !== undefined) {
    assertDateTimeValue(lastMessageAt, objectName, 'lastMessageAt', { allowNull: true })
  }

  const firstUnreadMessageId = getOptionalField(conversation, 'firstUnreadMessageId')
  if (firstUnreadMessageId !== undefined) {
    assertIdentifierValue(firstUnreadMessageId, objectName, 'firstUnreadMessageId', { allowNull: true })
  }

  const totalMessagesCount = getOptionalField(conversation, 'totalMessagesCount')
  if (totalMessagesCount !== undefined) {
    assertNumberValue(totalMessagesCount, objectName, 'totalMessagesCount', { allowNull: true, integer: true })
  }

  const updatedAt = getOptionalField(conversation, 'updatedAt')
  if (updatedAt !== undefined) {
    assertDateTimeValue(updatedAt, objectName, 'updatedAt', { allowNull: true })
  }

  return conversation
}

export function validateConversationDto(value, options = {}) {
  const { strict = true, objectName = 'ConversationDto' } = options
  return runValidator(value, objectName, strict, () => validateConversationDtoUnsafe(value, objectName))
}

export function validateConversationListDto(value, options = {}) {
  const { strict = true } = options
  return runValidator(value, 'ConversationListDto', strict, () => {
    const source = unwrapEnvelope(value)
    const items = Array.isArray(source)
      ? source
      : Array.isArray(source?.items)
        ? source.items
        : Array.isArray(source?.data)
          ? source.data
          : Array.isArray(source?.conversations)
            ? source.conversations
            : null

    if (!items) {
      failApiContract(CONTRACT_ERROR_CODE.INVALID_CONVERSATION, 'Conversation list payload must be an array or paged object', {
        objectName: 'ConversationListDto',
        receivedType: source === null ? 'null' : Array.isArray(source) ? 'array' : typeof source,
      })
    }

    return items.map((item, index) => validateConversationDto(item, { strict: true, objectName: `ConversationListDto[${index}]` }))
  })
}

export function validateConversationMessagesDto(value, options = {}) {
  const { strict = true } = options
  return runValidator(value, 'ConversationMessagesDto', strict, () => {
    const source = unwrapEnvelope(value)
    const response = assertObject(source, 'ConversationMessagesDto')

    const messages = assertArray(assertField(response, 'messages', { objectName: 'ConversationMessagesDto' }), 'ConversationMessagesDto.messages')
    const validatedMessages = messages.map((message, index) => validateMessageDto(message, {
      strict: true,
      objectName: `ConversationMessagesDto.messages[${index}]`,
    }))

    const conversation = getOptionalField(response, 'conversation')
    const validatedConversation = conversation === undefined || conversation === null
      ? conversation ?? null
      : validateConversationDto(conversation, {
          strict: true,
          objectName: 'ConversationMessagesDto.conversation',
        })

    const hasMore = getOptionalField(response, 'hasMore')
    if (hasMore !== undefined) {
      assertBooleanValue(hasMore, 'ConversationMessagesDto', 'hasMore')
    }

    const anchorMessageId = getOptionalField(response, 'anchorMessageId')
    if (anchorMessageId !== undefined && anchorMessageId !== null) {
      assertIdentifierValue(anchorMessageId, 'ConversationMessagesDto', 'anchorMessageId')
    }

    const sellerLastSeenMessageId = getOptionalField(response, 'sellerLastSeenMessageId')
    if (sellerLastSeenMessageId !== undefined && sellerLastSeenMessageId !== null) {
      assertIdentifierValue(sellerLastSeenMessageId, 'ConversationMessagesDto', 'sellerLastSeenMessageId')
    }

    const buyerLastSeenMessageId = getOptionalField(response, 'buyerLastSeenMessageId')
    if (buyerLastSeenMessageId !== undefined && buyerLastSeenMessageId !== null) {
      assertIdentifierValue(buyerLastSeenMessageId, 'ConversationMessagesDto', 'buyerLastSeenMessageId')
    }

    return {
      ...response,
      messages: validatedMessages,
      conversation: validatedConversation,
    }
  })
}

function normalizeContractGroup(error) {
  const dto = String(error?.details?.dto || error?.details?.objectName || '').toLowerCase()

  if (dto.includes('message')) return 'chat'
  if (dto.includes('conversation')) return 'chat'
  if (dto.includes('userprofile') || dto.includes('user')) return 'user'
  if (dto.includes('auth')) return 'auth'
  if (dto.includes('addetails') || dto.includes('adowner') || dto.includes('adcategory') || dto.includes('adimage') || dto.includes('location')) return 'ad'
  return 'default'
}

export function mapContractErrorToUi(error) {
  if (!isContractError(error)) {
    return 'Ошибка данных от сервера'
  }

  if (error.code && CONTRACT_UI_MESSAGE_BY_CODE[error.code]) {
    return CONTRACT_UI_MESSAGE_BY_CODE[error.code]
  }

  const group = normalizeContractGroup(error)
  if (group === 'ad') return 'Ошибка данных объявления'
  if (group === 'chat') return 'Ошибка данных чата'
  if (group === 'user') return 'Ошибка профиля пользователя'
  if (group === 'auth') return 'Ошибка данных авторизации'

  return 'Ошибка данных от сервера'
}

export function validateAdDetailsDto(value, options = {}) {
  const { strict = true } = options
  return runValidator(value, 'AdDetailsDto', strict, () => {
    const ad = assertObject(unwrapEnvelope(value), 'AdDetailsDto')

    assertNumberValue(assertField(ad, 'id', { objectName: 'AdDetailsDto' }), 'AdDetailsDto', 'id', { integer: true })
    assertNumberValue(assertField(ad, 'userId', { objectName: 'AdDetailsDto' }), 'AdDetailsDto', 'userId', { integer: true })
    assertNumberValue(assertField(ad, 'categoryId', { objectName: 'AdDetailsDto', allowNull: true }), 'AdDetailsDto', 'categoryId', { allowNull: true, integer: true })
    assertStringValue(assertField(ad, 'title', { objectName: 'AdDetailsDto' }), 'AdDetailsDto', 'title', { nonEmpty: true })
    assertStringValue(assertField(ad, 'description', { objectName: 'AdDetailsDto', allowNull: true }), 'AdDetailsDto', 'description', { allowNull: true })
    assertNumberValue(assertField(ad, 'price', { objectName: 'AdDetailsDto', allowNull: true }), 'AdDetailsDto', 'price', { allowNull: true })
    assertBooleanValue(assertField(ad, 'isNegotiable', { objectName: 'AdDetailsDto' }), 'AdDetailsDto', 'isNegotiable')
    assertNumberValue(assertField(ad, 'locationId', { objectName: 'AdDetailsDto' }), 'AdDetailsDto', 'locationId', { integer: true })

    const location = assertField(ad, 'location', { objectName: 'AdDetailsDto', allowNull: true })
    if (location !== null) {
      validateLocationRef(location, 'AdDetailsDto.location')
      if (String(location.id) !== String(ad.locationId)) {
        failApiContract(CONTRACT_ERROR_CODE.INVALID_AD_DETAILS, 'location.id must match locationId', {
          dto: 'AdDetailsDto',
          field: 'location',
          locationId: ad.locationId,
          locationIdFromObject: location.id,
        })
      }
    }

    assertStringValue(assertField(ad, 'listingType', { objectName: 'AdDetailsDto', allowNull: true }), 'AdDetailsDto', 'listingType', { allowNull: true })

    const mainImageId = assertField(ad, 'mainImageId', { objectName: 'AdDetailsDto', allowNull: true })
    if (mainImageId !== null) {
      assertNumberValue(mainImageId, 'AdDetailsDto', 'mainImageId', { integer: true })
    }

    assertDateTimeValue(assertField(ad, 'createdAt', { objectName: 'AdDetailsDto' }), 'AdDetailsDto', 'createdAt')
    assertDateTimeValue(assertField(ad, 'updatedAt', { objectName: 'AdDetailsDto' }), 'AdDetailsDto', 'updatedAt')
    assertEnumValue(assertField(ad, 'moderationStatus', { objectName: 'AdDetailsDto', allowNull: true }), 'AdDetailsDto', 'moderationStatus', AD_STATUS_VALUES, { allowNull: true })
    assertStringValue(assertField(ad, 'rejectionReason', { objectName: 'AdDetailsDto', allowNull: true }), 'AdDetailsDto', 'rejectionReason', { allowNull: true })
    assertDateTimeValue(assertField(ad, 'deletedAt', { objectName: 'AdDetailsDto', allowNull: true }), 'AdDetailsDto', 'deletedAt', { allowNull: true })

    const category = assertField(ad, 'category', { objectName: 'AdDetailsDto', allowNull: true })
    if (category !== null) {
      validateAdCategoryDto(category, 'AdDetailsDto.category')
      if (String(category.id) !== String(ad.categoryId)) {
        failApiContract(CONTRACT_ERROR_CODE.INVALID_AD_CATEGORY, 'category.id must match categoryId', {
          dto: 'AdDetailsDto',
          field: 'category',
          categoryId: ad.categoryId,
          categoryIdFromObject: category.id,
        })
      }
    }

    const owner = assertField(ad, 'user', { objectName: 'AdDetailsDto', allowNull: true })
    if (owner !== null) {
      validateAdOwnerDto(owner, 'AdDetailsDto.user')
      if (String(owner.id) !== String(ad.userId)) {
        failApiContract(CONTRACT_ERROR_CODE.INVALID_AD_OWNER, 'user.id must match userId', {
          dto: 'AdDetailsDto',
          field: 'user',
          userId: ad.userId,
          userIdFromObject: owner.id,
        })
      }
    }

    const images = assertArray(assertField(ad, 'images', { objectName: 'AdDetailsDto' }), 'AdDetailsDto.images')
    images.forEach((image, index) => {
      const validatedImage = validateAdImageDto(image, index)
      if (String(validatedImage.adId) !== String(ad.id)) {
        failApiContract(CONTRACT_ERROR_CODE.INVALID_IMAGE, 'image.adId must match ad.id', {
          dto: 'AdDetailsDto',
          objectName: `AdDetailsDto.images[${index}]`,
          adId: ad.id,
          imageAdId: validatedImage.adId,
        })
      }
    })

    if (images.length === 0) {
      if (mainImageId !== null) {
        failApiContract(CONTRACT_ERROR_CODE.INVALID_MAIN_IMAGE, 'mainImageId must be null when images are empty', {
          dto: 'AdDetailsDto',
          field: 'mainImageId',
          mainImageId,
          imagesCount: 0,
        })
      }
    } else {
      if (mainImageId === null) {
        failApiContract(CONTRACT_ERROR_CODE.INVALID_MAIN_IMAGE, 'Missing field: mainImageId', {
          dto: 'AdDetailsDto',
          field: 'mainImageId',
          imagesCount: images.length,
        })
      }

      const mainImage = images.find(image => String(image.id) === String(mainImageId))
      assertFound(mainImage, `Missing main image: ${mainImageId}`, {
        dto: 'AdDetailsDto',
        adId: ad.id,
        mainImageId,
        imageIds: images.map(image => image.id),
      }, CONTRACT_ERROR_CODE.INVALID_MAIN_IMAGE)

      if (mainImage.isMain !== true) {
        failApiContract(CONTRACT_ERROR_CODE.INVALID_MAIN_IMAGE, 'Main image must be marked isMain', {
          dto: 'AdDetailsDto',
          adId: ad.id,
          mainImageId,
          imageIds: images.map(image => image.id),
        })
      }

      const mainImagesCount = images.filter(image => image.isMain === true).length
      if (mainImagesCount !== 1) {
        failApiContract(CONTRACT_ERROR_CODE.INVALID_MAIN_IMAGE, 'AdDetailsDto.images must contain exactly one main image', {
          dto: 'AdDetailsDto',
          adId: ad.id,
          mainImagesCount,
          imageIds: images.map(image => image.id),
        })
      }
    }

    assertBooleanValue(assertField(ad, 'isFavorite', { objectName: 'AdDetailsDto' }), 'AdDetailsDto', 'isFavorite')

    return ad
  })
}

function validateAdImageDto(value, index) {
  return runValidator(value, `AdDetailsDto.images[${index}]`, true, () => {
    const objectName = `AdDetailsDto.images[${index}]`
    const image = assertObject(value, objectName)
    assertNumberValue(assertField(image, 'id', { objectName }), objectName, 'id', { integer: true })
    assertNumberValue(assertField(image, 'adId', { objectName }), objectName, 'adId', { integer: true })
    assertStringValue(assertField(image, 'filePath', { objectName }), objectName, 'filePath', { nonEmpty: true })
    assertNumberValue(assertField(image, 'sortOrder', { objectName }), objectName, 'sortOrder', { integer: true })
    assertBooleanValue(assertField(image, 'isMain', { objectName }), objectName, 'isMain')
    return image
  })
}
