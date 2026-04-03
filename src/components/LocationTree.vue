<script setup>
import { ref, onMounted } from 'vue'
import { useLocations } from '../composables/useLocations'

const props = defineProps({ locations: { type: Array, default: () => [] } })
const emit = defineEmits(['update:locations'])
const {
  regions,
  loadingCities,
  loadingDistricts,
  loadRegions,
  loadCitiesByRegion,
  loadDistrictsByCity,
  getRegionCities,
  getCityDistricts,
  hasCityDistricts,
  isRegionSelected,
  isCitySelected,
  isDistrictSelected,
  isBlockedByRegion,
  toggleRegionSelection,
  toggleCitySelection,
  toggleDistrictSelection,
  ensureSelectionContext,
} = useLocations()

const expandedRegionIds = ref([])
const expandedCityIds = ref([])

onMounted(loadRegions)

function isExpanded(collection, id) {
  return collection?.includes(id) ?? false
}

function toggleExpanded(collectionRef, id) {
  const index = collectionRef.value.indexOf(id)
  if (index !== -1) {
    collectionRef.value.splice(index, 1)
    return false
  }
  collectionRef.value.push(id)
  return true
}

function updateLocations(next) {
  emit('update:locations', next)
}

async function onRegionToggle(region) {
  await ensureSelectionContext([region])
  updateLocations(toggleRegionSelection(props.locations, region.id))
}

async function onCityToggle(city) {
  await ensureSelectionContext([city])
  updateLocations(toggleCitySelection(props.locations, city))
}

async function onDistrictToggle(district) {
  await ensureSelectionContext([district])
  updateLocations(toggleDistrictSelection(props.locations, district))
}

async function onRegionExpand(region) {
  if (toggleExpanded(expandedRegionIds, region.id)) await loadCitiesByRegion(region.id)
}

async function onCityExpand(city) {
  if (toggleExpanded(expandedCityIds, city.id)) await loadDistrictsByCity(city.id)
}
</script>

<template>
  <div>
    <div class="small text-uppercase text-secondary fw-semibold mb-2">Регионы</div>
    <div v-if="!regions.length" class="text-secondary small">Загрузка...</div>
    <div v-for="region in regions" :key="region.id" class="mb-1">
      <div class="d-flex align-items-center gap-1">
        <div class="form-check mb-0 flex-grow-1">
          <input :id="`region-${region.id}`" type="checkbox" class="form-check-input" :checked="isRegionSelected(locations, region.id)" @change="onRegionToggle(region)" />
          <label class="form-check-label" :for="`region-${region.id}`">{{ region.name }}</label>
        </div>
        <button type="button" class="btn btn-sm btn-link p-0 text-secondary text-decoration-none" @click="onRegionExpand(region)">{{ isExpanded(expandedRegionIds.value, region.id) ? '▲' : '▼' }}</button>
      </div>
      <div v-show="isExpanded(expandedRegionIds.value, region.id)" class="ps-3 pt-1">
        <div v-if="loadingCities[region.id]" class="text-secondary small">Загрузка...</div>
        <template v-else>
          <div v-if="!getRegionCities(region.id).length" class="text-secondary small">Нет городов</div>
          <div v-for="city in getRegionCities(region.id)" :key="city.id" class="mb-1">
            <div class="d-flex align-items-center gap-1">
              <div class="form-check mb-0 flex-grow-1">
                <input :id="`city-${city.id}`" type="checkbox" class="form-check-input" :checked="isCitySelected(locations, city.id)" :disabled="isBlockedByRegion(locations, region.id)" @change="onCityToggle(city)" />
                <label class="form-check-label" :class="{ 'text-muted': isBlockedByRegion(locations, region.id) }" :for="`city-${city.id}`">{{ city.name }}</label>
              </div>
              <button v-if="hasCityDistricts(city.id)" type="button" class="btn btn-sm btn-link p-0 text-secondary text-decoration-none" @click="onCityExpand(city)">{{ isExpanded(expandedCityIds.value, city.id) ? '▲' : '▼' }}</button>
            </div>
            <div v-show="isExpanded(expandedCityIds.value, city.id)" class="ps-3 pt-1">
              <div v-if="loadingDistricts[city.id]" class="text-secondary small">Загрузка...</div>
              <template v-else>
                <div v-if="!getCityDistricts(city.id).length" class="text-secondary small">Нет районов</div>
                <div v-for="district in getCityDistricts(city.id)" :key="district.id" class="mb-1">
                  <div class="form-check mb-0">
                    <input :id="`district-${district.id}`" type="checkbox" class="form-check-input" :checked="isDistrictSelected(locations, district.id)" :disabled="isBlockedByRegion(locations, region.id)" @change="onDistrictToggle(district)" />
                    <label class="form-check-label" :class="{ 'text-muted': isBlockedByRegion(locations, region.id) }" :for="`district-${district.id}`">{{ district.name }}</label>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
