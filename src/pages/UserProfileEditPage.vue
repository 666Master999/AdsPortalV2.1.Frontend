<script setup>
import { ref, computed, watch } from 'vue'
import { useUserStore } from '../stores/userStore'
import { useRoute, useRouter } from 'vue-router'
import { handleApiError, toPublicErrorMessage } from '../services/errorService'
import { resolveMediaUrl } from '../utils/resolveMediaUrl'
import { serializePatchIssues } from '../utils/patchResult'

const userStore = useUserStore()
const route = useRoute()
const router = useRouter()

const error = ref('')
const profile = ref(null)
const isLoading = ref(false)
const avatarFile = ref(null)
const editData = ref({
  userName: '',
  userLogin: '',
  avatarPath: '',
  userEmail: '',
  userPhoneNumber: '',
  password: '',
  passwordConfirm: ''
})

const currentUserId = computed(() => userStore.tokenUserId ?? userStore.user?.id ?? userStore.user?.userId ?? null)
const routeProfileId = computed(() => {
  const parsed = Number(route.params.id)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
})
const profileId = computed(() => routeProfileId.value ?? currentUserId.value)
const isOwnProfile = computed(() => currentUserId.value != null && profileId.value != null && String(profileId.value) === String(currentUserId.value))

// derive the actual src value for preview: if editData.avatarPath is a data URL
// (chosen file) we use it directly; otherwise convert server path to absolute
const avatarPreview = computed(() => {
  const v = editData.value.avatarPath
  if (!v) return ''
  if (/^data:/.test(v) || /^blob:/.test(v) || /^https?:\/\//.test(v)) return v
  return resolveMediaUrl(v)
})

watch([profileId, currentUserId], ([profileIdValue, currentUserIdValue]) => {
  if (!profileIdValue || currentUserIdValue == null) return

  if (String(profileIdValue) !== String(currentUserIdValue)) {
    router.replace(`/users/${profileIdValue}`)
  }
}, { immediate: true })

function syncEditData(source) {
  if (!source || typeof source !== 'object') return

  profile.value = source
  editData.value.userName = source.userName ?? ''
  editData.value.userLogin = source.userLogin ?? ''
  editData.value.avatarPath = source.avatarPath ?? ''
  editData.value.userEmail = source.userEmail ?? ''
  editData.value.userPhoneNumber = source.userPhoneNumber ?? ''
  editData.value.password = ''
  editData.value.passwordConfirm = ''
  avatarFile.value = null
}

let profileLoadToken = 0

watch(profileId, async profileIdValue => {
  if (!profileIdValue) return

  const requestToken = ++profileLoadToken
  error.value = ''
  isLoading.value = true

  try {
    if (isOwnProfile.value && userStore.user && String(userStore.user.id ?? userStore.user.userId ?? '') === String(profileIdValue)) {
      syncEditData(userStore.user)
    }

    const data = await userStore.fetchProfileDeduped(profileIdValue)
    if (requestToken !== profileLoadToken) return

    if (data) {
      syncEditData(data)
    }
  } catch (errorValue) {
    if (requestToken !== profileLoadToken) return
    const apiError = await handleApiError(errorValue, { notify: false })
    error.value = toPublicErrorMessage(apiError, 'Ошибка при загрузке профиля')
  } finally {
    if (requestToken === profileLoadToken) {
      isLoading.value = false
    }
  }
}, { immediate: true })

// file input handler saves File and preview
function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  avatarFile.value = file
  const reader = new FileReader()
  reader.onload = () => {
    editData.value.avatarPath = reader.result
  }
  reader.readAsDataURL(file)
}

// save: upload avatar via userStore.uploadAvatar then patch profile
async function saveProfile() {
  error.value = ''

  // password confirmation
  if (editData.value.password && editData.value.password !== editData.value.passwordConfirm) {
    error.value = 'Пароли не совпадают'
    return
  }

  // build payload of changed fields
  const payload = {}
  const keys = ['userName','userLogin','avatarPath','userEmail','userPhoneNumber']
  const updated = []
  const skipped = []

  keys.forEach(k => {
    const original = profile.value?.[k] ?? ''
    if (editData.value[k] !== original) {
      payload[k] = editData.value[k]
      updated.push(k)
    } else {
      skipped.push(k)
    }
  })

  if (editData.value.password) {
    payload.password = editData.value.password
    updated.push('password')
  }

  try {
    // upload avatar if a new file was selected
    if (avatarFile.value) {
      const uploadJson = await userStore.uploadAvatar(profileId.value, avatarFile.value)
      const serverPath =
        uploadJson?.user?.avatarPath ||
        uploadJson?.avatarPath

      if (!serverPath) throw new Error('Сервер не вернул путь к аватару')

      payload.avatarPath = serverPath
      if (!updated.includes('avatarPath')) updated.push('avatarPath')
    }

    // patch profile
    const result = await userStore.updateProfile(profileId.value, payload)

    // clear local file on success
    avatarFile.value = null

    // redirect with updated/skipped info. prefer server arrays if present
    router.push({
      path: `/users/${profileId.value}`,
      query: {
        updated: (result.updated?.join(',') || updated.join(',')) || '',
        skipped: serializePatchIssues(result.skipped?.length ? result.skipped : skipped),
        errors: serializePatchIssues(result.errors),
      }
    })
  } catch (errorValue) {
    // keep avatarFile so user can retry, but show error
    const apiError = await handleApiError(errorValue, { notify: false })
    error.value = toPublicErrorMessage(apiError, 'Не удалось сохранить профиль')
  }
}

function cancel() {
  router.push(`/users/${profileId.value}`)
}
</script>

