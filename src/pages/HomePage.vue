<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAdsStore } from '../stores/adsStore'
import { useCategoriesStore } from '../stores/categoriesStore'
import AdCard from '../components/AdCard.vue'

const route = useRoute()
const adsStore = useAdsStore()
const categoriesStore = useCategoriesStore()

const categoryId = ref('')
const priceFrom = ref('')
const priceTo = ref('')
const type = ref('')
const searchText = ref('')
const sortBy = ref('newest')

function getFilterParams() {
  const params = {}
  if (categoryId.value) params.categoryId = categoryId.value
  if (priceFrom.value) params.priceFrom = priceFrom.value
  if (priceTo.value) params.priceTo = priceTo.value
  if (type.value) params.type = type.value
  if (searchText.value.trim()) params.search = searchText.value.trim()
  if (sortBy.value) params.sortBy = sortBy.value
  return params
}

onMounted(() => {
  categoriesStore.loadCategories()
  const initialCategoryId = String(route.params.id || route.query.categoryId || '').trim()
  if (initialCategoryId) {
    categoryId.value = initialCategoryId
  }
  applyFilters()
})

watch(
  () => route.params.id,
  newId => {
    const id = String(newId || '').trim()
    if (id && id !== categoryId.value) {
      categoryId.value = id
      applyFilters()
    }
  }
)

function applyFilters() {
  adsStore.loadAds(getFilterParams())
}

function clearFilters() {
  categoryId.value = ''
  priceFrom.value = ''
  priceTo.value = ''
  type.value = ''
  searchText.value = ''
  sortBy.value = 'newest'
  applyFilters()
}

const adsCountLabel = computed(() => {
  const count = adsStore.ads.length
  return `${count} ${count === 1 ? 'объявление' : count < 5 ? 'объявления' : 'объявлений'}`
})
</script>

