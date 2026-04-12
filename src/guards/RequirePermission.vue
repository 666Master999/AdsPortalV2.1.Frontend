<script setup>
import { computed } from 'vue'
import { useAccessService } from '../services/accessService'

const props = defineProps({
  any: { type: Array, default: () => [] },
  all: { type: Array, default: () => [] },
})

const access = useAccessService()

const allowed = computed(() => {
  const anyPermissions = Array.isArray(props.any) ? props.any : []
  const allPermissions = Array.isArray(props.all) ? props.all : []

  const anyPass = !anyPermissions.length || access.hasAnyPermission(anyPermissions)
  const allPass = !allPermissions.length || allPermissions.every(permission => access.hasPermission(permission))

  return anyPass && allPass
})
</script>

<template>
  <slot v-if="allowed" />
  <slot v-else name="fallback" />
</template>
