import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchDeduped } from '../utils/fetchDeduped'
import { apiClient } from '../api/apiClient'

export const useCategoriesStore = defineStore('categories', () => {
  const categories = ref([])

  async function loadCategories() {
    if (categories.value.length) return categories.value
    return fetchDeduped('categories', async () => {
      const data = await apiClient.get('/categories', {
        errorHandlerOptions: { notify: false },
      })
      categories.value = Array.isArray(data) ? data : (data?.items ?? data?.data ?? [])
      return categories.value
    })
  }

  return { categories, loadCategories }
})