<template>
  <div class="container-fluid px-3 px-lg-4 py-3 py-lg-4">
    <div class="mx-auto rounded-5 border bg-body-tertiary shadow-lg overflow-hidden" style="max-width: 1520px; min-height: calc(100vh - 90px);">
      <div class="d-flex flex-column flex-xl-row h-100 gap-3 p-3 p-lg-4" style="min-height: 0;">
        <aside
          class="d-none d-xl-flex flex-column bg-white rounded-4 shadow-sm overflow-hidden"
          style="flex: 0 0 340px; max-width: 420px; min-height: 0;"
        >
          <div class="px-3 px-lg-4 py-3 border-bottom bg-white d-flex align-items-center justify-content-between">
            <div>
              <div class="small text-uppercase text-secondary fw-semibold mb-1">Marketplace</div>
              <h1 class="h5 mb-0 fw-semibold">Фильтры</h1>
            </div>
            <span class="badge rounded-pill text-bg-light border text-secondary">{{ adsStore.ads.length }}</span>
          </div>

          <div class="flex-grow-1 overflow-auto p-3 p-lg-4" style="min-height: 0;">
            <div class="mb-3">
              <label class="form-label small text-secondary fw-semibold mb-2">Поиск по словам</label>
              <input v-model="searchText" type="search" class="form-control rounded-pill" placeholder="Название, город, описание..." @change="applyFilters" />
            </div>

            <div class="mb-3">
              <label class="form-label small text-secondary fw-semibold mb-2">Категория</label>
              <select v-model="categoryId" class="form-select rounded-pill" @change="applyFilters">
                <option value="">Все категории</option>
                <option v-for="cat in categoriesStore.categories" :key="cat.id" :value="cat.id">
                  {{ cat.name }}
                </option>
              </select>
            </div>

            <div class="row g-2 mb-3">
              <div class="col-6">
                <label class="form-label small text-secondary fw-semibold mb-2">Цена от</label>
                <input v-model="priceFrom" type="number" class="form-control rounded-pill" placeholder="0" @change="applyFilters" />
              </div>
              <div class="col-6">
                <label class="form-label small text-secondary fw-semibold mb-2">Цена до</label>
                <input v-model="priceTo" type="number" class="form-control rounded-pill" placeholder="999999" @change="applyFilters" />
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label small text-secondary fw-semibold mb-2">Тип</label>
              <select v-model="type" class="form-select rounded-pill" @change="applyFilters">
                <option value="">Любой</option>
                <option value="sell">Продажа</option>
                <option value="buy">Покупка</option>
                <option value="service">Услуга</option>
              </select>
            </div>

            <div class="d-flex gap-2">
              <button type="button" class="btn btn-outline-secondary rounded-pill flex-grow-1" @click="applyFilters">Применить</button>
              <button type="button" class="btn btn-light border rounded-pill" @click="clearFilters">Сбросить</button>
            </div>
          </div>
        </aside>

        <section class="d-flex flex-column bg-white rounded-4 shadow-sm flex-grow-1 overflow-hidden" style="min-width: 0; min-height: 0;">
          <div class="px-3 px-lg-4 py-3 border-bottom bg-white d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
            <div>
              <div class="small text-uppercase text-secondary fw-semibold mb-1">Marketplace</div>
              <h1 class="h3 mb-0 fw-semibold">Последние объявления</h1>
            </div>
            <div class="d-flex align-items-center gap-2">
              <button
                type="button"
                class="btn btn-outline-secondary rounded-pill d-xl-none"
                data-bs-toggle="offcanvas"
                data-bs-target="#filtersCanvas"
                aria-controls="filtersCanvas"
              >
                Фильтры
              </button>
              <div class="text-secondary small">{{ adsCountLabel }}</div>
            </div>
          </div>

          <div class="border-bottom bg-white px-3 px-lg-4 py-3 d-flex flex-column flex-lg-row align-items-stretch align-items-lg-center gap-3">
            <div class="flex-grow-1">
              <label class="form-label small text-uppercase text-secondary fw-semibold mb-2">Сортировка</label>
              <select v-model="sortBy" class="form-select rounded-pill" aria-label="Sort ads" @change="applyFilters">
                <option value="newest">Сначала новые</option>
                <option value="oldest">Сначала старые</option>
                <option value="price-desc">От дорогих к дешёвым</option>
                <option value="price-asc">От дешёвых к дорогим</option>
              </select>
            </div>
            <div class="d-flex align-items-end justify-content-lg-end gap-2 flex-shrink-0">
              <button type="button" class="btn btn-outline-secondary rounded-pill px-3" @click="clearFilters">
                Сбросить
              </button>
            </div>
          </div>

          <div class="flex-grow-1 overflow-auto p-3 p-lg-4" style="min-height: 0;">
            <div class="row row-cols-1 row-cols-md-2 row-cols-xl-2 row-cols-xxl-3 g-4">
              <div class="col" v-for="ad in adsStore.ads" :key="ad.id">
                <AdCard :ad="ad" :allowEdit="false" />
              </div>
            </div>

            <p v-if="!adsStore.ads.length" class="text-muted mt-4 text-center mb-0">Объявлений пока нет</p>
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
        <div class="mb-3">
          <label class="form-label small text-secondary fw-semibold mb-2">Поиск по словам</label>
          <input v-model="searchText" type="search" class="form-control rounded-pill" placeholder="Название, город, описание..." @change="applyFilters" />
        </div>

        <div class="mb-3">
          <label class="form-label small text-secondary fw-semibold mb-2">Категория</label>
          <select v-model="categoryId" class="form-select rounded-pill" @change="applyFilters">
            <option value="">Все категории</option>
            <option v-for="cat in categoriesStore.categories" :key="cat.id" :value="cat.id">
              {{ cat.name }}
            </option>
          </select>
        </div>

        <div class="row g-2 mb-3">
          <div class="col-6">
            <label class="form-label small text-secondary fw-semibold mb-2">Цена от</label>
            <input v-model="priceFrom" type="number" class="form-control rounded-pill" placeholder="0" @change="applyFilters" />
          </div>
          <div class="col-6">
            <label class="form-label small text-secondary fw-semibold mb-2">Цена до</label>
            <input v-model="priceTo" type="number" class="form-control rounded-pill" placeholder="999999" @change="applyFilters" />
          </div>
        </div>

        <div class="mb-3">
          <label class="form-label small text-secondary fw-semibold mb-2">Тип</label>
          <select v-model="type" class="form-select rounded-pill" @change="applyFilters">
            <option value="">Любой</option>
            <option value="sell">Продажа</option>
            <option value="buy">Покупка</option>
            <option value="service">Услуга</option>
          </select>
        </div>

        <div class="d-flex gap-2">
          <button type="button" class="btn btn-outline-secondary rounded-pill flex-grow-1" @click="applyFilters" data-bs-dismiss="offcanvas">Применить</button>
          <button type="button" class="btn btn-light border rounded-pill" @click="clearFilters">Сбросить</button>
        </div>
      </div>
    </div>
  </div>
</template>
