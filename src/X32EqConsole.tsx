import { useMemo, useState } from 'react'
import SingleTapButton from './SingleTapButton'
import type { EqBand, EqFilterType, IntegratedEqSuggestion, LiveAnalysisEvidence } from './types'
import './x32-eq-console.css'
import './integrated-eq.css'

type Props = {
  profileLabel: string
  measuredBands?: number[]
  liveBands?: number[]
  liveEvidence?: LiveAnalysisEvidence | null
  integratedSuggestion?: IntegratedEqSuggestion | null
  currentValueSource: string
  eqBands: EqBand[]
  lowCutEnabled: boolean
  lowCutFrequency: number
  onApplyIntegratedSuggestion: () => void
  onLowCutEnabledChange: (enabled: boolean) => void
  onLowCutFrequencyChange: (frequency: number) => void
  onBandChange: (index: number, field: 'frequency' | 'gain' | 'q', value: number) => void
  onFilterTypeChange: (index: number, filterType: EqFilterType) => void
}

type KnobProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  accent?: string
  scale?: 'linear' | 'log'
  decimals?: number
  onChange: (value: number) => void
}

const FILTER_MODES: EqFilterType[] = ['LowCut', 'LowShelf', 'PEQ', 'VEQ', 'HighShelf', 'HighCut']
const MODE_LABEL: Record<EqFilterType, string> = {
  LowCut: 'LCut',
  LowShelf: 'LShv',
  PEQ: 'PEQ',
  VEQ: 'VEQ',
  HighShelf: 'HShv',
  HighCut: 'HCut',
}
const BAND_META = [
  { label: 'LOW', color: '#24d7cc' },
  { label: 'LOW MID', color: '#f0d83b' },
  { label: 'HIGH MID', color: '#ea65ce' },
  { label: 'HIGH', color: '#f0a43a' },
]
const GRAPH_FREQUENCIES = [20, 31.5, 50, 80, 125, 200, 315, 500, 800, 1250, 2000, 3150, 5000, 8000, 12500, 20000]
const RTA_FREQUENCIES = [80, 125, 250, 500, 1000, 2000, 4000, 8000]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function xForFrequency(frequency: number) {
  const min = Math.log10(20)
  const max = Math.log10(20000)
  return ((Math.log10(clamp(frequency, 20, 20000)) - min) / (max - min)) * 760 + 20
}

function yForGain(gain: number) {
  return 150 - clamp(gain, -15, 15) * 8.2
}

function formatFrequency(value: number) {
  if (value >= 10000) return `${(value / 1000).toFixed(1)}k`
  if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 2)}k`
  return `${Math.round(value)}`
}

function formatGain(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)} dB`
}

function filterContribution(frequency: number, band: EqBand) {
  const center = clamp(band.frequency, 20, 20000)
  const gain = clamp(band.gain, -15, 15)
  const q = clamp(band.q, 0.3, 10)
  const octaves = Math.log2(frequency / center)
  const mode = band.filterType ?? 'PEQ'

  if (mode === 'LowShelf') return gain / (1 + Math.exp(octaves * 7))
  if (mode === 'HighShelf') return gain / (1 + Math.exp(-octaves * 7))
  if (mode === 'LowCut') return frequency < center ? -Math.min(30, Math.log2(center / frequency) * 18) : 0
  if (mode === 'HighCut') return frequency > center ? -Math.min(30, Math.log2(frequency / center) * 18) : 0

  const width = Math.max(0.12, (mode === 'VEQ' ? 1.35 : 1) / q)
  return gain * Math.exp(-0.5 * (octaves / width) ** 2)
}

function responseAt(frequency: number, bands: EqBand[], lowCutEnabled: boolean, lowCutFrequency: number) {
  let gain = bands.reduce((sum, band) => sum + filterContribution(frequency, band), 0)
  if (lowCutEnabled && frequency < lowCutFrequency) {
    gain -= Math.min(30, Math.log2(lowCutFrequency / frequency) * 18)
  }
  return clamp(gain, -15, 15)
}

