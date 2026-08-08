import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Cable } from 'lucide-react'
import SingleTapButton from './SingleTapButton'
import './x32-connect-shortcut.css'

export default function X32ConnectMenuShortcut() {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const findTarget = () => {
      const nav = document.querySelector<HTMLElement>('.workflow-quick-nav')
      if (nav) setTarget(nav)
      return Boolean(nav)
    }

    if (findTarget()) return undefined

    const observer = new MutationObserver(() => {
      if (findTarget()) observer.disconnect()
    })
    observer.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  function goToConnect() {
    document.getElementById('x32-connect')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (!target) return null

  return createPortal(
    <SingleTapButton
      className="x32-connect-menu-button"
      aria-label="X32 Direct Connect 읽기 전용 연결 화면으로 이동"
      onActivate={goToConnect}
    >
      <Cable size={20} />
      <span>X32 연결</span>
      <small>Direct Connect</small>
    </SingleTapButton>,
    target,
  )
}
