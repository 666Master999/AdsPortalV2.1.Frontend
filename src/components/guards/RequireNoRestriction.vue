<script setup>
import { computed } from 'vue'
import { useAccessService } from '../../services/accessService'

const props = defineProps({
  types: { type: Array, default: () => [] },
})

const access = useAccessService()

const allowed = computed(() => {
  const restrictionTypes = Array.isArray(props.types) ? props.types : []
  if (!restrictionTypes.length) return true

  return !restrictionTypes.some(type => access.hasRestriction(type))
})
</script>

<template>
  <slot v-if="allowed" />
  <slot v-else name="fallback" />
</template>