<template>
  <div class="container-fluid px-3 px-lg-4 py-3 py-lg-4" >
    <div class="mx-auto rounded-5 border bg-body-tertiary shadow-lg overflow-hidden" style="max-width: 1520px; min-height: 90vh; box-sizing: border-box; display: flex; flex-direction: column;">
      <div class="px-3 px-lg-4 py-3 border-bottom bg-white d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
        <div>
          <div class="small text-uppercase text-secondary fw-semibold mb-1">Profile</div>
          <h1 class="h3 mb-0 fw-semibold">Редактирование профиля</h1>
        </div>
        <div class="d-flex align-items-center gap-2">
          <button class="btn btn-outline-secondary rounded-pill" type="button" @click="cancel">Назад</button>
        </div>
      </div>

      <div class="p-3 p-lg-4" style="flex: 1;">
        <p v-if="error" class="alert alert-danger mb-4">{{ error }}</p>

        <div v-if="isLoading && !profile" class="d-flex justify-content-center py-5">
          <div class="spinner-border text-secondary" role="status">
            <span class="visually-hidden">Загрузка...</span>
          </div>
        </div>

        <div v-else-if="profile" class="row g-4 align-items-stretch">
          <div class="col-12 col-xl-4 d-flex">
            <div class="card border-0 shadow-sm rounded-4 h-100 w-100">
              <div class="card-body p-4 d-grid gap-4">
                <div class="d-flex align-items-center justify-content-between gap-3">
                  <div>
                    <div class="small text-uppercase text-secondary fw-semibold mb-1">Аккаунт</div>
                    <h2 class="h5 mb-0 fw-semibold">{{ profile.userName || profile.userLogin || 'Пользователь' }}</h2>
                  </div>
                  <span class="badge rounded-pill text-bg-light border text-secondary">ID {{ profileId }}</span>
                </div>

                <div class="d-flex flex-column align-items-center gap-3 text-center">
                  <div class="rounded-circle overflow-hidden border bg-body-secondary shadow-sm d-flex align-items-center justify-content-center" style="width: 180px; height: 180px;">
                    <img v-if="avatarPreview" :src="avatarPreview" class="w-100 h-100" style="object-fit: cover;" alt="preview">
                    <span v-else class="fw-semibold text-secondary" style="font-size: 3rem;">{{ (editData.userName || editData.userLogin || 'П').charAt(0).toUpperCase() }}</span>
                  </div>
                  <div class="w-100 d-grid gap-1">
                    <div class="fw-semibold text-truncate">{{ editData.userName || 'Имя не указано' }}</div>
                    <div class="text-secondary text-truncate">{{ editData.userLogin || 'Логин не указан' }}</div>
                    <div class="small text-secondary text-truncate">{{ editData.userEmail || 'Email не указан' }}</div>
                    <div class="small text-secondary text-truncate">{{ editData.userPhoneNumber || 'Телефон не указан' }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="col-12 col-xl-8 d-flex">
            <div class="card border-0 shadow-sm rounded-4 h-100 w-100">
              <div class="card-body p-4">
                <form @submit.prevent="saveProfile" autocomplete="off" novalidate class="d-grid gap-4">
                  <div class="d-grid gap-3">
                    <div class="row g-3">
                      <div class="col-12 col-md-6">
                        <label class="form-label small text-secondary fw-semibold">Имя</label>
                        <input name="nope_1" autocomplete="off" v-model="editData.userName" class="form-control rounded-pill" placeholder="Имя">
                      </div>
                      <div class="col-12 col-md-6">
                        <label class="form-label small text-secondary fw-semibold">Логин</label>
                        <input name="nope_2" autocomplete="off" v-model="editData.userLogin" class="form-control rounded-pill" placeholder="Логин">
                      </div>
                      <div class="col-12 col-md-6">
                        <label class="form-label small text-secondary fw-semibold">Email</label>
                        <input name="nope_3" autocomplete="off" type="email" v-model="editData.userEmail" class="form-control rounded-pill" placeholder="Email">
                      </div>
                      <div class="col-12 col-md-6">
                        <label class="form-label small text-secondary fw-semibold">Телефон</label>
                        <input name="nope_4" autocomplete="off" v-model="editData.userPhoneNumber" class="form-control rounded-pill" placeholder="Телефон">
                      </div>
                    </div>

                    <div>
                      <label class="form-label small text-secondary fw-semibold">Аватар</label>
                      <input name="nope_5" autocomplete="off" type="file" @change="onFileChange" class="form-control rounded-pill" accept="image/*">
                    </div>

                    <div class="row g-3">
                      <div class="col-12 col-md-6">
                        <label class="form-label small text-secondary fw-semibold">Новый пароль</label>
                        <input name="newpw" autocomplete="new-password" type="password" v-model="editData.password" class="form-control rounded-pill" placeholder="Новый пароль">
                      </div>
                      <div class="col-12 col-md-6">
                        <label class="form-label small text-secondary fw-semibold">Повторите пароль</label>
                        <input name="newpw_confirm" autocomplete="new-password" type="password" v-model="editData.passwordConfirm" class="form-control rounded-pill" placeholder="Повторите пароль">
                      </div>
                    </div>
                  </div>

                  <div class="d-flex flex-column flex-sm-row align-items-stretch align-items-sm-center justify-content-end gap-2">
                    <button class="btn btn-outline-secondary rounded-pill px-4" type="button" @click="cancel">Отмена</button>
                    <button class="btn btn-primary rounded-pill px-4" type="submit" :disabled="isLoading && !profile">Сохранить</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="text-center text-secondary py-5">Профиль не загружен</div>
      </div>
    </div>
  </div>
</template>
