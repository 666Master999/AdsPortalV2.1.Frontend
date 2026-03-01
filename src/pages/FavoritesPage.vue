<script setup>
import { ref, onMounted } from 'vue'
import AdCard from '../components/AdCard.vue'

const favorites = ref([])

onMounted(async () => {
  const token = localStorage.getItem('token')
  const response = await fetch('/api/favorites', {
    headers: { Authorization: `Bearer ${token}` },
  })
  favorites.value = await response.json()
})
</script>

<template>
  <div class="container">
    <h1 class="mb-4">Избранное</h1>
    <div class="row g-4">
      <div class="col-md-4" v-for="ad in favorites" :key="ad.id">
        <AdCard :ad="ad" />
      </div>
    </div>
    <p v-if="!favorites.length" class="text-muted mt-3">Избранное пусто</p>
  </div>
</template>
