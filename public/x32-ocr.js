(() => {
  const BAND_NAMES = ['Low', 'Low Mid', 'High Mid', 'High']
  let candidates = []
  let rawText = ''
  let progress = 0
  let status = 'idle'

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

  function numberValue(value) {
    const parsed = Number(String(value).replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }

  function normalizeFrequency(value, unit = '') {
    const parsed = numberValue(value)
    if (parsed === null) return null
    const normalized = /k/i.test(unit) ? parsed * 1000 : parsed
    return normalized >= 20 && normalized <= 20000 ? Math.round(normalized) : null
  }

  function parseText(text) {
    const cleaned = text
      .replace(/[−–—]/g, '-')
      .replace(/O(?=\d)/g, '0')
      .replace(/(?<=\d)O/g, '0')
      .replace(/,/g, '.')

    const lines = cleaned.split(/\n+/).map((line) => line.trim()).filter(Boolean)
    const frequencyMatches = [...cleaned.matchAll(/(-?\d+(?:\.\d+)?)\s*(k?hz)\b/gi)]
      .map((match) => normalizeFrequency(match[1], match[2]))
      .filter((value) => value !== null)
    const gainMatches = [...cleaned.matchAll(/([+-]?\d+(?:\.\d+)?)\s*d\s*b\b/gi)]
      .map((match) => numberValue(match[1]))
      .filter((value) => value !== null && value >= -15 && value <= 15)
    const qMatches = [...cleaned.matchAll(/(?:\bq\b|quality)\s*[:=]?\s*(\d+(?:\.\d+)?)/gi)]
      .map((match) => numberValue(match[1]))
      .filter((value) => value !== null && value >= 0.3 && value <= 10)

    const defaults = [
      { frequency: 120, gain: 0, q: 1 },
      { frequency: 250, gain: 0, q: 1.4 },
      { frequency: 3200, gain: 0, q: 1.4 },
      { frequency: 8000, gain: 0, q: 1 },
    ]

    const inferred = BAND_NAMES.map((name, index) => ({
      name,
      frequency: frequencyMatches[index] ?? defaults[index].frequency,
      gain: gainMatches[index] ?? defaults[index].gain,
      q: qMatches[index] ?? defaults[index].q,
      confidence: Math.round([
        frequencyMatches[index] !== undefined,
        gainMatches[index] !== undefined,
        qMatches[index] !== undefined,
      ].filter(Boolean).length / 3 * 100),
    }))

    const lowCutLine = lines.find((line) => /(low\s*cut|lo\s*cut|hpf)/i.test(line)) || ''
    const lowCutMatch = lowCutLine.match(/(\d+(?:\.\d+)?)\s*(k?hz)/i)
    const lowCut = lowCutMatch ? normalizeFrequency(lowCutMatch[1], lowCutMatch[2]) : null

    return { bands: inferred, lowCut, detected: frequencyMatches.length + gainMatches.length + qMatches.length }
  }

  function setInputValue(input, value) {
    if (!input) return
    input.value = String(value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function applyCandidates() {
    const rows = [...document.querySelectorAll('.eq-band-row')]
    candidates.forEach((candidate, index) => {
      const row = rows[index]
      if (!row) return
      const inputs = row.querySelectorAll('input')
      setInputValue(inputs[0], clamp(Math.round(candidate.frequency), 20, 20000))
      setInputValue(inputs[1], clamp(Number(candidate.gain.toFixed(1)), -15, 15))
      setInputValue(inputs[2], clamp(Number(candidate.q.toFixed(1)), 0.3, 10))
    })

    const lowCutInput = document.querySelector('.lowcut-row input[type="number"]')
    const lowCutCandidate = document.querySelector('#ocr-lowcut')
    if (lowCutInput && lowCutCandidate?.value) setInputValue(lowCutInput, clamp(Number(lowCutCandidate.value), 20, 400))
    status = 'applied'
    render()
  }

  async function analyze() {
    const image = document.querySelector('.x32-image-preview img')
    if (!image) {
      status = 'missing-image'
      render()
      return
    }
    if (!window.Tesseract) {
      status = 'engine-error'
      render()
      return
    }

    status = 'working'
    progress = 0
    render()
    try {
      const result = await window.Tesseract.recognize(image.src, 'eng', {
        logger(message) {
          if (message.status === 'recognizing text') {
            progress = Math.round((message.progress || 0) * 100)
            render()
          }
        },
      })
      rawText = result?.data?.text || ''
      const parsed = parseText(rawText)
      candidates = parsed.bands
      window.__x32OcrLowCut = parsed.lowCut
      status = parsed.detected ? 'review' : 'no-values'
      render()
    } catch (error) {
      console.error('X32 OCR failed', error)
      status = 'engine-error'
      render()
    }
  }

  function syncCandidateFromInputs(panel) {
    candidates = candidates.map((candidate, index) => ({
      ...candidate,
      frequency: numberValue(panel.querySelector(`[data-ocr-frequency="${index}"]`)?.value) ?? candidate.frequency,
      gain: numberValue(panel.querySelector(`[data-ocr-gain="${index}"]`)?.value) ?? candidate.gain,
      q: numberValue(panel.querySelector(`[data-ocr-q="${index}"]`)?.value) ?? candidate.q,
    }))
  }

  function message() {
    if (status === 'missing-image') return '먼저 X32 EQ 화면 이미지를 촬영하거나 선택해 주세요.'
    if (status === 'engine-error') return '문자 인식 엔진을 불러오지 못했습니다. 네트워크 연결 후 다시 시도해 주세요.'
    if (status === 'no-values') return '숫자를 충분히 읽지 못했습니다. 화면을 정면에서 밝고 선명하게 다시 촬영해 주세요.'
    if (status === 'applied') return '검토한 후보를 입력칸에 반영했습니다. 실제 X32 화면과 다시 대조해 주세요.'
    return 'OCR 결과는 후보입니다. 숫자를 직접 검토한 뒤에만 입력칸에 반영하세요.'
  }

  function render() {
    const uploadPanel = document.querySelector('.upload-panel')
    if (!uploadPanel) return
    let panel = document.querySelector('#x32-ocr-panel')
    if (!panel) {
      panel = document.createElement('section')
      panel.id = 'x32-ocr-panel'
      panel.className = 'panel x32-ocr-panel'
      uploadPanel.insertAdjacentElement('afterend', panel)
    }

    const hasImage = Boolean(document.querySelector('.x32-image-preview img'))
    const working = status === 'working'
    const lowCut = window.__x32OcrLowCut || ''
    panel.innerHTML = `
      <div class="panel-heading compact">
        <div><span class="step">08</span><h2>X32 화면 자동 읽기 · Beta</h2></div>
        <span class="ocr-badge">검토 후 적용</span>
      </div>
      <p class="ocr-intro">휴대폰에서 문자 인식을 실행해 Frequency·Gain·Q 후보를 만듭니다. 사진과 숫자를 반드시 직접 대조하세요.</p>
      <div class="ocr-actions">
        <button type="button" id="ocr-analyze" class="primary" ${!hasImage || working ? 'disabled' : ''}>${working ? `인식 중 ${progress}%` : '이미지 숫자 읽기'}</button>
        ${working ? `<div class="ocr-progress"><span style="width:${progress}%"></span></div>` : ''}
      </div>
      <p class="ocr-message ${status.includes('error') || status === 'missing-image' ? 'warning' : ''}">${message()}</p>
      ${candidates.length ? `
        <div class="ocr-lowcut-row"><label>Low Cut 후보 <input id="ocr-lowcut" type="number" min="20" max="400" value="${lowCut}"></label></div>
        <div class="ocr-table" role="table" aria-label="OCR로 읽은 X32 EQ 후보">
          <div class="ocr-row ocr-head" role="row"><span>밴드</span><span>Hz</span><span>dB</span><span>Q</span></div>
          ${candidates.map((candidate, index) => `
            <div class="ocr-row" role="row">
              <strong>${candidate.name}</strong>
              <input data-ocr-frequency="${index}" type="number" min="20" max="20000" value="${candidate.frequency}">
              <input data-ocr-gain="${index}" type="number" min="-15" max="15" step="0.5" value="${candidate.gain}">
              <input data-ocr-q="${index}" type="number" min="0.3" max="10" step="0.1" value="${candidate.q}">
            </div>`).join('')}
        </div>
        <button type="button" id="ocr-apply" class="ocr-apply">검토한 후보를 X32 입력칸에 반영</button>
        <details class="ocr-raw"><summary>읽힌 원문 확인</summary><pre>${rawText.replace(/[&<>]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[char]))}</pre></details>
      ` : ''}
      <p class="ocr-safety">촬영 각도·반사광·화면 테마에 따라 오독될 수 있습니다. 자동 믹서 제어 또는 자동 확정은 하지 않습니다.</p>
    `

    panel.querySelector('#ocr-analyze')?.addEventListener('click', analyze)
    panel.querySelector('#ocr-apply')?.addEventListener('click', () => {
      syncCandidateFromInputs(panel)
      applyCandidates()
    })
  }

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some((node) => node.nodeType === 1 && !node.closest?.('#x32-ocr-panel')))) {
      requestAnimationFrame(render)
    }
  })

  window.addEventListener('DOMContentLoaded', () => {
    render()
    observer.observe(document.body, { childList: true, subtree: true })
  })
})()
