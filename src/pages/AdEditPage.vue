<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Sortable from 'sortablejs'
import { useAdsStore } from '../stores/adsStore'
import { useCategoriesStore } from '../stores/categoriesStore'
import LocationAutocomplete from '../components/LocationAutocomplete.vue'
import { mapApiToLocation, mapLocationToApi } from '../composables/useLocationMapper'
import { getApiBaseUrl } from '../config/apiBase'

const adsStore = useAdsStore()
const categoriesStore = useCategoriesStore()
const route = useRoute()
const router = useRouter()

const apiBase = getApiBaseUrl()

function getImageUrl(path) {
  return `${apiBase}/${path}`
}

const MAX_IMAGES = 10

// ---- Формы ----
const title = ref('')
const description = ref('')
const price = ref('')
const isNegotiable = ref(false)
const categoryId = ref('')
const selectedLocation = ref(null)
const type = ref('')
const error = ref('')

function resolveModerationStatus(raw) {
  if (raw === undefined || raw === null || raw === '') return ''
  const normalized = String(raw).trim()
  if (!normalized) return ''

  switch (normalized.toLowerCase()) {
    case '0':
    case 'pending':
      return 'Pending'
    case '1':
    case 'approved':
      return 'Approved'
    case '2':
    case 'rejected':
      return 'Rejected'
    case '3':
    case 'hidden':
      return 'Hidden'
    default:
      return normalized
  }
}

const moderationStatus = computed(() => {
  return resolveModerationStatus(adsStore.selectedAd?.moderationStatus ?? adsStore.selectedAd?.status)
})

const moderationStatusLabel = computed(() => {
  switch (moderationStatus.value) {
    case 'Pending':
      return 'На модерации'
    case 'Approved':
      return 'Одобрено'
    case 'Rejected':
      return 'Отклонено'
    case 'Hidden':
      return 'Скрыто'
    default:
      return moderationStatus.value
  }
})

// ---- Изображения ----
// Каждое изображение хранится как единый объект: существующее или новое.
// Состояние определяется полем `isNew`.
const images = ref([]) // { localId, id?, file?, filePath?, isNew, isMain }
const removedImageIds = ref(new Set())

// Снимки состояния для сравнения при сохранении
const initialAd = ref(null)
const initialImagesSnapshot = ref([])

// Кэш objectURL (revocable) для новых файлов
const objectUrlCache = new Map()
const URL = window.URL || globalThis.URL

const imagesListRef = ref(null)
const fileInputRef = ref(null)
let sortable = null

