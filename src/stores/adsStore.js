import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAdsStore = defineStore('ads', () => {
  const ads = ref([])
  const selectedAd = ref(null)
  const apiBase = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5122').replace(/\/$/, '')

  async function loadAds(params = {}) {
    const query = new URLSearchParams(params).toString()
    const response = await fetch(`${apiBase}/ads?${query}`)
    ads.value = await response.json()
  }

  async function loadAd(id) {
    const response = await fetch(`${apiBase}/ads/${id}`)
    selectedAd.value = await response.json()
  }

  async function createAd(adData) {
    const token = localStorage.getItem('token')
    const response = await fetch(`${apiBase}/ads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(adData),
    })
    return await response.json()
  }

  return { ads, selectedAd, loadAds, loadAd, createAd }
})
