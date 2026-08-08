import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, CheckCircle2, Clock3, Mic, MicOff, RotateCcw, SlidersHorizontal, Upload } from 'lucide-react'
import EqCurve from './EqCurve'
import LiveIpadMonitor from './LiveIpadMonitor'
import MeasurementConfidence from './MeasurementConfidence'
import SingleTapButton from './SingleTapButton'
import SourceModeWorkspace from './SourceModeWorkspace'
import SpeechPresetAdvisor from './SpeechPresetAdvisor'
import ToneGuide from './ToneGuide'
import X32Ocr from './X32Ocr'
import {
  DEFAULT_PROFILE_ID,
  MODE_LABELS,
  cloneProfileBands,
  getEqProfile,
} from './sourceProfiles'
import type { EqProfile } from './sourceProfiles'
import type { AnalysisResult, AudioState, EqBand, EqFilterType, Sample } from './types'
import './x32-controls.css'

const MEASUREMENT_SECONDS = 30
const bandLabels = ['80', '125', '250', '500', '1k', '2k', '4k', '8k']
const bandDisplayLabels = ['80Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz']
const bandFrequencies = [80, 125, 250, 500, 1000, 2000, 4000, 8000]
const ranges = [[60, 100], [100, 160], [160, 350], [350, 700], [700, 1400], [1400, 2800], [2800, 5600], [5600, 10000]]
const emptyAudio: AudioState = { rms: 0, peak: 0, bands: Array(8).fill(0) }
const defaultProfile = getEqProfile(DEFAULT_PROFILE_ID)

function nearestEqBand(profile: EqProfile, frequency: number) {
  return [...profile.eqBands].sort((a, b) => (
    Math.abs(Math.log2(Math.max(20, frequency) / a.frequency))
    - Math.abs(Math.log2(Math.max(20, frequency) / b.frequency))
  ))[0]
}

function gainLabel(gain: number) {
  return gain > 0 ? `+${gain}dB` : `${gain}dB`
}

