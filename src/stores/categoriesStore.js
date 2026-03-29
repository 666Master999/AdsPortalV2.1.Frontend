import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getApiBaseUrl } from '../config/apiBase'

export const useCategoriesStore = defineStore('categories', () => {
  const categories = ref([])

  const apiBase = getApiBaseUrl()

  async function loadCategories() {
    const response = await fetch(`${apiBase}/categories`)
    categories.value = await response.json()
  }

  return { categories, loadCategories }
})
