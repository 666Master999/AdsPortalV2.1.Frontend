import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useCategoriesStore = defineStore('categories', () => {
  const categories = ref([])

  // mirror adsStore API base logic so fetch goes to backend port
  const apiBase = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5122').replace(/\/$/, '')

  async function loadCategories() {
    const response = await fetch(`${apiBase}/categories`)
    categories.value = await response.json()
  }

  return { categories, loadCategories }
})
