<script setup>
const props = defineProps({
  currentPage: { type: Number, default: 1 },
  totalPages: { type: Number, default: 1 },
})

const emit = defineEmits(['changePage'])
</script>

<template>
  <nav>
    <ul class="pagination justify-content-center">
      <li class="page-item" :class="{ disabled: currentPage <= 1 }">
        <button class="page-link" @click="emit('changePage', currentPage - 1)">Назад</button>
      </li>
      <li
        v-for="page in totalPages"
        :key="page"
        class="page-item"
        :class="{ active: page === currentPage }"
      >
        <button class="page-link" @click="emit('changePage', page)">{{ page }}</button>
      </li>
      <li class="page-item" :class="{ disabled: currentPage >= totalPages }">
        <button class="page-link" @click="emit('changePage', currentPage + 1)">Вперёд</button>
      </li>
    </ul>
  </nav>
</template>
