import { useEffect } from 'react'

const formatter = new Intl.DateTimeFormat('ko-KR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
})

/**
 * Keeps the decorative X32 EQ status-strip clock synchronized with the
 * browser's local clock. X32EqConsole currently renders its initial time only
 * when React re-renders, so this installer refreshes every visible console
 * clock once per second without touching any mixer setting or bridge state.
 */
export default function RealtimeX32Clock() {
  useEffect(() => {
    function updateClock() {
      const now = new Date()
      const label = formatter.format(now)
      document.querySelectorAll<HTMLTimeElement>('.x32-status-strip time').forEach((element) => {
        element.dateTime = now.toISOString()
        element.textContent = label
      })
    }

    updateClock()
    const timer = window.setInterval(updateClock, 1000)
    return () => window.clearInterval(timer)
  }, [])

  return null
}
