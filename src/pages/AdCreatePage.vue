<script setup>
    import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
    import { useRouter } from 'vue-router'
    import Sortable from 'sortablejs'
    import { useAdsStore } from '../stores/adsStore'
    import { useCategoriesStore } from '../stores/categoriesStore'
    import LocationAutocomplete from '../components/LocationAutocomplete.vue'
    import { mapApiToLocation, mapLocationToApi } from '../composables/useLocationMapper'

    const adsStore = useAdsStore()
    const categoriesStore = useCategoriesStore()
    const router = useRouter()

    const URL = window.URL || globalThis.URL
    const MAX_IMAGES = 10

    const title = ref('')
    const description = ref('')
    const price = ref('')
    const isNegotiable = ref(false)
    const categoryId = ref('')
    const selectedLocation = ref(null)
    const type = ref('')
    const error = ref('')

    const images = ref([]) // { localId, file, isNew, isMain }
    const imagesListRef = ref(null)
    const fileInputRef = ref(null)
    const objectUrlCache = new Map()
    let sortable = null

    function makeLocalId() {
        return typeof crypto?.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    }

    function createImageItem({ file, isMain = false, isNew = true }) {
        return {
            localId: makeLocalId(),
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
        if (!item?.file) return ''
        if (!objectUrlCache.has(item.localId)) {
            objectUrlCache.set(item.localId, URL.createObjectURL(item.file))
        }
        return objectUrlCache.get(item.localId)
    }

    function revokePreviewUrl(item) {
        const url = objectUrlCache.get(item.localId)
        if (url) {
            URL.revokeObjectURL(url)
            objectUrlCache.delete(item.localId)
        }
    }

    function setMainImage(item) {
        images.value.forEach(i => (i.isMain = i.localId === item.localId))
    }

    function removeImage(item) {
        const idx = images.value.findIndex(i => i.localId === item.localId)
        if (idx === -1) return

        images.value.splice(idx, 1)
        revokePreviewUrl(item)

        if (item.isMain && images.value.length) {
            images.value[0].isMain = true
        }

        refreshTooManyFlags()
    }

    function addFiles(files) {
        const selected = Array.from(files)
        error.value = ''

        const newItems = selected.map(file =>
            createImageItem({ file, isNew: true, isMain: false })
        )

        const hasMain = images.value.some(i => i.isMain) || newItems.some(i => i.isMain)
        if (!hasMain && newItems.length) {
            newItems[0].isMain = true
        }

        images.value.push(...newItems)
        refreshTooManyFlags()

        if (images.value.length > MAX_IMAGES) {
            error.value = `Загружено больше ${MAX_IMAGES} файлов — первые ${MAX_IMAGES} будут отправлены, остальные будут выделены красным.`
        }
    }

    function onFilesSelected(e) {
        addFiles(e.target.files)
        if (fileInputRef.value) {
            fileInputRef.value.value = ''
        }
    }

    function initSortable() {
        if (!imagesListRef.value) return

        if (sortable) {
            sortable.destroy()
            sortable = null
        }

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

    async function handleCreate() {
        try {
            error.value = ''

            const form = new FormData()
            form.append('title', title.value)
            form.append('description', description.value)
            if (isNegotiable.value) {
                form.append('isNegotiable', 'true')
            }
            if (price.value !== '' && price.value != null) {
                form.append('price', price.value)
            }
            form.append('categoryId', categoryId.value)
            if (selectedLocation.value?.type === 'region') {
                error.value = 'Выберите город или район'
                return
            }
            const locationPayload = mapLocationToApi(selectedLocation.value)
            if (locationPayload.CityId != null) {
                form.append('CityId', String(locationPayload.CityId))
            }
            if (locationPayload.DistrictId != null) {
                form.append('DistrictId', String(locationPayload.DistrictId))
            }
            form.append('type', type.value)

            if (images.value.length > 0) {
                const uploadItems = images.value.filter(i => !i.tooMany)

                // Choose main index only among uploaded images.
                let mainIndex = uploadItems.findIndex(i => i.isMain)
                if (mainIndex < 0 && uploadItems.length) {
                    // If main is in the overflow part, fallback to the first uploaded.
                    uploadItems[0].isMain = true
                    mainIndex = 0
                }

                if (mainIndex >= 0) {
                    form.append('mainImageIndex', mainIndex)
                }

                uploadItems.forEach(i => {
                    if (i.file) {
                        form.append('files', i.file)
                    }
                })
            }

            const created = await adsStore.createAdWithImages(form)

            // API sometimes returns string `'undefined'` or `'null'`; normalize.
            const rawId = created?.id ?? created?.adId
            const normalizedId = rawId == null ? null : String(rawId).trim()
            const numericId = Number(normalizedId)

            if (normalizedId && Number.isFinite(numericId)) {
                router.push({ path: `/ads/${numericId}`, query: { message: 'Объявление отправлено на модерацию' } })
                return
            }

            error.value = 'Сервер вернул некорректный id (ожидался числовой). Проверь API.'
        } catch (e) {
            console.error('Error during ad creation:', e)
            error.value = e.message || 'Ошибка создания объявления'
        }
    }

    onMounted(async () => {
        categoriesStore.loadCategories()
        await nextTick()
        initSortable()
    })

    watch(
        () => images.value.length,
        async () => {
            // Re-init sortable when items are added/removed.
            await nextTick()
            initSortable()
        }
    )

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
                <h1 class="mb-4">Создать объявление</h1>
                <div v-if="error" class="alert alert-danger">{{ error }}</div>
                <form @submit.prevent="handleCreate">
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
                                <div class="text-muted small">Перетащите для изменения порядка. Только первые {{ MAX_IMAGES }} будут загружены.</div>
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
                                    style="max-height:100px" />

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
                                        @change="() => setMainImage(item)"
                                        :disabled="item.tooMany"
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

                    <button type="submit" class="btn btn-primary">Создать</button>
                </form>
            </div>
        </div>
    </div>
</template>

<style scoped>
    .sortable-ghost {
        opacity: 0.6;
        transform: scale(0.98);
    }

    .sortable-chosen {
        opacity: 0.8;
    }

    [draggable="true"] {
        user-select: none;
    }
</style>
