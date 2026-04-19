<script setup>
    import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
    import { useRouter } from 'vue-router'
    import Sortable from 'sortablejs'
    import { useAdsStore } from '../stores/adsStore'
    import { useCategoriesStore } from '../stores/categoriesStore'
    import LocationCascade from '../components/LocationCascade.vue'
    import { mapLocationIdToApi } from '../composables/useLocationMapper'
    import { useAccessService } from '../services/accessService'

    const adsStore = useAdsStore()
    const categoriesStore = useCategoriesStore()
    const access = useAccessService()
    const router = useRouter()

    const URL = window.URL || globalThis.URL
    const MAX_IMAGES = 10
    const DESCRIPTION_MAX = 2000

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

    const createDisabledReason = computed(() => {
        return access.getCreateAdBlockedReason() || access.getRateLimitReason() || ''
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

    async function handleCreate() {
        try {
            error.value = ''

            if (createDisabledReason.value) {
                error.value = createDisabledReason.value
                return
            }

            // Mark that the user attempted to submit so required-only errors show
            attemptedSubmit.value = true

            // Prevent submit if inline validation errors exist
            if (titleError.value || priceError.value) {
                focusFirstInvalid()
                return
            }

            if (selectedLocationId.value == null) {
                error.value = 'Выберите локацию'
                return
            }
            const locationPayload = mapLocationIdToApi(selectedLocationId.value)

            let resolvedMainIndex = null
            let uploadFiles = []
            if (images.value.length > 0) {
                const uploadItems = images.value.filter(i => !i.tooMany)

                const mainIndex = uploadItems.findIndex(i => i.isMain)
                if (mainIndex > 0) {
                    const [mainItem] = uploadItems.splice(mainIndex, 1)
                    uploadItems.unshift(mainItem)
                } else if (mainIndex < 0 && uploadItems.length) {
                    uploadItems[0].isMain = true
                }

                resolvedMainIndex = uploadItems.findIndex(i => i.isMain)
                uploadFiles = uploadItems.map(i => i.file).filter(Boolean)
            }

            const priceToSend = (price.value === '' || price.value == null)
                ? null
                : Number(String(price.value).trim())

            const created = await adsStore.createAd({
                title: title.value,
                description: description.value,
                price: priceToSend,
                isNegotiable: isNegotiable.value,
                categoryId: categoryId.value,
                locationId: locationPayload.locationId,
                listingType: type.value,
                mainImageIndex: resolvedMainIndex >= 0 ? resolvedMainIndex : null,
                files: uploadFiles,
            })

            // API sometimes returns string `'undefined'` or `'null'`; normalize.
            const rawId = created?.adId ?? created?.id
            const normalizedId = rawId == null ? null : String(rawId).trim()
            const numericId = Number(normalizedId)

            if (normalizedId && Number.isFinite(numericId)) {
                attemptedSubmit.value = false
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
    <div class="container py-4 py-lg-5">
        <div class="mx-auto" style="max-width: 1120px;">
            <div class="rounded-5 border bg-body-tertiary shadow-lg overflow-hidden">
                <div class="border-bottom px-4 px-lg-5 py-4 py-lg-5">
                    <div class="d-flex flex-column flex-lg-row justify-content-between align-items-start gap-4">
                        <div class="flex-grow-1">
                            <div class="small text-uppercase text-secondary fw-semibold mb-2">Создание объявления</div>
                            <h1 class="display-6 fw-semibold mb-2">Создать объявление</h1>
                            <p class="text-secondary mb-0 fs-5">
                                Заполните базовые поля, локацию, тип и фотографии в одном аккуратном экране.
                            </p>
                        </div>

                        <div class="text-lg-end">
                            <div class="mt-3 d-inline-flex flex-wrap gap-2 justify-content-lg-end">
                                <span class="badge rounded-pill text-bg-light border text-secondary px-3 py-2">
                                    {{ images.length }} / {{ MAX_IMAGES }} фото
                                </span>
                                <span class="badge rounded-pill text-bg-light border text-secondary px-3 py-2">
                                    Порядок можно менять
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="px-4 px-lg-5 py-4 py-lg-5">
                    <div v-if="createDisabledReason" class="alert alert-warning rounded-4 border-0 shadow-sm">{{ createDisabledReason }}</div>
                    <div v-if="error" class="alert alert-danger rounded-4 border-0 shadow-sm">{{ error }}</div>

                    <form @submit.prevent="handleCreate" class="d-grid gap-4">
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
                                        <div class="text-secondary small">Выберите местоположение и тип объявления.</div>
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
                                        <select v-model="type" class="form-select rounded-3">
                                            <option value="" disabled>Выберите тип</option>
                                            <option value="sell">Продажа</option>
                                            <option value="buy">Покупка</option>
                                            <option value="service">Услуга</option>
                                        </select>

                                        <div class="mt-3 p-3 rounded-4 bg-white border shadow-sm">
                                            <div class="fw-semibold mb-1">Подсказка</div>
                                            <div class="small text-secondary mb-0">
                                                Проверьте локацию и тип перед отправкой. После создания объявление уйдёт на модерацию.
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section class="card border-0 shadow-sm rounded-4">
                            <div class="card-body p-4 p-lg-5">
                                <div class="d-flex justify-content-between align-items-start mb-3">
                                    <div>
                                        <div class="small text-uppercase text-secondary fw-semibold mb-1">Изображения</div>
                                        <div class="text-secondary small">Добавляйте фото, меняйте порядок и выбирайте главное.</div>
                                    </div>

                                    <div class="small text-secondary">
                                        Загружено {{ images.length }} из {{ MAX_IMAGES }}
                                    </div>
                                </div>

                                <div v-if="!images.length" class="border rounded-4 bg-body-tertiary text-center p-5 mb-3">
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
                                            JPEG, JPG, PNG. Можно загрузить до {{ MAX_IMAGES }} файлов.
                                        </div>

                                        <div class="btn btn-light border">
                                            Добавить фотографии
                                        </div>
                                    </label>
                                </div>

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
                                                    :alt="item.file?.name || 'Изображение объявления'"
                                                />
                                            </div>

                                            <div
                                                v-if="item.isMain"
                                                class="position-absolute top-0 start-0 m-2 px-2 py-1 rounded-pill bg-primary text-white d-flex align-items-center gap-1"
                                                style="font-size: 12px;"
                                            >
                                                <span>📌</span>
                                                <span>Главная</span>
                                            </div>

                                            <button
                                                class="btn btn-sm btn-light rounded-circle position-absolute top-0 end-0 m-2 shadow-sm"
                                                style="width: 28px; height: 28px;"
                                                @click.stop="removeImage(item)"
                                                type="button"
                                            >
                                                ✕
                                            </button>

                                            <div class="position-absolute bottom-0 start-0 p-2">
                                                <span
                                                    class="badge rounded-pill"
                                                    :class="item.tooMany ? 'bg-danger' : 'bg-success'"
                                                >
                                                    {{ item.tooMany ? 'Не загрузится' : 'Новое' }}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="col-6 col-md-4 col-xl-3">
                                        <label class="card h-100 border rounded-4 d-flex align-items-center justify-content-center text-muted" style="cursor:pointer;">
                                            <input
                                                ref="fileInputRef"
                                                type="file"
                                                class="d-none"
                                                multiple
                                                accept="image/*"
                                                @change="onFilesSelected"
                                            />

                                            <div class="ratio ratio-1x1 bg-light w-100 position-relative">
                                                <div class="position-absolute top-50 start-50 translate-middle d-flex flex-column align-items-center justify-content-center text-center">
                                                    <div style="font-size: 28px; line-height: 1;">＋</div>
                                                    <div class="small">Добавить</div>
                                                </div>
                                            </div>

                                        </label>
                                    </div>
                                </div>

                                <div class="small text-secondary mt-3 d-flex align-items-start gap-2">
                                    <span>⚡</span>
                                    <span>
                                        Качественные фотографии увеличивают шансы на отклик. Перетащите карточки, чтобы изменить порядок.
                                    </span>
                                </div>
                            </div>
                        </section>

                        <div class="d-flex justify-content-end">
                            <button type="submit" class="btn btn-primary btn-lg rounded-pill px-4 px-lg-5" :disabled="Boolean(createDisabledReason) || Boolean(titleError) || Boolean(priceError)">
                                Создать объявление
                            </button>
                        </div>
                    </form>
                </div>
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
