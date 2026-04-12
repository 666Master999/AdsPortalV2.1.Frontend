export * from './contract'
import { ContractError } from './contract'

export function logContractError(error, data, { soft = false } = {}) {
  const logger = soft ? console.warn : console.error
  logger('Contract violation:', error, data)

  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV && error?.details !== undefined) {
    console.error(error.details)
  }
}

function failApiContract(message, details = {}) {
  throw new ContractError(message, details)
}

export function assertObject(value, objectName = 'API object') {
  if (value === null || value === undefined || Array.isArray(value) || typeof value !== 'object') {
    failApiContract(`${objectName} must be an object`, {
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
    failApiContract(`Missing field: ${field}`, {
      objectName,
      field,
      availableFields: Object.keys(target),
    })
  }

  const value = target[field]
  if (value === undefined || (!allowNull && value === null)) {
    failApiContract(`Missing field: ${field}`, {
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
    failApiContract(`${arrayName} must be an array`, {
      arrayName,
      receivedType: value === null ? 'null' : value === undefined ? 'undefined' : typeof value,
    })
  }

  return value
}

export function assertFound(value, message, details = {}) {
  if (!value) {
    failApiContract(message, details)
  }

  return value
}

const AD_STATUS_VALUES = new Set(['active', 'pendingModeration', 'rejected', 'deleted'])
const LOCATION_TYPE_VALUES = new Set(['region', 'city', 'district'])

function assertStringValue(value, objectName, field, { allowNull = false, nonEmpty = false } = {}) {
  if (value === null) {
    if (allowNull) return null
    failApiContract(`Missing field: ${field}`, { objectName, field, receivedValue: value })
  }

  if (typeof value !== 'string') {
    failApiContract(`${objectName}.${field} must be a string`, {
      objectName,
      field,
      receivedType: typeof value,
      receivedValue: value,
    })
  }

  if (nonEmpty && !value.trim()) {
    failApiContract(`${objectName}.${field} must be a non-empty string`, {
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
    failApiContract(`Missing field: ${field}`, { objectName, field, receivedValue: value })
  }

  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    failApiContract(`${objectName}.${field} must be a number`, {
      objectName,
      field,
      receivedType: typeof value,
      receivedValue: value,
    })
  }

  if (integer && !Number.isInteger(value)) {
    failApiContract(`${objectName}.${field} must be an integer`, {
      objectName,
      field,
      receivedValue: value,
    })
  }

  return value
}

function assertBooleanValue(value, objectName, field, { allowNull = false } = {}) {
  if (value === null) {
    if (allowNull) return null
    failApiContract(`Missing field: ${field}`, { objectName, field, receivedValue: value })
  }

  if (typeof value !== 'boolean') {
    failApiContract(`${objectName}.${field} must be a boolean`, {
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
    failApiContract(`${objectName}.${field} must be an ISO-8601 date string`, {
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
    failApiContract(`${objectName}.${field} has invalid value`, {
      objectName,
      field,
      receivedValue: text,
      allowedValues: [...allowedValues],
    })
  }

  return text
}

function validateLocationRef(value, objectName = 'LocationRef') {
  const location = assertObject(value, objectName)
  assertEnumValue(assertField(location, 'type', { objectName }), objectName, 'type', LOCATION_TYPE_VALUES)
  assertNumberValue(assertField(location, 'id', { objectName }), objectName, 'id', { integer: true })
  assertStringValue(assertField(location, 'name', { objectName, allowNull: true }), objectName, 'name', { allowNull: true })
  return location
}

function validateAdCategoryDto(value, objectName = 'AdCategoryDto') {
  const category = assertObject(value, objectName)
  assertNumberValue(assertField(category, 'id', { objectName }), objectName, 'id', { integer: true })
  assertStringValue(assertField(category, 'name', { objectName }), objectName, 'name', { nonEmpty: true })
  assertNumberValue(assertField(category, 'parentId', { objectName, allowNull: true }), objectName, 'parentId', { allowNull: true, integer: true })
  return category
}

function validateAdOwnerDto(value, objectName = 'AdOwnerDto') {
  const owner = assertObject(value, objectName)
  assertNumberValue(assertField(owner, 'id', { objectName }), objectName, 'id', { integer: true })
  assertStringValue(assertField(owner, 'userLogin', { objectName }), objectName, 'userLogin', { nonEmpty: true })
  assertStringValue(assertField(owner, 'userName', { objectName, allowNull: true }), objectName, 'userName', { allowNull: true })
  assertStringValue(assertField(owner, 'userEmail', { objectName, allowNull: true }), objectName, 'userEmail', { allowNull: true })
  assertStringValue(assertField(owner, 'userPhoneNumber', { objectName, allowNull: true }), objectName, 'userPhoneNumber', { allowNull: true })
  assertStringValue(assertField(owner, 'avatarPath', { objectName, allowNull: true }), objectName, 'avatarPath', { allowNull: true })
  const roles = assertArray(assertField(owner, 'roles', { objectName }), `${objectName}.roles`)
  roles.forEach((role, index) => {
    assertStringValue(role, `${objectName}.roles[${index}]`, 'value', { nonEmpty: true })
  })
  assertDateTimeValue(assertField(owner, 'createdAt', { objectName }), objectName, 'createdAt')
  assertDateTimeValue(assertField(owner, 'lastActivityAt', { objectName }), objectName, 'lastActivityAt')
  return owner
}

function validateAdImageDto(value, index) {
  const objectName = `AdDetailsDto.images[${index}]`
  const image = assertObject(value, objectName)
  assertNumberValue(assertField(image, 'id', { objectName }), objectName, 'id', { integer: true })
  assertNumberValue(assertField(image, 'adId', { objectName }), objectName, 'adId', { integer: true })
  assertStringValue(assertField(image, 'filePath', { objectName }), objectName, 'filePath', { nonEmpty: true })
  assertNumberValue(assertField(image, 'sortOrder', { objectName }), objectName, 'sortOrder', { integer: true })
  assertBooleanValue(assertField(image, 'isMain', { objectName }), objectName, 'isMain')
  return image
}

export function validateAdDetailsDto(value, options = {}) {
  const { strict = true } = options

  try {
    const ad = assertObject(value, 'AdDetailsDto')

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
    validateLocationRef(location, 'LocationRef')
    if (location.id !== ad.locationId) {
      failApiContract('location.id must match locationId', {
        objectName: 'AdDetailsDto',
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
    validateAdCategoryDto(category, 'AdCategoryDto')
    if (category.id !== ad.categoryId) {
      failApiContract('category.id must match categoryId', {
        objectName: 'AdDetailsDto',
        field: 'category',
        categoryId: ad.categoryId,
        categoryIdFromObject: category.id,
      })
    }
  }

  const owner = assertField(ad, 'user', { objectName: 'AdDetailsDto', allowNull: true })
  if (owner !== null) validateAdOwnerDto(owner, 'AdOwnerDto')

  const images = assertArray(assertField(ad, 'images', { objectName: 'AdDetailsDto' }), 'AdDetailsDto.images')
  images.forEach((image, index) => {
    const validatedImage = validateAdImageDto(image, index)
    if (validatedImage.adId !== ad.id) {
      failApiContract('image.adId must match ad.id', {
        objectName: `AdDetailsDto.images[${index}]`,
        adId: ad.id,
        imageAdId: validatedImage.adId,
      })
    }
  })

  if (images.length === 0) {
    if (mainImageId !== null) {
      failApiContract('mainImageId must be null when images are empty', {
        objectName: 'AdDetailsDto',
        field: 'mainImageId',
        mainImageId,
        imagesCount: 0,
      })
    }
  } else {
    if (mainImageId === null) {
      failApiContract('Missing field: mainImageId', {
        objectName: 'AdDetailsDto',
        field: 'mainImageId',
        imagesCount: images.length,
      })
    }

    const mainImage = images.find(image => image.id === mainImageId)
    assertFound(mainImage, `Missing main image: ${mainImageId}`, {
      objectName: 'AdDetailsDto',
      adId: ad.id,
      mainImageId,
      imageIds: images.map(image => image.id),
    })

    if (mainImage.isMain !== true) {
      failApiContract('Main image must be marked isMain', {
        objectName: 'AdDetailsDto',
        adId: ad.id,
        mainImageId,
        imageIds: images.map(image => image.id),
      })
    }

    const mainImagesCount = images.filter(image => image.isMain === true).length
    if (mainImagesCount !== 1) {
      failApiContract('AdDetailsDto.images must contain exactly one main image', {
        objectName: 'AdDetailsDto',
        adId: ad.id,
        mainImagesCount,
        imageIds: images.map(image => image.id),
      })
    }
  }

    assertBooleanValue(assertField(ad, 'isFavorite', { objectName: 'AdDetailsDto' }), 'AdDetailsDto', 'isFavorite')

    return ad
  } catch (error) {
    if (!(error instanceof ContractError)) {
      throw error
    }

    const normalizedDetails = {
      dto: 'AdDetailsDto',
      causeMessage: error.message,
      ...(error.details && typeof error.details === 'object' ? error.details : {}),
    }
    const normalizedError = error.message === 'Invalid AdDetailsDto'
      ? error
      : new ContractError('Invalid AdDetailsDto', normalizedDetails)

    logContractError(normalizedError, value, { soft: !strict })

    if (strict) {
      throw normalizedError
    }

    return null
  }
}
