<script setup>
import { onBeforeUnmount, watch } from 'vue'
import Navbar from './components/Navbar.vue'
import { useChatStore } from './stores/chatStore'
import { useNotificationsStore } from './stores/notificationsStore'
import { usePresenceStore } from './stores/presenceStore'
import { useUserStore } from './stores/userStore'

const chatStore = useChatStore()
const notificationsStore = useNotificationsStore()
const presenceStore = usePresenceStore()
const userStore = useUserStore()

watch(
  () => userStore.token,
  (token) => {
    if (token) {
      presenceStore.connect().catch(() => {})
      notificationsStore.connect().catch(() => {})
      chatStore.getConversations().catch(() => {})
      return
    }

    notificationsStore.disconnect()
    presenceStore.disconnect()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  notificationsStore.disconnect()
  presenceStore.disconnect()
})
</script>

<template>
  <div class="d-flex flex-column" style="height: 100dvh;">
    <Navbar class="flex-shrink-0" />
    <div class="flex-grow-1" style="min-height: 0;">
      <router-view />
    </div>
  </div>
</template>
