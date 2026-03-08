<script setup>
import { onMounted } from 'vue'
import { useAdsStore } from '../stores/adsStore'
import AdCard from '../components/AdCard.vue'

const adsStore = useAdsStore()

onMounted(() => {
  adsStore.loadAds()
})
</script>

<template>
  <div class="container">
    <h1 class="mb-4 text-center">Последние объявления</h1>
    <div class="row g-4">
      <div class="col-md-4" v-for="ad in adsStore.ads" :key="ad.id">
        <AdCard :ad="ad" />
      </div>
    </div>
    <p v-if="!adsStore.ads.length" class="text-muted mt-3 text-center">Объявлений пока нет</p>
  </div>
</template>
