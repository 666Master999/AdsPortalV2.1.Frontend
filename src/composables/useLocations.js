import { storeToRefs } from 'pinia'
import { useLocationsStore } from '../stores/locationsStore'

export function normalizeLocationId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export function normalizeLocationIdList(value) {
  const items = Array.isArray(value) ? value : value == null ? [] : [value]
  const seen = new Set()
  const output = []

  for (const item of items) {
    const id = normalizeLocationId(item)
    if (id == null || seen.has(id)) continue
    seen.add(id)
    output.push(id)
  }

  return output
}

export function useLocations() {
  const store = useLocationsStore()
  const { tree, treeLoaded } = storeToRefs(store)

  return {
    tree,
    treeLoaded,
    loadTree: store.loadTree,
    findLocationById: store.findLocationById,
    getRootLocations: store.getRootLocations,
    getLocationChildren: store.getLocationChildren,
    hasLocationChildren: store.hasLocationChildren,
    getLocationPath: store.getLocationPath,
    getLocationPathLabel: store.getLocationPathLabel,
    getLocationLabel: store.getLocationLabel,
    getLocationTypeLabel: store.getLocationTypeLabel,
    normalizeLocationId,
    normalizeLocationIdList,
  }
}
