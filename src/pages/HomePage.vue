<script setup>
import { ref, onMounted, watch } from 'vue'
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
  const params = {}
  if (categoryId.value) params.categoryId = categoryId.value
  if (priceFrom.value) params.priceFrom = priceFrom.value
  if (priceTo.value) params.priceTo = priceTo.value
  if (type.value) params.type = type.value
  adsStore.loadAds(params)
}
</script>

<template>
  <div class="container">
    <h1 class="mb-4 text-center">Последние объявления</h1>

    <!-- compact filters -->
    <div class="row mb-4 g-2 align-items-center">
      <div class="col-auto">
        <select v-model="categoryId" class="form-select form-select-sm" @change="applyFilters">
          <option value="">Категория</option>
          <option v-for="cat in categoriesStore.categories" :key="cat.id" :value="cat.id">
            {{ cat.name }}
          </option>
        </select>
      </div>
      <div class="col-auto">
        <input v-model="priceFrom" type="number" class="form-control form-control-sm" placeholder="Цена от" @change="applyFilters" />
      </div>
      <div class="col-auto">
        <input v-model="priceTo" type="number" class="form-control form-control-sm" placeholder="Цена до" @change="applyFilters" />
      </div>
      <div class="col-auto">
        <select v-model="type" class="form-select form-select-sm" @change="applyFilters">
          <option value="">Тип</option>
          <option value="sell">Продажа</option>
          <option value="buy">Покупка</option>
          <option value="service">Услуга</option>
        </select>
      </div>
    </div>

    <div class="row g-4">
      <div class="col-md-4" v-for="ad in adsStore.ads" :key="ad.id">
        <AdCard :ad="ad" />
      </div>
    </div>

    <p v-if="!adsStore.ads.length" class="text-muted mt-3 text-center">Объявлений пока нет</p>
  </div>
</template>
