<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useChatStore } from '../stores/chatStore'

const route = useRoute()
const chatStore = useChatStore()

const newMessage = ref('')
const threadId = ref(null)

onMounted(async () => {
  const thread = await chatStore.loadThread(route.params.adId)
  threadId.value = thread.id
  await chatStore.loadMessages(thread.id)
})

async function handleSend() {
  if (!newMessage.value.trim()) return
  await chatStore.sendMessage(threadId.value, newMessage.value)
  newMessage.value = ''
}
</script>

<template>
  <div class="container">
    <h1 class="mb-4">Чат</h1>
    <div class="card">
      <div class="card-body" style="height: 400px; overflow-y: auto">
        <div v-for="msg in chatStore.messages" :key="msg.id" class="mb-2">
          <strong>{{ msg.senderName }}:</strong> {{ msg.text }}
          <small class="text-muted ms-2">{{ msg.createdAt }}</small>
        </div>
        <p v-if="!chatStore.messages.length" class="text-muted">Сообщений пока нет</p>
      </div>
      <div class="card-footer">
        <form @submit.prevent="handleSend" class="d-flex gap-2">
          <input v-model="newMessage" type="text" class="form-control" placeholder="Введите сообщение..." />
          <button type="submit" class="btn btn-primary">Отправить</button>
        </form>
      </div>
    </div>
  </div>
</template>
