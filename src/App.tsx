import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, CheckCircle2, Clock3, Mic, MicOff, RotateCcw, SlidersHorizontal, Upload } from 'lucide-react'
import ToneGuide from './ToneGuide'
import './x32-controls.css'

type AudioState = { rms: number; peak: number; bands: number[] }
type Sample = AudioState & { at: number }
type AnalysisResult = { duration: number; averageRms: number; maxPeak: number; averageBands: number[]; score: number; findings: string[]; recommendations: string[] }
type EqBand = { name: string; frequency: number; gain: number; q: number }

const MEASUREMENT_SECONDS = 30
const bandLabels = ['80', '125', '250', '500', '1k', '2k', '4k', '8k']
const ranges = [[60,100],[100,160],[160,350],[350,700],[700,1400],[1400,2800],[2800,5600],[5600,10000]]
const emptyAudio: AudioState = { rms: 0, peak: 0, bands: Array(8).fill(0) }
const initialEqBands: EqBand[] = [
  { name: 'Low', frequency: 120, gain: 0, q: 1 },
  { name: 'Low Mid', frequency: 250, gain: 0, q: 1.4 },
  { name: 'High Mid', frequency: 3200, gain: 0, q: 1.4 },
  { name: 'High', frequency: 8000, gain: 0, q: 1 },
]

