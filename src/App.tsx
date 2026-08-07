import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Upload, SlidersHorizontal, Activity } from 'lucide-react'

type AudioState = {
  rms: number
  peak: number
  bands: number[]
}

const bandLabels = ['80', '125', '250', '500', '1k', '2k', '4k', '8k']

export default function App() {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')
  const [audio, setAudio] = useState<AudioState>({
    rms: 0,
    peak: 0,
    bands: Array(8).fill(0),
  })
  const contextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)

  useEffect(() => () => stopListening(), [])

  async function startListening() {
    try {
      setError('')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      const context = new AudioContext()
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.78
      source.connect(analyser)

      contextRef.current = context
      streamRef.current = stream
      setIsListening(true)

      const frequency = new Uint8Array(analyser.frequencyBinCount)
      const time = new Uint8Array(analyser.fftSize)
      const hzPerBin = context.sampleRate / analyser.fftSize
      const ranges = [
        [60, 100], [100, 160], [160, 350], [350, 700],
        [700, 1400], [1400, 2800], [2800, 5600], [5600, 10000],
      ]

      const update = () => {
        analyser.getByteFrequencyData(frequency)
        analyser.getByteTimeDomainData(time)

        let sum = 0
        let peak = 0
        for (const sample of time) {
          const normalized = (sample - 128) / 128
          sum += normalized * normalized
          peak = Math.max(peak, Math.abs(normalized))
        }

        const bands = ranges.map(([low, high]) => {
          const start = Math.max(0, Math.floor(low / hzPerBin))
          const end = Math.min(frequency.length - 1, Math.ceil(high / hzPerBin))
          let total = 0
          for (let i = start; i <= end; i += 1) total += frequency[i]
          return Math.round((total / Math.max(1, end - start + 1) / 255) * 100)
        })

        setAudio({
          rms: Math.round(Math.sqrt(sum / time.length) * 100),
          peak: Math.round(peak * 100),
          bands,
        })
        frameRef.current = requestAnimationFrame(update)
      }
      update()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '마이크를 시작하지 못했습니다.')
      stopListening()
    }
  }

  function stopListening() {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    void contextRef.current?.close()
    frameRef.current = null
    streamRef.current = null
    contextRef.current = null
    setIsListening(false)
  }

  const status = audio.peak > 92
    ? '클리핑 위험'
    : audio.bands[2] > 68
      ? '저중역 과다 가능성'
      : audio.bands[6] < 18 && audio.rms > 8
        ? '명료도 부족 가능성'
        : '측정 대기 또는 정상 범위'

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">X32 SPEECH EQ GUIDE · MVP</p>
          <h1>설교 음성을 듣고<br />조정 순서를 안내합니다.</h1>
          <p className="hero-copy">
            브라우저 마이크 분석과 X32 EQ 화면 확인을 결합하는 설교자용 음향 가이드입니다.
          </p>
        </div>
        <div className="status-card">
          <Activity size={20} />
          <span>현재 판단</span>
          <strong>{status}</strong>
        </div>
      </header>

      <section className="control-grid">
        <article className="panel microphone-panel">
          <div className="panel-heading">
            <div>
              <span className="step">01</span>
              <h2>실시간 설교 음성</h2>
            </div>
            <button className={isListening ? 'danger' : 'primary'} onClick={isListening ? stopListening : startListening}>
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              {isListening ? '측정 중지' : '마이크 측정 시작'}
            </button>
          </div>

          {error && <p className="error-message">{error}</p>}

          <div className="meter-row">
            <div className="metric"><span>RMS</span><strong>{audio.rms}%</strong></div>
            <div className="metric"><span>PEAK</span><strong>{audio.peak}%</strong></div>
          </div>

          <div className="spectrum" aria-label="주파수 대역별 레벨">
            {audio.bands.map((value, index) => (
              <div className="band" key={bandLabels[index]}>
                <div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(3, value)}%` }} /></div>
                <strong>{value}</strong>
                <span>{bandLabels[index]}Hz</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel upload-panel">
          <div className="panel-heading compact">
            <div>
              <span className="step">02</span>
              <h2>X32 EQ 화면</h2>
            </div>
            <SlidersHorizontal size={22} />
          </div>
          <label className="upload-zone">
            <Upload size={28} />
            <strong>EQ 화면 이미지 선택</strong>
            <span>PNG·JPG · 판독값은 사용자가 확인하는 방식</span>
            <input type="file" accept="image/png,image/jpeg" />
          </label>
          <div className="eq-preview">
            <p>초기 MVP에서는 이미지 업로드와 수동 확인형 입력부터 제공합니다.</p>
            <div className="eq-points">
              <span>Low Cut</span><span>Low</span><span>Low Mid</span><span>High Mid</span><span>High</span>
            </div>
          </div>
        </article>
      </section>

      <section className="panel recommendation-panel">
        <div className="panel-heading compact">
          <div>
            <span className="step">03</span>
            <h2>안전한 조정 가이드</h2>
          </div>
        </div>
        <div className="recommendations">
          <div><span>1</span><p><strong>게인과 클리핑을 먼저 확인</strong>EQ보다 입력 레벨을 먼저 안정화합니다.</p></div>
          <div><span>2</span><p><strong>과도한 부스트를 원점으로 복원</strong>문제 대역을 새로 깎기 전에 현재 부스트가 원인인지 확인합니다.</p></div>
          <div><span>3</span><p><strong>한 번에 한 밴드만 변경</strong>적용 후 동일한 거리와 문장으로 재측정합니다.</p></div>
        </div>
      </section>

      <footer>분석 결과는 전문 음향 엔지니어의 현장 판단을 대체하지 않습니다.</footer>
    </main>
  )
}
