<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/userStore'

const router = useRouter()
const userStore = useUserStore()

const userLogin = ref('')
const password = ref('')
const error = ref('')
    
async function handleRegister() {
  try {
    error.value = ''
    await userStore.register(userLogin.value, password.value)
    router.push('/')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Ошибка регистрации'
  }
}
</script>

<template>
  <div class="container">
    <div class="row justify-content-center">
      <div class="col-md-6">
        <h1 class="mb-4">Регистрация</h1>
        <div v-if="error" class="alert alert-danger">{{ error }}</div>
        <form @submit.prevent="handleRegister">
          <div class="mb-3">
            <label class="form-label">Логин</label>
            <input v-model="userLogin" type="text" class="form-control" required />
          </div>
          <div class="mb-3">
            <label class="form-label">Пароль</label>
            <input v-model="password" type="password" class="form-control" required />
          </div>
          <button type="submit" class="btn btn-primary">Зарегистрироваться</button>
        </form>
      </div>
    </div>
  </div>
</template>
