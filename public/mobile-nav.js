const navItems = [
  { label: '측정', icon: '🎤', match: '30초 설교 음성 측정' },
  { label: 'EQ', icon: '🎚', match: 'X32 EQ 화면·설정' },
  { label: '분석', icon: '📊', match: '설교 음향 분석 결과', fallback: '설교 음성 기준' },
  { label: '배우기', icon: '📚', match: '음역대', fallback: '적용 원칙' },
]

function findTarget(item) {
  const headings = [...document.querySelectorAll('h2')]
  const heading = headings.find((node) => node.textContent?.includes(item.match))
    || headings.find((node) => item.fallback && node.textContent?.includes(item.fallback))
  return heading?.closest('section, article') || heading
}

function mountNavigation() {
  if (document.querySelector('.mobile-section-nav')) return
  const main = document.querySelector('main')
  if (!main) return

  const nav = document.createElement('nav')
  nav.className = 'mobile-section-nav'
  nav.setAttribute('aria-label', '주요 화면 이동')

  navItems.forEach((item, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.innerHTML = `<span aria-hidden="true">${item.icon}</span><strong>${item.label}</strong>`
    button.addEventListener('click', () => {
      const target = findTarget(item)
      if (!target) return
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      nav.querySelectorAll('button').forEach((node) => node.removeAttribute('aria-current'))
      button.setAttribute('aria-current', 'page')
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
