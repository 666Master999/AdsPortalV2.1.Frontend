<script setup>
import { ref, onMounted } from 'vue'
import { useLocations } from '../composables/useLocations'
import LocationAutocomplete from './LocationAutocomplete.vue'
import LocationPresets from './LocationPresets.vue'
import SelectedLocations from './SelectedLocations.vue'
import LocationTree from './LocationTree.vue'

const locations = defineModel({ type: Array, default: () => [] })
const presetLoading = ref(false)

const {
  loadRegions,
  applyPreset,
  ensureSelectionContext,
  addLocation,
  removeLocation,
  normalizeCurrentLocations,
} = useLocations()

onMounted(loadRegions)

function syncLocations(next) {
  locations.value = normalizeCurrentLocations(next)
}

async function onPresetSelect(key) {
  presetLoading.value = true
  try {
    const presetLocations = await applyPreset(key)
    await ensureSelectionContext(presetLocations)
    syncLocations(presetLocations)
  } finally {
    presetLoading.value = false
  }
}

async function onSearchSelect(item) {
  if (item?.type === 'preset' && item.id === 'all') {
    syncLocations([])
    return
  }
  await ensureSelectionContext([item])
  syncLocations(addLocation(locations.value, item))
}

function onTreeUpdate(nextLocations) {
  syncLocations(nextLocations)
}

function onLocationRemove(item) {
  syncLocations(removeLocation(locations.value, item))
}
</script>

<template>
  <div>
    <LocationPresets :loading="presetLoading" @select="onPresetSelect" />

    <div class="mb-3">
      <LocationAutocomplete :selected="locations" @select="onSearchSelect" />
    </div>

    <SelectedLocations :locations="locations" @remove="onLocationRemove" />

    <LocationTree :locations="locations" @update:locations="onTreeUpdate" />
  </div>
</template>
