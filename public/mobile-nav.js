const navItems = [
  { label: '시작', icon: '⌂', target: 'workflow-hub' },
  { label: '소스', icon: '🎤', target: 'source-workspace' },
  { label: '측정', icon: '⏱', target: 'measurement-workspace' },
  { label: 'X32', icon: '🎚', target: 'x32-eq-workspace' },
  { label: 'Live', icon: '📷', target: 'live-monitor-workspace', ariaLabel: '아이패드 X32 화면과 회중석 음향 Live Monitor로 이동' },
  { label: '방송', icon: '📡', target: 'broadcast-workspace', workspaceLabel: '유튜브 방송 믹스' },
]

function findTarget(item) {
  const directTarget = document.getElementById(item.target)
  if (directTarget) return directTarget

  if (item.target === 'broadcast-workspace') return document.getElementById('workflow-hub')
  if (item.target === 'live-monitor-workspace') {
    const heading = [...document.querySelectorAll('h2')]
      .find((node) => node.textContent?.includes('아이패드 X32 화면 + 회중석 음향'))
    return heading?.closest('section, article') || heading
  }

  return null
}

function activateWorkspace(item) {
  if (!item.workspaceLabel) return
  const button = [...document.querySelectorAll('.workspace-switch button')]
    .find((node) => node.textContent?.includes(item.workspaceLabel))
  button?.click()
}

function bindTap(element, handler) {
  let lastPointerActivation = 0

  element.addEventListener('pointerup', (event) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
    if (element.disabled) return
    lastPointerActivation = performance.now()
    event.preventDefault()
    handler()
  })

  element.addEventListener('click', (event) => {
    if (element.disabled) return
    if (performance.now() - lastPointerActivation < 700) {
      event.preventDefault()
      return
    }
    handler()
  })
}

function mountNavigation() {
  if (document.querySelector('.mobile-section-nav')) return
  if (!document.querySelector('main')) return

  const nav = document.createElement('nav')
  nav.className = 'mobile-section-nav'
  nav.setAttribute('aria-label', '주요 기능 빠른 이동')

  navItems.forEach((item, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('aria-label', item.ariaLabel || `${item.label} 위치로 이동`)
    button.innerHTML = `<span aria-hidden="true">${item.icon}</span><strong>${item.label}</strong>`
    bindTap(button, () => {
      activateWorkspace(item)
      window.setTimeout(() => {
        const target = findTarget(item)
        if (!target) return
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        nav.querySelectorAll('button').forEach((node) => node.removeAttribute('aria-current'))
        button.setAttribute('aria-current', 'page')
      }, 0)
    })
    if (index === 0) button.setAttribute('aria-current', 'page')
    nav.appendChild(button)
  })

  document.body.appendChild(nav)

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
    if (!visible) return
    const index = navItems.findIndex((item) => findTarget(item) === visible.target)
    if (index < 0) return
    nav.querySelectorAll('button').forEach((button, buttonIndex) => {
      if (buttonIndex === index) button.setAttribute('aria-current', 'page')
      else button.removeAttribute('aria-current')
    })
  }, { rootMargin: '-20% 0px -60% 0px', threshold: [0.05, 0.3] })

  navItems.map(findTarget).filter(Boolean).forEach((target) => observer.observe(target))
}

const root = document.querySelector('#root')
if (root) {
  const watcher = new MutationObserver(() => {
    if (document.querySelector('main')) {
      mountNavigation()
      watcher.disconnect()
    }
  })
  watcher.observe(root, { childList: true, subtree: true })
}

window.addEventListener('DOMContentLoaded', mountNavigation)
