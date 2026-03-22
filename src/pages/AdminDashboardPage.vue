<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const apiBase = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5122').replace(/\/$/, '')

const route = useRoute()
const ads = ref([])
const users = ref([])
const complaints = ref([])
const isLoading = ref(false)
const error = ref('')

const activeTab = computed(() => route.query.tab || 'ads')

const imagePlaceholder =
  'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2240%22%20height%3D%2240%22%3E%3Crect%20width%3D%2240%22%20height%3D%2240%22%20fill%3D%22%23e9ecef%22/%3E%3Ctext%20x%3D%2220%22%20y%3D%2224%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2214%22%20fill%3D%22%23777%22%20text-anchor%3D%22middle%22%20alignment-baseline%3D%22middle%22%3E%3F%3C/text%3E%3C/svg%3E'

function getAdMainImage(ad) {
  const path = ad?.mainImageUrl || ad?.mainImage || ad?.image
  return path ? `${apiBase}/${String(path).replace(/^\//, '')}` : imagePlaceholder
}

function formatDate(dateString) {
  if (!dateString) return ''
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('ru-RU', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatModerationStatus(status) {
  const normalized = String(status ?? '').trim()
  if (!normalized) return ''

  switch (normalized.toLowerCase()) {
    case '0':
    case 'pending':
      return 'На модерации'
    case '1':
    case 'approved':
      return 'Одобрено'
    case '2':
    case 'rejected':
      return 'Отклонено'
    case '3':
    case 'hidden':
      return 'Скрыто'
    default:
      return normalized
  }
}

function getUserName(ad) {
  const login = ad.userLogin || ad.user?.userLogin || ''
  const fullName = ad.user?.userName || ad.authorName || ad.userName || ''

  if (login && fullName) return `${login} (${fullName})`
  if (login) return login
  if (fullName) return fullName

  return ad.userId ? String(ad.userId) : '—'
}

function moderationStatusClass(status) {
  const normalized = String(status ?? '').trim().toLowerCase()

  switch (normalized) {
    case '0':
    case 'pending':
      return 'bg-warning text-dark'
    case '1':
    case 'approved':
      return 'bg-success'
    case '2':
    case 'rejected':
      return 'bg-danger'
    case '3':
    case 'hidden':
      return 'bg-secondary'
    default:
      return 'bg-secondary'
  }
}

async function loadActiveTab() {
  const token = localStorage.getItem('token')
  const headers = { Authorization: `Bearer ${token}` }

  isLoading.value = true
  error.value = ''

  try {
    if (activeTab.value === 'users') {
      const res = await fetch(`${apiBase}/admin/users`, { headers })
      if (!res.ok) throw new Error(await res.text())
      users.value = await res.json()
    } else if (activeTab.value === 'complaints') {
      const res = await fetch(`${apiBase}/admin/complaints`, { headers })
      if (!res.ok) throw new Error(await res.text())
      complaints.value = await res.json()
    } else {
      const res = await fetch(`${apiBase}/ads/moderation`, { headers })
      if (!res.ok) throw new Error(await res.text())
      ads.value = await res.json()
    }
  } catch (e) {
    error.value = e?.message || 'Ошибка загрузки данных'
  } finally {
    isLoading.value = false
  }
}

function normalizeModerationStatus(value) {
  if (value === undefined || value === null) return null
  const v = String(value).trim().toLowerCase()
  switch (v) {
    case '0':
    case 'pending':
      return 0
    case '1':
    case 'approved':
      return 1
    case '2':
    case 'rejected':
      return 2
    case '3':
    case 'hidden':
      return 3
    default:
      if (!Number.isNaN(Number(value))) return Number(value)
      return value
  }
}

async function updateAdModerationStatus(ad, newStatus) {
  const token = localStorage.getItem('token')
  try {
    const payload = normalizeModerationStatus(newStatus)
    const res = await fetch(`${apiBase}/ads/${ad.id}/moderation`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `Request failed (${res.status})`)
    }

    const json = await res.json()
    // Keep UI in sync
    ad.moderationStatus = json?.moderationStatus ?? newStatus
  } catch (e) {
    alert(e?.message || 'Не удалось изменить статус')
  }
}

onMounted(loadActiveTab)
watch(() => route.query.tab, loadActiveTab)
</script>

<template>
  <div class="container">
    <h1 class="mb-4">Панель администратора</h1>

    <ul class="nav nav-pills mb-4">
      <li class="nav-item">
        <router-link class="nav-link" :class="{ active: activeTab === 'ads' }" to="/admin?tab=ads">Объявления</router-link>
      </li>
      <li class="nav-item">
        <router-link class="nav-link" :class="{ active: activeTab === 'users' }" to="/admin?tab=users">Пользователи</router-link>
      </li>
      <li class="nav-item">
        <router-link class="nav-link" :class="{ active: activeTab === 'complaints' }" to="/admin?tab=complaints">Жалобы</router-link>
      </li>
    </ul>

    <div v-if="isLoading" class="alert alert-secondary">Загрузка...</div>
    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <section v-if="activeTab === 'ads'">
      <h3>Объявления</h3>
      <div class="list-group mb-5">
        <div
          class="list-group-item list-group-item-action rounded-3 shadow-sm mb-2"
          v-for="ad in ads"
          :key="ad.id"
        >
          <div class="d-flex gap-3">
            <img
              :src="getAdMainImage(ad)"
              :alt="ad.title"
              width="60"
              height="60"
              class="rounded"
              style="object-fit: cover; flex-shrink: 0"
              @error="event => (event.target.src = imagePlaceholder)"
            />

            <div class="flex-grow-1">
              <div class="d-flex justify-content-between align-items-start">
                <div>
                  <router-link
                    :to="`/ads/${ad.id}`"
                    class="h6 mb-1 d-block text-decoration-none text-dark"
                  >
                    {{ ad.title }}
                  </router-link>
                  <div class="d-flex flex-wrap gap-2 align-items-center" style="font-size: 0.85rem;">
                    <span class="badge bg-light text-dark border">
                      {{ ad.category || 'Без категории' }}
                    </span>
                    <span class="text-muted">
                      {{ ad.city || '—' }}
                    </span>
                    <span class="text-primary fw-semibold">
                      {{ ad.price ? ad.price + ' ₽' : 'Цена не указана' }}
                    </span>
                  </div>
                  <div class="text-muted mt-1" style="font-size: 0.8rem;">
                    Создано: {{ formatDate(ad.createdAt) }}
                    <span v-if="ad.updatedAt">· Обновлено: {{ formatDate(ad.updatedAt) }}</span>
                  </div>
                </div>

                <span class="badge" :class="moderationStatusClass(ad.moderationStatus ?? ad.status)">
                  {{ formatModerationStatus(ad.moderationStatus ?? ad.status) }}
                </span>
              </div>

              <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-2">
                <div class="text-muted" style="font-size: 0.85rem;">
                  Автор:
                  <router-link
                    :to="`/profile/${ad.user?.id ?? ad.authorId ?? ad.userId}`"
                    class="text-decoration-none"
                  >
                    {{ getUserName(ad) }}
                  </router-link>
                </div>
                <router-link
                  :to="`/ads/${ad.id}`"
                  class="btn btn-sm btn-primary"
                >
                  Просмотреть объявление
                </router-link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="activeTab === 'users'">
      <h3>Пользователи</h3>
      <table class="table table-striped mb-5">
        <thead>
          <tr>
            <th>ID</th>
            <th>Имя</th>
            <th>Email</th>
            <th>Роль</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id">
            <td>{{ user.id }}</td>
            <td>{{ user.name }}</td>
            <td>{{ user.email }}</td>
            <td>{{ user.role }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="activeTab === 'complaints'">
      <h3>Жалобы</h3>
      <table class="table table-striped">
        <thead>
          <tr>
            <th>ID</th>
            <th>Тема</th>
            <th>Автор</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="complaint in complaints" :key="complaint.id">
            <td>{{ complaint.id }}</td>
            <td>{{ complaint.subject }}</td>
            <td>{{ complaint.authorName }}</td>
            <td>{{ complaint.status }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
