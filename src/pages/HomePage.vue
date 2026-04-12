<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCategoriesStore } from '../stores/categoriesStore'
import { useAdsList } from '../composables/useAdsList'
import AdCard from '../components/AdCard.vue'
import FilterForm from '../components/FilterForm.vue'
import Pagination from '../components/Pagination.vue'

const route = useRoute()
const categoriesStore = useCategoriesStore()

const SORT_OPTIONS = [
  { label: 'Сначала новые', value: 'createdAt-desc' },
  { label: 'Сначала старые', value: 'createdAt-asc' },
  { label: 'Сначала обновленные', value: 'updatedAt-desc' },
  { label: 'По названию', value: 'title-asc' },
  { label: 'Дешевле', value: 'price-asc' },
  { label: 'Дороже', value: 'price-desc' },
  { label: 'Популярные', value: 'views-desc' },
  { label: 'Избранное', value: 'favorites-desc' },
]

const {
  items,
  loading,
  error,
  page,
  pageSize,
  totalPages,
  totalCount,
  sortKey,
  search,
  status,
  category,
  dateFrom,
  dateTo,
  priceFrom,
  priceTo,
  selectedLocationIds,
  adsCountLabel,
  setPage,
  setPageSize,
  setSort,
  resetFilters,
  onSearchInput,
  applyFilters,
  initWithCategoryId,
} = useAdsList()

// UI-only state (not part of URL / data flow)
const isFiltersOpen = ref(true)

// --- UI handlers ---

function onSortChange() {
  const [sb, sd] = sortKey.value.split('-')
  setSort({ sortBy: sb, sortDir: sd })
}

function onFilterApply() {
  applyFilters()
}

function onFilterClear() {
  resetFilters()
}

function onPageSizeChange(newSize) {
  setPageSize(newSize)
}

// --- Init ---

onMounted(() => {
  const saved = localStorage.getItem('filters-open')
  if (saved !== null) isFiltersOpen.value = saved === 'true'
  else if (window.innerWidth < 1400) isFiltersOpen.value = false

  categoriesStore.loadCategories()
  initWithCategoryId(String(route.params.id || '').trim())
})

// Watch /category/:id route changes
watch(
  () => route.params.id,
  newId => {
    const id = String(newId || '').trim()
    if (id === category.value) return
    category.value = id
    applyFilters()
  }
)

watch(isFiltersOpen, val => localStorage.setItem('filters-open', String(val)))
</script>

