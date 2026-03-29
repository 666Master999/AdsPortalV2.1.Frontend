<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getApiBaseUrl } from '../config/apiBase'

const apiBase = getApiBaseUrl()

const route = useRoute()
const ads = ref([])
const users = ref([])
const complaints = ref([])
const isLoading = ref(false)
const error = ref('')

const activeTab = computed(() => String(route.query.tab || 'ads'))

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
  isLoading.value = true
  error.value = ''

  const token = localStorage.getItem('token')
  const headers = token ? { Authorization: `Bearer ${token}` } : {}

  try {
    const [adsRes, usersRes, complaintsRes] = await Promise.all([
      fetch(`${apiBase}/ads`, { headers }),
      fetch(`${apiBase}/users`, { headers }),
      fetch(`${apiBase}/complaints`, { headers }),
    ])

    if (!adsRes.ok || !usersRes.ok || !complaintsRes.ok) {
      throw new Error('Ошибка при загрузке данных администратора')
    }

    const adsData = await adsRes.json()
    const usersData = await usersRes.json()
    const complaintsData = await complaintsRes.json()

    ads.value = adsData.data || adsData || []
    users.value = usersData.data || usersData || []
    complaints.value = complaintsData.data || complaintsData || []
  } catch (ex) {
    error.value = ex?.message || 'Не удалось загрузить данные'
  } finally {
    isLoading.value = false
  }
}

onMounted(loadActiveTab)

watch(
  () => route.query.tab,
  () => {
    loadActiveTab()
  }
)
</script>

<template>
  <div class="container-fluid px-3 px-lg-4 py-3 py-lg-4">
    <div class="mx-auto rounded-5 border bg-body-tertiary shadow-lg overflow-hidden" style="max-width: 1520px; min-height: calc(100vh - 90px);">
      <div class="d-flex flex-column h-100">
        <div class="px-3 px-lg-4 py-3 border-bottom bg-white d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
          <div>
            <div class="small text-uppercase text-secondary fw-semibold mb-1">Admin</div>
            <h1 class="h3 mb-0 fw-semibold">Панель администратора</h1>
          </div>
          <ul class="nav nav-pills flex-wrap gap-2">
            <li class="nav-item">
              <router-link class="nav-link rounded-pill" :class="{ active: activeTab === 'ads' }" to="/admin?tab=ads">Объявления</router-link>
            </li>
            <li class="nav-item">
              <router-link class="nav-link rounded-pill" :class="{ active: activeTab === 'users' }" to="/admin?tab=users">Пользователи</router-link>
            </li>
            <li class="nav-item">
              <router-link class="nav-link rounded-pill" :class="{ active: activeTab === 'complaints' }" to="/admin?tab=complaints">Жалобы</router-link>
            </li>
          </ul>
        </div>

        <div class="flex-grow-1 overflow-auto p-3 p-lg-4" style="min-height: 0;">
          <p v-if="isLoading" class="alert alert-secondary">Загрузка...</p>
          <p v-if="error" class="alert alert-danger">{{ error }}</p>

          <section v-if="activeTab === 'ads'" class="card border-0 shadow-sm rounded-4 mb-4">
            <div class="card-body">
              <h3 class="h5 mb-3 fw-semibold">Объявления</h3>
              <div class="list-group">
                <div class="list-group-item list-group-item-action rounded-4 shadow-sm mb-2 border" v-for="ad in ads" :key="ad.id">
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
                      <div class="d-flex flex-column flex-lg-row justify-content-between align-items-start gap-2">
                        <div>
                          <router-link :to="`/ads/${ad.id}`" class="h6 mb-1 d-block text-decoration-none text-dark">{{ ad.title }}</router-link>
                          <div class="d-flex flex-wrap gap-2 align-items-center small">
                            <span class="badge bg-light text-dark border">{{ ad.category || 'Без категории' }}</span>
                            <span class="text-muted">{{ ad.city || '—' }}</span>
                            <span class="text-primary fw-semibold">{{ ad.price ? ad.price + ' ₽' : 'Цена не указана' }}</span>
                          </div>
                          <div class="text-muted small mt-1">
                            Создано: {{ formatDate(ad.createdAt) }}
                            <span v-if="ad.updatedAt">· Обновлено: {{ formatDate(ad.updatedAt) }}</span>
                          </div>
                        </div>
                        <span class="badge" :class="moderationStatusClass(ad.moderationStatus ?? ad.status)">{{ formatModerationStatus(ad.moderationStatus ?? ad.status) }}</span>
                      </div>

                      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-2">
                        <div class="text-muted small">
                          Автор: <router-link :to="`/profile/${ad.user?.id ?? ad.authorId ?? ad.userId}`" class="text-decoration-none">{{ getUserName(ad) }}</router-link>
                        </div>
                        <router-link :to="`/ads/${ad.id}`" class="btn btn-sm btn-primary">Просмотреть объявление</router-link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section v-if="activeTab === 'users'" class="card border-0 shadow-sm rounded-4 mb-4">
            <div class="card-body">
              <h3 class="h5 mb-3 fw-semibold">Пользователи</h3>
              <div class="table-responsive">
                <table class="table table-striped mb-0">
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
              </div>
            </div>
          </section>

          <section v-if="activeTab === 'complaints'" class="card border-0 shadow-sm rounded-4">
            <div class="card-body">
              <h3 class="h5 mb-3 fw-semibold">Жалобы</h3>
              <div class="table-responsive">
                <table class="table table-striped mb-0">
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
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
