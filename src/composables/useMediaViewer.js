import { ref, computed, watch } from 'vue'

export function useMediaViewer({ buildUrl, isVideoAttachment }) {
  const viewport = ref(null)
  const message = ref(null)
  const attachments = ref([])
  const index = ref(0)
  const zoom = ref(1)
  const panX = ref(0)
  const panY = ref(0)
  const swipeOffsetX = ref(0)
  const isSwiping = ref(false)
  const isCurrentVideoPaused = ref(true)
  const tapState = ref({ lastTapAt: 0, lastTapX: 0, lastTapY: 0 })
  const pointers = new Map()
  const pointerStarts = new Map()
  const pointerMoved = new Set()
  const mediaElements = new Map()
  let gesture = null
  let ignoreClickUntil = 0

  const currentAttachment = computed(() => attachments.value[index.value] || null)
  const currentRawAttachment = computed(() => {
    const a = attachments.value[index.value]
    return a && typeof a === 'object' && ('original' in a) && a.original ? a.original : a
  })
  const currentUrl = computed(() => buildUrl(currentRawAttachment.value))
  const currentIsVideo = computed(() => isVideoAttachment(currentRawAttachment.value))
  const trackStyle = computed(() => {
    const count = attachments.value.length || 1
    const step = 100 / count
    return {
      width: `${count * 100}%`,
      transform: `translateX(calc(-${index.value * step}% + ${swipeOffsetX.value}px))`,
      transition: isSwiping.value ? 'none' : 'transform 280ms ease',
    }
  })

  const imageStyle = computed(() => ({
    transform: `translate(-50%, -50%) translate3d(${panX.value}px, ${panY.value}px, 0) scale(${zoom.value})`,
    cursor: zoom.value > 1 ? 'grab' : 'zoom-in'
  }))

    // Track slides stay centered by flex layout; this transform handles pan/zoom only.
  const slideStyle = computed(() => ({
      transform: `translate3d(${panX.value}px, ${panY.value}px, 0) scale(${zoom.value})`,
     transformOrigin: 'center center',
     maxWidth: '100%',
     maxHeight: '100%',
     width: 'auto',
      height: 'auto',
      cursor: currentIsVideo.value ? 'default' : (zoom.value > 1 ? 'grab' : 'zoom-in')
  }))

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
  const getRect = () => viewport.value?.getBoundingClientRect() || null

  function resetTransform() { zoom.value = 1; panX.value = 0; panY.value = 0 }

  function resetSwipe() {
    swipeOffsetX.value = 0
    isSwiping.value = false
  }

  function resetPointers() {
    pointers.clear(); pointerStarts.clear(); pointerMoved.clear()
    gesture = null; tapState.value = { lastTapAt: 0, lastTapX: 0, lastTapY: 0 }
  }

  function resetView() { resetPointers(); resetSwipe(); resetTransform() }

  function clampPan(x, y, z) {
    const r = getRect()
    if (!r) return { x, y }
    const lx = Math.max(0, (r.width * (z - 1)) / 2)
    const ly = Math.max(0, (r.height * (z - 1)) / 2)
    return { x: clamp(x, -lx, lx), y: clamp(y, -ly, ly) }
  }

  function relPt(e) {
    const r = getRect()
    return r ? { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 } : null
  }

  function applyZoom(nz, cx, cy) {
    if (nz === 1) return resetTransform()
    const ratio = nz / zoom.value
    const bp = clampPan(cx - (cx - panX.value) * ratio, cy - (cy - panY.value) * ratio, nz)
    zoom.value = nz; panX.value = bp.x; panY.value = bp.y
  }

  function open(msg, media, startIndex = 0) {
    if (!media.length) return
    message.value = msg; attachments.value = media
    index.value = clamp(startIndex, 0, media.length - 1)
    resetView()
  }

  function close() {
    message.value = null; attachments.value = []; index.value = 0
    mediaElements.clear()
    isCurrentVideoPaused.value = true
    resetView()
  }

  function switchTo(delta) {
    const n = index.value + delta
    if (n < 0 || n >= attachments.value.length) return
    index.value = n; resetView()
  }

  function setMediaElement(key, el) {
    const normalizedKey = String(key ?? '')
    if (!normalizedKey) return
    if (el) mediaElements.set(normalizedKey, el)
    else mediaElements.delete(normalizedKey)
    syncCurrentVideoState()
  }

  function getCurrentMediaElement() {
    return mediaElements.get(String(currentAttachment.value?.key ?? '')) || null
  }

  function getCurrentVideoElement() {
    const el = getCurrentMediaElement()
    return el && typeof el.play === 'function' && 'paused' in el ? el : null
  }

  function syncCurrentVideoState() {
    const video = getCurrentVideoElement()
    isCurrentVideoPaused.value = !video || Boolean(video.paused)
  }

  function toggleCurrentVideoPlayback() {
    const video = getCurrentVideoElement()
    if (!video) return
    if (video.paused) {
      const playback = video.play?.()
      if (playback && typeof playback.catch === 'function') {
        playback.catch(() => {})
      }
    } else {
      video.pause?.()
    }
    syncCurrentVideoState()
  }

  function seekCurrentVideo(deltaSeconds) {
    const video = getCurrentVideoElement()
    if (!video) return
    const duration = Number.isFinite(video.duration) ? video.duration : null
    const targetTime = Math.max(0, Number(video.currentTime || 0) + Number(deltaSeconds || 0))
    video.currentTime = duration == null ? targetTime : Math.min(duration, targetTime)
    syncCurrentVideoState()
  }

  function onWheel(e) {
    if (!message.value) return
    e.preventDefault()
    if (!e.ctrlKey && !e.metaKey) {
      if (e.deltaY > 0) switchTo(1); else if (e.deltaY < 0) switchTo(-1)
      return
    }
    const r = getRect()
    if (!r) return
    const nz = clamp(zoom.value * (e.deltaY < 0 ? 1.12 : 0.88), 1, 4)
    const cx = e.clientX - r.left - r.width / 2, cy = e.clientY - r.top - r.height / 2
    applyZoom(nz, cx, cy)
  }

  function onClick(e) {
    if (!message.value) return
    if (Date.now() < ignoreClickUntil) return
    const ts = tapState.value, now = Date.now()
    if (ts.lastTapAt && now - ts.lastTapAt < 280) {
      tapState.value = { lastTapAt: 0, lastTapX: 0, lastTapY: 0 }
      const pt = relPt(e)
      if (pt) zoom.value <= 1 ? applyZoom(clamp(2.25, 1, 4), pt.x, pt.y) : resetTransform()
      return
    }
    const pt = relPt(e)
    tapState.value = { lastTapAt: now, lastTapX: pt?.x ?? 0, lastTapY: pt?.y ?? 0 }
  }

  function onPointerDown(e) {
    if (!message.value) return
    const p = relPt(e)
    if (!p) return
    pointers.set(e.pointerId, p); pointerStarts.set(e.pointerId, p); pointerMoved.delete(e.pointerId)
    if (pointers.size === 1) {
      gesture = zoom.value > 1
        ? { type: 'pan', pointerId: e.pointerId, startX: p.x, startY: p.y, startPanX: panX.value, startPanY: panY.value }
        : { type: 'swipe', pointerId: e.pointerId, startX: p.x, startY: p.y, axis: null }
    }
    if (pointers.size >= 2) {
      const [fId, sId] = Array.from(pointers.keys())
      const f = pointers.get(fId), s = pointers.get(sId)
      if (!f || !s) return
      gesture = { type: 'pinch', pointerIds: [fId, sId], startDistance: Math.hypot(f.x - s.x, f.y - s.y) || 1, startZoom: zoom.value, startPanX: panX.value, startPanY: panY.value }
    }
    try { (e.target || e.currentTarget)?.setPointerCapture?.(e.pointerId) } catch {}
  }

  function onPointerMove(e) {
    if (!message.value || !pointers.has(e.pointerId)) return
    const p = relPt(e)
    if (!p) return
    pointers.set(e.pointerId, p)
    const sp = pointerStarts.get(e.pointerId)
    if (sp && Math.hypot(p.x - sp.x, p.y - sp.y) > 8) pointerMoved.add(e.pointerId)
    if (gesture?.type === 'swipe' && gesture.pointerId === e.pointerId) {
      const dx = p.x - gesture.startX
      const dy = p.y - gesture.startY
      if (!gesture.axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        gesture.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
      }
      if (gesture.axis !== 'x') return
      const width = Math.max(getRect()?.width || 320, 1)
      swipeOffsetX.value = clamp(dx, -width * 0.35, width * 0.35)
      isSwiping.value = true
      return
    }
    if (gesture?.type === 'pinch') {
      const [fId, sId] = gesture.pointerIds
      const f = pointers.get(fId), s = pointers.get(sId)
      if (!f || !s) return
      const dist = Math.hypot(f.x - s.x, f.y - s.y) || 1
      const nz = clamp(gesture.startZoom * (dist / gesture.startDistance), 1, 4)
      if (nz === 1) return resetTransform()
      const cx = (f.x + s.x) / 2, cy = (f.y + s.y) / 2, ratio = nz / gesture.startZoom
      const bp = clampPan(cx - (cx - gesture.startPanX) * ratio, cy - (cy - gesture.startPanY) * ratio, nz)
      zoom.value = nz; panX.value = bp.x; panY.value = bp.y
      return
    }
    if (gesture?.type === 'pan' && gesture.pointerId === e.pointerId) {
      const bp = clampPan(gesture.startPanX + (p.x - gesture.startX), gesture.startPanY + (p.y - gesture.startY), zoom.value)
      panX.value = bp.x; panY.value = bp.y
    }
  }

  function onPointerEnd(e) {
    if (!message.value) return
    const moved = pointerMoved.has(e.pointerId)
    pointers.delete(e.pointerId); pointerStarts.delete(e.pointerId); pointerMoved.delete(e.pointerId)
    try { (e.target || e.currentTarget)?.releasePointerCapture?.(e.pointerId) } catch {}
    if (gesture?.type === 'swipe' && gesture.pointerId === e.pointerId) {
      const width = Math.max(getRect()?.width || 320, 1)
      const threshold = Math.max(width * 0.16, 56)
      const direction = swipeOffsetX.value <= -threshold ? 1 : swipeOffsetX.value >= threshold ? -1 : 0
      if (moved || Math.abs(swipeOffsetX.value) > 12) ignoreClickUntil = Date.now() + 220
      resetSwipe()
      if (direction !== 0) {
        switchTo(direction)
        gesture = null
        return
      }
    }
    if (moved) ignoreClickUntil = Date.now() + 220
    if (!pointers.size) { gesture = null; return }
    if (pointers.size === 1) {
      const [rid, rpos] = pointers.entries().next().value
      gesture = zoom.value > 1
        ? { type: 'pan', pointerId: rid, startX: rpos.x, startY: rpos.y, startPanX: panX.value, startPanY: panY.value }
        : null
    }
  }

  function onKeydown(e) {
    if (!message.value) return
    if (e.key === 'Escape') close()
    if (e.key === 'ArrowLeft') switchTo(-1)
    if (e.key === 'ArrowRight') switchTo(1)
  }

  watch(currentAttachment, (nextAttachment, previousAttachment) => {
    const previousKey = String(previousAttachment?.key ?? '')
    const previousVideo = previousKey ? mediaElements.get(previousKey) : null
    if (previousVideo && typeof previousVideo.pause === 'function') {
      previousVideo.pause()
    }
    resetSwipe()
    syncCurrentVideoState()
  })

  watch(currentIsVideo, (isVideo) => {
    if (!isVideo) {
      isCurrentVideoPaused.value = true
      return
    }
    syncCurrentVideoState()
  })

  watch(message, (v) => {
    if (v) {
      window.addEventListener('keydown', onKeydown)
      // capture wheel and pointer events globally so overlay can be pointer-events:none
      window.addEventListener('wheel', onWheel, { passive: false })
      window.addEventListener('pointerdown', onPointerDown, true)
      window.addEventListener('pointermove', onPointerMove, true)
      window.addEventListener('pointerup', onPointerEnd, true)
      window.addEventListener('pointercancel', onPointerEnd, true)
      window.addEventListener('click', onClick, true)
    } else {
      window.removeEventListener('keydown', onKeydown)
      window.removeEventListener('wheel', onWheel, { passive: false })
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('pointermove', onPointerMove, true)
      window.removeEventListener('pointerup', onPointerEnd, true)
      window.removeEventListener('pointercancel', onPointerEnd, true)
      window.removeEventListener('click', onClick, true)
    }
  })

  return {
    viewport, message, attachments, index,
    currentAttachment, currentUrl, currentIsVideo, imageStyle,
    slideStyle, trackStyle,
    isCurrentVideoPaused,
    open, close, switchTo,
    previous: () => switchTo(-1),
    next: () => switchTo(1),
    setMediaElement,
    syncCurrentVideoState,
    toggleCurrentVideoPlayback,
    seekCurrentVideo,
    onWheel, onClick, onPointerDown, onPointerMove, onPointerEnd,
    onPointerCancel: onPointerEnd,
    resetView,
  }
}
