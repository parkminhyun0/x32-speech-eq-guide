import { ButtonHTMLAttributes, MouseEvent, PointerEvent, useRef } from 'react'

type SingleTapButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  onActivate: () => void
}

const DUPLICATE_CLICK_WINDOW_MS = 700

export default function SingleTapButton({
  onActivate,
  onPointerUp,
  disabled,
  type = 'button',
  ...props
}: SingleTapButtonProps) {
  const lastPointerActivation = useRef(0)

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    onPointerUp?.(event)
    if (event.defaultPrevented || disabled) return
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return

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
      onPointerUp={handlePointerUp}
      onClick={handleClick}
    />
  )
}
