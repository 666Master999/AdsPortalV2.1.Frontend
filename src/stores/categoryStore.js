import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiClient } from '../api/apiClient'
import { fetchDeduped } from '../utils/fetchDeduped'

function normalizeCategoryView(data) {
  return {
    category: data?.category ?? null,
    path: Array.isArray(data?.path) ? data.path : [],
    children: Array.isArray(data?.children) ? data.children : [],
    filters: Array.isArray(data?.filters) ? data.filters : [],
  }
}

export const useCategoryStore = defineStore('category', () => {
  const currentCategoryView = ref(null)
  const filters = ref([])
  const children = ref([])
  const path = ref([])

  function resetCategoryView() {
    currentCategoryView.value = null
    filters.value = []
    children.value = []
    path.value = []
  }

  async function fetchCategoryView(id) {
    const categoryId = String(id || '').trim()

    if (!categoryId) {
      resetCategoryView()
      return null
    }

    return fetchDeduped(`category-view:${categoryId}`, async () => {
      const data = await apiClient.get(`/categories/${categoryId}/view`, {
        errorHandlerOptions: { notify: false },
      })
      const view = normalizeCategoryView(data)

      currentCategoryView.value = view
      filters.value = view.filters
      children.value = view.children
      path.value = view.path

      return view
    })
  }

  return {
    currentCategoryView,
    filters,
    children,
    path,
    fetchCategoryView,
    resetCategoryView,
  }
})