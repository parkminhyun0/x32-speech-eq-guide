(() => {
  const frequencies = [80, 125, 250, 500, 1000, 2000, 4000, 8000]
  const labels = ['80', '125', '250', '500', '1k', '2k', '4k', '8k']
  let stream = null
  let audioContext = null
  let analyser = null
  let rafId = 0
  let frozen = false
  let history = []

  function createPanel() {
    if (document.querySelector('.live-ipad-monitor')) return
    const host = document.querySelector('.recommendation-panel') || document.querySelector('footer')
    if (!host) return setTimeout(createPanel, 250)

    const panel = document.createElement('section')
    panel.className = 'panel live-ipad-monitor'
    panel.innerHTML = `
      <div class="panel-heading compact">
        <div><span class="step">LIVE</span><h2>아이패드 X32 화면 + 회중석 음향</h2></div>
        <span class="live-status" data-live-status>대기</span>
      </div>
      <p class="live-help">아이폰 후면 카메라로 아이패드 미니의 EQ/RTA 화면을 비추면, 같은 아이폰 마이크가 회중석 소리를 동시에 분석합니다. 아이패드는 무음으로 두세요.</p>
      <div class="live-layout">
        <div class="live-video-wrap">
          <video data-live-video playsinline muted></video>
          <div class="screen-guide"><span>아이패드 EQ/RTA 화면을 이 안에 맞추세요</span></div>
          <div class="live-video-placeholder" data-live-placeholder>카메라를 시작하면 아이패드 화면이 표시됩니다.</div>
        </div>
        <div class="live-rta-card">
          <div class="live-rta-head"><strong>회중석 실시간 RTA</strong><span data-live-mode>실시간</span></div>
          <div class="live-bars" data-live-bars>${labels.map(label => `<div><span class="live-bar-track"><i style="height:3%"></i></span><b>0</b><small>${label}</small></div>`).join('')}</div>
          <div class="live-metrics"><span>RMS <b data-live-rms>0%</b></span><span>Peak <b data-live-peak>0%</b></span></div>
        </div>
      </div>
      <div class="live-controls">
        <button type="button" class="live-primary" data-live-start>카메라+음향 시작</button>
        <button type="button" data-live-freeze disabled>화면 고정</button>
        <button type="button" data-live-average="3" disabled>3초 평균</button>
        <button type="button" data-live-average="10" disabled>10초 평균</button>
        <button type="button" data-live-stop disabled>종료</button>
      </div>
      <div class="live-guidance" data-live-guidance>
        <p><strong>배치 팁</strong> 아이패드는 카메라에 보이게 세우고, 아이폰 하단 마이크를 손이나 케이스로 막지 마세요.</p>
      </div>
    `
    host.before(panel)
    bind(panel)
  }

  function bindTap(element, handler) {
    let lastPointerActivation = 0

    element.addEventListener('pointerup', event => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
      if (element.disabled) return
      lastPointerActivation = Date.now()
      event.preventDefault()
      handler(event)
    })

    element.addEventListener('click', event => {
      if (element.disabled) return
      if (Date.now() - lastPointerActivation < 700) return
      handler(event)
    })
  }

  function bind(panel) {
    const video = panel.querySelector('[data-live-video]')
    const start = panel.querySelector('[data-live-start]')
    const stop = panel.querySelector('[data-live-stop]')
    const freeze = panel.querySelector('[data-live-freeze]')
    const averages = panel.querySelectorAll('[data-live-average]')

    bindTap(start, () => startMonitor(panel, video))
    bindTap(stop, () => stopMonitor(panel, video))
    bindTap(freeze, () => {
      frozen = !frozen
      freeze.textContent = frozen ? '실시간 재개' : '화면 고정'
      panel.querySelector('[data-live-mode]').textContent = frozen ? '고정됨' : '실시간'
    })
    averages.forEach(button => bindTap(button, () => renderAverage(panel, Number(button.dataset.liveAverage))))
  }

  async function startMonitor(panel, video) {
    try {
      stopMonitor(panel, video)
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      })
      video.srcObject = stream
      await video.play()
      panel.querySelector('[data-live-placeholder]').hidden = true
      panel.querySelector('[data-live-status]').textContent = 'LIVE'
      panel.querySelector('[data-live-status]').classList.add('active')
      setControls(panel, true)

      audioContext = new (window.AudioContext || window.webkitAudioContext)()
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.72
      audioContext.createMediaStreamSource(stream).connect(analyser)
      history = []
      frozen = false
      tick(panel)
    } catch (error) {
      panel.querySelector('[data-live-status]').textContent = '권한 필요'
      panel.querySelector('[data-live-guidance]').innerHTML = `<p><strong>시작하지 못했습니다.</strong> Safari 설정에서 카메라와 마이크 권한을 허용한 뒤 다시 시도하세요.</p>`
    }
  }

  function stopMonitor(panel, video) {
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
    stream?.getTracks().forEach(track => track.stop())
    stream = null
    if (audioContext && audioContext.state !== 'closed') audioContext.close()
    audioContext = null
    analyser = null
    if (video) video.srcObject = null
    if (panel) {
      panel.querySelector('[data-live-status]').textContent = '대기'
      panel.querySelector('[data-live-status]').classList.remove('active')
      const placeholder = panel.querySelector('[data-live-placeholder]')
      if (placeholder) placeholder.hidden = false
      setControls(panel, false)
    }
  }

  function setControls(panel, active) {
    panel.querySelector('[data-live-start]').disabled = active
    panel.querySelector('[data-live-stop]').disabled = !active
    panel.querySelector('[data-live-freeze]').disabled = !active
    panel.querySelectorAll('[data-live-average]').forEach(button => button.disabled = !active)
  }

  function tick(panel) {
    if (!analyser) return
    const bins = new Uint8Array(analyser.frequencyBinCount)
    const time = new Uint8Array(analyser.fftSize)
    analyser.getByteFrequencyData(bins)
    analyser.getByteTimeDomainData(time)

    const sampleRate = audioContext.sampleRate
    const bands = frequencies.map(freq => {
      const startHz = freq / Math.sqrt(2)
      const endHz = freq * Math.sqrt(2)
      const startBin = Math.max(0, Math.floor(startHz / (sampleRate / 2) * bins.length))
      const endBin = Math.min(bins.length - 1, Math.ceil(endHz / (sampleRate / 2) * bins.length))
      let sum = 0
      for (let i = startBin; i <= endBin; i++) sum += bins[i]
      return Math.round((sum / Math.max(1, endBin - startBin + 1)) / 255 * 100)
    })

    let squareSum = 0
    let peak = 0
    for (const value of time) {
      const normalized = Math.abs((value - 128) / 128)
      squareSum += normalized * normalized
      peak = Math.max(peak, normalized)
    }
    const rms = Math.round(Math.sqrt(squareSum / time.length) * 100)
    const peakPercent = Math.round(peak * 100)
    history.push({ time: Date.now(), bands, rms, peak: peakPercent })
    history = history.filter(item => Date.now() - item.time <= 12000)

    if (!frozen) render(panel, bands, rms, peakPercent, '실시간')
    rafId = requestAnimationFrame(() => tick(panel))
  }

  function renderAverage(panel, seconds) {
    const cutoff = Date.now() - seconds * 1000
    const rows = history.filter(item => item.time >= cutoff)
    if (!rows.length) return
    const bands = frequencies.map((_, index) => Math.round(rows.reduce((sum, row) => sum + row.bands[index], 0) / rows.length))
    const rms = Math.round(rows.reduce((sum, row) => sum + row.rms, 0) / rows.length)
    const peak = Math.max(...rows.map(row => row.peak))
    frozen = true
    panel.querySelector('[data-live-freeze]').textContent = '실시간 재개'
    render(panel, bands, rms, peak, `${seconds}초 평균`)
  }

  function render(panel, bands, rms, peak, mode) {
    const bars = panel.querySelectorAll('[data-live-bars] > div')
    bars.forEach((bar, index) => {
      bar.querySelector('i').style.height = `${Math.max(3, bands[index])}%`
      bar.querySelector('b').textContent = bands[index]
    })
    panel.querySelector('[data-live-rms]').textContent = `${rms}%`
    panel.querySelector('[data-live-peak]').textContent = `${peak}%`
    panel.querySelector('[data-live-mode]').textContent = mode

    const lowMid = bands[2]
    const clarity = Math.round((bands[5] + bands[6]) / 2)
    let message = '큰 불균형은 아직 감지되지 않았습니다. 같은 위치에서 한 밴드씩 조정해 비교하세요.'
    if (peak >= 96) message = '클리핑 위험 후보입니다. EQ보다 입력 게인과 채널 Peak를 먼저 확인하세요.'
    else if (lowMid > clarity + 15) message = '250Hz 부근이 명료도 대역보다 높습니다. 먹먹함이 실제로 들리는지 확인하고 Low Mid를 0.5dB씩 비교하세요.'
    else if (clarity + 12 < lowMid) message = '2~4kHz 명료도 대역이 상대적으로 약합니다. 현재 High Mid 컷 여부를 먼저 확인하세요.'
    panel.querySelector('[data-live-guidance]').innerHTML = `<p><strong>${mode} 판단</strong> ${message}</p><p>이 결과는 아이폰 마이크의 상대 비교값이며, 절대 SPL·STI·하울링 여유를 확정하지 않습니다.</p>`
  }

  createPanel()
})()
