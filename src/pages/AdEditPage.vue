<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Sortable from 'sortablejs'
import { useAdsStore } from '../stores/adsStore'
import { useCategoriesStore } from '../stores/categoriesStore'
import LocationCascade from '../components/LocationCascade.vue'
import { mapApiToLocationId, mapLocationIdToApi } from '../composables/useLocationMapper'
import { useAccessService } from '../services/accessService'
import { getModerationStatusClass, getModerationStatusLabel, normalizeModerationStatus } from '@/utils/moderationStatus'
import { resolveMediaUrl } from '../utils/resolveMediaUrl'
import { normalizePatchIssues, serializePatchIssues } from '../utils/patchResult'
import { ContractError, mapContractErrorToUi } from '../utils/apiContract'

const adsStore = useAdsStore()
const categoriesStore = useCategoriesStore()
const access = useAccessService()
const route = useRoute()
const router = useRouter()

function getImageUrl(path) {
  return resolveMediaUrl(path)
}

const MAX_IMAGES = 10
const DESCRIPTION_MAX = 5000

// ---- Формы ----
const title = ref('')
const description = ref('')
const price = ref('')
const titleRef = ref(null)
const priceRef = ref(null)
const movedPastPrice = ref(false)
const attemptedSubmit = ref(false)
const isNegotiable = ref(false)
const categoryId = ref('')
const selectedLocationId = ref(null)
const type = ref('')
const error = ref('')

const editDisabledReason = computed(() => {
  const rateLimitReason = access.getRateLimitReason()
  if (rateLimitReason) return rateLimitReason

  const createBlockedReason = access.getCreateAdBlockedReason()
  if (!createBlockedReason) return ''
  if (createBlockedReason.includes('Создание')) {
    return createBlockedReason.replace('Создание', 'Редактирование')
  }
  return 'Редактирование объявлений ограничено (PostBan).'
})

const titleError = computed(() => {
  const t = String(title.value || '')
  if (!t.trim()) {
    if (!attemptedSubmit.value) return ''
    return 'Заголовок обязателен'
  }
  if (t.length > 200) return 'Заголовок не может быть длиннее 200 символов'
  return ''
})

const priceError = computed(() => {
  const rawPrice = price.value
  if (rawPrice === '' || rawPrice == null) return ''
  const p = Number(String(rawPrice).trim())
  if (!Number.isFinite(p)) return 'Цена должна быть числом'
  if (p < 0 || p > 999999999) return 'Цена должна быть от 0 до 999999999'
  return ''
})

const priceEmptyWarning = computed(() => {
  return movedPastPrice.value && (price.value === '' || price.value == null) && !priceError.value
})

function focusFirstInvalid() {
  if (titleError.value) {
    titleRef.value?.focus?.()
    return
  }
  if (priceError.value) {
    priceRef.value?.focus?.()
    return
  }
}

watch(title, () => {
  if (attemptedSubmit.value) {
    attemptedSubmit.value = false
  }
})

const moderationStatus = computed(() => {
  return normalizeModerationStatus(adsStore.selectedAd?.moderationStatus ?? adsStore.selectedAd?.status)
})

const moderationStatusLabel = computed(() => {
  return getModerationStatusLabel(moderationStatus.value)
})

