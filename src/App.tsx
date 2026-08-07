import { useEffect, useRef, useState } from 'react'
import { Activity, CheckCircle2, Clock3, Mic, MicOff, RotateCcw, SlidersHorizontal, Upload } from 'lucide-react'

type AudioState = {
  rms: number
  peak: number
  bands: number[]
}

type Sample = AudioState & { at: number }

type AnalysisResult = {
  duration: number
  averageRms: number
  maxPeak: number
  averageBands: number[]
  score: number
  findings: string[]
  recommendations: string[]
}

const MEASUREMENT_SECONDS = 30
const bandLabels = ['80', '125', '250', '500', '1k', '2k', '4k', '8k']

const emptyAudio: AudioState = {
  rms: 0,
  peak: 0,
  bands: Array(8).fill(0),
}

export default function App() {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')
  const [audio, setAudio] = useState<AudioState>(emptyAudio)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const samplesRef = useRef<Sample[]>([])

  useEffect(() => () => stopHardware(), [])

  async function startListening() {
    try {
      stopHardware()
      setError('')
      setResult(null)
      setElapsed(0)
      setAudio(emptyAudio)
      samplesRef.current = []

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
      startedAtRef.current = performance.now()
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

        const nextAudio = {
          rms: Math.round(Math.sqrt(sum / time.length) * 100),
          peak: Math.round(peak * 100),
          bands,
        }
        const elapsedSeconds = (performance.now() - startedAtRef.current) / 1000
        setAudio(nextAudio)
        setElapsed(Math.min(MEASUREMENT_SECONDS, elapsedSeconds))
        samplesRef.current.push({ ...nextAudio, at: elapsedSeconds })

        if (elapsedSeconds >= MEASUREMENT_SECONDS) {
          finishMeasurement()
          return
        }
        frameRef.current = requestAnimationFrame(update)
      }
      update()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '마이크를 시작하지 못했습니다.')
      stopHardware()
    }
  }

  function stopHardware() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    if (contextRef.current && contextRef.current.state !== 'closed') void contextRef.current.close()
    frameRef.current = null
    streamRef.current = null
    contextRef.current = null
    setIsListening(false)
  }

  function finishMeasurement() {
    const samples = samplesRef.current
    stopHardware()
    if (samples.length < 15) {
      setError('분석하기에는 측정 시간이 너무 짧습니다. 최소 5초 이상 평소 설교 음성으로 다시 측정해 주세요.')
      return
    }

    const duration = samples.at(-1)?.at ?? 0
    const averageRms = Math.round(samples.reduce((sum, sample) => sum + sample.rms, 0) / samples.length)
    const maxPeak = Math.max(...samples.map((sample) => sample.peak))
    const averageBands = bandLabels.map((_, index) => Math.round(
      samples.reduce((sum, sample) => sum + sample.bands[index], 0) / samples.length,
    ))

    const findings: string[] = []
    const recommendations: string[] = []
    let score = 100

    if (maxPeak >= 92) {
      findings.push('입력 피크가 높아 클리핑 위험이 있습니다.')
      recommendations.push('X32 입력 게인을 먼저 2~4dB 낮추고 다시 측정하세요.')
      score -= 22
    } else if (maxPeak < 25) {
      findings.push('입력 레벨이 낮아 작은 발음이 묻힐 수 있습니다.')
      recommendations.push('게인을 소폭 높이되, 큰 발성에서 Peak 80~90%를 넘지 않게 확인하세요.')
      score -= 12
    }

    if (averageRms < 4) {
      findings.push('평균 음량이 너무 낮거나 마이크 거리가 멀 수 있습니다.')
      recommendations.push('마이크와 입의 거리를 일정하게 유지한 뒤 다시 측정하세요.')
      score -= 15
    }

    if (averageBands[2] > averageBands[5] + 14) {
      findings.push('160~350Hz 저중역이 상대적으로 많아 먹먹하게 들릴 가능성이 있습니다.')
      recommendations.push('X32 Low Mid에서 220~320Hz를 Q 1.2~1.8, -1~-2dB부터 시험하세요.')
      score -= 15
    }

    if (averageBands[6] + 8 < averageBands[2] && averageRms >= 4) {
      findings.push('2.8~5.6kHz 명료도 대역이 상대적으로 부족합니다.')
      recommendations.push('먼저 현재 2~4kHz 컷 설정을 0dB 쪽으로 복원한 뒤 재측정하세요.')
      score -= 12
    }

    if (averageBands[7] > averageBands[5] + 16) {
      findings.push('5.6~10kHz가 상대적으로 강해 치찰음이나 피로감이 생길 수 있습니다.')
      recommendations.push('High 또는 High Mid의 과도한 부스트를 1~2dB 줄여 비교하세요.')
      score -= 10
    }

    if (findings.length === 0) {
      findings.push('이번 측정에서는 뚜렷한 과다 대역이나 클리핑 신호가 발견되지 않았습니다.')
      recommendations.push('현재 설정을 기준으로 객석 위치를 바꿔 한 번 더 비교 측정하세요.')
    }

    setResult({
      duration: Math.round(duration * 10) / 10,
      averageRms,
      maxPeak,
      averageBands,
      score: Math.max(35, score),
      findings,
      recommendations,
    })
  }

  function resetMeasurement() {
    stopHardware()
    samplesRef.current = []
    setAudio(emptyAudio)
    setElapsed(0)
    setResult(null)
    setError('')
  }

  const remaining = Math.max(0, Math.ceil(MEASUREMENT_SECONDS - elapsed))
  const status = isListening
    ? `${remaining}초 남음`
    : result
      ? `분석 완료 · ${result.score}점`
      : '30초 측정 대기'

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">X32 SPEECH EQ GUIDE · MVP 0.2</p>
          <h1>30초 설교 음성을 측정하고<br />즉시 분석합니다.</h1>
          <p className="hero-copy">
            평소 설교하듯 일정한 거리에서 말씀해 주세요. 30초 후 자동 종료되며, 중간에 정지를 눌러도 누적된 음향으로 분석합니다.
          </p>
        </div>
        <div className="status-card">
          <Activity size={20} />
          <span>현재 상태</span>
          <strong>{status}</strong>
          <div className="progress-track" aria-label="측정 진행률">
            <div className="progress-fill" style={{ width: `${Math.min(100, (elapsed / MEASUREMENT_SECONDS) * 100)}%` }} />
          </div>
        </div>
      </header>

      <section className="control-grid">
        <article className="panel microphone-panel">
          <div className="panel-heading">
            <div>
              <span className="step">01</span>
              <h2>30초 설교 음성 측정</h2>
            </div>
            <div className="button-row">
              {result && (
                <button className="secondary" onClick={resetMeasurement}>
                  <RotateCcw size={18} />다시 측정
                </button>
              )}
              <button className={isListening ? 'danger' : 'primary'} onClick={isListening ? finishMeasurement : startListening}>
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                {isListening ? '정지하고 분석' : '30초 측정 시작'}
              </button>
            </div>
          </div>

          {error && <p className="error-message">{error}</p>}

          <div className="timer-card">
            <Clock3 size={20} />
            <div><span>측정 시간</span><strong>{elapsed.toFixed(1)} / {MEASUREMENT_SECONDS}초</strong></div>
            <p>{isListening ? '평소 설교 속도와 음량으로 계속 말씀해 주세요.' : result ? '측정이 끝났습니다. 아래 분석 결과를 확인하세요.' : '최소 5초, 권장 30초입니다.'}</p>
          </div>

          <div className="meter-row">
            <div className="metric"><span>현재 RMS</span><strong>{audio.rms}%</strong></div>
            <div className="metric"><span>현재 PEAK</span><strong>{audio.peak}%</strong></div>
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
            <span>PNG·JPG · 다음 단계에서 설정값 확인 기능을 연결합니다.</span>
            <input type="file" accept="image/png,image/jpeg" />
          </label>
          <div className="eq-preview">
            <p>이번 버전의 결과는 마이크 수음만 기준으로 한 1차 후보입니다. X32 이미지와 결합하기 전에는 자동 확정하지 않습니다.</p>
            <div className="eq-points">
              <span>Low Cut</span><span>Low</span><span>Low Mid</span><span>High Mid</span><span>High</span>
            </div>
          </div>
        </article>
      </section>

      {result && (
        <section className="panel result-panel">
          <div className="panel-heading compact">
            <div>
              <span className="step">03</span>
              <h2>설교 음향 1차 분석 결과</h2>
            </div>
            <div className="score-badge"><CheckCircle2 size={20} /><strong>{result.score}점</strong></div>
          </div>

          <div className="result-metrics">
            <div><span>측정 시간</span><strong>{result.duration}초</strong></div>
            <div><span>평균 RMS</span><strong>{result.averageRms}%</strong></div>
            <div><span>최대 Peak</span><strong>{result.maxPeak}%</strong></div>
          </div>

          <div className="analysis-columns">
            <div className="analysis-box">
              <h3>감지된 상태</h3>
              {result.findings.map((finding) => <p key={finding}>{finding}</p>)}
            </div>
            <div className="analysis-box recommendation-box">
              <h3>안전한 조정 후보</h3>
              {result.recommendations.map((recommendation, index) => (
                <p key={recommendation}><span>{index + 1}</span>{recommendation}</p>
              ))}
            </div>
          </div>

          <div className="average-spectrum">
            <h3>측정 전체 평균 대역</h3>
            <div className="compact-spectrum">
              {result.averageBands.map((value, index) => (
                <div key={bandLabels[index]}><span>{bandLabels[index]}Hz</span><strong>{value}</strong></div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="panel recommendation-panel">
        <div className="panel-heading compact">
          <div>
            <span className="step">04</span>
            <h2>적용 원칙</h2>
          </div>
        </div>
        <div className="recommendations">
          <div><span>1</span><p><strong>게인과 클리핑을 먼저 확인</strong>EQ보다 입력 레벨을 먼저 안정화합니다.</p></div>
          <div><span>2</span><p><strong>한 번에 한 항목만 변경</strong>권장값은 시작점이며, 적용 후 같은 문장으로 재측정합니다.</p></div>
          <div><span>3</span><p><strong>객석 청취로 최종 확인</strong>브라우저 마이크 결과만으로 X32 설정을 자동 확정하지 않습니다.</p></div>
        </div>
      </section>

      <footer>현재 점수는 MVP 비교용 지표이며 전문 음향 측정기나 현장 엔지니어의 판단을 대체하지 않습니다.</footer>
    </main>
  )
}