function makeLocalId() {
  return typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function onFilesSelected(e) {
  addFiles(e.target.files)
  // Сбрасываем input, чтобы пользователь мог повторно выбрать тот же файл или выбрать новые.
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

function createImageItem({ id, filePath, file, isMain = false, isNew = false }) {
  return {
    localId: makeLocalId(),
    id,
    filePath,
    file,
    isNew,
    isMain,
    tooMany: false,
  }
}

function refreshTooManyFlags() {
  images.value.forEach((item, index) => {
    item.tooMany = index >= MAX_IMAGES
  })
}

function getPreviewUrl(item) {
  if (item.file) {
    if (!objectUrlCache.has(item.localId)) {
      objectUrlCache.set(item.localId, URL.createObjectURL(item.file))
    }
    return objectUrlCache.get(item.localId)
  }
  if (item.filePath) {
    return getImageUrl(item.filePath)
  }
  return ''
}

function revokePreviewUrl(item) {
  const url = objectUrlCache.get(item.localId)
  if (url) {
    URL.revokeObjectURL(url)
    objectUrlCache.delete(item.localId)
  }
}

function setMainImage(item) {
  if (item.tooMany) return
  images.value.forEach(i => (i.isMain = i.localId === item.localId))
}

function sameLocationRef(a, b) {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.type === b.type && Number(a.id) === Number(b.id)
}

function resolveInitialLocation(adData) {
  return mapApiToLocation(adData)[0] ?? null
}

function onLocationSelect(item) {
  if (item?.type === 'preset' && item.id === 'all') {
    selectedLocation.value = null
    return
  }
  selectedLocation.value = mapApiToLocation(item)[0] ?? null
}

function clearSelectedLocation() {
  selectedLocation.value = null
}

function initSortable() {
  if (!imagesListRef.value) return

  sortable = Sortable.create(imagesListRef.value, {
    animation: 180,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    onEnd: (evt) => {
      const { oldIndex, newIndex } = evt
      if (oldIndex === newIndex) return

      const moved = images.value.splice(oldIndex, 1)[0]
      images.value.splice(newIndex, 0, moved)
      refreshTooManyFlags()
    },
  })
}

function removeImage(item) {
  const idx = images.value.findIndex(i => i.localId === item.localId)
  if (idx === -1) return

  // Если это существующее изображение, помечаем его для удаления на сервере.
  if (!item.isNew && item.id) {
    removedImageIds.value.add(item.id)
  }

  images.value.splice(idx, 1)
  revokePreviewUrl(item)

  // Поддерживаем наличие главного изображения
  if (item.isMain && images.value.length) {
    images.value[0].isMain = true
  }

  refreshTooManyFlags()
}

function addFiles(files) {
  const selected = Array.from(files)
  error.value = ''

  const newItems = selected.map((file) =>
    createImageItem({ file, isNew: true, isMain: false })
  )

  // Если нет выбранного главного, назначаем первый из всех имеющихся
  const hasMain = images.value.some(i => i.isMain) || newItems.some(i => i.isMain)
  if (!hasMain && newItems.length > 0) {
    newItems[0].isMain = true
  }

  images.value.push(...newItems)
  refreshTooManyFlags()

  if (images.value.length > MAX_IMAGES) {
    error.value = `Загружено больше ${MAX_IMAGES} файлов — первые ${MAX_IMAGES} будут отправлены, остальные будут выделены красным.`
  }
}

async function uploadNewFiles(files) {
  const formData = new FormData()
  files.forEach(file => formData.append('files', file))

  const response = await fetch(`${apiBase}/ads/${route.params.id}/upload`, {
    method: 'POST',
    body: formData,
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
  })

  if (!response.ok) {
    throw new Error('Ошибка загрузки файлов')
  }

  const result = await response.json()
  return result.files || []
}

async function handleUpdate() {
  try {
    error.value = ''

    const items = images.value

    // 1) Загружаем новые файлы, получаем их filePath
    const uploadItems = items.filter(i => i.isNew && i.file && !i.tooMany)
    const uploadedPaths = uploadItems.length
      ? await uploadNewFiles(uploadItems.map(i => i.file))
      : []

    const uploadedByLocalId = new Map()
    uploadItems.forEach((item, idx) => {
      uploadedByLocalId.set(item.localId, uploadedPaths[idx])
    })

    // 2) Составляем payload по изображениям
    const imagesPayload = []

    // 2.1 Удалённые
    removedImageIds.value.forEach(id => {
      imagesPayload.push({ id, delete: true })
    })

    // 2.2 Текущие в порядке списка
    const remainingExisting = items.filter(i => !i.isNew && i.id)
    const mainBeforeId = initialImagesSnapshot.value.find(i => i.isMain)?.id ?? null
    const mainAfterId = remainingExisting.find(i => i.isMain)?.id ?? null
    const mainChanged = mainBeforeId !== mainAfterId

    const effectiveItems = items.slice(0, MAX_IMAGES)
    effectiveItems.forEach((item, index) => {
      const sortOrder = index
      const isMain = item.isMain

      if (item.isNew) {
        const filePath = uploadedByLocalId.get(item.localId)
        if (!filePath) return

        imagesPayload.push({
          filePath,
          sortOrder,
          isMain,
        })
        return
      }

      // Существующие
      const original = initialImagesSnapshot.value.find(i => i.id === item.id)
      const sortOrderChanged = original ? original.sortOrder !== sortOrder : true
      const isMainChanged = mainChanged || (original ? original.isMain !== isMain : true)

      if (sortOrderChanged || isMainChanged) {
        imagesPayload.push({
          id: item.id,
          sortOrder,
          isMain,
        })
      }
    })

    // 3) Поля объявления
    const payload = {}
    if (title.value !== initialAd.value.title) payload.title = title.value
    if (description.value !== initialAd.value.description) payload.description = description.value
    if (isNegotiable.value !== Boolean(initialAd.value.isNegotiable)) payload.isNegotiable = isNegotiable.value
    if (price.value !== initialAd.value.price) payload.price = price.value
    if (categoryId.value !== initialAd.value.categoryId) payload.categoryId = categoryId.value
    if (selectedLocation.value?.type === 'region') {
      error.value = 'Выберите город или район'
      return
    }
    if (!sameLocationRef(selectedLocation.value, initialAd.value.location)) {
      if (!selectedLocation.value) {
        payload.CityId = null
        payload.DistrictId = null
      } else {
        Object.assign(payload, mapLocationToApi(selectedLocation.value))
      }
    }
    if (type.value !== initialAd.value.type) payload.type = type.value

    if (imagesPayload.length) {
      payload.images = imagesPayload
    }

    const result = await adsStore.updateAd(route.params.id, payload)

    // Pass server response along to details page so user sees what happened.
    // Similar to Profile edit flow: show updated/skipped info or message.
    const query = {}
    if (result?.message) query.message = result.message
    if (Array.isArray(result?.updated) && result.updated.length) query.updated = result.updated.join(',')
    if (Array.isArray(result?.skipped) && result.skipped.length) query.skipped = result.skipped.join(',')
    if (!Object.keys(query).length) query.message = 'Объявление обновлено'

    router.push({ path: `/ads/${route.params.id}`, query })
  } catch (e) {
    console.error('Error during ad update:', e)
    error.value = e.message || 'Ошибка обновления объявления'
  }
}

onMounted(async () => {
  categoriesStore.loadCategories()
  await adsStore.loadAd(route.params.id)

  const adData = adsStore.selectedAd
  if (!adData) return

  initialAd.value = { ...adData }
  title.value = adData.title || ''
  description.value = adData.description || ''
  price.value = adData.price || ''
  isNegotiable.value = Boolean(adData.isNegotiable)
  categoryId.value = adData.categoryId || ''
  type.value = adData.type || ''

  selectedLocation.value = resolveInitialLocation(adData)
  initialAd.value = { ...adData, location: selectedLocation.value }
  const existing = (adData.images || []).map(img =>
    createImageItem({
      id: img.id,
      filePath: img.filePath,
      isNew: false,
      isMain: !!img.isMain,
    })
  )

  // Гарантируем, что одно изображение является главным
  if (!existing.some(i => i.isMain) && existing.length) {
    existing[0].isMain = true
  }

  images.value = existing
  refreshTooManyFlags()
  initialImagesSnapshot.value = existing.map((i, idx) => ({
    id: i.id,
    sortOrder: idx,
    isMain: i.isMain,
  }))

  await nextTick()
  initSortable()
})

onBeforeUnmount(() => {
  images.value.forEach(revokePreviewUrl)
  if (sortable) {
    sortable.destroy()
    sortable = null
  }
})
</script>

<template>
  <div class="container">
    <div class="row justify-content-center">
      <div class="col-md-8">
        <h1 class="mb-4">Редактировать объявление</h1>
        <div v-if="moderationStatus" class="mb-3">
          <span class="badge" :class="moderationStatus === 'Pending' ? 'bg-warning text-dark' : 'bg-secondary'">{{ moderationStatusLabel }}</span>
          <small class="text-muted ms-2">Изменения могут отправить объявление на модерацию.</small>
        </div>
        <div v-if="error" class="alert alert-danger">{{ error }}</div>
        <form @submit.prevent="handleUpdate">
          <!-- Поля формы (без изменений) -->
          <div class="mb-3">
            <label class="form-label">Заголовок *</label>
            <input v-model="title" type="text" class="form-control" required />
          </div>

          <div class="mb-3">
            <label class="form-label">Описание</label>
            <textarea v-model="description" class="form-control" rows="4"></textarea>
          </div>

          <div class="row mb-3">
            <div class="col-md-6">
              <label class="form-label">Цена (бел. руб.)</label>
              <input v-model="price" type="number" class="form-control" />
              <div class="form-check mt-2">
                <input class="form-check-input" type="checkbox" v-model="isNegotiable" id="negotiableCheckbox" />
                <label class="form-check-label" for="negotiableCheckbox">Договорная цена</label>
              </div>
            </div>
            <div class="col-md-6">
              <label class="form-label">Категория *</label>
              <select v-model="categoryId" class="form-select" required>
                <option value="" disabled>Выберите категорию</option>
                <option v-for="cat in categoriesStore.categories" :key="cat.id" :value="cat.id">
                  {{ cat.name }}
                </option>
              </select>
            </div>
          </div>

          <div class="row mb-3">
            <div class="col-md-6">
              <label class="form-label">Местоположение</label>
              <LocationAutocomplete
                :selected="selectedLocation ? [selectedLocation] : []"
                placeholder="Начните вводить город, область или район"
                @select="onLocationSelect"
              />
              <div v-if="selectedLocation" class="d-flex flex-wrap align-items-center gap-2 mt-2">
                <span class="badge text-bg-secondary">{{ selectedLocation.label || selectedLocation.name || `${selectedLocation.type}:${selectedLocation.id}` }}</span>
                <span v-if="selectedLocation.subtitle" class="small text-secondary">{{ selectedLocation.subtitle }}</span>
                <button type="button" class="btn btn-sm btn-outline-secondary" @click="clearSelectedLocation">Очистить</button>
              </div>
            </div>
            <div class="col-md-6">
              <label class="form-label">Тип</label>
              <select v-model="type" class="form-select">
                <option value="" disabled>Выберите тип</option>
                <option value="sell">Продажа</option>
                <option value="buy">Покупка</option>
                <option value="service">Услуга</option>
              </select>
            </div>
          </div>

          <!-- Изображения -->
          <div class="mb-3">
            <label class="form-label">Изображения</label>
            <input
              ref="fileInputRef"
              type="file"
              class="form-control"
              multiple
              accept="image/*"
              @change="onFilesSelected"
            />
            <small class="form-text text-muted">
              Всего можно загрузить до {{ MAX_IMAGES }} изображений. Сейчас: {{ images.length }}.
            </small>
          </div>

          <div v-if="images.length" class="mb-3">
            <div class="d-flex justify-content-between mb-1">
              <div>
                <strong>Превью изображений</strong>
                  <div class="text-muted small">Перетащите для изменения порядка. Первые {{ MAX_IMAGES }} будут загружены.</div>
                </div>
                <div class="text-muted small">Нажмите ✕, чтобы удалить.</div>
              </div>

              <div ref="imagesListRef" class="row">
                <div
                  class="col-3 mb-2 position-relative"
                  v-for="item in images"
                  :key="item.localId"
                >
                  <img
                    :src="getPreviewUrl(item)"
                    class="img-fluid border"
                    :class="{ 'border-danger': item.tooMany }"
                    style="max-height:100px"
                  />

                  <button
                    type="button"
                    class="btn-close position-absolute top-0 end-0"
                    aria-label="Удалить"
                    @click="removeImage(item)"
                  ></button>

                  <div class="form-check position-absolute top-0 start-0 bg-light p-1">
                    <input
                      class="form-check-input"
                      type="radio"
                      name="mainImage"
                      :checked="item.isMain"
                      :disabled="item.tooMany"
                      @change="() => setMainImage(item)"
                    />
                    <label class="form-check-label small">Главное</label>
                  </div>

                  <div
                    class="badge position-absolute bottom-0 start-0 m-1"
                    :class="item.tooMany ? 'bg-danger' : 'bg-secondary'"
                  >
                    {{ item.tooMany ? 'Не будет загружено' : (item.isNew ? 'Новое' : 'С сервера') }}
                  </div>
                </div>
              </div>
            </div>

          <button type="submit" class="btn btn-primary">Сохранить</button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Стили для SortableJS */
.sortable-ghost {
  opacity: 0.6;
  transform: scale(0.98);
}

.sortable-chosen {
  opacity: 0.8;
}

/* Убираем выделение текста при захвате карточки */
[draggable="true"] {
  user-select: none;
}
</style>