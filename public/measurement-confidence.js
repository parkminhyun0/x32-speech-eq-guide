(() => {
  const state = { before: null, after: null, lastSignature: '' }
  let scheduled = false

  const numberFrom = (text, pattern) => {
    const match = text.match(pattern)
    return match ? Number(match[1]) : 0
  }

  function measuredBands() {
    const line = document.querySelector('.measured-line')
    const raw = line?.getAttribute('points') || ''
    if (!raw) return []
    return raw.trim().split(/\s+/).map((pair) => {
      const y = Number(pair.split(',')[1])
      return Math.max(0, Math.min(100, Math.round((92 - y) / 0.78)))
    })
  }

  function readSnapshot() {
    const panel = document.querySelector('.result-panel')
    if (!panel) return null
    const text = panel.textContent || ''
    const bands = measuredBands()
    return {
      score: numberFrom(text, /(\d+)점/),
      duration: numberFrom(text, /측정 시간\s*(\d+(?:\.\d+)?)초/),
      rms: numberFrom(text, /평균 RMS\s*(\d+)%/),
      peak: numberFrom(text, /최대 Peak\s*(\d+)%/),
      bands,
      text,
      savedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    }
  }

  function confidence(snapshot) {
    if (!snapshot) return { score: 0, level: '측정 전', items: [] }
    let value = 100
    const items = []
    if (snapshot.duration < 15) { value -= 30; items.push('측정 시간이 짧음') }
    else if (snapshot.duration < 25) { value -= 12; items.push('권장 30초보다 짧음') }
    else items.push('측정 시간 충분')
    if (snapshot.peak >= 92) { value -= 28; items.push('클리핑 위험') }
    else if (snapshot.peak < 25) { value -= 18; items.push('입력 레벨 낮음') }
    else items.push('입력 레벨 적정')
    if (snapshot.rms < 4) { value -= 18; items.push('평균 음량 낮음') }
    else items.push('평균 음량 확보')
    if (/주변 소음|마이크 거리가 멀/.test(snapshot.text)) { value -= 12; items.push('환경·거리 재확인') }
    const score = Math.max(25, value)
    return { score, level: score >= 85 ? '높음' : score >= 65 ? '보통' : '낮음', items }
  }

  function bandDelta(before, after, index) {
    if (!before?.bands?.length || !after?.bands?.length) return null
    return after.bands[index] - before.bands[index]
  }

  function signed(value) { return `${value > 0 ? '+' : ''}${value}` }

  function comparison() {
    const { before, after } = state
    if (!before || !after) return '<p class="confidence-empty">측정 A와 측정 B를 저장하면 변화가 표시됩니다.</p>'
    const low = bandDelta(before, after, 2)
    const clarity = bandDelta(before, after, 6)
    const peak = after.peak - before.peak
    const score = after.score - before.score
    const verdict = []
    if (low !== null) verdict.push(low <= -3 ? '저중역 에너지가 줄었습니다.' : low >= 3 ? '저중역 에너지가 늘었습니다.' : '저중역 변화는 작습니다.')
    if (clarity !== null) verdict.push(clarity >= 3 ? '명료도 대역이 증가했습니다.' : clarity <= -3 ? '명료도 대역이 감소했습니다.' : '명료도 변화는 작습니다.')
    if (Math.abs(peak) >= 8) verdict.push('두 측정의 입력 레벨 차이가 커서 같은 조건 재측정을 권합니다.')
    return `
      <div class="ab-grid">
        <div><span>250Hz 상대 변화</span><strong>${low === null ? '—' : signed(low) + '%'}</strong></div>
        <div><span>4kHz 명료도 변화</span><strong>${clarity === null ? '—' : signed(clarity) + '%'}</strong></div>
        <div><span>Peak 변화</span><strong>${signed(peak)}%</strong></div>
        <div><span>분석 점수 변화</span><strong>${signed(score)}점</strong></div>
      </div>
      <div class="ab-verdict">${verdict.map((item) => `<p>${item}</p>`).join('')}</div>`
  }

  function render() {
    scheduled = false
    let panel = document.querySelector('#measurement-confidence')
    if (!panel) {
      panel = document.createElement('section')
      panel.id = 'measurement-confidence'
      panel.className = 'panel confidence-panel'
      const anchor = document.querySelector('.curve-panel') || document.querySelector('.recommendation-panel')
      anchor?.parentNode?.insertBefore(panel, anchor)
    }
    const snapshot = readSnapshot()
    const quality = confidence(snapshot)
    panel.innerHTML = `
      <div class="panel-heading compact"><div><span class="step">08</span><h2>측정 신뢰도 · 전후 비교</h2></div><span class="confidence-badge ${quality.level === '낮음' ? 'low' : ''}">${snapshot ? quality.score + '% · ' + quality.level : '측정 대기'}</span></div>
      <div class="prep-checks">
        <label><input type="checkbox">객석 청취 위치에 휴대폰을 둠</label>
        <label><input type="checkbox">같은 거리·같은 문장으로 측정</label>
        <label><input type="checkbox">한 번에 EQ 한 항목만 변경</label>
      </div>
      ${snapshot ? `<div class="confidence-items">${quality.items.map((item) => `<span>${item}</span>`).join('')}</div>` : '<p class="confidence-empty">측정을 완료하면 시간·RMS·Peak를 바탕으로 참고용 신뢰도를 계산합니다.</p>'}
      ${snapshot && quality.score < 65 ? '<p class="confidence-warning">현재 측정은 참고용입니다. EQ 조정보다 위치·거리·입력 레벨을 먼저 맞춘 뒤 재측정하세요.</p>' : ''}
      <div class="ab-actions">
        <button type="button" data-save="before" ${snapshot ? '' : 'disabled'}>측정 A · 조정 전 저장</button>
        <button type="button" data-save="after" ${snapshot ? '' : 'disabled'}>측정 B · 조정 후 저장</button>
        <button type="button" data-reset-ab>비교 초기화</button>
      </div>
      <div class="saved-slots"><span>A ${state.before ? state.before.savedAt + ' · ' + state.before.score + '점' : '미저장'}</span><span>B ${state.after ? state.after.savedAt + ' · ' + state.after.score + '점' : '미저장'}</span></div>
      ${comparison()}
      <p class="confidence-note">휴대폰 측정은 절대 SPL·하울링 여유·정확한 STI를 확정하지 않습니다. 같은 위치에서의 상대 비교에 사용하세요.</p>`

    panel.querySelectorAll('[data-save]').forEach((button) => button.addEventListener('click', () => {
      const current = readSnapshot()
      if (!current) return
      state[button.dataset.save] = current
      render()
    }))
    panel.querySelector('[data-reset-ab]')?.addEventListener('click', () => { state.before = null; state.after = null; render() })
  }

  function scheduleRender() {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(render)
  }

  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => !mutation.target.closest?.('#measurement-confidence'))
    if (!relevant) return
    const result = document.querySelector('.result-panel')?.textContent || ''
    const signature = result.slice(0, 240)
    if (signature !== state.lastSignature || !document.querySelector('#measurement-confidence')) {
      state.lastSignature = signature
      scheduleRender()
    }
  })

  window.addEventListener('DOMContentLoaded', () => {
    scheduleRender()
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  })
})()
