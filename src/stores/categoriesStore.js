import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getApiBaseUrl } from '../config/apiBase'
import { fetchDeduped } from '../utils/fetchDeduped'

export const useCategoriesStore = defineStore('categories', () => {
  const categories = ref([])

  const apiBase = getApiBaseUrl()

  async function loadCategories() {
    if (categories.value.length) return categories.value
    return fetchDeduped('categories', async () => {
      const response = await fetch(`${apiBase}/categories`)
      categories.value = await response.json()
      return categories.value
    })
  }

  return { categories, loadCategories }
})