<template>
  <div class="container-fluid px-3 px-lg-4 py-3 py-lg-4">
    <div class="mx-auto rounded-5 border bg-body-tertiary shadow-lg overflow-hidden" style="max-width: 1520px; min-height: calc(100vh - 90px);">
      <div class="d-flex flex-column flex-xl-row h-100 p-3 p-lg-4" style="min-height: 0;">
        <!-- clip-wrapper: shrinks width so section slides over; aside inside never reflows -->
        <div
          class="d-none d-xl-block flex-shrink-0"
          :style="{
            flex: '0 0 auto',
            width: isFiltersOpen ? '340px' : '0px',
            marginRight: isFiltersOpen ? '1rem' : '0px',
            overflow: 'hidden',
            transition: 'width 0.3s ease, margin-right 0.3s ease'
          }"
        >
        <aside
          class="d-flex flex-column bg-white rounded-4 shadow-sm overflow-hidden align-self-start"
          :style="{
            width: '340px',
            minHeight: 0,
            opacity: isFiltersOpen ? 1 : 0,
            pointerEvents: isFiltersOpen ? 'auto' : 'none',
            transition: 'opacity 0.2s ease'
          }"
        >
          <div class="px-3 px-lg-4 py-3 border-bottom bg-white d-flex align-items-center justify-content-between">
            <div>
              <div class="small text-uppercase text-secondary fw-semibold mb-1">Marketplace</div>
              <h1 class="h5 mb-0 fw-semibold">Фильтры</h1>
            </div>
            <span class="badge rounded-pill text-bg-light border text-secondary">{{ items.length }}</span>
          </div>

          <div class="flex-grow-1 overflow-auto p-3 p-lg-4" style="min-height: 0;">
            <FilterForm
              v-model:category="category"
              v-model:priceFrom="priceFrom"
              v-model:priceTo="priceTo"
              v-model:status="status"
              v-model:searchText="search"
              v-model:dateFrom="dateFrom"
              v-model:dateTo="dateTo"
              v-model:selectedLocationIds="selectedLocationIds"
              @apply="onFilterApply"
              @clear="onFilterClear"
              @searchInput="onSearchInput"
            />
          </div>
        </aside>
        </div>

        <section class="d-flex flex-column bg-white rounded-4 shadow-sm flex-grow-1 overflow-hidden" style="min-width: 0; min-height: 0;">
          <div class="px-3 px-lg-4 py-3 border-bottom bg-white d-flex flex-column align-items-start justify-content-between gap-3">
            <div>
              <div class="small text-uppercase text-secondary fw-semibold mb-1">Marketplace</div>
              <h1 class="h3 mb-0 fw-semibold">Последние объявления</h1>
            </div>
            <div class="d-flex align-items-center gap-2 justify-content-start w-100 mt-2">
              <button
                type="button"
                class="btn btn-outline-secondary rounded-pill d-xl-none"
                data-bs-toggle="offcanvas"
                data-bs-target="#filtersCanvas"
                aria-controls="filtersCanvas"
              >
                Фильтры
              </button>
              <button
                type="button"
                class="btn btn-light border rounded-pill px-3 d-none d-xl-inline-flex"
                @click="isFiltersOpen = !isFiltersOpen"
              >
                {{ isFiltersOpen ? 'Скрыть фильтры' : 'Показать фильтры' }}
              </button>
              <div class="text-secondary small">{{ adsCountLabel }}</div>
            </div>
          </div>

          <div class="border-bottom bg-white px-3 px-lg-4 py-3 d-flex flex-column flex-lg-row align-items-stretch align-items-lg-center gap-3">
            <div class="flex-grow-1">
              <label class="form-label small text-uppercase text-secondary fw-semibold mb-2">Сортировка</label>
              <select v-model="sortKey" class="form-select rounded-pill" aria-label="Sort ads" @change="onSortChange">
                <option v-for="opt in SORT_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
            <div class="flex-shrink-0" style="min-width: 160px;">
              <label class="form-label small text-uppercase text-secondary fw-semibold mb-2">Размер страницы</label>
              <select class="form-select rounded-pill" :value="pageSize" @change="onPageSizeChange(Number($event.target.value))">
                <option :value="10">10</option>
                <option :value="20">20</option>
                <option :value="50">50</option>
              </select>
            </div>
            <div class="d-flex align-items-end justify-content-lg-end gap-2 flex-shrink-0">
              <button type="button" class="btn btn-outline-secondary rounded-pill px-3" @click="onFilterClear">
                Сбросить
              </button>
            </div>
          </div>

          <div class="flex-grow-1 overflow-auto p-3 p-lg-4" style="min-height: 0;">
            <div v-if="loading" class="d-flex justify-content-center py-5">
              <div class="spinner-border text-secondary" role="status">
                <span class="visually-hidden">Загрузка...</span>
              </div>
            </div>

            <div v-else-if="error" class="alert alert-danger mt-3" role="alert">
              {{ error }}
            </div>

            <template v-else>
              <div class="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-4" :class="isFiltersOpen ? 'row-cols-xl-4' : 'row-cols-xl-5'">
                <div class="col" v-for="ad in items" :key="ad.id">
                  <AdCard :ad="ad" :allowEdit="false" />
                </div>
              </div>

              <p v-if="!items.length" class="text-muted mt-4 text-center mb-0">Объявлений пока нет</p>

              <div class="mt-4">
                <Pagination
                  :currentPage="page"
                  :totalPages="totalPages"
                  :totalCount="totalCount"
                  :pageSize="pageSize"
                  @changePage="setPage"
                  @changePageSize="onPageSizeChange"
                />
              </div>
            </template>
          </div>
        </section>
      </div>
    </div>

    <div class="offcanvas offcanvas-start d-xl-none" tabindex="-1" id="filtersCanvas" aria-labelledby="filtersCanvasLabel">
      <div class="offcanvas-header border-bottom">
        <div>
          <h5 class="offcanvas-title mb-0" id="filtersCanvasLabel">Фильтры</h5>
          <div class="small text-secondary">Поиск и параметры</div>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
      </div>
      <div class="offcanvas-body">
        <FilterForm
          v-model:category="category"
          v-model:priceFrom="priceFrom"
          v-model:priceTo="priceTo"
          v-model:status="status"
          v-model:searchText="search"
          v-model:dateFrom="dateFrom"
          v-model:dateTo="dateTo"
          v-model:selectedLocationIds="selectedLocationIds"
          @apply="onFilterApply"
          @clear="onFilterClear"
          @searchInput="onSearchInput"
        >
          <template #buttons>
            <button type="button" class="btn btn-outline-secondary rounded-pill flex-grow-1" @click="onFilterApply" data-bs-dismiss="offcanvas">Применить</button>
            <button type="button" class="btn btn-light border rounded-pill" @click="onFilterClear">Сбросить</button>
          </template>
        </FilterForm>
      </div>
    </div>
  </div>
</template>
