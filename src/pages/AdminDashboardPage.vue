<script setup>
import { ref, onMounted } from 'vue'

const ads = ref([])
const users = ref([])
const complaints = ref([])

onMounted(async () => {
  const token = localStorage.getItem('token')
  const headers = { Authorization: `Bearer ${token}` }

  const [adsRes, usersRes, complaintsRes] = await Promise.all([
    fetch('/api/admin/ads', { headers }),
    fetch('/api/admin/users', { headers }),
    fetch('/api/admin/complaints', { headers }),
  ])

  ads.value = await adsRes.json()
  users.value = await usersRes.json()
  complaints.value = await complaintsRes.json()
})
</script>

<template>
  <div class="container">
    <h1 class="mb-4">Панель администратора</h1>

    <h3>Объявления</h3>
    <table class="table table-striped mb-5">
      <thead>
        <tr>
          <th>ID</th>
          <th>Заголовок</th>
          <th>Автор</th>
          <th>Статус</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="ad in ads" :key="ad.id">
          <td>{{ ad.id }}</td>
          <td>{{ ad.title }}</td>
          <td>{{ ad.authorName }}</td>
          <td>{{ ad.status }}</td>
        </tr>
      </tbody>
    </table>

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
  </div>
</template>
