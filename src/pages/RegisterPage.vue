<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/userStore'
import { handleApiError, isLoginBanError, toPublicErrorMessage } from '../services/errorService'

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
    const apiError = await handleApiError(e, { notify: false, redirect: true })
    if (isLoginBanError(apiError)) {
      router.push('/blocked?reason=login-ban')
      return
    }

    error.value = toPublicErrorMessage(apiError, 'Ошибка регистрации')
  }
}
</script>

<template>
  <div class="container">
    <div class="row justify-content-center">
      <div class="col-md-6">
        <div class="card shadow-sm">
          <div class="card-body">
            <h4 class="card-title mb-3">Регистрация</h4>
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
              <button type="submit" class="btn btn-primary w-100">Зарегистрироваться</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