export default function App() {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')
  const [audio, setAudio] = useState<AudioState>(emptyAudio)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [imageName, setImageName] = useState('')
  const [lowCutEnabled, setLowCutEnabled] = useState(true)
  const [lowCutFrequency, setLowCutFrequency] = useState(80)
  const [eqBands, setEqBands] = useState<EqBand[]>(initialEqBands)
  const contextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const samplesRef = useRef<Sample[]>([])

  useEffect(() => () => {
    stopHardware()
    if (imageUrl) URL.revokeObjectURL(imageUrl)
  }, [imageUrl])

  async function startListening() {
    try {
      stopHardware(); setError(''); setResult(null); setElapsed(0); setAudio(emptyAudio); samplesRef.current = []
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false } })
      const context = new AudioContext()
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.78
      source.connect(analyser)
      contextRef.current = context; streamRef.current = stream; startedAtRef.current = performance.now(); setIsListening(true)
      const frequency = new Uint8Array(analyser.frequencyBinCount)
      const time = new Uint8Array(analyser.fftSize)
      const hzPerBin = context.sampleRate / analyser.fftSize
      const update = () => {
        analyser.getByteFrequencyData(frequency); analyser.getByteTimeDomainData(time)
        let sum = 0; let peak = 0
        for (const sample of time) { const normalized = (sample - 128) / 128; sum += normalized * normalized; peak = Math.max(peak, Math.abs(normalized)) }
        const bands = ranges.map(([low, high]) => {
          const start = Math.max(0, Math.floor(low / hzPerBin)); const end = Math.min(frequency.length - 1, Math.ceil(high / hzPerBin))
          let total = 0; for (let index = start; index <= end; index += 1) total += frequency[index]
          return Math.round((total / Math.max(1, end - start + 1) / 255) * 100)
        })
        const nextAudio = { rms: Math.round(Math.sqrt(sum / time.length) * 100), peak: Math.round(peak * 100), bands }
        const elapsedSeconds = (performance.now() - startedAtRef.current) / 1000
        setAudio(nextAudio); setElapsed(Math.min(MEASUREMENT_SECONDS, elapsedSeconds)); samplesRef.current.push({ ...nextAudio, at: elapsedSeconds })
        if (elapsedSeconds >= MEASUREMENT_SECONDS) { finishMeasurement(); return }
        frameRef.current = requestAnimationFrame(update)
      }
      update()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '마이크를 시작하지 못했습니다.'); stopHardware()
    }
  }

  function stopHardware() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    if (contextRef.current && contextRef.current.state !== 'closed') void contextRef.current.close()
    frameRef.current = null; streamRef.current = null; contextRef.current = null; setIsListening(false)
  }

  function finishMeasurement() {
    const samples = samplesRef.current; stopHardware(); const duration = samples.at(-1)?.at ?? 0
    if (duration < 5) { setError('분석하기에는 측정 시간이 너무 짧습니다. 최소 5초 이상 측정해 주세요.'); return }
    const averageRms = Math.round(samples.reduce((sum, sample) => sum + sample.rms, 0) / samples.length)
    const maxPeak = Math.max(...samples.map((sample) => sample.peak))
    const averageBands = bandLabels.map((_, index) => Math.round(samples.reduce((sum, sample) => sum + sample.bands[index], 0) / samples.length))
    const findings: string[] = []; const recommendations: string[] = []; let score = 100
    if (maxPeak >= 92) { findings.push('입력 피크가 높아 클리핑 위험이 있습니다.'); recommendations.push('X32 입력 게인을 먼저 2~4dB 낮추세요.'); score -= 22 }
    else if (maxPeak < 25) { findings.push('입력 레벨이 낮아 작은 발음이 묻힐 수 있습니다.'); recommendations.push('게인을 소폭 높이고 큰 발성의 Peak를 다시 확인하세요.'); score -= 12 }
    if (averageRms < 4) { findings.push('평균 음량이 낮거나 마이크 거리가 멀 수 있습니다.'); recommendations.push('마이크 거리를 일정하게 유지해 재측정하세요.'); score -= 15 }
    if (averageBands[2] > averageBands[5] + 14) { findings.push('160~350Hz 저중역이 상대적으로 많습니다.'); recommendations.push('Low Mid 220~320Hz를 -1~-2dB부터 시험하세요.'); score -= 15 }
    if (averageBands[6] + 8 < averageBands[2] && averageRms >= 4) { findings.push('2.8~5.6kHz 명료도 대역이 상대적으로 부족합니다.'); recommendations.push('현재 2~4kHz 컷을 0dB 쪽으로 복원한 뒤 비교하세요.'); score -= 12 }
    if (averageBands[7] > averageBands[5] + 16) { findings.push('5.6~10kHz가 상대적으로 강합니다.'); recommendations.push('High 또는 High Mid 부스트를 1~2dB 줄여보세요.'); score -= 10 }
    if (!findings.length) { findings.push('뚜렷한 과다 대역이나 클리핑 신호가 발견되지 않았습니다.'); recommendations.push('현재 설정을 기준으로 객석 위치를 바꿔 비교 측정하세요.') }
    setResult({ duration: Math.round(duration * 10) / 10, averageRms, maxPeak, averageBands, score: Math.max(35, score), findings, recommendations })
  }

  function resetMeasurement() { stopHardware(); samplesRef.current = []; setAudio(emptyAudio); setElapsed(0); setResult(null); setError('') }
  function handleImage(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; if (imageUrl) URL.revokeObjectURL(imageUrl); setImageUrl(URL.createObjectURL(file)); setImageName(file.name) }
  function updateEqBand(index: number, field: keyof Omit<EqBand,'name'>, value: number) { setEqBands((current) => current.map((band, bandIndex) => bandIndex === index ? { ...band, [field]: value } : band)) }

  const crossChecks = useMemo(() => {
    if (!result) return ['음성 측정을 완료하면 현재 X32 설정과 대조 결과가 표시됩니다.']
    const checks: string[] = []; const lowMid = eqBands[1]; const highMid = eqBands[2]; const high = eqBands[3]
    if (result.averageBands[2] > result.averageBands[5] + 14 && lowMid.gain > 0) checks.push(`저중역 과다 후보인데 Low Mid가 +${lowMid.gain}dB입니다. 먼저 0dB로 복원해 보세요.`)
    if (result.averageBands[6] + 8 < result.averageBands[2] && highMid.gain < 0) checks.push(`명료도 부족 후보인데 High Mid가 ${highMid.gain}dB로 컷되어 있습니다.`)
    if (result.averageBands[7] > result.averageBands[5] + 16 && high.gain > 1) checks.push(`고역 과다 후보인데 High가 +${high.gain}dB입니다. 1~2dB 낮춰 비교하세요.`)
    if (!lowCutEnabled && result.averageBands[0] > result.averageBands[3] + 10) checks.push('저역 에너지가 많은데 Low Cut이 꺼져 있습니다. 70~100Hz에서 켜고 재측정하세요.')
    if (lowCutEnabled && lowCutFrequency > 140) checks.push(`Low Cut ${lowCutFrequency}Hz는 음성의 두께를 과도하게 줄일 수 있습니다.`)
    return checks.length ? checks : ['입력한 X32 EQ 값과 수음 결과 사이에 뚜렷한 충돌은 없습니다. 한 밴드씩 변경하며 재측정하세요.']
  }, [result, eqBands, lowCutEnabled, lowCutFrequency])

  const remaining = Math.max(0, Math.ceil(MEASUREMENT_SECONDS - elapsed))
  const status = isListening ? `${remaining}초 남음` : result ? `분석 완료 · ${result.score}점` : '30초 측정 대기'

  return <main className="app-shell">
    <header className="hero"><div><p className="eyebrow">X32 SPEECH EQ GUIDE · MVP 0.4</p><h1>휴대폰으로 측정하고<br/>음색까지 이해합니다.</h1><p className="hero-copy">설교 음성을 측정하고 X32 설정과 대조한 뒤, 각 음역대가 만드는 톤과 조정 방향을 바로 확인합니다.</p></div><div className="status-card"><Activity size={20}/><span>현재 상태</span><strong>{status}</strong><div className="progress-track"><div className="progress-fill" style={{width:`${Math.min(100,(elapsed/MEASUREMENT_SECONDS)*100)}%`}}/></div></div></header>

    <section className="control-grid">
      <article className="panel microphone-panel"><div className="panel-heading"><div><span className="step">01</span><h2>30초 설교 음성 측정</h2></div><div className="button-row">{result&&<button className="secondary" onClick={resetMeasurement}><RotateCcw size={18}/>다시 측정</button>}<button className={isListening?'danger':'primary'} onClick={isListening?finishMeasurement:startListening}>{isListening?<MicOff size={18}/>:<Mic size={18}/>} {isListening?'정지하고 분석':'30초 측정 시작'}</button></div></div>{error&&<p className="error-message">{error}</p>}<div className="timer-card"><Clock3 size={20}/><div><span>측정 시간</span><strong>{elapsed.toFixed(1)} / 30초</strong></div><p>{isListening?'평소 설교 속도와 음량으로 말씀해 주세요.':result?'측정 완료. 아래 결과와 X32 설정을 대조하세요.':'최소 5초, 권장 30초입니다.'}</p></div><div className="meter-row"><div className="metric"><span>현재 RMS</span><strong>{audio.rms}%</strong></div><div className="metric"><span>현재 PEAK</span><strong>{audio.peak}%</strong></div></div><div className="spectrum">{audio.bands.map((value,index)=><div className="band" key={bandLabels[index]}><div className="bar-track"><div className="bar-fill" style={{height:`${Math.max(3,value)}%`}}/></div><strong>{value}</strong><span>{bandLabels[index]}Hz</span></div>)}</div></article>

      <article className="panel upload-panel"><div className="panel-heading compact"><div><span className="step">02</span><h2>X32 EQ 화면·설정</h2></div><SlidersHorizontal size={22}/></div><label className="upload-zone"><Upload size={28}/><strong>EQ 화면 이미지 선택</strong><span>휴대폰 촬영 또는 화면 캡처를 사용할 수 있습니다.</span><input type="file" accept="image/png,image/jpeg" capture="environment" onChange={handleImage}/></label>{imageUrl&&<><div className="x32-image-preview"><img src={imageUrl} alt="업로드한 X32 EQ 화면"/></div><p className="image-meta">{imageName}</p><button className="clear-image" onClick={()=>{URL.revokeObjectURL(imageUrl);setImageUrl('');setImageName('')}}>이미지 지우기</button></>}<div className="eq-form"><div className="lowcut-row"><label><input type="checkbox" checked={lowCutEnabled} onChange={(e)=>setLowCutEnabled(e.target.checked)}/>Low Cut 사용</label><label>Hz <input type="number" min="20" max="400" value={lowCutFrequency} onChange={(e)=>setLowCutFrequency(Number(e.target.value))}/></label></div>{eqBands.map((band,index)=><div className="eq-band-row" key={band.name}><strong>{band.name}</strong><input aria-label={`${band.name} frequency`} type="number" value={band.frequency} onChange={(e)=>updateEqBand(index,'frequency',Number(e.target.value))}/><input aria-label={`${band.name} gain`} type="number" step="0.5" value={band.gain} onChange={(e)=>updateEqBand(index,'gain',Number(e.target.value))}/><input aria-label={`${band.name} q`} type="number" step="0.1" min="0.3" max="10" value={band.q} onChange={(e)=>updateEqBand(index,'q',Number(e.target.value))}/></div>)}</div></article>
    </section>

    {result&&<section className="panel result-panel"><div className="panel-heading compact"><div><span className="step">03</span><h2>설교 음향 분석 결과</h2></div><div className="score-badge"><CheckCircle2 size={20}/><strong>{result.score}점</strong></div></div><div className="result-metrics"><div><span>측정 시간</span><strong>{result.duration}초</strong></div><div><span>평균 RMS</span><strong>{result.averageRms}%</strong></div><div><span>최대 Peak</span><strong>{result.maxPeak}%</strong></div></div><div className="analysis-columns"><div className="analysis-box"><h3>감지된 상태</h3>{result.findings.map((item)=><p key={item}>{item}</p>)}</div><div className="analysis-box recommendation-box"><h3>X32 대조·조정 후보</h3>{[...result.recommendations,...crossChecks].map((item,index)=><p key={`${item}-${index}`}><span>{index+1}</span>{item}</p>)}</div></div></section>}

    <ToneGuide/>

    <section className="panel recommendation-panel"><div className="panel-heading compact"><div><span className="step">05</span><h2>적용 원칙</h2></div></div><div className="recommendations"><div><span>1</span><p><strong>게인을 먼저 확인</strong>EQ보다 클리핑과 입력 레벨을 먼저 안정화합니다.</p></div><div><span>2</span><p><strong>한 번에 한 밴드</strong>작게 조정한 뒤 같은 문장으로 재측정합니다.</p></div><div><span>3</span><p><strong>객석 청취로 확정</strong>휴대폰 분석은 후보이며 최종 판단은 실제 청취로 합니다.</p></div></div></section>

    <div className="mobile-action-dock"><button className="mobile-secondary" onClick={resetMeasurement} aria-label="초기화"><RotateCcw size={20}/></button><button className={isListening?'mobile-danger':'mobile-primary'} onClick={isListening?finishMeasurement:startListening}>{isListening?<MicOff size={20}/>:<Mic size={20}/>} {isListening?'정지·분석':'30초 측정'}</button></div>
    <footer>휴대폰 마이크와 공간의 특성이 결과에 영향을 줄 수 있습니다. 자동 설정 확정이나 믹서 자동 변경은 하지 않습니다.</footer>
  </main>
}
