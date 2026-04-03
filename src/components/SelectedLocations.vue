<script setup>
import { useLocations } from '../composables/useLocations'

defineProps({
  locations: { type: Array, default: () => [] },
})

const emit = defineEmits(['remove'])
const { labelForLocation } = useLocations()
</script>

<template>
  <div v-if="locations.length" class="d-flex flex-wrap gap-1 mb-3">
    <span
      v-for="loc in locations"
      :key="`${loc.type}-${loc.id}`"
      class="badge text-bg-secondary d-inline-flex align-items-center gap-1"
    >
      {{ labelForLocation(loc) }}
      <button type="button" class="btn-close btn-close-white" style="font-size: 0.6rem;" @click="emit('remove', loc)"></button>
    </span>
  </div>
</template>
