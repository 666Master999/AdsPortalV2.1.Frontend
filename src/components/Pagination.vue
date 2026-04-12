<script setup>
import { computed } from 'vue'

const props = defineProps({
  currentPage: { type: Number, default: 1 },
  totalPages: { type: Number, default: 1 },
  totalCount: { type: Number, default: 0 },
  pageSize: { type: Number, default: 20 },
})

const emit = defineEmits(['changePage', 'changePageSize'])

const PAGE_SIZES = [10, 20, 50]

const visiblePages = computed(() => {
  const totalPages = props.totalPages
  const currentPage = props.currentPage
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1)

  const pages = [1]
  if (currentPage > 3) pages.push('...')
  for (let page = Math.max(2, currentPage - 1); page <= Math.min(totalPages - 1, currentPage + 1); page++) {
    pages.push(page)
  }
  if (currentPage < totalPages - 2) pages.push('...')
  if (totalPages > 1) pages.push(totalPages)
  return pages
})
</script>

<template>
  <div class="d-flex flex-column flex-sm-row align-items-center justify-content-between gap-3">
    <div class="d-flex align-items-center gap-2 text-muted small">
      <span v-if="totalCount">Всего: {{ totalCount }}</span>
      <span v-if="totalCount && totalPages > 1">&middot;</span>
      <span v-if="totalPages > 1">Стр. {{ currentPage }} из {{ totalPages }}</span>
      <select
        class="form-select form-select-sm rounded-pill ms-2"
        style="width: auto"
        :value="pageSize"
        @change="emit('changePageSize', Number($event.target.value))"
      >
        <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }} / стр.</option>
      </select>
    </div>

    <nav v-if="totalPages > 1">
      <ul class="pagination pagination-sm mb-0">
        <li class="page-item" :class="{ disabled: currentPage <= 1 }">
          <button class="page-link" @click="emit('changePage', currentPage - 1)">&laquo;</button>
        </li>
        <li
          v-for="(page, index) in visiblePages"
          :key="index"
          class="page-item"
          :class="{ active: page === currentPage, disabled: page === '...' }"
        >
          <button class="page-link" :disabled="page === '...'" @click="page !== '...' && emit('changePage', page)">{{ page }}</button>
        </li>
        <li class="page-item" :class="{ disabled: currentPage >= totalPages }">
          <button class="page-link" @click="emit('changePage', currentPage + 1)">&raquo;</button>
        </li>
      </ul>
    </nav>
  </div>
</template>
