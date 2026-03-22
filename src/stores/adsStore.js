import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAdsStore = defineStore('ads', () => {
  const ads = ref([])
  const selectedAd = ref(null)
  const apiBase = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5122').replace(/\/$/, '')

  function getAuthHeaders() {
    const token = localStorage.getItem('token')
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  async function loadAds(params = {}) {
    const query = new URLSearchParams(params).toString()
    const response = await fetch(`${apiBase}/ads?${query}`, {
      headers: getAuthHeaders(),
    })

    if (!response.ok) {
      ads.value = []
      const errorText = await response.text().catch(() => '')
      throw new Error(errorText || `Request failed (${response.status})`)
    }

    ads.value = await response.json()
  }

  async function loadAd(id) {
    const response = await fetch(`${apiBase}/ads/${id}`, {
      headers: getAuthHeaders(),
    })

    if (!response.ok) {
      selectedAd.value = null
      const errorText = await response.text().catch(() => '')
      throw new Error(errorText || `Request failed (${response.status})`)
    }

    selectedAd.value = await response.json()
  }

  // regular JSON-only creation (no images)
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

    // handle text/JSON response
    let payload
    const text = await response.text()
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }

    if (!response.ok) {
      const message = (payload && typeof payload === 'object' ? payload.message : payload) || `Request failed (${response.status})`
      throw new Error(message)
    }

    return payload
  }

  // use one request to create an ad and upload images simultaneously
  async function createAdWithImages(formData) {
    if (!(formData instanceof FormData)) {
      throw new Error('createAdWithImages expects a FormData instance')
    }
    const token = localStorage.getItem('token')
    const response = await fetch(`${apiBase}/ads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        // do not touch Content-Type
      },
      body: formData,
    })
    if (!response.ok) {
      const txt = await response.text()
      throw new Error(txt || `Request failed (${response.status})`)
    }
    return await response.json()
  }

  // uploadAdImages takes a FormData instance prepared by the caller.
  // It behaves similarly to userStore.uploadAvatar but allows multiple files.
  async function uploadAdImages(adId, formData) {
    if (!formData) throw new Error('FormData not provided')
    const token = localStorage.getItem('token')
    const resp = await fetch(`${apiBase}/ads/${adId}/upload-images`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
        // do not set Content-Type; the browser will add the right boundary
      },
      body: formData,
    })
    const json = await resp.json()
    if (!resp.ok) throw new Error(json?.message || json || `Upload failed (${resp.status})`)
    return json
  }

  // updateAd PATCH JSON (no images)
  async function updateAd(adId, adData) {
    const token = localStorage.getItem('token')
    const res = await fetch(`${apiBase}/ads/${adId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(adData),
    })
    const json = await res.json()
    if (!res.ok) {
      const message = (json && typeof json === 'object' ? json.message : json) || `Request failed (${res.status})`
      throw new Error(message)
    }
    // keep selectedAd in sync
    selectedAd.value = json
    return json
  }

  // updateAdWithImages allows updating fields and uploading new images in one request
  async function updateAdWithImages(adId, formData) {
    if (!(formData instanceof FormData)) {
      throw new Error('updateAdWithImages expects a FormData instance')
    }
    const token = localStorage.getItem('token')
    const response = await fetch(`${apiBase}/ads/${adId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        // do not touch Content-Type
      },
      body: formData,
    })
    if (!response.ok) {
      const txt = await response.text()
      throw new Error(txt || `Request failed (${response.status})`)
    }
    const json = await response.json()
    selectedAd.value = json
    return json
  }

  // patchModerationStatus allows admins to change moderation status of an ad.
  // Backend accepts a PATCH to /ads/{id}/moderation; expected enum type should be numeric code or canonical name.
  // Response is expected to include { id, moderationStatus }.
  function normalizeModerationStatus(value) {
    if (value === undefined || value === null) return null
    const v = String(value).trim().toLowerCase()
    switch (v) {
      case '0':
      case 'pending':
        return 0
      case '1':
      case 'approved':
        return 1
      case '2':
      case 'rejected':
        return 2
      case '3':
      case 'hidden':
        return 3
      default:
        // если число/строка не распознаны, возвращаем оригинальное значение
        if (!Number.isNaN(Number(value))) return Number(value)
        return value
    }
  }

  async function patchModerationStatus(adId, moderationStatus) {
    const token = localStorage.getItem('token')
    const payload = normalizeModerationStatus(moderationStatus)

    const res = await fetch(`${apiBase}/ads/${adId}/moderation`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })

    const json = await res.json()
    if (!res.ok) {
      const message = (json && typeof json === 'object' ? json.message : json) || `Request failed (${res.status})`
      throw new Error(message)
    }

    const newStatus = json?.moderationStatus ?? moderationStatus

    // keep store in sync with backend
    const index = ads.value.findIndex(a => String(a.id) === String(adId))
    if (index !== -1) ads.value[index].moderationStatus = newStatus
    if (selectedAd.value?.id && String(selectedAd.value.id) === String(adId)) {
      selectedAd.value.moderationStatus = newStatus
    }

    return json
  }

  // deleteAd deletes an advertisement. Caller can handle 403/404 statuses.
  async function deleteAd(adId) {
    const token = localStorage.getItem('token')
    const response = await fetch(`${apiBase}/ads/${adId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (response.status === 204 || response.status === 200) {
      // Successful deletion
      selectedAd.value = null
      ads.value = ads.value.filter(a => String(a.id) !== String(adId))
      return
    }

    const text = await response.text()
    let payload
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }

    const message = (payload && typeof payload === 'object' ? payload.message : payload) || `Request failed (${response.status})`
    const error = new Error(message)
    // Attach status for callers that want to react differently
    error.status = response.status
    throw error
  }

  return {
    ads,
    selectedAd,
    loadAds,
    loadAd,
    createAd,
    createAdWithImages,
    uploadAdImages,
    updateAd,
    updateAdWithImages,
    patchModerationStatus,
    deleteAd,
  }
})
