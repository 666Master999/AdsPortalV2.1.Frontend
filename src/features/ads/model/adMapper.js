import { normalizeModerationStatus } from '@/utils/moderationStatus'

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeText(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizeOwner(owner) {
  if (!owner || typeof owner !== 'object') return null

  const id = owner.id ?? owner.userId ?? null

  return {
    ...owner,
    id,
    userId: id,
    userLogin: normalizeText(owner.userLogin),
    userName: normalizeText(owner.userName),
    avatarPath: normalizeText(owner.avatarPath),
    userEmail: normalizeText(owner.userEmail),
    userPhoneNumber: normalizeText(owner.userPhoneNumber),
    lastActivityAt: owner.lastActivityAt ?? null,
  }
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  if (typeof value === 'number') return value !== 0
  return Boolean(value)
}

export function mapAdDtoToViewModel(dto = {}) {
  const ad = dto && typeof dto === 'object' ? dto : {}
  const owner = normalizeOwner(ad.user ?? null)
  const ownerId = owner?.id ?? owner?.userId ?? null

  const moderationStatus = normalizeModerationStatus(ad.moderationStatus ?? ad.status)
  const rejectionReason = normalizeText(ad.rejectionReason)
  const locationId = ad.locationId ?? ad.location?.id ?? null
  const mainImageId = ad.mainImageId ?? null
  const id = ad.id ?? null
  const mainImagePath = normalizeText(ad.mainImagePath)

  return {
    ...ad,
    id,
    adId: id,
    owner,
    user: owner,
    title: normalizeText(ad.title),
    description: normalizeText(ad.description),
    price: ad.price ?? null,
    isNegotiable: toBoolean(ad.isNegotiable),
    categoryId: ad.categoryId ?? null,
    listingType: normalizeText(ad.listingType),
    createdAt: ad.createdAt ?? null,
    updatedAt: ad.updatedAt ?? null,
    viewsCount: ad.viewsCount ?? null,
    favoritesCount: ad.favoritesCount ?? null,
    isFavorite: toBoolean(ad.isFavorite),
    moderationStatus,
    status: moderationStatus,
    rejectionReason,
    userId: ad.userId ?? ownerId ?? null,
    locationId: toNullableNumber(locationId) ?? locationId,
    mainImageId: toNullableNumber(mainImageId) ?? mainImageId,
    mainImagePath,
    mainImage: mainImagePath,
    mainImageUrl: mainImagePath,
    isDeleted: moderationStatus === 'deleted',
  }
}

export function mapAdListDtoToViewModel(value) {
  if (!Array.isArray(value)) return []
  return value.map(mapAdDtoToViewModel)
}
