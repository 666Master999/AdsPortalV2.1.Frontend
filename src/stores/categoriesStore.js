import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useCategoriesStore = defineStore('categories', () => {
  const categories = ref([])

  async function loadCategories() {
    const response = await fetch('/api/categories')
    categories.value = await response.json()
  }

  return { categories, loadCategories }
})
