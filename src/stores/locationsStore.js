import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { fetchDeduped } from '../utils/fetchDeduped'
import { LOCATION_TYPE_LABELS, LocationType, normalizeLocationType } from '../types/location'
import { apiClient } from '../api/apiClient'

function toId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function normalizeNode(node) {
  if (!node || typeof node !== 'object') return null

  // Strict mapping according to API contract:
  // Expect shape: { id: number, name: string, type: "region"|"city"|"district", children: [] }
  const id = toId(node.id)
  const name = String(node.name ?? '').trim()

  let type = null
  const rawType = node.type
  if (typeof rawType === 'string') {
    const t = rawType.toLowerCase().trim()
    if (t === 'region') type = LocationType.REGION
    else if (t === 'city') type = LocationType.CITY
    else if (t === 'district') type = LocationType.DISTRICT
  }

  const children = Array.isArray(node.children) ? node.children : []

  if (id == null || type == null || !name) return null

  return {
    id,
    name,
    type,
    children,
  }
}

function indexTree(nodes, parent = null, ancestry = [], byId, parentById, pathById) {
  const output = []

  for (const node of nodes) {
    const normalized = normalizeNode(node)
    if (!normalized) continue

    parentById[normalized.id] = parent
    pathById[normalized.id] = [...ancestry, normalized]

    normalized.children = indexTree(
      normalized.children,
      normalized.id,
      pathById[normalized.id],
      byId,
      parentById,
      pathById,
    )

    byId[normalized.id] = normalized
    output.push(normalized)
  }

  return output
}

function clearReactiveObject(target) {
  for (const key of Object.keys(target)) {
    delete target[key]
  }
}

export const useLocationsStore = defineStore('locations', () => {
  const tree = ref([])
  const treeLoaded = ref(false)
  const nodesById = reactive({})
  const parentById = reactive({})
  const pathById = reactive({})

  function rebuildIndexes(nextTree) {
    clearReactiveObject(nodesById)
    clearReactiveObject(parentById)
    clearReactiveObject(pathById)
    tree.value = indexTree(Array.isArray(nextTree) ? nextTree : [], null, [], nodesById, parentById, pathById)
  }

  async function loadTree() {
    if (treeLoaded.value) return tree.value

    return fetchDeduped('locations', async () => {
      const data = await apiClient.get('/locations', {
        errorHandlerOptions: { notify: false },
      })
      rebuildIndexes(Array.isArray(data) ? data : [])
      treeLoaded.value = true
      return tree.value
    })
  }

  function findLocationById(id) {
    const locationId = toId(id)
    if (locationId == null) return null
    return nodesById[locationId] || null
  }

  function getRootLocations() {
    return tree.value
  }

  function getLocationChildren(id) {
    const locationId = toId(id)
    if (locationId == null) return tree.value
    return nodesById[locationId]?.children || []
  }

  function hasLocationChildren(id) {
    return getLocationChildren(id).length > 0
  }

  function getLocationPath(id) {
    const locationId = toId(id)
    if (locationId == null) return []
    return pathById[locationId] || []
  }

  function getLocationPathLabel(id) {
    const path = getLocationPath(id)
    if (!path.length) return ''
    return path.map(node => node.name).join(' / ')
  }

  function getLocationLabel(id) {
    const pathLabel = getLocationPathLabel(id)
    return pathLabel || 'Локация не указана'
  }

  function getLocationTypeLabel(type) {
    const normalized = normalizeLocationType(type)
    return normalized == null ? '' : LOCATION_TYPE_LABELS[normalized] || ''
  }

  return {
    tree,
    treeLoaded,
    loadTree,
    findLocationById,
    getRootLocations,
    getLocationChildren,
    hasLocationChildren,
    getLocationPath,
    getLocationPathLabel,
    getLocationLabel,
    getLocationTypeLabel,
  }
})