export default function App() {
  const [activeProfileId, setActiveProfileId] = useState(DEFAULT_PROFILE_ID)
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')
  const [audio, setAudio] = useState<AudioState>(emptyAudio)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [imageName, setImageName] = useState('')
  const [lowCutEnabled, setLowCutEnabled] = useState(defaultProfile.lowCutEnabled)
  const [lowCutFrequency, setLowCutFrequency] = useState(defaultProfile.lowCutFrequency)
  const [eqBands, setEqBands] = useState<EqBand[]>(cloneProfileBands(defaultProfile))
  const contextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const samplesRef = useRef<Sample[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const activeProfile = getEqProfile(activeProfileId)

  useEffect(() => () => stopHardware(), [])

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl)
  }, [imageUrl])

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
          for (let index = start; index <= end; index += 1) total += frequency[index]
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
    const duration = samples.at(-1)?.at ?? 0
    if (duration < 5) {
      setError('분석하기에는 측정 시간이 너무 짧습니다. 최소 5초 이상 측정해 주세요.')
      return
    }

    const averageRms = Math.round(samples.reduce((sum, sample) => sum + sample.rms, 0) / samples.length)
    const maxPeak = Math.max(...samples.map((sample) => sample.peak))
    const averageBands = bandLabels.map((_, index) => Math.round(samples.reduce((sum, sample) => sum + sample.bands[index], 0) / samples.length))
    const findings: string[] = []
    const recommendations: string[] = []
    let score = 100

    if (maxPeak >= 92) {
      findings.push('입력 피크가 높아 클리핑 위험이 있습니다.')
      recommendations.push('EQ보다 X32 입력 Gain과 신호 경로를 먼저 낮춰 다시 측정하세요.')
      score -= 22
    } else if (maxPeak < 25) {
      findings.push('입력 레벨이 낮아 작은 소리와 잔향의 구분이 어려울 수 있습니다.')
      recommendations.push('가장 큰 소리의 Peak를 확인하며 입력 Gain을 소폭 높이세요.')
      score -= 12
    }
    if (averageRms < 4) {
      findings.push('평균 레벨이 낮거나 측정 마이크와 소스의 거리가 멀 수 있습니다.')
      recommendations.push('같은 위치와 거리에서 기준 샘플을 다시 확보하세요.')
      score -= 15
    }

    const deviations = averageBands
      .map((value, index) => ({ index, value, difference: value - activeProfile.targetCenter[index] }))
      .filter((item) => Math.abs(item.difference) >= 14)
      .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
      .slice(0, 3)

    deviations.forEach((item) => {
      const direction = item.difference > 0 ? '강한' : '약한'
      const eqBand = nearestEqBand(activeProfile, bandFrequencies[item.index])
      findings.push(`${bandDisplayLabels[item.index]} 대역이 ${activeProfile.shortLabel} 비교 중심보다 ${direction} 후보입니다.`)
      recommendations.push(`${eqBand.name} ${eqBand.frequency}Hz ${gainLabel(eqBand.gain)}, Q ${eqBand.q}를 출발점으로 한 밴드만 A/B 비교하세요.`)
      score -= Math.min(12, Math.round(Math.abs(item.difference) / 2))
    })

    if (!findings.length) {
      findings.push('뚜렷한 클리핑이나 프로필 비교 범위의 큰 편차가 발견되지 않았습니다.')
      recommendations.push('현재 값을 기준으로 다른 청취 위치 또는 전체 믹스에서 다시 비교하세요.')
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

  function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setImageUrl(URL.createObjectURL(file))
    setImageName(file.name)
    event.target.value = ''
  }

  function clearImage() {
    setImageUrl('')
    setImageName('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function updateEqBand(index: number, field: 'frequency' | 'gain' | 'q', value: number) {
    setEqBands((current) => current.map((band, bandIndex) => (
      bandIndex === index ? { ...band, [field]: value } : band
    )))
  }

  function updateEqFilterType(index: number, filterType: EqFilterType) {
    setEqBands((current) => current.map((band, bandIndex) => (
      bandIndex === index ? { ...band, filterType } : band
    )))
  }

  function applyOcr(bands: EqBand[], lowCut: number | null) {
    setEqBands(bands.map((band, index) => ({
      ...band,
      filterType: band.filterType ?? eqBands[index]?.filterType ?? 'PEQ',
    })))
    if (lowCut !== null) {
      setLowCutEnabled(true)
      setLowCutFrequency(lowCut)
    }
  }

  function applySourceProfile(profile: EqProfile) {
    setActiveProfileId(profile.id)
    setLowCutEnabled(profile.lowCutEnabled)
    setLowCutFrequency(profile.lowCutFrequency)
    setEqBands(cloneProfileBands(profile))
  }

  const crossChecks = useMemo(() => {
    if (!result) return ['측정을 완료하면 현재 X32 입력값과 선택 프로필의 차이를 표시합니다.']
    const checks: string[] = []

    if (activeProfile.lowCutEnabled && !lowCutEnabled) {
      checks.push(`${activeProfile.shortLabel} 프로필은 Low Cut ${activeProfile.lowCutFrequency}Hz를 시작 후보로 사용합니다. 현재는 꺼져 있습니다.`)
    }
    if (lowCutEnabled && Math.abs(lowCutFrequency - activeProfile.lowCutFrequency) >= 40) {
      checks.push(`현재 Low Cut ${lowCutFrequency}Hz와 프로필 시작값 ${activeProfile.lowCutFrequency}Hz의 차이가 큽니다. 음성·악기 몸통 손실을 확인하세요.`)
    }

    eqBands.forEach((band, index) => {
      const candidate = activeProfile.eqBands[index]
      if (!candidate) return
      if (Math.abs(band.gain - candidate.gain) >= 4) {
        checks.push(`${band.name} Gain ${gainLabel(band.gain)}은 선택 프로필 시작값 ${gainLabel(candidate.gain)}과 차이가 큽니다.`)
      }
      if (band.filterType && candidate.filterType && band.filterType !== candidate.filterType) {
        checks.push(`${band.name} 필터가 ${band.filterType}입니다. 프로필 후보 ${candidate.filterType}과 역할이 다른지 확인하세요.`)
      }
    })

    return checks.length
      ? checks.slice(0, 5)
      : ['현재 입력한 X32 값과 선택 프로필 사이에 큰 구조적 충돌은 없습니다. 한 밴드씩 변경하며 재측정하세요.']
  }, [result, eqBands, lowCutEnabled, lowCutFrequency, activeProfile])

  const remaining = Math.max(0, Math.ceil(MEASUREMENT_SECONDS - elapsed))
  const status = isListening ? `${remaining}초 남음` : result ? `분석 완료 · ${result.score}점` : '30초 측정 대기'
  const modeLabel = MODE_LABELS[activeProfile.mode]

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">X32 SOURCE EQ GUIDE · MVP 1.2</p>
          <h1>{modeLabel} 기준 곡선과 실측 소리를<br />한 화면에서 비교합니다.</h1>
          <p className="hero-copy">설교자·보컬·악기 프로필을 선택하고 30초 실측, 현재 X32 설정, 보수적인 시작값을 겹쳐 보며 최적화합니다.</p>
        </div>
        <div className="status-card">
          <Activity size={20} />
          <span>현재 상태 · {activeProfile.shortLabel}</span>
          <strong>{status}</strong>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(100, (elapsed / MEASUREMENT_SECONDS) * 100)}%` }} /></div>
        </div>
      </header>

      <SourceModeWorkspace
        activeProfileId={activeProfileId}
        result={result}
        onProfileChange={setActiveProfileId}
        onApplyProfile={applySourceProfile}
      />

      <section className="control-grid">
        <article className="panel microphone-panel">
          <div className="panel-heading">
            <div><span className="step">01</span><h2>30초 {activeProfile.measurementLabel} 측정</h2></div>
            <div className="button-row">
              {result && <SingleTapButton className="secondary" onActivate={resetMeasurement}><RotateCcw size={18} />다시 측정</SingleTapButton>}
              <SingleTapButton className={isListening ? 'danger' : 'primary'} onActivate={isListening ? finishMeasurement : startListening}>
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                {isListening ? '정지하고 분석' : '30초 측정 시작'}
              </SingleTapButton>
            </div>
          </div>
          {error && <p className="error-message">{error}</p>}
          <div className="timer-card">
            <Clock3 size={20} />
            <div><span>측정 시간</span><strong>{elapsed.toFixed(1)} / 30초</strong></div>
            <p>{isListening ? `${activeProfile.measurementLabel}을 평소 실제 레벨로 유지해 주세요.` : result ? '측정 완료. 아래 곡선과 X32 설정을 대조하세요.' : '최소 5초, 권장 30초입니다.'}</p>
          </div>
          <div className="meter-row">
            <div className="metric"><span>현재 RMS</span><strong>{audio.rms}%</strong></div>
            <div className="metric"><span>현재 PEAK</span><strong>{audio.peak}%</strong></div>
          </div>
          <div className="spectrum">
            {audio.bands.map((value, index) => (
              <div className="band" key={bandLabels[index]}>
                <div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(3, value)}%` }} /></div>
                <strong>{value}</strong><span>{bandLabels[index]}Hz</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel upload-panel">
          <div className="panel-heading compact">
            <div><span className="step">02</span><h2>X32 EQ 화면·설정</h2></div>
            <SlidersHorizontal size={22} />
          </div>
          <input
            ref={fileInputRef}
            id="x32-image-input"
            className="visually-hidden-file-input"
            type="file"
            accept="image/png,image/jpeg"
            capture="environment"
            onChange={handleImage}
          />
          <SingleTapButton className="upload-zone" onActivate={() => fileInputRef.current?.click()}>
            <Upload size={28} />
            <strong>EQ 화면 이미지 선택</strong>
            <span>휴대폰 촬영 또는 화면 캡처를 사용할 수 있습니다.</span>
          </SingleTapButton>
          {imageUrl && (
            <>
              <div className="x32-image-preview"><img src={imageUrl} alt="업로드한 X32 EQ 화면" /></div>
              <p className="image-meta">{imageName}</p>
              <SingleTapButton className="clear-image" onActivate={clearImage}>이미지 지우기</SingleTapButton>
            </>
          )}
          <div className="eq-form">
            <div className="lowcut-row">
              <label><input type="checkbox" checked={lowCutEnabled} onChange={(event) => setLowCutEnabled(event.target.checked)} />Low Cut 사용</label>
              <label>Hz <input type="number" inputMode="numeric" min="20" max="400" value={lowCutFrequency} onChange={(event) => setLowCutFrequency(Number(event.target.value))} /></label>
            </div>
            <div className="eq-form-header"><span>Band</span><span>Type</span><span>Freq</span><span>Gain</span><span>Q</span></div>
            {eqBands.map((band, index) => (
              <div className="eq-band-row" key={band.name}>
                <strong>{band.name}</strong>
                <select aria-label={`${band.name} filter type`} value={band.filterType ?? 'PEQ'} onChange={(event) => updateEqFilterType(index, event.target.value as EqFilterType)}>
                  <option value="PEQ">PEQ</option>
                  <option value="LowShelf">Low Shelf</option>
                  <option value="HighShelf">High Shelf</option>
                </select>
                <input aria-label={`${band.name} frequency`} type="number" inputMode="numeric" value={band.frequency} onChange={(event) => updateEqBand(index, 'frequency', Number(event.target.value))} />
                <input aria-label={`${band.name} gain`} type="number" inputMode="decimal" step="0.5" value={band.gain} onChange={(event) => updateEqBand(index, 'gain', Number(event.target.value))} />
                <input aria-label={`${band.name} q`} type="number" inputMode="decimal" step="0.1" min="0.3" max="10" value={band.q} onChange={(event) => updateEqBand(index, 'q', Number(event.target.value))} />
              </div>
            ))}
          </div>
        </article>
      </section>

      <X32Ocr imageUrl={imageUrl} onApply={applyOcr} />

      {result && (
        <section className="panel result-panel">
          <div className="panel-heading compact">
            <div><span className="step">03</span><h2>{activeProfile.label} 분석 결과</h2></div>
            <div className="score-badge"><CheckCircle2 size={20} /><strong>{result.score}점</strong></div>
          </div>
          <div className="result-metrics">
            <div><span>측정 시간</span><strong>{result.duration}초</strong></div>
            <div><span>평균 RMS</span><strong>{result.averageRms}%</strong></div>
            <div><span>최대 Peak</span><strong>{result.maxPeak}%</strong></div>
          </div>
          <div className="analysis-columns">
            <div className="analysis-box"><h3>감지된 상태</h3>{result.findings.map((item) => <p key={item}>{item}</p>)}</div>
            <div className="analysis-box recommendation-box">
              <h3>X32 대조·조정 후보</h3>
              {[...result.recommendations, ...crossChecks].map((item, index) => <p key={`${item}-${index}`}><span>{index + 1}</span>{item}</p>)}
            </div>
          </div>
        </section>
      )}

      <EqCurve
        measuredBands={result?.averageBands}
        eqBands={eqBands}
        lowCutEnabled={lowCutEnabled}
        lowCutFrequency={lowCutFrequency}
        targetCenter={activeProfile.targetCenter}
        targetRange={activeProfile.targetRange}
        targetLabel={activeProfile.label}
      />
      {activeProfile.mode === 'preacher' && <ToneGuide />}
      {activeProfile.mode === 'preacher' && <SpeechPresetAdvisor result={result} eqBands={eqBands} />}
      <MeasurementConfidence result={result} />
      <LiveIpadMonitor />

      <section className="panel recommendation-panel">
        <div className="panel-heading compact"><div><span className="step">RULES</span><h2>공통 적용 원칙</h2></div></div>
        <div className="recommendations">
          <div><span>1</span><p><strong>Pre-EQ Gate</strong>Gain, 클리핑, 마이크·라우팅과 깨끗한 기준 상태를 먼저 확인합니다.</p></div>
          <div><span>2</span><p><strong>한 번에 한 밴드</strong>범위 후보를 작게 적용한 뒤 같은 소리와 위치로 재측정합니다.</p></div>
          <div><span>3</span><p><strong>소스와 시스템 분리</strong>채널 Tone EQ와 공간·Monitor·Main Feedback 처리를 구분합니다.</p></div>
        </div>
      </section>

      <div className="mobile-action-dock">
        <SingleTapButton className="mobile-secondary" onActivate={resetMeasurement} aria-label="초기화"><RotateCcw size={20} /></SingleTapButton>
        <SingleTapButton className={isListening ? 'mobile-danger' : 'mobile-primary'} onActivate={isListening ? finishMeasurement : startListening}>
          {isListening ? <MicOff size={20} /> : <Mic size={20} />}
          {isListening ? '정지·분석' : '30초 측정'}
        </SingleTapButton>
      </div>
      <footer>프로필 값은 비교용 시작점입니다. 휴대폰 마이크, 공간, 마이크 종류와 연주·발성의 영향을 받으며 믹서를 자동 변경하지 않습니다.</footer>
    </main>
  )
}
