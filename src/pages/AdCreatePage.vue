<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAdsStore } from '../stores/adsStore'

const adsStore = useAdsStore()
const router = useRouter()

const title = ref('')
const description = ref('')
const price = ref('')
const city = ref('')
const category = ref('')
const type = ref('sell')
const error = ref('')

async function handleCreate() {
  try {
    error.value = ''
    await adsStore.createAd({
      title: title.value,
      description: description.value,
      price: Number(price.value),
      city: city.value,
      category: category.value,
      type: type.value,
    })
    router.push('/ads')
  } catch (e) {
    error.value = 'Ошибка создания объявления'
  }
}
</script>

<template>
  <div class="container">
    <div class="row justify-content-center">
      <div class="col-md-8">
        <h1 class="mb-4">Создать объявление</h1>
        <div v-if="error" class="alert alert-danger">{{ error }}</div>
        <form @submit.prevent="handleCreate">
          <div class="mb-3">
            <label class="form-label">Заголовок</label>
            <input v-model="title" type="text" class="form-control" required />
          </div>
          <div class="mb-3">
            <label class="form-label">Описание</label>
            <textarea v-model="description" class="form-control" rows="4" required></textarea>
          </div>
          <div class="row mb-3">
            <div class="col-md-6">
              <label class="form-label">Цена</label>
              <input v-model="price" type="number" class="form-control" required />
            </div>
            <div class="col-md-6">
              <label class="form-label">Город</label>
              <input v-model="city" type="text" class="form-control" required />
            </div>
          </div>
          <div class="row mb-3">
            <div class="col-md-6">
              <label class="form-label">Категория</label>
              <input v-model="category" type="text" class="form-control" required />
            </div>
            <div class="col-md-6">
              <label class="form-label">Тип</label>
              <select v-model="type" class="form-select">
                <option value="sell">Продажа</option>
                <option value="buy">Покупка</option>
                <option value="service">Услуга</option>
              </select>
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label">Изображения</label>
            <input type="file" class="form-control" multiple disabled />
            <small class="text-muted">Загрузка изображений будет доступна позже</small>
          </div>
          <button type="submit" class="btn btn-primary">Создать</button>
        </form>
      </div>
    </div>
  </div>
</template>
