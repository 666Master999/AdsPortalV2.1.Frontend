const DEFAULT_AXIS_THRESHOLD = 8
const DEFAULT_AXIS_BIAS = 6

function sortConsumers(left, right) {
  return Number(right?.priority ?? 0) - Number(left?.priority ?? 0)
}

function buildDetail(session, event) {
  const dx = event.clientX - session.startX
  const dy = event.clientY - session.startY

  return {
    dx,
    dy,
    absX: Math.abs(dx),
    absY: Math.abs(dy),
    direction: dx > 0 ? 'right' : dx < 0 ? 'left' : 'none',
  }
}

export function createGestureManager(options = {}) {
  const axisThreshold = Number.isFinite(options.axisThreshold)
    ? options.axisThreshold
    : DEFAULT_AXIS_THRESHOLD
  const axisBias = Number.isFinite(options.axisBias)
    ? options.axisBias
    : DEFAULT_AXIS_BIAS

  let session = null
  let consumers = []

  function getOwner() {
    if (!session?.ownerId || session.ownerId === 'scroll') return null
    return consumers.find(consumer => consumer.id === session.ownerId) || null
  }

  function finalize(event, cancelled = false) {
    if (!session) return

    const owner = getOwner()
    if (owner) {
      const detail = buildDetail(session, event || {
        clientX: session.currentX,
        clientY: session.currentY,
      })

      if (cancelled) {
        owner.onCancel?.({ session, detail, event })
      } else {
        owner.onEnd?.({ session, detail, event })
      }
    }

    session = null
  }

  function register(consumer) {
    if (!consumer?.id) {
      throw new Error('Gesture consumer id is required')
    }

    consumers = [...consumers.filter(item => item.id !== consumer.id), consumer].sort(sortConsumers)

    return () => {
      consumers = consumers.filter(item => item.id !== consumer.id)
    }
  }

  function onPointerDown(event) {
    if (!event) return
    if (event.pointerType === 'mouse' && event.button !== 0) return

    if (session && session.pointerId !== event.pointerId) {
      finalize(event, true)
    }

    session = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      startTarget: event.target,
      axis: null,
      locked: false,
      ownerId: null,
      data: {},
    }
  }

  function onPointerMove(event) {
    if (!session || event.pointerId !== session.pointerId) return

    session.currentX = event.clientX
    session.currentY = event.clientY

    const detail = buildDetail(session, event)

    if (!session.locked) {
      if (detail.absX < axisThreshold && detail.absY < axisThreshold) return

      if (detail.absX > detail.absY + axisBias) {
        session.axis = 'x'
        session.locked = true

        const owner = consumers.find(consumer => consumer.canStart?.({ session, detail, event })) || null
        if (!owner) {
          session.ownerId = 'scroll'
          return
        }

        session.ownerId = owner.id
        owner.onStart?.({ session, detail, event })
        if (event.cancelable) event.preventDefault()
        owner.onMove?.({ session, detail, event })
        return
      }

      if (detail.absY > detail.absX + axisBias) {
        session.axis = 'y'
        session.locked = true
        session.ownerId = 'scroll'
      }

      return
    }

    const owner = getOwner()
    if (!owner) return

    if (event.cancelable) event.preventDefault()
    owner.onMove?.({ session, detail, event })
  }

  function onPointerUp(event) {
    if (!session || event.pointerId !== session.pointerId) return
    finalize(event, false)
  }

  function onPointerCancel(event) {
    if (!session || event.pointerId !== session.pointerId) return
    finalize(event, true)
  }

  function cancel() {
    finalize(null, true)
  }

  return {
    register,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    cancel,
  }
}