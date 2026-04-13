import { ref, computed, watch } from 'vue'

export function useMediaViewer({ buildUrl, isVideoAttachment }) {
  const viewport = ref(null)
  const message = ref(null)
  const attachments = ref([])
  const index = ref(0)
  const zoom = ref(1)
  const panX = ref(0)
  const panY = ref(0)
  const tapState = ref({ lastTapAt: 0, lastTapX: 0, lastTapY: 0 })
  const pointers = new Map()
  const pointerStarts = new Map()
  const pointerMoved = new Set()
  let gesture = null

  const currentAttachment = computed(() => attachments.value[index.value] || null)
  const currentRawAttachment = computed(() => {
    const a = attachments.value[index.value]
    return a && typeof a === 'object' && ('original' in a) && a.original ? a.original : a
  })
  const currentUrl = computed(() => buildUrl(currentRawAttachment.value))
  const currentIsVideo = computed(() => isVideoAttachment(currentRawAttachment.value))

  const imageStyle = computed(() => ({
    transform: `translate(-50%, -50%) translate3d(${panX.value}px, ${panY.value}px, 0) scale(${zoom.value})`,
    cursor: zoom.value > 1 ? 'grab' : 'zoom-in'
  }))

  // Slide-style transform (no centering translate) for horizontal track layout
  const slideStyle = computed(() => ({
     transform: `translate3d(0,0,0)`,
     transition: `transform ${transitionMs}ms ease`,
     transformOrigin: 'center center',
     maxWidth: '100%',
     maxHeight: '100%',
     width: 'auto',
     height: 'auto'
  }))

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
  const getRect = () => viewport.value?.getBoundingClientRect() || null

  function resetTransform() { zoom.value = 1; panX.value = 0; panY.value = 0 }

  function resetPointers() {
    pointers.clear(); pointerStarts.clear(); pointerMoved.clear()
    gesture = null; tapState.value = { lastTapAt: 0, lastTapX: 0, lastTapY: 0 }
  }

  function resetView() { resetPointers(); resetTransform() }

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
    resetView()
  }

  function switchTo(delta) {
    const n = index.value + delta
    if (n < 0 || n >= attachments.value.length) return
    index.value = n; resetView()
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
    if (pointers.size === 1 && zoom.value > 1)
      gesture = { type: 'pan', pointerId: e.pointerId, startX: p.x, startY: p.y, startPanX: panX.value, startPanY: panY.value }
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
    pointers.delete(e.pointerId); pointerStarts.delete(e.pointerId); pointerMoved.delete(e.pointerId)
    try { (e.target || e.currentTarget)?.releasePointerCapture?.(e.pointerId) } catch {}
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
    slideStyle,
    open, close, switchTo,
    previous: () => switchTo(-1),
    next: () => switchTo(1),
    onWheel, onClick, onPointerDown, onPointerMove, onPointerEnd,
    onPointerCancel: onPointerEnd,
    resetView,
  }
}
