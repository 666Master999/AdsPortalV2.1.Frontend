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
  const tp = props.totalPages
  const cp = props.currentPage
  if (tp <= 7) return Array.from({ length: tp }, (_, i) => i + 1)
  const pages = [1]
  if (cp > 3) pages.push('...')
  for (let i = Math.max(2, cp - 1); i <= Math.min(tp - 1, cp + 1); i++) pages.push(i)
  if (cp < tp - 2) pages.push('...')
  if (tp > 1) pages.push(tp)
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
        <option v-for="s in PAGE_SIZES" :key="s" :value="s">{{ s }} / стр.</option>
      </select>
    </div>
    <nav v-if="totalPages > 1">
      <ul class="pagination pagination-sm mb-0">
        <li class="page-item" :class="{ disabled: currentPage <= 1 }">
          <button class="page-link" @click="emit('changePage', currentPage - 1)">&laquo;</button>
        </li>
        <li
          v-for="(p, idx) in visiblePages"
          :key="idx"
          class="page-item"
          :class="{ active: p === currentPage, disabled: p === '...' }"
        >
          <button class="page-link" :disabled="p === '...'" @click="p !== '...' && emit('changePage', p)">{{ p }}</button>
        </li>
        <li class="page-item" :class="{ disabled: currentPage >= totalPages }">
          <button class="page-link" @click="emit('changePage', currentPage + 1)">&raquo;</button>
        </li>
      </ul>
    </nav>
  </div>
</template>
