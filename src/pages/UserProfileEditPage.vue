<script setup>
import { ref, computed, watchEffect } from 'vue'
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

// derive the actual src value for preview: if editData.avatarPath is a data URL
// (chosen file) we use it directly; otherwise convert server path to absolute
const avatarPreview = computed(() => {
  const v = editData.value.avatarPath
  if (!v) return ''
  if (/^data:/.test(v) || /^blob:/.test(v) || /^https?:\/\//.test(v)) return v
  return resolveMediaUrl(v)
})

const profileId = computed(() => parseInt(route.params.id) || userStore.user?.userId)
const isOwnProfile = computed(() => profileId.value === userStore.user?.userId)

// redirect bare /profile to include id
watchEffect(() => {
  if (!route.params.id && profileId.value) {
    router.replace(`/users/${profileId.value}`)
  }
})

// if the user tries to edit someone else's profile, send them back
watchEffect(() => {
  if (profileId.value && !isOwnProfile.value) {
    router.replace(`/users/${profileId.value}`)
  }
})

// load profile when id changes
watchEffect(async () => {
  if (!profileId.value) return

  error.value = ''
  try {
    profile.value = await userStore.fetchProfile(profileId.value)
    if (profile.value) {
      editData.value.userName = profile.value.userName || ''
      editData.value.userLogin = profile.value.userLogin || ''
      editData.value.avatarPath = profile.value.avatarPath || ''
      editData.value.userEmail = profile.value.userEmail || ''
      editData.value.userPhoneNumber = profile.value.userPhoneNumber || ''
      editData.value.password = ''
      editData.value.passwordConfirm = ''
      avatarFile.value = null
    }
  } catch (errorValue) {
    profile.value = null
    const apiError = await handleApiError(errorValue, { notify: false })
    error.value = toPublicErrorMessage(apiError, 'Ошибка при загрузке профиля')
  }
})

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
    const original = profile.value?.[k] || ''
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
  <div class="container">
    <h1 class="mb-4">Редактирование профиля</h1>
    <p v-if="error" class="alert alert-danger">{{ error }}</p>

    <div v-if="profile" class="card p-4">
      <form @submit.prevent="saveProfile" autocomplete="off" novalidate>
        <label>Имя:</label>
        <input name="nope_1" autocomplete="off" v-model="editData.userName" class="form-control mb-2" placeholder="Имя">
        <label>Логин:</label>
        <input name="nope_2" autocomplete="off" v-model="editData.userLogin" class="form-control mb-2" placeholder="Логин">
        <label>Email:</label>
        <input name="nope_3" autocomplete="off" type="email" v-model="editData.userEmail" class="form-control mb-2" placeholder="Email">
        <label>Телефон:</label>
        <input name="nope_4" autocomplete="off" v-model="editData.userPhoneNumber" class="form-control mb-2" placeholder="Телефон">
        <label>Сменить пароль:</label>
        <input name="newpw" autocomplete="new-password" type="password" v-model="editData.password" class="form-control mb-2" placeholder="Новый пароль">
        <input name="newpw_confirm" autocomplete="new-password" type="password" v-model="editData.passwordConfirm" class="form-control mb-2" placeholder="Повторите пароль">
        <label>Аватар:</label>
        <input name="nope_5" autocomplete="off" type="file" @change="onFileChange" class="form-control mb-2" accept="image/*">
        <div v-if="avatarPreview" class="mb-2">
          <img :src="avatarPreview" class="img-thumbnail" style="max-width: 150px" alt="preview">
        </div>
        <button class="btn btn-success me-2" type="submit">Сохранить</button>
        <button class="btn btn-secondary" type="button" @click="cancel">Отмена</button>
      </form>
    </div>

    <p v-else class="text-muted">Загрузка...</p>
  </div>
</template>
