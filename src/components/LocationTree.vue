<script setup>
import { computed, onMounted, ref } from 'vue'
import { useLocations, normalizeLocationIdList } from '../composables/useLocations'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const { tree, loadTree, getLocationPathLabel } = useLocations()

const isLoading = ref(false)
const expandedRegionIds = ref([])
const expandedCityIds = ref([])
const MAX_LOCATIONS = 10

const selectedIds = computed(() => normalizeLocationIdList(props.modelValue).slice(0, MAX_LOCATIONS))

function getCollectionItems(collection) {
  if (Array.isArray(collection)) return collection
  if (Array.isArray(collection?.value)) return collection.value
  return []
}

function isExpanded(collectionRef, id) {
  return getCollectionItems(collectionRef).includes(id)
}

function toggleExpanded(collectionRef, id) {
  const items = getCollectionItems(collectionRef)
  const index = items.indexOf(id)
  if (index !== -1) {
    items.splice(index, 1)
    return false
  }

  items.push(id)
  return true
}

function updateSelection(next) {
  emit('update:modelValue', normalizeLocationIdList(next).slice(0, MAX_LOCATIONS))
}

function toggleSelection(id) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else if (next.size >= MAX_LOCATIONS) {
    return
  } else {
    next.add(id)
  }
  updateSelection([...next])
}

function removeSelection(id) {
  updateSelection(selectedIds.value.filter(item => item !== id))
}

function clearSelection() {
  updateSelection([])
}

onMounted(async () => {
  isLoading.value = true
  try {
    await loadTree()
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="d-grid gap-3">
    <div v-if="selectedIds.length" class="d-flex flex-wrap gap-2">
      <span
        v-for="id in selectedIds"
        :key="id"
        class="badge rounded-pill text-bg-light border text-secondary px-3 py-2 d-inline-flex align-items-center gap-2"
      >
        {{ getLocationPathLabel(id) || `Локация #${id}` }}
        <button type="button" class="btn-close" aria-label="Удалить" @click="removeSelection(id)"></button>
      </span>
      <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill" :disabled="disabled" @click="clearSelection">
        Очистить всё
      </button>
    </div>

    <div class="small text-secondary">
      Можно выбрать до {{ MAX_LOCATIONS }} локаций.
    </div>

    <div v-if="isLoading" class="small text-secondary">Загрузка локаций...</div>

    <div v-else class="d-grid gap-3">
      <div v-if="!tree.length" class="small text-secondary">Список локаций пуст.</div>

      <div v-for="region in tree" :key="region.id" class="border rounded-4 bg-white p-3">
        <div class="d-flex align-items-center gap-2">
          <button
            v-if="region.children?.length"
            type="button"
            class="btn btn-sm btn-link p-0 text-secondary text-decoration-none"
            @click="toggleExpanded(expandedRegionIds, region.id)"
          >
            {{ isExpanded(expandedRegionIds, region.id) ? '▲' : '▼' }}
          </button>
          <div class="form-check mb-0 flex-grow-1">
            <input
              :id="`region-${region.id}`"
              type="checkbox"
              class="form-check-input"
              :disabled="disabled"
              :checked="selectedIds.includes(region.id)"
              @change="toggleSelection(region.id)"
            />
            <label class="form-check-label" :for="`region-${region.id}`">{{ region.name }}</label>
          </div>
        </div>

        <div v-show="isExpanded(expandedRegionIds, region.id)" class="ps-3 pt-3">
          <div v-for="city in region.children || []" :key="city.id" class="mb-3">
            <div class="d-flex align-items-center gap-2">
              <button
                v-if="city.children?.length"
                type="button"
                class="btn btn-sm btn-link p-0 text-secondary text-decoration-none"
                @click="toggleExpanded(expandedCityIds, city.id)"
              >
                {{ isExpanded(expandedCityIds, city.id) ? '▲' : '▼' }}
              </button>
              <div class="form-check mb-0 flex-grow-1">
                <input
                  :id="`city-${city.id}`"
                  type="checkbox"
                  class="form-check-input"
                  :disabled="disabled"
                  :checked="selectedIds.includes(city.id)"
                  @change="toggleSelection(city.id)"
                />
                <label class="form-check-label" :for="`city-${city.id}`">{{ city.name }}</label>
              </div>
            </div>

            <div v-show="isExpanded(expandedCityIds, city.id)" class="ps-3 pt-2">
              <div v-for="district in city.children || []" :key="district.id" class="form-check mb-2">
                <input
                  :id="`district-${district.id}`"
                  type="checkbox"
                  class="form-check-input"
                  :disabled="disabled"
                  :checked="selectedIds.includes(district.id)"
                  @change="toggleSelection(district.id)"
                />
                <label class="form-check-label" :for="`district-${district.id}`">{{ district.name }}</label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
