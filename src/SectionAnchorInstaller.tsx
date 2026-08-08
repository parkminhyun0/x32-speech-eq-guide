import { useEffect } from 'react'

const anchors = [
  { id: 'source-workspace', match: '설교자·보컬·악기 EQ 워크스페이스' },
  { id: 'measurement-workspace', match: '30초' },
  { id: 'x32-eq-workspace', match: 'X32 채널 EQ 동일 배열' },
  { id: 'confidence-workspace', match: '측정 신뢰도' },
]

function installAnchors() {
  const headings = [...document.querySelectorAll<HTMLHeadingElement>('h2')]
  anchors.forEach(({ id, match }) => {
    if (document.getElementById(id)) return
    const heading = headings.find((item) => item.textContent?.includes(match))
    const target = heading?.closest<HTMLElement>('section, article')
    if (target) target.id = id
  })
}

export default function SectionAnchorInstaller() {
  useEffect(() => {
    installAnchors()
    const root = document.getElementById('root')
    if (!root) return
    const observer = new MutationObserver(installAnchors)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return null
}
