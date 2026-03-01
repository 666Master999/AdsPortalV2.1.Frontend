import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUserStore = defineStore('user', () => {
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))
  const token = ref(localStorage.getItem('token') || '')
  const apiBase = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5122').replace(/\/$/, '')
  const authBase = `${apiBase}/auth`

  function saveAuth(data) {
    token.value = data.token
    user.value = {
      userId: data.userId,
      userLogin: data.userLogin,
      userName: data.userName,
      avatar: data.avatar,
    }
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(user.value))
  }

  async function auth(endpoint, userLogin, userPassword) {
    let response
    try {
      response = await fetch(`${authBase}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userLogin, userPassword }),
      })
    } catch {
      throw new Error('Сервер недоступен. Проверьте, запущен ли бэкенд.')
    }

    if (!response.ok) {
      throw new Error((await response.text()) || 'Ошибка запроса')
    }

    saveAuth(await response.json())
  }

  async function login(userLogin, userPassword) {
    await auth('login', userLogin, userPassword)
  }

  async function register(userLogin, userPassword) {
    await auth('register', userLogin, userPassword)
  }

  function logout() {
    user.value = null
    token.value = ''
    localStorage.removeItem('user')
    localStorage.removeItem('token')
  }

  function loadProfile() {
    user.value = token.value ? JSON.parse(localStorage.getItem('user') || 'null') : null
  }

  return { user, token, login, register, logout, loadProfile }
})