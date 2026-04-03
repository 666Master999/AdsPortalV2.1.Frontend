import { ref, computed } from 'vue'
import { normalizeLocations } from './useLocations'
import { mapFilterToLocation } from './useLocationMapper'

// ─── Constants ────────────────────────────────────────────────────────────────

export const SCALAR_FILTER_TYPES = ['priceFrom', 'priceTo', 'category', 'status', 'dateFrom', 'dateTo']
export const ALL_FILTER_TYPES = [...SCALAR_FILTER_TYPES, 'location']

// ─── Location helpers ─────────────────────────────────────────────────────────

// LocationRef { type, id } ↔ filter value string "city:1"
function locationRefToValue(loc) {
  return `${loc.type}:${loc.id}`
}

// ─── Pure serialization ───────────────────────────────────────────────────────

/**
 * Parse URL ?filters= JSON string into FilterRef[].
 */
export function parseFiltersParam(str) {
  if (!str || typeof str !== 'string') return []
  try {
    const parsed = JSON.parse(str)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Build URL ?filters= string from FilterRef[].
 */
export function buildFiltersParam(filters) {
  return JSON.stringify(filters ?? [])
}

// ─── Normalization ────────────────────────────────────────────────────────────

/**
 * Normalize FilterRef[]:
 * - Scalar types: deduplicate (last wins)
 * - priceFrom > priceTo: swap
 * - location: deduplicate and run normalizeLocations
 */
export function normalizeFilters(filters, locationData = {}) {
  const scalars = {}
  const locationFilters = []

  for (const f of filters) {
    if (f.type === 'location') {
      locationFilters.push(f)
    } else if (SCALAR_FILTER_TYPES.includes(f.type)) {
      scalars[f.type] = f.value
    }
  }

  // Swap price if needed
  const from = Number(scalars.priceFrom)
  const to = Number(scalars.priceTo)
  if (scalars.priceFrom != null && scalars.priceTo != null && from > to) {
    const tmp = scalars.priceFrom
    scalars.priceFrom = scalars.priceTo
    scalars.priceTo = tmp
  }

  // Normalize locations via existing utility
  const normalizedLocationRefs = normalizeLocations(mapFilterToLocation(locationFilters), locationData)

  // Rebuild
  const result = []
  for (const [type, value] of Object.entries(scalars)) {
    if (value != null && value !== '') result.push({ type, value })
  }
  for (const loc of normalizedLocationRefs) {
    result.push({ type: 'location', value: locationRefToValue(loc) })
  }
  return result
}

// ─── Immutable helpers ────────────────────────────────────────────────────────

/**
 * Returns new FilterRef[] with filter added.
 * Scalar types replace existing. Location type allows multiple (deduped by value).
 */
export function addFilter(filters, filter) {
  const { type, value } = filter
  if (type === 'location') {
    const strValue = typeof value === 'string' ? value : locationRefToValue(value)
    if (filters.some(f => f.type === 'location' && f.value === strValue)) return filters
    return [...filters, { type: 'location', value: strValue }]
  }
  return [...filters.filter(f => f.type !== type), { type, value }]
}

/**
 * Returns new FilterRef[] with filter(s) removed.
 * If value is provided, only removes matching entry. Otherwise removes all of type.
 */
export function removeFilter(filters, filter) {
  const { type, value } = filter
  if (value !== undefined) {
    const strValue = typeof value === 'string' ? value : locationRefToValue(value)
    return filters.filter(f => !(f.type === type && f.value === strValue))
  }
  return filters.filter(f => f.type !== type)
}

// ─── Composable ───────────────────────────────────────────────────────────────

/**
 * Vue composable wrapping FilterRef[] state with add/remove/normalize actions.
 * Designed to be used inside useAdsList — not directly in components.
 *
 * Components interact via derived computed values and the action methods.
 */
export function useFilters(getLocationData) {
  const filters = ref([])

  function doAdd(filter) {
    filters.value = addFilter(filters.value, filter)
  }

  function doRemove(filter) {
    filters.value = removeFilter(filters.value, filter)
  }

  function doNormalize() {
    filters.value = normalizeFilters(filters.value, getLocationData?.() ?? {})
  }

  function setFromArray(arr) {
    filters.value = arr
  }

  // ── Derived values (read) ────────────────────────────────────────────────

  const priceFrom = computed(() => filters.value.find(f => f.type === 'priceFrom')?.value ?? '')
  const priceTo = computed(() => filters.value.find(f => f.type === 'priceTo')?.value ?? '')
  const category = computed(() => filters.value.find(f => f.type === 'category')?.value ?? '')
  const status = computed(() => filters.value.find(f => f.type === 'status')?.value ?? '')
  const dateFrom = computed(() => filters.value.find(f => f.type === 'dateFrom')?.value ?? '')
  const dateTo = computed(() => filters.value.find(f => f.type === 'dateTo')?.value ?? '')
  const locations = computed(() => mapFilterToLocation(filters.value))

  return {
    filters,
    addFilter: doAdd,
    removeFilter: doRemove,
    normalizeFilters: doNormalize,
    setFromArray,
    // Derived
    priceFrom,
    priceTo,
    category,
    status,
    dateFrom,
    dateTo,
    locations,
  }
}
