<script setup>
const props = defineProps({
  msg: {
    type: Object,
    required: true,
  },
  brokenMedia: {
    type: Object,
    default: () => ({}),
  },
  actionsDisabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'open-media',
  'jump-to-reply',
  'retry',
  'edit',
  'delete',
  'media-loaded',
  'media-error',
])

function openMedia(index) {
  emit('open-media', { message: props.msg, index })
}

function jumpToReply() {
  emit('jump-to-reply', props.msg.replyToMessageId)
}

function retryMessage() {
  emit('retry', props.msg)
}

function editMessage() {
  emit('edit', props.msg)
}

function deleteMessage() {
  emit('delete', props.msg)
}

function onMediaLoaded(attachment) {
  emit('media-loaded', { message: props.msg, attachment })
}

function onMediaError(attachment) {
  emit('media-error', { message: props.msg, attachment })
}
</script>

<template>
  <div :id="msg.domId" :data-message-id="msg.id" class="d-flex mb-3" :class="msg.isMine ? 'justify-content-end' : 'justify-content-start'">
    <div v-if="!msg.isMine" class="rounded-circle flex-shrink-0 me-2 align-self-end overflow-hidden bg-secondary-subtle border d-flex align-items-center justify-content-center text-secondary" style="width: 30px; height: 30px; font-size: 0.75rem; font-weight: 600;">
      <img v-if="msg.authorAvatarUrl" :src="msg.authorAvatarUrl" class="w-100 h-100" style="object-fit: cover;" alt="">
      <span v-else>{{ msg.authorInitial }}</span>
    </div>

    <div class="d-inline-block min-w-0" :style="msg.contentStyle">
      <div v-if="!msg.isMine" class="small text-secondary mb-1 ms-1">{{ msg.authorName ?? msg.authorId ?? 'нет данных' }}</div>
      <div
        class="px-3 py-2 px-lg-4 py-lg-3 rounded-4 shadow-sm border position-relative"
        :class="[
          msg.bubbleClass,
          msg.deleted || msg.deletedAt ? 'opacity-50' : '',
          msg.isBusy ? 'opacity-75' : ''
        ]"
        :style="msg.bubbleRadiusStyle"
      >
        <div v-if="msg.deleted || msg.deletedAt" class="fst-italic small">Сообщение удалено</div>
        <div v-else>
          <div v-if="msg.replyToMessageId" class="mb-2 rounded-3 border-start border-3 border-secondary-subtle bg-body-tertiary px-2 py-1 small">
            <template v-if="msg.replyMessage">
              <div class="fw-semibold text-truncate">{{ msg.replyMessage.authorName || 'Сообщение' }}</div>
              <div class="text-truncate">{{ msg.replyMessage.previewText }}</div>
            </template>
            <template v-else>
              <div class="fw-semibold text-truncate">Ответ на сообщение #{{ msg.replyToMessageId }}</div>
            </template>
            <button type="button" class="btn btn-link p-0 small text-decoration-none" :disabled="actionsDisabled" @click="jumpToReply">Перейти к сообщению</button>
          </div>

          <div v-if="msg.mediaAttachments.length" class="mt-2 w-100">
            <div v-if="msg.mediaAttachments.length === 1">
              <button class="btn p-0 border border-primary-subtle rounded-4 overflow-hidden bg-white w-100" type="button" :disabled="actionsDisabled" @click="openMedia(0)">
                <img
                  v-if="msg.mediaAttachments[0].isImage"
                  :src="msg.mediaAttachments[0].src"
                  class="w-100 d-block"
                  style="max-height: 320px; object-fit: cover;"
                  :data-msg-id="msg.domId"
                  :data-att-key="msg.mediaAttachments[0].key"
                />
                <div v-else class="position-relative w-100">
                  <div v-if="brokenMedia[msg.mediaKeyPrefix + msg.mediaAttachments[0].key]" class="w-100 d-flex justify-content-center align-items-center" style="aspect-ratio:16/9;">
                    <span class="small text-muted">Видео недоступно</span>
                  </div>
                  <template v-else>
                    <video
                      class="w-100 d-block"
                      style="max-height: 320px; background:#000;"
                      preload="metadata"
                      playsinline
                      @loadeddata="onMediaLoaded(msg.mediaAttachments[0])"
                      @error="onMediaError(msg.mediaAttachments[0])"
                      :data-msg-id="msg.domId"
                      :data-att-key="msg.mediaAttachments[0].key"
                    >
                      <source :src="msg.mediaAttachments[0].src" />
                    </video>
                    <div class="position-absolute top-50 start-50 translate-middle" style="width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.75);backdrop-filter:blur(4px);box-shadow:0 0 0 2px rgba(0,180,255,.4);pointer-events:none;display:flex;align-items:center;justify-content:center;">
                      <div style="width:0;height:0;border-left:12px solid #000;border-top:8px solid transparent;border-bottom:8px solid transparent;margin-left:3px;"></div>
                    </div>
                  </template>
                </div>
              </button>
            </div>

            <div v-else class="d-flex flex-wrap gap-1" style="min-width:0;">
              <button
                v-for="(att, i) in msg.mediaAttachments"
                :key="att.key"
                class="btn p-0 border border-primary-subtle rounded-3 overflow-hidden bg-white flex-fill"
                :style="msg.mediaAttachments.length === 2
                  ? 'min-width:0; flex-basis: calc(50% - 4px); max-width: calc(50% - 4px);'
                  : msg.mediaAttachments.length === 3
                    ? (i === 0 ? 'min-width:0; flex-basis:100%; max-width:100%;' : 'min-width:0; flex-basis:calc(50% - 4px); max-width:calc(50% - 4px);')
                    : msg.mediaAttachments.length === 4
                      ? 'min-width:0; flex-basis:calc(50% - 4px); max-width:calc(50% - 4px);'
                      : 'min-width:0; flex-basis:calc(33.333% - 5px); max-width:calc(33.333% - 5px);'
                "
                type="button"
                :disabled="actionsDisabled"
                @click="openMedia(i)"
              >
                <img
                  v-if="att.isImage"
                  :src="att.src"
                  class="w-100 d-block"
                  :data-msg-id="msg.domId"
                  :data-att-key="att.key"
                  :style="msg.mediaAttachments.length === 3 && i === 0
                    ? 'aspect-ratio:16/9; object-fit:cover;'
                    : 'aspect-ratio:1/1; object-fit:cover;'
                  "
                />
                <div v-else class="position-relative w-100">
                  <div v-if="brokenMedia[msg.mediaKeyPrefix + att.key]" class="w-100 d-flex justify-content-center align-items-center" :style="msg.mediaAttachments.length === 3 && i === 0 ? 'aspect-ratio:16/9;' : 'aspect-ratio:1/1;'">
                    <span class="small text-muted">Видео недоступно</span>
                  </div>
                  <template v-else>
                    <video
                      class="w-100 d-block"
                      :data-msg-id="msg.domId"
                      :data-att-key="att.key"
                      :style="(msg.mediaAttachments.length === 3 && i === 0 ? 'aspect-ratio:16/9;' : 'aspect-ratio:1/1;') + ' object-fit:cover; background:#000;'"
                      preload="metadata"
                      playsinline
                      @loadeddata="onMediaLoaded(att)"
                      @error="onMediaError(att)"
                    >
                      <source :src="att.src" />
                    </video>
                    <div class="position-absolute top-50 start-50 translate-middle" style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.75);backdrop-filter:blur(4px);box-shadow:0 0 0 2px rgba(0,180,255,.4);pointer-events:none;display:flex;align-items:center;justify-content:center;">
                      <div style="width:0;height:0;border-left:10px solid #000;border-top:6px solid transparent;border-bottom:6px solid transparent;margin-left:2px;"></div>
                    </div>
                  </template>
                </div>
              </button>
            </div>
          </div>

          <template v-if="msg.audioAttachments.length">
            <div class="d-flex flex-column gap-2 mt-2">
              <div
                v-for="att in msg.audioAttachments"
                :key="`${msg.id}-audio-${att.key}`"
                class="w-100 min-w-0 overflow-hidden bg-white border border-light-subtle rounded-5 p-2 shadow-sm"
              >
                <div class="d-flex align-items-center gap-2 mb-3 min-w-0 overflow-hidden">
                  <span class="flex-shrink-0 rounded-circle bg-primary-subtle text-primary d-inline-flex align-items-center justify-content-center border-0 shadow-sm" style="width: 40px; height: 40px; opacity: 0.7">{{ att.kindEmoji }}</span>
                  <div class="min-w-0 flex-grow-1 overflow-hidden">
                    <div class="fw-semibold text-truncate d-block" :title="att.name">{{ att.name }}</div>
                    <div class="small text-secondary text-truncate d-block">{{ att.kindLabel }}</div>
                  </div>
                </div>
                <audio class="w-100 d-block" controls preload="metadata" :src="att.src">
                  Ваш браузер не поддерживает воспроизведение аудио.
                </audio>
              </div>
            </div>
          </template>

          <template v-if="msg.fileAttachments.length">
            <div class="d-flex flex-column gap-1 mt-2">
              <a
                v-for="att in msg.fileAttachments"
                :key="`${msg.id}-file-${att.key}`"
                :href="att.src"
                target="_blank"
                rel="noopener"
                class="text-decoration-none"
              >
                <div class="d-flex align-items-center gap-3 rounded-4 border bg-body-tertiary px-3 py-2 shadow-sm">
                  <div class="rounded-circle bg-white border d-inline-flex align-items-center justify-content-center flex-shrink-0" style="width: 42px; height: 42px;">
                    <span>{{ att.kindEmoji }}</span>
                  </div>
                  <div class="min-w-0 flex-grow-1">
                    <div class="fw-semibold text-body text-truncate">{{ att.name }}</div>
                    <div class="small text-secondary text-truncate">{{ att.kindLabel }}</div>
                  </div>
                  <span class="badge rounded-pill text-bg-light border text-secondary flex-shrink-0">Открыть</span>
                </div>
              </a>
            </div>
          </template>

          <p
            v-if="msg.text"
            class="mb-0 text-break"
            :class="msg.mediaAttachments.length || msg.audioAttachments.length || msg.fileAttachments.length ? 'mt-2' : ''"
            style="white-space: pre-wrap;"
          >{{ msg.text }}</p>

          <div v-if="msg.statusText" class="d-flex align-items-center justify-content-between gap-2 flex-wrap mt-2 small">
            <span v-if="msg.isBusy" class="text-secondary d-inline-flex align-items-center gap-2">
              <span class="spinner-border spinner-border-sm" style="width: 0.7rem; height: 0.7rem;" role="status" aria-hidden="true"></span>
              {{ msg.statusText }}
            </span>
            <span v-else-if="msg.isFailed" class="text-danger">{{ msg.statusText }}</span>
            <span v-else class="text-secondary">{{ msg.statusText }}</span>
            <button v-if="msg.isFailed" type="button" class="btn btn-link btn-sm p-0 text-primary text-decoration-none" :disabled="actionsDisabled" @click="retryMessage">Повторить</button>
          </div>
        </div>

        <div v-if="msg.showReceipt" class="d-flex align-items-center justify-content-end gap-1 mt-2">
          <small :class="msg.readReceipt.cls" style="font-size: 0.72rem;">{{ msg.readReceipt.icon }}</small>
          <small class="text-secondary" style="font-size: 0.72rem;">{{ msg.timeLabel }}</small>
          <small v-if="msg.edited" class="text-secondary" style="font-size: 0.72rem;">· изм.</small>
        </div>
        <div v-else class="d-flex align-items-center justify-content-end gap-1 mt-2">
          <small class="text-secondary" style="font-size: 0.72rem;">{{ msg.timeLabel }}</small>
        </div>
      </div>

      <div class="d-flex justify-content-end gap-2 mt-1 px-1">
        <button v-if="msg.canEdit" class="btn btn-link btn-sm p-0 text-secondary text-decoration-none" style="font-size: 0.74rem;" type="button" :disabled="actionsDisabled" @click="editMessage">Изменить</button>
        <button v-if="msg.canDelete" class="btn btn-link btn-sm p-0 text-danger text-decoration-none" style="font-size: 0.74rem;" type="button" :disabled="actionsDisabled" @click="deleteMessage">{{ msg.deleteLabel }}</button>
      </div>
    </div>
  </div>
</template>
