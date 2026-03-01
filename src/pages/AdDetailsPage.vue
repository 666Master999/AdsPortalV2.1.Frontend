<script setup>
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdsStore } from '../stores/adsStore'

const route = useRoute()
const router = useRouter()
const adsStore = useAdsStore()

onMounted(() => {
  adsStore.loadAd(route.params.id)
})

async function addToFavorites() {
  const token = localStorage.getItem('token')
  await fetch(`/api/favorites/${route.params.id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  alert('Добавлено в избранное')
}

function writeToSeller() {
  router.push(`/chat/${route.params.id}`)
}
</script>

<template>
  <div class="container">
    <div v-if="adsStore.selectedAd">
      <h1 class="mb-3">{{ adsStore.selectedAd.title }}</h1>
      <div class="row">
        <div class="col-md-6">
          <img
            :src="adsStore.selectedAd.image || 'https://via.placeholder.com/600x400'"
            class="img-fluid rounded"
            :alt="adsStore.selectedAd.title"
          />
        </div>
        <div class="col-md-6">
          <p class="fs-4 fw-bold text-primary">{{ adsStore.selectedAd.price }} ₽</p>
          <p><strong>Город:</strong> {{ adsStore.selectedAd.city }}</p>
          <p><strong>Категория:</strong> {{ adsStore.selectedAd.category }}</p>
          <p><strong>Тип:</strong> {{ adsStore.selectedAd.type }}</p>
          <p class="mt-3">{{ adsStore.selectedAd.description }}</p>
          <div class="mt-4">
            <button class="btn btn-outline-danger me-2" @click="addToFavorites">
              Добавить в избранное
            </button>
            <button class="btn btn-primary" @click="writeToSeller">
              Написать продавцу
            </button>
          </div>
        </div>
      </div>
    </div>
    <p v-else class="text-muted">Загрузка...</p>
  </div>
</template>
