(() => {
  const TAP_MAX_DISTANCE = 12
  const DUPLICATE_WINDOW_MS = 700
  let activePointer = null
  let syntheticTarget = null
  let syntheticAt = 0

  function getButton(target) {
    if (!(target instanceof Element)) return null
    const button = target.closest('button, [role="button"]')
    if (!button || button.matches(':disabled, [aria-disabled="true"]')) return null
    if (button.closest('label, input, select, textarea')) return null
    return button
  }

  document.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
    const button = getButton(event.target)
    if (!button) return
    activePointer = {
      id: event.pointerId,
      button,
      x: event.clientX,
      y: event.clientY,
    }
  }, true)

  document.addEventListener('pointercancel', () => {
    activePointer = null
  }, true)

  document.addEventListener('pointerup', (event) => {
    if (!activePointer || activePointer.id !== event.pointerId) return
    const { button, x, y } = activePointer
    activePointer = null

    const moved = Math.hypot(event.clientX - x, event.clientY - y)
    if (moved > TAP_MAX_DISTANCE || !document.contains(button)) return

    event.preventDefault()
    syntheticTarget = button
    syntheticAt = performance.now()
    button.click()
  }, true)

  document.addEventListener('click', (event) => {
    if (!event.isTrusted || !syntheticTarget) return
    const button = getButton(event.target)
    if (button === syntheticTarget && performance.now() - syntheticAt < DUPLICATE_WINDOW_MS) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    syntheticTarget = null
  }, true)
})()
