<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useLocations, normalizeLocationId } from '../composables/useLocations'

const props = defineProps({
  modelValue: { type: [Number, String], default: null },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const { tree, loadTree, getLocationPath, getLocationChildren, getLocationLabel } = useLocations()

const isLoading = ref(false)
const loadError = ref('')
const regionId = ref(null)
const cityId = ref(null)
const districtId = ref(null)

function applyValue(value) {
  const locationId = normalizeLocationId(value)
  if (locationId == null) {
    regionId.value = null
    cityId.value = null
    districtId.value = null
    return
  }

  const path = getLocationPath(locationId)
  regionId.value = path[0]?.id ?? null
  cityId.value = path[1]?.id ?? null
  districtId.value = path[2]?.id ?? null
}

async function ensureTreeLoaded() {
  if (tree.value.length) return

  isLoading.value = true
  loadError.value = ''

  try {
    await loadTree()
    if (!tree.value.length) {
      loadError.value = 'Список локаций пуст.'
    }
  } catch (error) {
    console.error('Failed to load location tree:', error)
    loadError.value = 'Не удалось загрузить список локаций.'
  } finally {
    isLoading.value = false
  }
}

function emitCurrentSelection() {
  if (districtId.value != null) {
    emit('update:modelValue', districtId.value)
    return
  }

  if (cityId.value != null) {
    emit('update:modelValue', cityId.value)
    return
  }

  if (regionId.value != null) {
    emit('update:modelValue', regionId.value)
    return
  }

  emit('update:modelValue', null)
}

function onRegionChange(event) {
  regionId.value = normalizeLocationId(event.target.value)
  cityId.value = null
  districtId.value = null
  emitCurrentSelection()
}

function onCityChange(event) {
  cityId.value = normalizeLocationId(event.target.value)
  districtId.value = null
  emitCurrentSelection()
}

function onDistrictChange(event) {
  districtId.value = normalizeLocationId(event.target.value)
  emitCurrentSelection()
}

function clearSelection() {
  regionId.value = null
  cityId.value = null
  districtId.value = null
  emit('update:modelValue', null)
}

const currentCities = computed(() => {
  if (regionId.value == null) return []
  return getLocationChildren(regionId.value)
})

const currentDistricts = computed(() => {
  if (cityId.value == null) return []
  return getLocationChildren(cityId.value)
})

const selectionSummary = computed(() => {
  const locationId = districtId.value ?? cityId.value ?? regionId.value
  return locationId != null ? getLocationLabel(locationId) : ''
})

watch(
  () => props.modelValue,
  async (value) => {
    await ensureTreeLoaded()
    applyValue(value)
  },
  { immediate: true }
)

onMounted(() => {
  void ensureTreeLoaded()
})
</script>

<template>
  <div class="d-grid gap-3">
    <div v-if="loadError" class="alert alert-danger rounded-4 border-0 mb-0">
      {{ loadError }}
    </div>

    <div class="location-stack">
      <div>
        <label class="form-label small text-secondary fw-semibold">Область</label>
        <select
          class="form-select rounded-3"
          :disabled="disabled || isLoading"
          :value="regionId ?? ''"
          @change="onRegionChange"
        >
          <option value="">Выберите область</option>
          <option v-for="region in tree" :key="region.id" :value="region.id">
            {{ region.name }}
          </option>
        </select>
      </div>

      <transition name="loc-slide" appear>
        <div v-if="regionId != null" class="mt-2">
          <label class="form-label small text-secondary fw-semibold">Город</label>
          <select
            class="form-select rounded-3"
            :disabled="disabled || isLoading"
            :value="cityId ?? ''"
            @change="onCityChange"
          >
            <option value="">Выберите город</option>
            <option v-for="city in currentCities" :key="city.id" :value="city.id">
              {{ city.name }}
            </option>
          </select>
        </div>
      </transition>

      <transition name="loc-slide" appear>
        <div v-if="cityId != null && currentDistricts.length" class="mt-2">
          <label class="form-label small text-secondary fw-semibold">Район</label>
          <select
            class="form-select rounded-3"
            :disabled="disabled || isLoading"
            :value="districtId ?? ''"
            @change="onDistrictChange"
          >
            <option value="">Выберите район</option>
            <option v-for="district in currentDistricts" :key="district.id" :value="district.id">
              {{ district.name }}
            </option>
          </select>
        </div>
      </transition>
    </div>

    <div v-if="isLoading" class="small text-secondary">Загрузка локаций...</div>

    <div v-if="selectionSummary" class="d-flex flex-wrap align-items-center gap-2">
      <span class="badge rounded-pill text-bg-light border text-secondary px-3 py-2">
        {{ selectionSummary }}
      </span>
      <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill" :disabled="disabled" @click="clearSelection">
        Очистить
      </button>
    </div>
  </div>
</template>

<style scoped>
.loc-slide-enter-active,
.loc-slide-leave-active {
  transition: opacity .18s ease, transform .18s ease;
}
.loc-slide-enter-from,
.loc-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
.loc-slide-enter-to,
.loc-slide-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
