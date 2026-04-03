<script setup>
import { useCategoriesStore } from '../stores/categoriesStore'
import LocationSelector from './LocationSelector.vue'

const categoriesStore = useCategoriesStore()

const category = defineModel('category')
const priceFrom = defineModel('priceFrom')
const priceTo = defineModel('priceTo')
const status = defineModel('status')
const searchText = defineModel('searchText')
const dateFrom = defineModel('dateFrom')
const dateTo = defineModel('dateTo')
const selectedLocations = defineModel('selectedLocations')

const emit = defineEmits(['apply', 'clear', 'searchInput'])
</script>

<template>
  <div class="mb-3">
    <label class="form-label small text-secondary fw-semibold mb-2">Поиск по словам</label>
    <input v-model="searchText" type="search" class="form-control rounded-pill" placeholder="Название, описание..." @input="emit('searchInput')" />
  </div>

  <div class="mb-3">
    <label class="form-label small text-secondary fw-semibold mb-2">Категория</label>
    <select v-model="category" class="form-select rounded-pill" @change="emit('apply')">
      <option value="">Все категории</option>
      <option v-for="cat in categoriesStore.categories" :key="cat.id" :value="cat.id">
        {{ cat.name }}
      </option>
    </select>
  </div>

  <div class="mb-3">
    <label class="form-label small text-secondary fw-semibold mb-2">Статус</label>
    <select v-model="status" class="form-select rounded-pill" @change="emit('apply')">
      <option value="">Любой</option>
      <option value="active">Активные</option>
      <option value="draft">Черновики</option>
      <option value="archived">Архивные</option>
    </select>
  </div>

  <div class="row g-2 mb-3">
    <div class="col-6">
      <label class="form-label small text-secondary fw-semibold mb-2">Цена от</label>
      <input v-model="priceFrom" type="number" class="form-control rounded-pill" placeholder="0" min="0" @change="emit('apply')" />
    </div>
    <div class="col-6">
      <label class="form-label small text-secondary fw-semibold mb-2">Цена до</label>
      <input v-model="priceTo" type="number" class="form-control rounded-pill" placeholder="999999" min="0" @change="emit('apply')" />
    </div>
  </div>

  <div class="row g-2 mb-3">
    <div class="col-6">
      <label class="form-label small text-secondary fw-semibold mb-2">Дата от</label>
      <input v-model="dateFrom" type="date" class="form-control rounded-pill" @change="emit('apply')" />
    </div>
    <div class="col-6">
      <label class="form-label small text-secondary fw-semibold mb-2">Дата до</label>
      <input v-model="dateTo" type="date" class="form-control rounded-pill" @change="emit('apply')" />
    </div>
  </div>

  <div class="mb-3">
    <label class="form-label small text-secondary fw-semibold mb-2">Местоположение</label>
    <LocationSelector
      v-model="selectedLocations"
      @update:modelValue="emit('apply')"
    />
  </div>

  <div class="d-flex gap-2">
    <slot name="buttons">
      <button type="button" class="btn btn-outline-secondary rounded-pill flex-grow-1" @click="emit('apply')">Применить</button>
      <button type="button" class="btn btn-light border rounded-pill" @click="emit('clear')">Сбросить</button>
    </slot>
  </div>
</template>
