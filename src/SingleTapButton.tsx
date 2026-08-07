import {
  ButtonHTMLAttributes,
  MouseEvent,
  PointerEvent,
  useRef,
} from 'react'

type SingleTapButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  onActivate: () => void
}

type ActivePointer = {
  id: number
  x: number
  y: number
}

const DUPLICATE_CLICK_WINDOW_MS = 700
const TAP_MAX_DISTANCE_PX = 12

export default function SingleTapButton({
  onActivate,
  onPointerDown,
  onPointerCancel,
  onPointerUp,
  disabled,
  type = 'button',
  ...props
}: SingleTapButtonProps) {
  const lastPointerActivation = useRef(0)
  const activePointer = useRef<ActivePointer | null>(null)

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    onPointerDown?.(event)
    if (event.defaultPrevented || disabled) return
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
    activePointer.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    }
  }

  function handlePointerCancel(event: PointerEvent<HTMLButtonElement>) {
    onPointerCancel?.(event)
    activePointer.current = null
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    onPointerUp?.(event)
    if (event.defaultPrevented || disabled) return
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return

    const start = activePointer.current
    activePointer.current = null
    if (!start || start.id !== event.pointerId) return

    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y)
    if (moved > TAP_MAX_DISTANCE_PX) return

    lastPointerActivation.current = performance.now()
    event.preventDefault()
    onActivate()
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (disabled) return
    if (performance.now() - lastPointerActivation.current < DUPLICATE_CLICK_WINDOW_MS) {
      event.preventDefault()
      return
    }
    onActivate()
  }

  return (
    <button
      {...props}
      type={type}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerCancel={handlePointerCancel}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
    />
  )
}
