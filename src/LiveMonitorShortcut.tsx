import { AudioLines, TabletSmartphone } from 'lucide-react'
import SingleTapButton from './SingleTapButton'
import './live-monitor-shortcut.css'

const TARGET_ID = 'live-monitor-workspace'
const TARGET_HEADING = '아이패드 X32 화면 + 회중석 음향'

function findLiveMonitor() {
  const anchored = document.getElementById(TARGET_ID)
  if (anchored) return anchored

  const heading = [...document.querySelectorAll<HTMLHeadingElement>('h2')]
    .find((item) => item.textContent?.includes(TARGET_HEADING))
  return heading?.closest<HTMLElement>('section, article') ?? null
}

export default function LiveMonitorShortcut() {
  function moveToLiveMonitor() {
    findLiveMonitor()?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav className="live-monitor-shortcut-bar" aria-label="아이패드 X32 화면과 회중석 음향 빠른 이동">
      <SingleTapButton
        className="live-monitor-shortcut-button"
        onActivate={moveToLiveMonitor}
        aria-label="아이패드 X32 화면과 회중석 음향 Live Monitor로 이동"
      >
        <span className="live-monitor-shortcut-icon" aria-hidden="true">
          <TabletSmartphone size={21} />
          <AudioLines size={17} />
        </span>
        <span className="live-monitor-shortcut-copy">
          <strong>아이패드 X32 + 회중석 음향</strong>
          <small>Live Monitor 위치로 바로 이동</small>
        </span>
      </SingleTapButton>
    </nav>
  )
}
