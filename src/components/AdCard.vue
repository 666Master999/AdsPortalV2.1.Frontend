<script setup>
defineProps({
  ad: Object,
})
</script>

<template>
  <div class="card h-100">
    <img
      :src="ad.image || 'https://via.placeholder.com/300x200'"
      class="card-img-top"
      :alt="ad.title"
      style="height: 200px; object-fit: cover"
    />
    <div class="card-body">
      <h5 class="card-title">{{ ad.title }}</h5>
      <p class="card-text fw-bold text-primary">{{ ad.price }} ₽</p>
      <p class="card-text text-muted">{{ ad.city }}</p>
      <router-link :to="`/ads/${ad.id}`" class="btn btn-outline-primary btn-sm">Подробнее</router-link>
    </div>
  </div>
</template>
