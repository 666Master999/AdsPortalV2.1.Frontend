<script setup>
const presets = [
  { key: 'all', label: 'Вся Беларусь' },
  { key: 'minsk', label: 'Минск' },
  { key: 'minskRegion', label: 'Минская область' },
]

defineProps({
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['select'])
</script>

<template>
  <div class="mb-3">
    <div class="small text-uppercase text-secondary fw-semibold mb-2">Популярное</div>
    <div class="d-flex flex-wrap gap-1">
      <button
        v-for="preset in presets"
        :key="preset.key"
        type="button"
        class="btn btn-sm btn-outline-secondary rounded-pill"
        :disabled="loading"
        @click="emit('select', preset.key)"
      >
        📍 {{ preset.label }}
      </button>
    </div>
  </div>
</template>
