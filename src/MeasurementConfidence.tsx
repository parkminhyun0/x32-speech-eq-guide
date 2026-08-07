import { useMemo, useState } from 'react'
import SingleTapButton from './SingleTapButton'
import type { AnalysisResult } from './types'

type Snapshot = {
  score: number
  duration: number
  rms: number
  peak: number
  bands: number[]
  savedAt: string
}

type MeasurementConfidenceProps = {
  result: AnalysisResult | null
}

function snapshotFrom(result: AnalysisResult): Snapshot {
  return {
    score: result.score,
    duration: result.duration,
    rms: result.averageRms,
    peak: result.maxPeak,
    bands: result.averageBands,
    savedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
  }
}

function confidence(result: AnalysisResult | null) {
  if (!result) return { score: 0, level: '측정 전', items: [] as string[] }
  let value = 100
  const items: string[] = []

  if (result.duration < 15) { value -= 30; items.push('측정 시간이 짧음') }
  else if (result.duration < 25) { value -= 12; items.push('권장 30초보다 짧음') }
  else items.push('측정 시간 충분')

  if (result.maxPeak >= 92) { value -= 28; items.push('클리핑 위험') }
  else if (result.maxPeak < 25) { value -= 18; items.push('입력 레벨 낮음') }
  else items.push('입력 레벨 적정')

  if (result.averageRms < 4) { value -= 18; items.push('평균 음량 낮음') }
  else items.push('평균 음량 확보')

  if ([...result.findings, ...result.recommendations].some((text) => /주변 소음|마이크 거리가 멀/.test(text))) {
    value -= 12
    items.push('환경·거리 재확인')
  }

  const score = Math.max(25, value)
  return { score, level: score >= 85 ? '높음' : score >= 65 ? '보통' : '낮음', items }
}

function signed(value: number) {
  return `${value > 0 ? '+' : ''}${value}`
}

export default function MeasurementConfidence({ result }: MeasurementConfidenceProps) {
  const [checks, setChecks] = useState([false, false, false])
  const [before, setBefore] = useState<Snapshot | null>(null)
  const [after, setAfter] = useState<Snapshot | null>(null)
  const quality = useMemo(() => confidence(result), [result])

  const comparison = useMemo(() => {
    if (!before || !after) return null
    const low = (after.bands[2] ?? 0) - (before.bands[2] ?? 0)
    const clarity = (after.bands[6] ?? 0) - (before.bands[6] ?? 0)
    const peak = after.peak - before.peak
    const score = after.score - before.score
    const verdict = [
      low <= -3 ? '저중역 에너지가 줄었습니다.' : low >= 3 ? '저중역 에너지가 늘었습니다.' : '저중역 변화는 작습니다.',
      clarity >= 3 ? '명료도 대역이 증가했습니다.' : clarity <= -3 ? '명료도 대역이 감소했습니다.' : '명료도 변화는 작습니다.',
    ]
    if (Math.abs(peak) >= 8) verdict.push('두 측정의 입력 레벨 차이가 커서 같은 조건 재측정을 권합니다.')
    return { low, clarity, peak, score, verdict }
  }, [before, after])

  function toggleCheck(index: number) {
    setChecks((current) => current.map((checked, currentIndex) => currentIndex === index ? !checked : checked))
  }

  function save(slot: 'before' | 'after') {
    if (!result) return
    const snapshot = snapshotFrom(result)
    if (slot === 'before') setBefore(snapshot)
    else setAfter(snapshot)
  }

  return (
    <section id="measurement-confidence" className="panel confidence-panel">
      <div className="panel-heading compact">
        <div><span className="step">08</span><h2>측정 신뢰도 · 전후 비교</h2></div>
        <span className={`confidence-badge ${quality.level === '낮음' ? 'low' : ''}`}>
          {result ? `${quality.score}% · ${quality.level}` : '측정 대기'}
        </span>
      </div>

      <div className="prep-checks">
        {[
          '객석 청취 위치에 휴대폰을 둠',
          '같은 거리·같은 문장으로 측정',
          '한 번에 EQ 한 항목만 변경',
        ].map((label, index) => (
          <label key={label}>
            <input
              type="checkbox"
              checked={checks[index]}
              onChange={() => toggleCheck(index)}
            />
            {label}
          </label>
        ))}
      </div>

      {result ? (
        <div className="confidence-items">{quality.items.map((item) => <span key={item}>{item}</span>)}</div>
      ) : (
        <p className="confidence-empty">측정을 완료하면 시간·RMS·Peak를 바탕으로 참고용 신뢰도를 계산합니다.</p>
      )}

      {result && quality.score < 65 && (
        <p className="confidence-warning">현재 측정은 참고용입니다. EQ 조정보다 위치·거리·입력 레벨을 먼저 맞춘 뒤 재측정하세요.</p>
      )}

      <div className="ab-actions">
        <SingleTapButton disabled={!result} onActivate={() => save('before')}>측정 A · 조정 전 저장</SingleTapButton>
        <SingleTapButton disabled={!result} onActivate={() => save('after')}>측정 B · 조정 후 저장</SingleTapButton>
        <SingleTapButton onActivate={() => { setBefore(null); setAfter(null) }}>비교 초기화</SingleTapButton>
      </div>

      <div className="saved-slots">
        <span>A {before ? `${before.savedAt} · ${before.score}점` : '미저장'}</span>
        <span>B {after ? `${after.savedAt} · ${after.score}점` : '미저장'}</span>
      </div>

      {comparison ? (
        <>
          <div className="ab-grid">
            <div><span>250Hz 상대 변화</span><strong>{signed(comparison.low)}%</strong></div>
            <div><span>4kHz 명료도 변화</span><strong>{signed(comparison.clarity)}%</strong></div>
            <div><span>Peak 변화</span><strong>{signed(comparison.peak)}%</strong></div>
            <div><span>분석 점수 변화</span><strong>{signed(comparison.score)}점</strong></div>
          </div>
          <div className="ab-verdict">{comparison.verdict.map((item) => <p key={item}>{item}</p>)}</div>
        </>
      ) : (
        <p className="confidence-empty">측정 A와 측정 B를 저장하면 변화가 표시됩니다.</p>
      )}

      <p className="confidence-note">휴대폰 측정은 절대 SPL·하울링 여유·정확한 STI를 확정하지 않습니다. 같은 위치에서의 상대 비교에 사용하세요.</p>
    </section>
  )
}