function sliderPosition(value: number, min: number, max: number, scale: 'linear' | 'log') {
  if (scale === 'log') {
    return ((Math.log(clamp(value, min, max)) - Math.log(min)) / (Math.log(max) - Math.log(min))) * 1000
  }
  return ((clamp(value, min, max) - min) / (max - min)) * 1000
}

function valueFromSlider(position: number, min: number, max: number, scale: 'linear' | 'log') {
  if (scale === 'log') return Math.exp(Math.log(min) + (position / 1000) * (Math.log(max) - Math.log(min)))
  return min + (position / 1000) * (max - min)
}

function X32Knob({ label, value, min, max, step, unit = '', accent = '#f4f4f4', scale = 'linear', decimals = 1, onChange }: KnobProps) {
  const position = sliderPosition(value, min, max, scale)
  const rotation = -135 + (position / 1000) * 270
  const formatted = scale === 'log' && unit === 'Hz'
    ? formatFrequency(value)
    : value.toFixed(decimals)

  function commit(nextValue: number) {
    const rounded = Math.round(nextValue / step) * step
    onChange(clamp(Number(rounded.toFixed(4)), min, max))
  }

  return (
    <div className="x32-knob-control" style={{ '--x32-accent': accent } as React.CSSProperties}>
      <span className="x32-knob-label">{label}</span>
      <div className="x32-knob" aria-hidden="true">
        <span className="x32-knob-pointer" style={{ transform: `rotate(${rotation}deg)` }} />
      </div>
      <div className="x32-knob-value-row">
        <input
          aria-label={`${label} value`}
          type="number"
          value={Number(value.toFixed(decimals))}
          min={min}
          max={max}
          step={step}
          inputMode="decimal"
          onChange={(event) => commit(Number(event.target.value))}
        />
        <span>{unit}</span>
      </div>
      <strong>{formatted}{unit && unit !== 'Hz' ? unit : ''}</strong>
      <input
        className="x32-knob-range"
        aria-label={`${label} rotary control`}
        type="range"
        min="0"
        max="1000"
        step="1"
        value={position}
        onChange={(event) => commit(valueFromSlider(Number(event.target.value), min, max, scale))}
      />
    </div>
  )
}