const moderationStatusBadgeClass = computed(() => {
  return getModerationStatusClass(moderationStatus.value)
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

function getImageLabel(item) {
  if (!item) return ''
  if (item.isNew && item.file?.name) return item.file.name
  if (!item.isNew && item.filePath) return item.filePath.split('/').pop() || 'Изображение'
  return item.isNew ? 'Новое изображение' : 'Изображение'
}

function resolveInitialLocation(adData) {
  return mapApiToLocationId(adData)
}

function initSortable() {
  if (!imagesListRef.value) return

  sortable = Sortable.create(imagesListRef.value, {
    animation: 180,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    // allow dragging only for actual image items; exclude the "Add" card
    draggable: '.image-item',
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
  const result = await adsStore.uploadAdImages(route.params.id, files)

  const uploaded = Array.isArray(result)
    ? result
    : (result?.files ?? result?.filePaths ?? result?.uploadedPaths ?? result?.paths ?? result?.data ?? [])

  return Array.isArray(uploaded) ? uploaded : []
}

function normalizeFilePath(value) {
  return String(value || '').trim().replace(/\\/g, '/')
}

function mergePatchResults(...results) {
  const updated = []
  const updatedSeen = new Set()
  const skipped = []
  const errors = []
  let message = ''
  let success = true

  for (const result of results) {
    if (!result || typeof result !== 'object') continue

    if (!message && result.message) {
      message = String(result.message)
    }

    for (const field of Array.isArray(result.updated) ? result.updated : []) {
      const key = String(field || '').trim()
      if (!key || updatedSeen.has(key)) continue
      updatedSeen.add(key)
      updated.push(key)
    }

    skipped.push(...normalizePatchIssues(result.skipped))
    errors.push(...normalizePatchIssues(result.errors, 'validation_error'))

    if (result.success === false) {
      success = false
    }
  }

  return { success, message, updated, skipped, errors }
}

async function handleUpdate() {
  try {
    error.value = ''

    if (editDisabledReason.value) {
      error.value = editDisabledReason.value
      return
    }

    // Mark that the user attempted to submit so required-only errors show
    attemptedSubmit.value = true

    // Prevent submit if inline validation errors exist
    if (titleError.value || priceError.value) {
      focusFirstInvalid()
      return
    }

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
    const effectiveItems = items.slice(0, MAX_IMAGES)
    const selectedMainItem = effectiveItems.find(item => item.isMain) || null
    const initialMainImageId = initialAd.value?.mainImageId ?? null
    const selectedMainImageId = selectedMainItem?.id ?? null
    const mainChanged = String(initialMainImageId ?? '') !== String(selectedMainImageId ?? '')
    const selectedMainUploadedPath = selectedMainItem?.isNew
      ? uploadedByLocalId.get(selectedMainItem.localId) ?? null
      : null
    const requiresFollowUpMainImage = Boolean(mainChanged && selectedMainItem?.isNew && selectedMainUploadedPath)

    const itemsForPayload = selectedMainItem && selectedMainImageId == null
      ? [selectedMainItem, ...effectiveItems.filter(item => item.localId !== selectedMainItem.localId)]
      : effectiveItems

    const imagesPayload = []

    removedImageIds.value.forEach(id => {
      imagesPayload.push({ id, delete: true })
    })

    itemsForPayload.forEach((item, index) => {
      const sortOrder = index

      if (item.isNew) {
        const filePath = uploadedByLocalId.get(item.localId)
        if (!filePath) return

        imagesPayload.push({
          filePath,
          sortOrder,
        })
        return
      }

      const original = initialImagesSnapshot.value.find(i => i.id === item.id)
      const sortOrderChanged = original ? original.sortOrder !== sortOrder : true

      if (sortOrderChanged) {
        imagesPayload.push({
          id: item.id,
          sortOrder,
        })
      }
    })

    // 3) Поля объявления
    const payload = {}
    if (title.value !== initialAd.value.title) payload.title = title.value
    if (description.value !== initialAd.value.description) payload.description = description.value
    if (isNegotiable.value !== Boolean(initialAd.value.isNegotiable)) payload.isNegotiable = isNegotiable.value
    const normalizedPrice = (price.value === '' || price.value == null) ? null : Number(String(price.value).trim())
    if (String(normalizedPrice ?? '') !== String(initialAd.value.price ?? '')) payload.price = normalizedPrice
    if (categoryId.value !== initialAd.value.categoryId) payload.categoryId = categoryId.value
    if (selectedLocationId.value == null) {
      error.value = 'Выберите локацию'
      return
    }

    // Отправляем locationId только если оно изменилось относительно исходного значения
    const locationPayload = mapLocationIdToApi(selectedLocationId.value)
    if (String(locationPayload.locationId ?? '') !== String(initialAd.value?.locationId ?? '')) {
      Object.assign(payload, locationPayload)
    }
    if (type.value !== (initialAd.value.listingType ?? '')) payload.listingType = type.value

    if (mainChanged && selectedMainImageId != null && !requiresFollowUpMainImage) {
      payload.mainImageId = selectedMainImageId
    }

    if (imagesPayload.length) {
      payload.images = imagesPayload
    }

    const result = await adsStore.updateAd(route.params.id, payload)
    let finalResult = result

    if (requiresFollowUpMainImage) {
      const refreshedAd = await adsStore.loadAd(route.params.id)
      const uploadedMainImage = Array.isArray(refreshedAd?.images)
        ? refreshedAd.images.find(img => normalizeFilePath(img?.filePath) === normalizeFilePath(selectedMainUploadedPath))
        : null

      if (!uploadedMainImage?.id) {
        throw new Error('Не удалось определить id нового главного изображения после сохранения.')
      }

      const mainImageResult = await adsStore.updateAd(route.params.id, { mainImageId: uploadedMainImage.id })
      finalResult = mergePatchResults(result, mainImageResult)
    }

    // Pass server response along to details page so user sees what happened.
    // Similar to Profile edit flow: show updated/skipped info or message.
    const query = {}
    if (finalResult?.message) query.message = finalResult.message
    if (Array.isArray(finalResult?.updated) && finalResult.updated.length) query.updated = finalResult.updated.join(',')
    if (Array.isArray(finalResult?.skipped) && finalResult.skipped.length) query.skipped = serializePatchIssues(finalResult.skipped)
    if (Array.isArray(finalResult?.errors) && finalResult.errors.length) query.errors = serializePatchIssues(finalResult.errors)
    if (!Object.keys(query).length) query.message = 'Объявление обновлено'

    attemptedSubmit.value = false
    router.push({ path: `/ads/${route.params.id}`, query })
  } catch (e) {
    console.error('Error during ad update:', e)
    error.value = e.message || 'Ошибка обновления объявления'
  }
}

onMounted(async () => {
  categoriesStore.loadCategories()
  try {
    await adsStore.loadAd(route.params.id)

    const adData = adsStore.selectedAd
    if (!adData) return

    initialAd.value = { ...adData }
    title.value = adData.title || ''
    description.value = adData.description || ''
    price.value = adData.price || ''
    isNegotiable.value = Boolean(adData.isNegotiable)
    categoryId.value = adData.categoryId || ''
    type.value = adData.listingType || ''

    selectedLocationId.value = resolveInitialLocation(adData)
    initialAd.value = { ...adData, locationId: selectedLocationId.value }
    const existing = (adData.images || []).map(img =>
      createImageItem({
        id: img.id,
        filePath: img.filePath,
        isNew: false,
        isMain: img.isMain,
      })
    )

    images.value = existing
    refreshTooManyFlags()
    initialImagesSnapshot.value = existing.map((i, idx) => ({
      id: i.id,
      sortOrder: idx,
      isMain: i.isMain,
    }))

    await nextTick()
    initSortable()
  } catch (e) {
    if (e instanceof ContractError) {
      error.value = mapContractErrorToUi(e)
      return
    }

    console.error('Error loading ad for edit:', e)
    error.value = e?.message || 'Ошибка загрузки объявления'
  }
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
  <div class="container py-4 py-lg-5">
    <div class="mx-auto" style="max-width: 1120px;">
      <div class="rounded-5 border bg-body-tertiary shadow-lg overflow-hidden">
        <div class="border-bottom px-4 px-lg-5 py-4 py-lg-5">
          <div class="d-flex flex-column flex-lg-row justify-content-between align-items-start gap-4">
            <div class="flex-grow-1">
              <div class="small text-uppercase text-secondary fw-semibold mb-2">Редактирование объявления</div>
              <h1 class="display-6 fw-semibold mb-2">Редактировать объявление</h1>
              <p class="text-secondary mb-0 fs-5">
                Обновите текст, локацию, тип и изображения в одном аккуратном экране.
              </p>
            </div>

            <div class="text-lg-end">
              <div v-if="moderationStatus" class="d-inline-flex flex-column align-items-start align-items-lg-end gap-2">
                <span class="badge rounded-pill px-3 py-2" :class="moderationStatusBadgeClass">
                  {{ moderationStatusLabel }}
                </span>
                <div class="small text-secondary">
                  Изменения могут снова отправить объявление на модерацию.
                </div>
              </div>
              <div class="mt-3 d-inline-flex flex-wrap gap-2 justify-content-lg-end">
                <span class="badge rounded-pill text-bg-light border text-secondary px-3 py-2">
                  {{ images.length }} / {{ MAX_IMAGES }} фото
                </span>
                <span class="badge rounded-pill text-bg-light border text-secondary px-3 py-2">
                  Перетаскивание включено
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="px-4 px-lg-5 py-4 py-lg-5">
          <div v-if="editDisabledReason" class="alert alert-warning rounded-4 border-0 shadow-sm">{{ editDisabledReason }}</div>
          <div v-if="error" class="alert alert-danger rounded-4 border-0 shadow-sm">{{ error }}</div>

          <form @submit.prevent="handleUpdate" class="d-grid gap-4">
            <section class="card border-0 shadow-sm rounded-4">
              <div class="card-body p-4 p-lg-5">
                <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
                  <div>
                    <div class="small text-uppercase text-secondary fw-semibold mb-1">Основное</div>
                    <div class="text-secondary small">Базовые поля, которые видны в карточке объявления.</div>
                  </div>
                </div>

                <div class="mb-3">
                  <label class="form-label">Заголовок *</label>
                  <input ref="titleRef" v-model="title" type="text" maxlength="200" class="form-control form-control-lg rounded-3" :class="{ 'is-invalid': titleError }" required />
                  <div v-if="titleError" class="invalid-feedback d-block">{{ titleError }}</div>
                </div>

                <div class="mb-3">
                  <label class="form-label d-flex justify-content-between align-items-center">
                    <span>Описание</span>
                    <small>
                      <span :class="description.length > DESCRIPTION_MAX ? 'text-danger fw-semibold' : 'text-secondary'">{{ description.length || 0 }}</span>
                      <span class="text-secondary"> / {{ DESCRIPTION_MAX }}</span>
                    </small>
                  </label>
                  <textarea v-model="description" class="form-control rounded-3" rows="5"></textarea>
                </div>

                <div class="row g-3 align-items-start">
                  <div class="col-md-6">
                    <label class="form-label">Цена (бел. руб.)</label>
                    <input ref="priceRef" v-model="price" type="number" class="form-control rounded-3" :class="{ 'is-invalid': priceError }" />
                    <div v-if="priceError" class="invalid-feedback d-block">{{ priceError }}</div>
                    <div v-else-if="priceEmptyWarning" class="form-text text-warning">Оставив поле цены пустым, объявление будет помечено как «Бесплатно».</div>
                    <div class="form-check mt-2">
                      <input class="form-check-input" type="checkbox" v-model="isNegotiable" id="negotiableCheckbox" />
                      <label class="form-check-label" for="negotiableCheckbox">Договорная цена</label>
                    </div>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Категория *</label>
                                        <select v-model="categoryId" class="form-select rounded-3" required @focus="movedPastPrice = true">
                      <option value="" disabled>Выберите категорию</option>
                      <option v-for="cat in categoriesStore.categories" :key="cat.id" :value="cat.id">
                        {{ cat.name }}
                      </option>
                    </select>
                  </div>
                </div>
              </div>
            </section>

            <section class="card border-0 shadow-sm rounded-4">
              <div class="card-body p-4 p-lg-5">
                <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
                  <div>
                    <div class="small text-uppercase text-secondary fw-semibold mb-1">Локация и тип</div>
                    <div class="text-secondary small">Город, район и тип объявления редактируются здесь же.</div>
                  </div>
                </div>

                <div class="row g-4 align-items-start">
                  <div class="col-lg-7">
                    <label class="form-label">Местоположение</label>
                    <div class="bg-body-tertiary border rounded-4 p-3 p-lg-4 shadow-sm" @focusin="movedPastPrice = true">
                      <LocationCascade v-model="selectedLocationId" />
                    </div>
                  </div>

                  <div class="col-lg-5">
                    <label class="form-label">Тип</label>
                    <select v-model="type" class="form-select rounded-3" @focus="movedPastPrice = true">
                      <option value="" disabled>Выберите тип</option>
                      <option value="sell">Продажа</option>
                      <option value="buy">Покупка</option>
                      <option value="service">Услуга</option>
                    </select>

                    <div class="mt-3 p-3 rounded-4 bg-white border shadow-sm">
                      <div class="fw-semibold mb-1">Подсказка</div>
                      <div class="small text-secondary mb-0">
                        Если меняете локацию или фото, проверяйте главное изображение и порядок карточек.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section class="card border-0 shadow-sm rounded-4">
  <div class="card-body p-4 p-lg-5">

    <!-- HEADER -->
    <div class="d-flex justify-content-between align-items-start mb-3">
      <div>
        <div class="small text-uppercase text-secondary fw-semibold mb-1">
          Изображения
        </div>
        <div class="text-secondary small">
          Добавляйте фото, меняйте порядок и выбирайте главное.
        </div>
      </div>

      <div class="small text-secondary">
        Загружено {{ images.length }} из {{ MAX_IMAGES }}
      </div>
    </div>

    <!-- DROPZONE (если пусто) -->
    <div
      v-if="!images.length"
      class="border rounded-4 bg-body-tertiary text-center p-5 mb-3"
    >
      <label style="cursor:pointer;">
        <input
          ref="fileInputRef"
          type="file"
          class="d-none"
          multiple
          accept="image/*"
          @change="onFilesSelected"
        />

        <div class="mb-2" style="font-size: 32px;">📷</div>

        <div class="fw-semibold mb-1">
          Выберите или перетащите фотографии
        </div>

        <div class="small text-secondary mb-2">
          JPEG, JPG, PNG до 10 МБ
        </div>

        <div class="btn btn-light border">
          Выбрать фотографии
        </div>
      </label>
    </div>

    <!-- GRID -->
    <div v-else ref="imagesListRef" class="row g-3">
      <div
        v-for="item in images"
        :key="item.localId"
        class="col-6 col-md-4 col-xl-3 image-item"
      >
        <div
          class="card h-100 border rounded-4 overflow-hidden position-relative"
          :class="[
            item.tooMany ? 'opacity-50' : '',
            item.isMain ? 'border-primary border-3' : 'border-light'
          ]"
          @click="!item.tooMany && setMainImage(item)"
          style="cursor: pointer;"
        >
          <div class="ratio ratio-1x1 bg-light">
            <img
              :src="getPreviewUrl(item)"
              class="w-100 h-100"
              style="object-fit: cover;"
            />
          </div>

          <!-- ГЛАВНОЕ -->
          <div
            v-if="item.isMain"
            class="position-absolute top-0 start-0 m-2 px-2 py-1 rounded-pill bg-primary text-white d-flex align-items-center gap-1"
            style="font-size: 12px;"
          >
            <span>📌</span>
            <span>Главная</span>
          </div>

          <!-- DELETE -->
          <button
            class="btn btn-sm btn-light rounded-circle position-absolute top-0 end-0 m-2 shadow-sm"
            style="width: 28px; height: 28px;"
            @click.stop="removeImage(item)"
            type="button"
          >
            ✕
          </button>

          <!-- STATUS -->
          <div class="position-absolute bottom-0 start-0 p-2">
            <span
              class="badge rounded-pill"
              :class="item.tooMany ? 'bg-danger' : item.isNew ? 'bg-success' : 'bg-secondary'"
            >
              {{ item.tooMany ? 'Не загрузится' : item.isNew ? 'Новое' : 'С сервера' }}
            </span>
          </div>
        </div>
      </div>

      <!-- ADD CARD -->
      <div class="col-6 col-md-4 col-xl-3">
        <label
          class="card h-100 border rounded-4 d-flex align-items-center justify-content-center text-muted"
          style="cursor:pointer;"
        >
          <input
            type="file"
            class="d-none"
            multiple
            accept="image/*"
            @change="onFilesSelected"
          />

          <div class="ratio ratio-1x1 bg-light d-flex align-items-center justify-content-center w-100">
            <div class="ratio ratio-1x1 bg-light w-100 position-relative">
              <div class="position-absolute top-50 start-50 translate-middle d-flex flex-column align-items-center justify-content-center text-center">
                <div style="font-size: 28px; line-height: 1;">＋</div>
                <div class="small">Добавить</div>
              </div>
            </div>

          </div>
        </label>
      </div>
    </div>

    <!-- HINT -->
    <div class="small text-secondary mt-3 d-flex align-items-start gap-2">
      <span>⚡</span>
      <span>
        Качественные фотографии увеличивают шансы на отклик. Перетащите карточки, чтобы изменить порядок.
      </span>
    </div>

  </div>
</section>

            <div class="d-flex justify-content-end">
              <button type="submit" class="btn btn-primary btn-lg rounded-pill px-4 px-lg-5" :disabled="Boolean(editDisabledReason) || Boolean(titleError) || Boolean(priceError)">
                Сохранить изменения
              </button>
            </div>
          </form>
        </div>
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