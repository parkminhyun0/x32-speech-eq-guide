import type { EqBand } from './types'
import './eq-curve.css'

type Props = {
  measuredBands?: number[]
  eqBands: EqBand[]
  lowCutEnabled: boolean
  lowCutFrequency: number
  targetCenter?: number[]
  targetRange?: number[]
  targetLabel?: string
}

const frequencies = [80, 125, 250, 500, 1000, 2000, 4000, 8000]
const labels = ['80','125','250','500','1k','2k','4k','8k']
const defaultTargetCenter = [30, 40, 48, 50, 55, 62, 60, 46]
const defaultTargetRange = [8, 8, 9, 9, 9, 10, 10, 10]

function xFor(freq: number) {
  const min = Math.log10(60)
  const max = Math.log10(10000)
  return ((Math.log10(freq) - min) / (max - min)) * 100
}

function yFor(value: number) {
  return 92 - Math.max(0, Math.min(100, value)) * 0.78
}

function measuredPoints(values?: number[]) {
  const safe = values?.length === 8 ? values : Array(8).fill(0)
  return safe.map((value, i) => `${xFor(frequencies[i])},${yFor(value)}`).join(' ')
}

function targetPoints(center: number[], range: number[], direction: 'top'|'bottom') {
  const values = center.map((value, index) => direction === 'top' ? value + range[index] : value - range[index])
  const points = values.map((value, index) => `${xFor(frequencies[index])},${yFor(value)}`)
  return direction === 'top' ? points : points.reverse()
}

function shelfContribution(freq: number, band: EqBand, direction: 'low' | 'high') {
  const octaves = Math.log2(freq / Math.max(20, band.frequency))
  const steepness = 5 / Math.max(.45, band.q)
  const highAmount = 1 / (1 + Math.exp(-octaves * steepness))
  return band.gain * (direction === 'high' ? highAmount : 1 - highAmount)
}

function eqGainAt(freq: number, bands: EqBand[], lowCutEnabled: boolean, lowCutFrequency: number) {
  let gain = 0
  for (const band of bands) {
    if (band.filterType === 'LowShelf') {
      gain += shelfContribution(freq, band, 'low')
      continue
    }
    if (band.filterType === 'HighShelf') {
      gain += shelfContribution(freq, band, 'high')
      continue
    }
    const octaves = Math.log2(freq / Math.max(20, band.frequency))
    const width = Math.max(0.18, 1 / Math.max(0.3, band.q))
    gain += band.gain * Math.exp(-0.5 * (octaves / width) ** 2)
  }
  if (lowCutEnabled && freq < lowCutFrequency) {
    const octavesBelow = Math.log2(lowCutFrequency / Math.max(20, freq))
    gain -= Math.min(18, octavesBelow * 12)
  }
  return gain
}

export default function EqCurve({
  measuredBands,
  eqBands,
  lowCutEnabled,
  lowCutFrequency,
  targetCenter = defaultTargetCenter,
  targetRange = defaultTargetRange,
  targetLabel = '선택 소스',
}: Props) {
  const safeCenter = targetCenter.length === 8 ? targetCenter : defaultTargetCenter
  const safeRange = targetRange.length === 8 ? targetRange : defaultTargetRange
  const eqPoints = frequencies.map((freq) => {
    const gain = eqGainAt(freq, eqBands, lowCutEnabled, lowCutFrequency)
    return `${xFor(freq)},${50 - gain * 2.2}`
  }).join(' ')
  const envelope = [
    ...targetPoints(safeCenter, safeRange, 'top'),
    ...targetPoints(safeCenter, safeRange, 'bottom'),
  ].join(' ')
  const hasMeasurement = Boolean(measuredBands?.some((value) => value > 0))

  return <section className="panel curve-panel">
    <div className="panel-heading compact">
      <div><span className="step">COMPARE</span><h2>{targetLabel} 기준·실측·X32 곡선</h2></div>
    </div>
    <p className="curve-help">파란 영역은 절대 정답이 아닌 프로필별 비교 범위입니다. 실측 선과 X32 보정 방향을 함께 보고 한 밴드씩 조정하세요.</p>
    <div className="curve-legend" aria-label="그래프 범례">
      <span><i className="legend-target"/>프로필 비교 범위</span>
      <span><i className="legend-measured"/>실측 평균</span>
      <span><i className="legend-eq"/>X32 EQ</span>
    </div>
    <div className="curve-scroll">
      <svg className="curve-chart" viewBox="0 0 100 100" role="img" aria-label={`${targetLabel} EQ 비교 곡선`} preserveAspectRatio="none">
        {[20,35,50,65,80].map((y)=><line key={y} x1="0" y1={y} x2="100" y2={y} className="curve-grid"/>) }
        {frequencies.map((freq)=><line key={freq} x1={xFor(freq)} y1="12" x2={xFor(freq)} y2="88" className="curve-grid vertical"/>) }
        <polygon points={envelope} className="target-envelope"/>
        <polyline points={eqPoints} className="eq-line"/>
        {hasMeasurement && <polyline points={measuredPoints(measuredBands)} className="measured-line"/>}
      </svg>
      <div className="curve-labels">{labels.map((label)=><span key={label}>{label}</span>)}</div>
    </div>
    {!hasMeasurement && <p className="curve-empty">30초 측정을 완료하면 실측 평균 곡선이 표시됩니다.</p>}
    <div className="curve-notes">
      <p><strong>저역 80–250Hz</strong> Rumble·무게·부밍을 확인합니다.</p>
      <p><strong>중역 500Hz–2kHz</strong> 몸통·공진·음정 정의를 확인합니다.</p>
      <p><strong>고역 2–8kHz</strong> 명료도·어택·거칠음·치찰음을 확인합니다.</p>
    </div>
  </section>
}
