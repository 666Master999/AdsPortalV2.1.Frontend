<script setup>
import { ref, onMounted } from 'vue'
import { useUserStore } from '../stores/userStore'
import { useAdsStore } from '../stores/adsStore'
import AdCard from '../components/AdCard.vue'

const userStore = useUserStore()
const adsStore = useAdsStore()
const favorites = ref([])
const ads = ref([])

onMounted(async () => {
  const userId = userStore.user?.userId || userStore.tokenUserId
  favorites.value = await userStore.getFavorites(userId)
  if (favorites.value.length) {
    const ids = favorites.value.map(f => f.adId).join(',')
    await adsStore.loadAds({ ids })
    ads.value = adsStore.ads
  }
})
</script>

<template>
  <div class="container-fluid px-3 px-lg-4 py-3 py-lg-4">
    <div class="mx-auto rounded-5 border bg-body-tertiary shadow-lg overflow-hidden" style="max-width: 1520px; min-height: calc(100vh - 90px);">
      <div class="d-flex flex-column h-100">
        <div class="px-3 px-lg-4 py-3 border-bottom bg-white d-flex align-items-center justify-content-between gap-3">
          <div>
            <div class="small text-uppercase text-secondary fw-semibold mb-1">Saved</div>
            <h1 class="h3 mb-0 fw-semibold">Избранное</h1>
          </div>
        </div>

        <div class="flex-grow-1 overflow-auto p-3 p-lg-4" style="min-height: 0;">
          <div class="row g-4">
            <div class="col-12 col-sm-6 col-lg-4 col-xxl-3" v-for="ad in ads" :key="ad.id">
              <AdCard :ad="ad" :allowEdit="false" />
            </div>
          </div>
          <div v-if="!ads.length" class="text-center text-secondary py-5">Избранное пусто</div>
        </div>
      </div>
    </div>
  </div>
</template>