function IntegratedDecision({
  suggestion,
  currentBands,
  currentValueSource,
  liveEvidence,
  onApply,
}: {
  suggestion?: IntegratedEqSuggestion | null
  currentBands: EqBand[]
  currentValueSource: string
  liveEvidence?: LiveAnalysisEvidence | null
  onApply: () => void
}) {
  if (!suggestion) {
    return (
      <div className="integrated-decision is-empty">
        <div><span>통합 EQ 판단</span><strong>측정 근거 대기</strong></div>
        <p>회중석 30초 측정 또는 Live Monitor에서 `X32 화면·음향 통합`을 실행하면 현재 X32 값과 보정 후보가 이곳에 표시됩니다.</p>
      </div>
    )
  }

  return (
    <section className="integrated-decision" aria-label="통합 EQ 판단 결과">
      <div className="integrated-heading">
        <div><span>FIELD + LIVE + X32</span><h3>현장 결과를 X32 동일 배열에 반영</h3><p>{currentValueSource}을 기준으로 회중석 편차만큼 소폭 보정합니다.</p></div>
        <strong className="integrated-confidence">신뢰도 {suggestion.confidence}%</strong>
      </div>

      <div className="integrated-evidence-list">
        {suggestion.evidenceLabels.map((label) => <span key={label}>{label}</span>)}
      </div>

      <div className="integrated-body">
        {liveEvidence?.frameDataUrl && (
          <figure className="integrated-frame">
            <img src={liveEvidence.frameDataUrl} alt="Live Monitor에서 캡처한 아이패드 X32 화면" />
            <figcaption>{liveEvidence.mode} · RMS {liveEvidence.rms}% · Peak {liveEvidence.peak}%</figcaption>
          </figure>
        )}
        <div className="integrated-notes">
          {suggestion.notes.map((note) => <p key={note}>{note}</p>)}
        </div>
      </div>

      <div className="integrated-band-table">
        <div className="integrated-band-row is-header"><span>Band</span><span>현재 X32</span><span>통합 후보</span><span>변화</span></div>
        {suggestion.candidateBands.map((candidate, index) => {
          const current = currentBands[index]
          const delta = candidate.gain - current.gain
          return (
            <div className="integrated-band-row" key={`${candidate.name}-${index}`}>
              <span><b>{index + 1}</b>{BAND_META[index]?.label}</span>
              <span>{formatFrequency(current.frequency)}Hz · {formatGain(current.gain)} · Q {current.q.toFixed(1)}</span>
              <span>{formatFrequency(candidate.frequency)}Hz · {formatGain(candidate.gain)} · Q {candidate.q.toFixed(1)}</span>
              <strong className={delta === 0 ? '' : delta > 0 ? 'is-boost' : 'is-cut'}>{delta > 0 ? '+' : ''}{delta.toFixed(2)}dB</strong>
            </div>
          )
        })}
      </div>

      <div className="integrated-lowcut-row">
        <span>LOW CUT</span>
        <strong>{suggestion.candidateLowCutEnabled ? `${suggestion.candidateLowCutFrequency}Hz ON` : 'OFF'}</strong>
        <small>성별이 아니라 선택 프로필·마이크·실측 근거를 확인한 출발점</small>
      </div>

      {suggestion.blockedReason && <p className="integrated-blocked">⚠️ {suggestion.blockedReason}</p>}
      <div className="integrated-actions">
        <SingleTapButton disabled={Boolean(suggestion.blockedReason)} onActivate={onApply}>통합 후보를 아래 X32 조절값에 반영</SingleTapButton>
        <p>반영 후 실제 X32에서 같은 Band·Freq·Gain·Q·Mode를 입력하고 반드시 A/B 재측정하세요.</p>
      </div>
    </section>
  )
}

