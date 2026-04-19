<script setup>
import { computed } from 'vue'
import LocationTree from './LocationTree.vue'

const filterState = defineModel('filterState', {
  default: () => ({}),
})

const baseFilterState = defineModel('baseFilterState', {
  default: () => ({}),
})

const selectedLocationIds = defineModel('selectedLocationIds', {
  default: () => [],
})

const props = defineProps({
  filters: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['clear'])

const supportedFilters = computed(() => {
  const allowedTypes = new Set(['bool', 'enum', 'int', 'decimal'])
  return Array.isArray(props.filters)
    ? props.filters.filter(filter => allowedTypes.has(String(filter?.type || '').toLowerCase()))
    : []
})

function getFilterValue(slug) {
  if (!filterState.value || typeof filterState.value !== 'object') return undefined
  return filterState.value[slug]
}

function getBaseFilterValue(slug) {
  if (!baseFilterState.value || typeof baseFilterState.value !== 'object') return undefined
  return baseFilterState.value[slug]
}

function setFilterValue(slug, value) {
  const currentState = filterState.value && typeof filterState.value === 'object' ? filterState.value : {}
  filterState.value = {
    ...currentState,
    [slug]: value,
  }
}

function setBaseFilterValue(slug, value) {
  const currentState = baseFilterState.value && typeof baseFilterState.value === 'object' ? baseFilterState.value : {}
  baseFilterState.value = {
    ...currentState,
    [slug]: value,
  }
}

function getDecimalValue(slug, part) {
  const value = getFilterValue(slug)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  return value[part] ?? ''
}

function setDecimalValue(slug, part, value) {
  const currentValue = getFilterValue(slug)
  const baseValue = currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
    ? currentValue
    : { min: '', max: '' }

  setFilterValue(slug, {
    ...baseValue,
    [part]: value,
  })
}

function getEnumSelections(slug) {
  const value = getFilterValue(slug)
  return Array.isArray(value) ? value : []
}

function isEnumSelected(slug, optionValue) {
  return getEnumSelections(slug).includes(optionValue)
}

function toggleEnumSelection(slug, optionValue, checked) {
  const nextValues = new Set(getEnumSelections(slug))
  if (checked) {
    nextValues.add(optionValue)
  } else {
    nextValues.delete(optionValue)
  }

  setFilterValue(slug, [...nextValues])
}

function clearBoolFilter(slug) {
  setFilterValue(slug, null)
}
</script>

<template>
  <div class="d-grid gap-4">
    <LocationTree v-model="selectedLocationIds" />

    <div class="border-top pt-4 d-grid gap-4">
      <div>
        <div class="small text-uppercase text-secondary fw-semibold mb-1">Основные критерии</div>
        <div class="text-secondary small">Цена, даты и includeChildren.</div>
      </div>

      <div class="form-check form-switch d-flex align-items-center gap-3 mb-0">
        <input
          id="include-children-switch"
          class="form-check-input m-0"
          type="checkbox"
          role="switch"
          :checked="Boolean(getBaseFilterValue('includeChildren'))"
          @change="setBaseFilterValue('includeChildren', $event.target.checked)"
        />
        <label class="form-check-label fw-semibold" for="include-children-switch">
          Включать дочерние категории
        </label>
      </div>

      <div class="row g-2">
        <div class="col-6">
          <label class="form-label small text-secondary fw-semibold mb-2">Цена от</label>
          <input
            :value="getBaseFilterValue('priceFrom') ?? ''"
            type="number"
            step="any"
            class="form-control rounded-3"
            placeholder="От"
            @input="setBaseFilterValue('priceFrom', $event.target.value)"
          />
        </div>
        <div class="col-6">
          <label class="form-label small text-secondary fw-semibold mb-2">Цена до</label>
          <input
            :value="getBaseFilterValue('priceTo') ?? ''"
            type="number"
            step="any"
            class="form-control rounded-3"
            placeholder="До"
            @input="setBaseFilterValue('priceTo', $event.target.value)"
          />
        </div>
      </div>

      <div class="row g-2">
        <div class="col-6">
          <label class="form-label small text-secondary fw-semibold mb-2">Дата от</label>
          <input
            :value="getBaseFilterValue('dateFrom') ?? ''"
            type="date"
            class="form-control rounded-3"
            @input="setBaseFilterValue('dateFrom', $event.target.value)"
          />
        </div>
        <div class="col-6">
          <label class="form-label small text-secondary fw-semibold mb-2">Дата до</label>
          <input
            :value="getBaseFilterValue('dateTo') ?? ''"
            type="date"
            class="form-control rounded-3"
            @input="setBaseFilterValue('dateTo', $event.target.value)"
          />
        </div>
      </div>

    </div>

    <div v-if="supportedFilters.length" class="border-top pt-4 d-grid gap-4">
      <div v-for="filter in supportedFilters" :key="filter.slug">
        <template v-if="filter.type === 'bool'">
          <div class="form-check form-switch d-flex align-items-center gap-3 mb-0">
            <input
              :id="`filter-${filter.slug}`"
              class="form-check-input m-0"
              type="checkbox"
              role="switch"
              :checked="Boolean(getFilterValue(filter.slug))"
              @change="setFilterValue(filter.slug, $event.target.checked)"
            />
            <label class="form-check-label fw-semibold" :for="`filter-${filter.slug}`">
              {{ filter.name }}
            </label>
            <button
              v-if="getFilterValue(filter.slug) !== null && getFilterValue(filter.slug) !== undefined"
              type="button"
              class="btn btn-link btn-sm p-0 ms-auto text-secondary text-decoration-none"
              @click="clearBoolFilter(filter.slug)"
            >
              Сбросить
            </button>
          </div>
        </template>

        <template v-else>
          <label class="form-label small text-secondary fw-semibold mb-2">
            {{ filter.name }}
          </label>

          <template v-if="filter.type === 'enum'">
            <div v-if="Array.isArray(filter.options) && filter.options.length" class="d-grid gap-2">
              <div
                v-for="option in filter.options"
                :key="option.id ?? option.value"
                class="form-check"
              >
                <input
                  :id="`filter-${filter.slug}-${option.id ?? option.value}`"
                  class="form-check-input"
                  type="checkbox"
                  :value="option.value"
                  :checked="isEnumSelected(filter.slug, option.value)"
                  @change="toggleEnumSelection(filter.slug, option.value, $event.target.checked)"
                />
                <label class="form-check-label" :for="`filter-${filter.slug}-${option.id ?? option.value}`">
                  {{ option.value }}
                </label>
              </div>
            </div>
            <div v-else class="small text-secondary">
              Нет вариантов.
            </div>
          </template>

          <template v-else-if="filter.type === 'int'">
            <input
              :value="getFilterValue(filter.slug) ?? ''"
              type="number"
              class="form-control rounded-pill"
              :placeholder="filter.name"
              @input="setFilterValue(filter.slug, $event.target.value)"
            />
          </template>

          <template v-else-if="filter.type === 'decimal'">
            <div class="row g-2">
              <div class="col-6">
                <input
                  :value="getDecimalValue(filter.slug, 'min')"
                  type="number"
                  step="any"
                  class="form-control rounded-pill"
                  placeholder="От"
                  @input="setDecimalValue(filter.slug, 'min', $event.target.value)"
                />
              </div>
              <div class="col-6">
                <input
                  :value="getDecimalValue(filter.slug, 'max')"
                  type="number"
                  step="any"
                  class="form-control rounded-pill"
                  placeholder="До"
                  @input="setDecimalValue(filter.slug, 'max', $event.target.value)"
                />
              </div>
            </div>
          </template>
        </template>
      </div>
    </div>

    <div v-else class="text-secondary small">
      Для этой категории фильтры не заданы.
    </div>

    <div class="d-flex gap-2 flex-wrap">
      <slot name="buttons">
        <button type="button" class="btn btn-outline-secondary rounded-pill px-3" @click="clearLocations">
          Сбросить локации
        </button>
        <button type="button" class="btn btn-outline-secondary rounded-pill px-3" @click="emit('clear')">
          Сбросить фильтры
        </button>
      </slot>
    </div>
  </div>
</template>
