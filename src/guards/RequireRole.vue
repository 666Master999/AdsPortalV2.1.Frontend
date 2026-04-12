<script setup>
import { computed } from 'vue'
import { useAccessService } from '../services/accessService'

const props = defineProps({
  any: { type: Array, default: () => [] },
  all: { type: Array, default: () => [] },
})

const access = useAccessService()

const allowed = computed(() => {
  const anyRoles = Array.isArray(props.any) ? props.any : []
  const allRoles = Array.isArray(props.all) ? props.all : []

  const anyPass = !anyRoles.length || access.hasAnyRole(anyRoles)
  const allPass = !allRoles.length || allRoles.every(role => access.hasRole(role))

  return anyPass && allPass
})
</script>

<template>
  <slot v-if="allowed" />
  <slot v-else name="fallback" />
</template>