export default function X32EqConsole({
  profileLabel,
  measuredBands,
  liveBands,
  liveEvidence,
  integratedSuggestion,
  currentValueSource,
  eqBands,
  lowCutEnabled,
  lowCutFrequency,
  onApplyIntegratedSuggestion,
  onLowCutEnabledChange,
  onLowCutFrequencyChange,
  onBandChange,
  onFilterTypeChange,
}: Props) {
  const [selectedBand, setSelectedBand] = useState(0)
  const [eqEnabled, setEqEnabled] = useState(true)
  const [rtaMode, setRtaMode] = useState<'BAR' | 'SPEC'>('BAR')
  const [rtaTap, setRtaTap] = useState<'PRE' | 'POST'>('POST')
  const selected = eqBands[selectedBand] ?? eqBands[0]
  const displayBands = liveBands?.some((value) => value > 0) ? liveBands : measuredBands

  const curvePoints = useMemo(() => GRAPH_FREQUENCIES.map((frequency) => {
    const gain = eqEnabled ? responseAt(frequency, eqBands, lowCutEnabled, lowCutFrequency) : 0
    return `${xForFrequency(frequency)},${yForGain(gain)}`
  }).join(' '), [eqBands, eqEnabled, lowCutEnabled, lowCutFrequency])

  const candidateCurvePoints = useMemo(() => {
    if (!integratedSuggestion) return ''
    return GRAPH_FREQUENCIES.map((frequency) => {
      const gain = responseAt(
        frequency,
        integratedSuggestion.candidateBands,
        integratedSuggestion.candidateLowCutEnabled,
        integratedSuggestion.candidateLowCutFrequency,
      )
      return `${xForFrequency(frequency)},${yForGain(gain)}`
    }).join(' ')
  }, [integratedSuggestion])

  function resetSelectedBand() {
    onBandChange(selectedBand, 'gain', 0)
    onBandChange(selectedBand, 'q', 2)
    onFilterTypeChange(selectedBand, 'PEQ')
  }

  function resetAllBands() {
    eqBands.forEach((_, index) => {
      onBandChange(index, 'gain', 0)
      onBandChange(index, 'q', 2)
      onFilterTypeChange(index, 'PEQ')
    })
    onLowCutEnabledChange(false)
  }

  function cycleMode(direction: 1 | -1) {
    const current = FILTER_MODES.indexOf(selected.filterType ?? 'PEQ')
    const next = (current + direction + FILTER_MODES.length) % FILTER_MODES.length
    onFilterTypeChange(selectedBand, FILTER_MODES[next])
  }

  function cycleBand(direction: 1 | -1) {
    setSelectedBand((current) => (current + direction + eqBands.length) % eqBands.length)
  }

  return (
    <section className="panel x32-console-panel">
      <div className="panel-heading compact x32-console-heading">
        <div>
          <span className="step">X32 EQ</span>
          <h2>X32 채널 EQ 동일 배열</h2>
          <p>현장 측정·Live 영상/음향·OCR 현재값을 통합하고, 화면 아래 6개 컨트롤 순서대로 실제 X32에 옮깁니다.</p>
        </div>
        <span className="x32-transfer-badge">통합 적용 화면</span>
      </div>

      <IntegratedDecision
        suggestion={integratedSuggestion}
        currentBands={eqBands}
        currentValueSource={currentValueSource}
        liveEvidence={liveEvidence}
        onApply={onApplyIntegratedSuggestion}
      />

      <div className="x32-console-shell">
        <div className="x32-screen-frame">
          <div className="x32-status-strip">
            <div className="x32-channel-box"><strong>Ch01</strong><span>{profileLabel.slice(0, 18)}</span></div>
            <div className="x32-scene-box"><span>SCENE</span><strong>EQ GUIDE</strong></div>
            <div className="x32-io-box"><span>A: LOCAL</span><span>L: 48K</span></div>
            <time>{new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time>
          </div>

          <nav className="x32-screen-tabs" aria-label="X32 channel screen tabs">
            {['HOME', 'CONFIG', 'GATE', 'DYN', 'EQ', 'SENDS', 'MAIN'].map((tab) => (
              <span className={tab === 'EQ' ? 'is-active' : ''} key={tab}>{tab}</span>
            ))}
          </nav>

          <div className="x32-display-grid">
            <div className={`x32-graph ${rtaMode === 'SPEC' ? 'is-spectro' : ''} ${eqEnabled ? '' : 'is-bypassed'}`}>
              <svg viewBox="0 0 800 300" role="img" aria-label="X32 EQ curve and RTA display" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="x32-rta-gradient" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0" stopColor="#168dff" />
                    <stop offset="0.5" stopColor="#2eda70" />
                    <stop offset="0.78" stopColor="#f2da38" />
                    <stop offset="1" stopColor="#f05a43" />
                  </linearGradient>
                </defs>
                {[-15, -10, -5, 0, 5, 10, 15].map((gain) => (
                  <g key={gain}>
                    <line x1="20" x2="780" y1={yForGain(gain)} y2={yForGain(gain)} className={gain === 0 ? 'x32-zero-line' : 'x32-grid-line'} />
                    <text x="2" y={yForGain(gain) + 4} className="x32-axis-text">{gain > 0 ? `+${gain}` : gain}</text>
                  </g>
                ))}
                {GRAPH_FREQUENCIES.map((frequency) => (
                  <g key={frequency}>
                    <line x1={xForFrequency(frequency)} x2={xForFrequency(frequency)} y1="18" y2="273" className="x32-grid-line" />
                    <text x={xForFrequency(frequency)} y="293" textAnchor="middle" className="x32-axis-text">{formatFrequency(frequency)}</text>
                  </g>
                ))}
                {displayBands?.map((value, index) => {
                  const x = xForFrequency(RTA_FREQUENCIES[index])
                  const height = clamp(value, 0, 100) * 2.25
                  return <rect key={`${RTA_FREQUENCIES[index]}-${index}`} x={x - 19} y={268 - height} width="38" height={height} className="x32-rta-bar" opacity={rtaMode === 'SPEC' ? 0.55 + index * 0.04 : 0.82} />
                })}
                {candidateCurvePoints && <polyline points={candidateCurvePoints} className="x32-candidate-curve" />}
                <polyline points={curvePoints} className="x32-eq-curve" />
                {eqBands.map((band, index) => {
                  const color = BAND_META[index]?.color ?? '#fff'
                  const gain = eqEnabled ? responseAt(band.frequency, [band], false, 20) : 0
                  return (
                    <g key={`${band.name}-${index}`} className={selectedBand === index ? 'x32-band-point is-selected' : 'x32-band-point'}>
                      <circle cx={xForFrequency(band.frequency)} cy={yForGain(gain)} r={selectedBand === index ? 10 : 7} fill={color} />
                      <text x={xForFrequency(band.frequency)} y={yForGain(gain) - 14} textAnchor="middle" fill={color}>{index + 1}</text>
                    </g>
                  )
                })}
              </svg>
              {integratedSuggestion && <div className="x32-curve-legend"><span>실선 현재값</span><span>점선 통합 후보</span></div>}
            </div>

            <div className="x32-band-stack" aria-label="X32 band selection">
              <span className={`x32-eq-state ${eqEnabled ? 'is-on' : ''}`}>EQ</span>
              {[3, 2, 1, 0].map((index) => (
                <SingleTapButton
                  key={BAND_META[index].label}
                  className={selectedBand === index ? 'x32-band-stack-button is-selected' : 'x32-band-stack-button'}
                  style={{ '--band-color': BAND_META[index].color } as React.CSSProperties}
                  onActivate={() => setSelectedBand(index)}
                >
                  {BAND_META[index].label}
                </SingleTapButton>
              ))}
            </div>
          </div>

          <div className="x32-band-cards">
            {eqBands.map((band, index) => {
              const meta = BAND_META[index]
              return (
                <SingleTapButton
                  key={`${band.name}-${index}`}
                  className={selectedBand === index ? 'x32-band-card is-selected' : 'x32-band-card'}
                  style={{ '--band-color': meta.color } as React.CSSProperties}
                  onActivate={() => setSelectedBand(index)}
                >
                  <span className="x32-band-card-title"><b>{index + 1}</b>{meta.label}</span>
                  <span><small>FREQ</small><strong>{formatFrequency(band.frequency)} Hz</strong></span>
                  <span><small>GAIN</small><strong>{formatGain(band.gain)}</strong></span>
                  <span><small>Q</small><strong>{band.q.toFixed(1)}</strong></span>
                  <span><small>MODE</small><strong>{MODE_LABEL[band.filterType ?? 'PEQ']}</strong></span>
                </SingleTapButton>
              )
            })}
          </div>

          <div className="x32-encoder-strip">
            <div className="x32-encoder-slot">
              <X32Knob label="Low Cut" value={lowCutFrequency} min={20} max={400} step={1} unit="Hz" scale="log" decimals={0} accent="#ff9f28" onChange={onLowCutFrequencyChange} />
              <SingleTapButton className={lowCutEnabled ? 'x32-push-button is-on' : 'x32-push-button'} onActivate={() => onLowCutEnabledChange(!lowCutEnabled)}>{lowCutEnabled ? 'LOW CUT ON' : 'LOW CUT OFF'}</SingleTapButton>
            </div>

            <div className="x32-encoder-slot">
              <X32Knob label="Freq" value={selected.frequency} min={20} max={20000} step={1} unit="Hz" scale="log" decimals={0} accent={BAND_META[selectedBand].color} onChange={(value) => onBandChange(selectedBand, 'frequency', value)} />
              <SingleTapButton className="x32-dual-button" onActivate={() => setRtaMode((mode) => mode === 'BAR' ? 'SPEC' : 'BAR')}><span className={rtaMode === 'BAR' ? 'is-active' : ''}>BAR</span><span className={rtaMode === 'SPEC' ? 'is-active' : ''}>SPEC</span></SingleTapButton>
            </div>

            <div className="x32-encoder-slot">
              <X32Knob label="Gain" value={selected.gain} min={-15} max={15} step={0.25} unit=" dB" decimals={2} accent={BAND_META[selectedBand].color} onChange={(value) => onBandChange(selectedBand, 'gain', value)} />
              <SingleTapButton className="x32-dual-button" onActivate={() => setRtaTap((tap) => tap === 'PRE' ? 'POST' : 'PRE')}><span className={rtaTap === 'PRE' ? 'is-active' : ''}>RTA PRE</span><span className={rtaTap === 'POST' ? 'is-active' : ''}>POST</span></SingleTapButton>
            </div>

            <div className="x32-encoder-slot">
              <X32Knob label="Q" value={selected.q} min={0.3} max={10} step={0.1} decimals={1} accent={BAND_META[selectedBand].color} onChange={(value) => onBandChange(selectedBand, 'q', value)} />
              <SingleTapButton className="x32-push-button" onActivate={resetSelectedBand}>RESET</SingleTapButton>
            </div>

            <div className="x32-encoder-slot x32-mode-slot">
              <span className="x32-knob-label">Mode</span>
              <div className="x32-mode-dial" style={{ '--x32-accent': BAND_META[selectedBand].color } as React.CSSProperties}><strong>{MODE_LABEL[selected.filterType ?? 'PEQ']}</strong></div>
              <div className="x32-stepper"><SingleTapButton onActivate={() => cycleMode(-1)}>−</SingleTapButton><select aria-label="Selected X32 filter mode" value={selected.filterType ?? 'PEQ'} onChange={(event) => onFilterTypeChange(selectedBand, event.target.value as EqFilterType)}>{FILTER_MODES.map((mode) => <option key={mode} value={mode}>{MODE_LABEL[mode]}</option>)}</select><SingleTapButton onActivate={() => cycleMode(1)}>+</SingleTapButton></div>
              <SingleTapButton className="x32-push-button" onActivate={resetAllBands}>RESET ALL</SingleTapButton>
            </div>

            <div className="x32-encoder-slot x32-mode-slot">
              <span className="x32-knob-label">Select</span>
              <div className="x32-mode-dial" style={{ '--x32-accent': BAND_META[selectedBand].color } as React.CSSProperties}><strong>{selectedBand + 1}</strong><span>{BAND_META[selectedBand].label}</span></div>
              <div className="x32-stepper"><SingleTapButton onActivate={() => cycleBand(-1)}>◀</SingleTapButton><strong>{selectedBand + 1}</strong><SingleTapButton onActivate={() => cycleBand(1)}>▶</SingleTapButton></div>
              <SingleTapButton className={eqEnabled ? 'x32-push-button is-on' : 'x32-push-button'} onActivate={() => setEqEnabled((enabled) => !enabled)}>{eqEnabled ? 'EQ ON' : 'EQ OFF'}</SingleTapButton>
            </div>
          </div>
        </div>
      </div>

      <div className="x32-copy-guide">
        <strong>X32에 옮기는 순서</strong>
        <span>① EQ VIEW</span><span>② LOW CUT</span><span>③ 밴드 SELECT</span><span>④ FREQ</span><span>⑤ GAIN</span><span>⑥ Q</span><span>⑦ MODE</span>
      </div>
      <p className="x32-console-note">실선은 현재 X32 입력값, 점선은 현장·Live 통합 후보입니다. 후보를 반영해도 실제 X32로 자동 전송되지 않으며, 화면의 값과 순서를 보고 직접 적용한 뒤 동일 조건으로 A/B 재측정합니다.</p>
    </section>
  )
}
