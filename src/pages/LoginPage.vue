<script setup>
import { ref } from 'vue'
import { useUserStore } from '../stores/userStore'
import { useRouter } from 'vue-router'
import { handleApiError, isLoginBanError, toPublicErrorMessage } from '../services/errorService'

const userStore = useUserStore()
const router = useRouter()

const userLogin = ref('')
const password = ref('')
const error = ref('')

async function handleLogin() {
  try {
    error.value = ''
    await userStore.login(userLogin.value, password.value)
    router.push('/')
  } catch (e) {
    const apiError = await handleApiError(e, { notify: false, redirect: true })
    if (isLoginBanError(apiError)) {
      router.push('/blocked?reason=login-ban')
      return
    }

    error.value = toPublicErrorMessage(apiError, 'Ошибка входа')
  }
}
</script>

<template>
  <div class="container">
    <div class="row justify-content-center">
      <div class="col-md-6">
        <div class="card shadow-sm">
          <div class="card-body">
            <h4 class="card-title mb-3">Вход</h4>
            <div v-if="error" class="alert alert-danger">{{ error }}</div>
            <form @submit.prevent="handleLogin">
              <div class="mb-3">
                <label class="form-label">Логин</label>
                <input v-model="userLogin" type="text" class="form-control" required />
              </div>
              <div class="mb-3">
                <label class="form-label">Пароль</label>
                <input v-model="password" type="password" class="form-control" required />
              </div>
              <button type="submit" class="btn btn-primary w-100">Войти</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
