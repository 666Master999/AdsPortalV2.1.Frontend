<script setup>
import { computed } from 'vue'
import { useAccessService } from '../services/accessService'

const access = useAccessService()
const allowed = computed(() => access.isAuthenticated())
</script>

<template>
  <slot v-if="allowed" />
  <slot v-else name="fallback" />
</template>
