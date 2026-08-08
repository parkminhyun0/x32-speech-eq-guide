import { useEffect, useRef, useState } from 'react'
import SingleTapButton from './SingleTapButton'
import type { LiveAnalysisEvidence } from './types'

const frequencies = [80, 125, 250, 500, 1000, 2000, 4000, 8000]
const labels = ['80', '125', '250', '500', '1k', '2k', '4k', '8k']

type HistoryRow = {
  time: number
  bands: number[]
  rms: number
  peak: number
}

type Props = {
  onEvidence?: (evidence: LiveAnalysisEvidence) => void
}

type WebkitWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

export default function LiveIpadMonitor({ onEvidence }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef(0)
  const historyRef = useRef<HistoryRow[]>([])
  const frozenRef = useRef(false)
  const currentRef = useRef({ bands: Array(8).fill(0) as number[], rms: 0, peak: 0, mode: '실시간' })

  const [active, setActive] = useState(false)
  const [frozen, setFrozen] = useState(false)
  const [status, setStatus] = useState('대기')
  const [mode, setMode] = useState('실시간')
  const [bands, setBands] = useState(Array(8).fill(0) as number[])
  const [rms, setRms] = useState(0)
  const [peak, setPeak] = useState(0)
  const [guidance, setGuidance] = useState('아이패드는 카메라에 보이게 세우고, 아이폰 하단 마이크를 손이나 케이스로 막지 마세요.')

  useEffect(() => () => stopHardware(), [])

  function stopHardware() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') void audioContextRef.current.close()
    audioContextRef.current = null
    analyserRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  function resetUi() {
    frozenRef.current = false
    currentRef.current = { bands: Array(8).fill(0), rms: 0, peak: 0, mode: '실시간' }
    setFrozen(false)
    setActive(false)
    setStatus('대기')
    setMode('실시간')
    setBands(Array(8).fill(0))
    setRms(0)
    setPeak(0)
  }

  function stopMonitor() {
    stopHardware()
    resetUi()
  }

  async function startMonitor() {
    try {
      stopHardware()
      resetUi()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      streamRef.current = stream
      if (!videoRef.current) throw new Error('video element unavailable')
      videoRef.current.srcObject = stream
      await videoRef.current.play()

      const Context = window.AudioContext || (window as WebkitWindow).webkitAudioContext
      if (!Context) throw new Error('Web Audio API unavailable')
      const context = new Context()
      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.72
      context.createMediaStreamSource(stream).connect(analyser)
      audioContextRef.current = context
      analyserRef.current = analyser
      historyRef.current = []
      frozenRef.current = false

      setActive(true)
      setStatus('LIVE')
      setGuidance('카메라와 마이크가 작동 중입니다. 아이패드 화면 전체가 가이드 안에 들어오도록 거리를 맞추세요.')
      tick()
    } catch (error) {
      console.error('Live monitor failed', error)
      stopHardware()
      setActive(false)
      setStatus('권한 필요')
      setGuidance('시작하지 못했습니다. Safari 설정에서 카메라와 마이크 권한을 허용한 뒤 다시 시도하세요.')
    }
  }

  function tick() {
    const analyser = analyserRef.current
    const context = audioContextRef.current
    if (!analyser || !context) return

    const bins = new Uint8Array(analyser.frequencyBinCount)
    const time = new Uint8Array(analyser.fftSize)
    analyser.getByteFrequencyData(bins)
    analyser.getByteTimeDomainData(time)

    const nextBands = frequencies.map((frequency) => {
      const startHz = frequency / Math.sqrt(2)
      const endHz = frequency * Math.sqrt(2)
      const startBin = Math.max(0, Math.floor(startHz / (context.sampleRate / 2) * bins.length))
      const endBin = Math.min(bins.length - 1, Math.ceil(endHz / (context.sampleRate / 2) * bins.length))
      let sum = 0
      for (let index = startBin; index <= endBin; index += 1) sum += bins[index]
      return Math.round((sum / Math.max(1, endBin - startBin + 1)) / 255 * 100)
    })

    let squareSum = 0
    let nextPeak = 0
    for (const value of time) {
      const normalized = Math.abs((value - 128) / 128)
      squareSum += normalized * normalized
      nextPeak = Math.max(nextPeak, normalized)
    }
    const nextRms = Math.round(Math.sqrt(squareSum / time.length) * 100)
    const nextPeakPercent = Math.round(nextPeak * 100)
    const now = Date.now()
    historyRef.current.push({ time: now, bands: nextBands, rms: nextRms, peak: nextPeakPercent })
    historyRef.current = historyRef.current.filter((item) => now - item.time <= 12000)

    if (!frozenRef.current) renderValues(nextBands, nextRms, nextPeakPercent, '실시간')
    rafRef.current = requestAnimationFrame(tick)
  }

  function renderValues(nextBands: number[], nextRms: number, nextPeak: number, nextMode: string) {
    currentRef.current = { bands: [...nextBands], rms: nextRms, peak: nextPeak, mode: nextMode }
    setBands(nextBands)
    setRms(nextRms)
    setPeak(nextPeak)
    setMode(nextMode)

    const lowMid = nextBands[2]
    const clarity = Math.round((nextBands[5] + nextBands[6]) / 2)
    let message = '큰 불균형은 아직 감지되지 않았습니다. 같은 위치에서 한 밴드씩 조정해 비교하세요.'
    if (nextPeak >= 96) message = '클리핑 위험 후보입니다. EQ보다 입력 게인과 채널 Peak를 먼저 확인하세요.'
    else if (lowMid > clarity + 15) message = '250Hz 부근이 명료도 대역보다 높습니다. 먹먹함이 실제로 들리는지 확인하고 Low Mid를 0.5dB씩 비교하세요.'
    else if (clarity + 12 < lowMid) message = '2~4kHz 명료도 대역이 상대적으로 약합니다. 현재 High Mid 컷 여부를 먼저 확인하세요.'
    setGuidance(`${nextMode} 판단 · ${message}`)
  }

  function toggleFreeze() {
    const next = !frozenRef.current
    frozenRef.current = next
    setFrozen(next)
    const nextMode = next ? '고정됨' : '실시간'
    currentRef.current = { ...currentRef.current, mode: nextMode }
    setMode(nextMode)
  }

  function renderAverage(seconds: number) {
    const cutoff = Date.now() - seconds * 1000
    const rows = historyRef.current.filter((item) => item.time >= cutoff)
    if (!rows.length) return
    const nextBands = frequencies.map((_, index) => Math.round(rows.reduce((sum, row) => sum + row.bands[index], 0) / rows.length))
    const nextRms = Math.round(rows.reduce((sum, row) => sum + row.rms, 0) / rows.length)
    const nextPeak = Math.max(...rows.map((row) => row.peak))
    frozenRef.current = true
    setFrozen(true)
    renderValues(nextBands, nextRms, nextPeak, `${seconds}초 평균`)
  }

  function captureFrame() {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) return undefined
    const width = Math.min(1280, video.videoWidth)
    const height = Math.round(width * video.videoHeight / video.videoWidth)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return undefined
    context.drawImage(video, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', 0.86)
  }

  function integrateEvidence() {
    if (!active) return
    const current = currentRef.current
    const evidence: LiveAnalysisEvidence = {
      capturedAt: Date.now(),
      mode: current.mode,
      rms: current.rms,
      peak: current.peak,
      bands: [...current.bands],
      frameDataUrl: captureFrame(),
    }
    onEvidence?.(evidence)
    setStatus('통합됨')
    setGuidance(`${current.mode} 값과 아이패드 X32 화면을 통합 EQ 판단으로 전달했습니다. 아래 X32 동일 배열에서 현재값과 보정 후보를 비교하세요.`)
    window.setTimeout(() => document.getElementById('x32-eq-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }

  return (
    <section className="panel live-ipad-monitor" id="live-monitor-workspace">
      <div className="panel-heading compact">
        <div><span className="step">LIVE</span><h2>아이패드 X32 화면 + 회중석 음향</h2></div>
        <span className={`live-status ${active ? 'active' : ''}`}>{status}</span>
      </div>
      <p className="live-help">아이폰 후면 카메라로 아이패드 미니의 EQ/RTA 화면을 비추면, 같은 아이폰 마이크가 회중석 소리를 동시에 분석합니다. 아이패드는 무음으로 두세요.</p>
      <div className="live-layout">
        <div className="live-video-wrap">
          <video ref={videoRef} playsInline muted />
          <div className="screen-guide"><span>아이패드 EQ/RTA 화면을 이 안에 맞추세요</span></div>
          {!active && <div className="live-video-placeholder">카메라를 시작하면 아이패드 화면이 표시됩니다.</div>}
        </div>
        <div className="live-rta-card">
          <div className="live-rta-head"><strong>회중석 실시간 RTA</strong><span>{mode}</span></div>
          <div className="live-bars">
            {labels.map((label, index) => (
              <div key={label}>
                <span className="live-bar-track"><i style={{ height: `${Math.max(3, bands[index])}%` }} /></span>
                <b>{bands[index]}</b>
                <small>{label}</small>
              </div>
            ))}
          </div>
          <div className="live-metrics"><span>RMS <b>{rms}%</b></span><span>Peak <b>{peak}%</b></span></div>
        </div>
      </div>
      <div className="live-controls">
        <SingleTapButton className="live-primary" disabled={active} onActivate={startMonitor}>카메라+음향 시작</SingleTapButton>
        <SingleTapButton disabled={!active} onActivate={toggleFreeze}>{frozen ? '실시간 재개' : '화면 고정'}</SingleTapButton>
        <SingleTapButton disabled={!active} onActivate={() => renderAverage(3)}>3초 평균</SingleTapButton>
        <SingleTapButton disabled={!active} onActivate={() => renderAverage(10)}>10초 평균</SingleTapButton>
        <SingleTapButton className="live-primary" disabled={!active} onActivate={integrateEvidence}>X32 화면·음향 통합</SingleTapButton>
        <SingleTapButton disabled={!active} onActivate={stopMonitor}>종료</SingleTapButton>
      </div>
      <div className="live-guidance">
        <p><strong>{mode}</strong> {guidance}</p>
        <p>이 결과는 아이폰 마이크의 상대 비교값이며, 절대 SPL·STI·하울링 여유를 확정하지 않습니다. 캡처 화면의 숫자는 OCR 검토 후 현재 X32 값으로 확정합니다.</p>
      </div>
    </section>
  )
}
