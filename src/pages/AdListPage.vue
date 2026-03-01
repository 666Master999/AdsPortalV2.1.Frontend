<script setup>
import { ref, onMounted } from 'vue'
import { useAdsStore } from '../stores/adsStore'
import { useCategoriesStore } from '../stores/categoriesStore'
import AdCard from '../components/AdCard.vue'
import Pagination from '../components/Pagination.vue'

const adsStore = useAdsStore()
const categoriesStore = useCategoriesStore()

const category = ref('')
const priceFrom = ref('')
const priceTo = ref('')
const type = ref('')
const currentPage = ref(1)

onMounted(() => {
  adsStore.loadAds()
  categoriesStore.loadCategories()
})

function applyFilters() {
  const params = {}
  if (category.value) params.category = category.value
  if (priceFrom.value) params.priceFrom = priceFrom.value
  if (priceTo.value) params.priceTo = priceTo.value
  if (type.value) params.type = type.value
  params.page = currentPage.value
  adsStore.loadAds(params)
}

function changePage(page) {
  currentPage.value = page
  applyFilters()
}
</script>

<template>
  <div class="container">
    <h1 class="mb-4">Объявления</h1>

    <div class="row mb-4 g-3">
      <div class="col-md-3">
        <select v-model="category" class="form-select" @change="applyFilters">
          <option value="">Все категории</option>
          <option v-for="cat in categoriesStore.categories" :key="cat.id" :value="cat.id">
            {{ cat.name }}
          </option>
        </select>
      </div>
      <div class="col-md-2">
        <input v-model="priceFrom" type="number" class="form-control" placeholder="Цена от" @change="applyFilters" />
      </div>
      <div class="col-md-2">
        <input v-model="priceTo" type="number" class="form-control" placeholder="Цена до" @change="applyFilters" />
      </div>
      <div class="col-md-3">
        <select v-model="type" class="form-select" @change="applyFilters">
          <option value="">Все типы</option>
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

    <p v-if="!adsStore.ads.length" class="text-muted mt-3">Ничего не найдено</p>

    <Pagination :currentPage="currentPage" :totalPages="5" @changePage="changePage" class="mt-4" />
  </div>
</template>
