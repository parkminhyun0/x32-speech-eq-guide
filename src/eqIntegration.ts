import type { EqProfile } from './sourceProfiles'
import type { AnalysisResult, EqBand, IntegratedEqSuggestion, LiveAnalysisEvidence } from './types'

const RTA_FREQUENCIES = [80, 125, 250, 500, 1000, 2000, 4000, 8000]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundToQuarter(value: number) {
  return Math.round(value * 4) / 4
}

function nearestRtaIndex(frequency: number) {
  return RTA_FREQUENCIES.reduce((bestIndex, candidate, index) => {
    const bestDistance = Math.abs(Math.log2(Math.max(20, frequency) / RTA_FREQUENCIES[bestIndex]))
    const candidateDistance = Math.abs(Math.log2(Math.max(20, frequency) / candidate))
    return candidateDistance < bestDistance ? index : bestIndex
  }, 0)
}

function combineEvidence(result: AnalysisResult | null, live: LiveAnalysisEvidence | null) {
  if (result && live) {
    return RTA_FREQUENCIES.map((_, index) => Math.round(
      (result.averageBands[index] ?? 0) * 0.65 + (live.bands[index] ?? 0) * 0.35,
    ))
  }
  if (result) return [...result.averageBands]
  if (live) return [...live.bands]
  return []
}

function formatBand(frequency: number) {
  return frequency >= 1000 ? `${frequency / 1000}kHz` : `${frequency}Hz`
}

export function buildIntegratedEqSuggestion({
  result,
  live,
  profile,
  currentBands,
  lowCutEnabled,
  lowCutFrequency,
  ocrApplied,
}: {
  result: AnalysisResult | null
  live: LiveAnalysisEvidence | null
  profile: EqProfile
  currentBands: EqBand[]
  lowCutEnabled: boolean
  lowCutFrequency: number
  ocrApplied: boolean
}): IntegratedEqSuggestion | null {
  const combinedBands = combineEvidence(result, live)
  if (!combinedBands.length) return null

  const evidenceLabels: string[] = []
  let confidence = 15
  if (result) {
    evidenceLabels.push(`회중석 ${result.duration.toFixed(0)}초 측정`)
    confidence += result.duration >= 20 ? 38 : 28
  }
  if (live) {
    evidenceLabels.push(`Live ${live.mode}`)
    confidence += live.mode.includes('평균') ? 26 : 18
    if (live.frameDataUrl) {
      evidenceLabels.push('아이패드 X32 화면 캡처')
      confidence += 8
    }
  }
  if (ocrApplied) {
    evidenceLabels.push('OCR 현재 X32 값')
    confidence += 13
  } else {
    evidenceLabels.push('현재 수동·프로필 X32 값')
  }

  const maxPeak = Math.max(result?.maxPeak ?? 0, live?.peak ?? 0)
  const blockedReason = maxPeak >= 92
    ? '클리핑 위험이 감지되어 EQ 후보 자동 반영을 잠갔습니다. X32 Preamp Gain과 신호 경로를 먼저 낮추고 다시 측정하세요.'
    : undefined

  const notes: string[] = []
  const deviations = combinedBands
    .map((value, index) => ({
      index,
      value,
      difference: value - profile.targetCenter[index],
    }))
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))

  deviations.slice(0, 3).forEach(({ index, difference }) => {
    if (Math.abs(difference) < 7) return
    notes.push(`${formatBand(RTA_FREQUENCIES[index])}가 ${difference > 0 ? '기준보다 강함' : '기준보다 약함'} · 한 밴드씩 소폭 ${difference > 0 ? 'Cut' : 'Boost'} 후보`)
  })
  if (!notes.length) notes.push('프로필 비교 중심과 큰 편차가 없습니다. 현재값을 유지하고 다른 위치에서 A/B 확인하세요.')
  if (live?.frameDataUrl && !ocrApplied) notes.push('Live 캡처 화면이 OCR 입력으로 연결됐습니다. 숫자 읽기 후 현재 X32 값과 다시 통합하세요.')

  const candidateBands = currentBands.map((band) => {
    const rtaIndex = nearestRtaIndex(band.frequency)
    const deviation = combinedBands[rtaIndex] - profile.targetCenter[rtaIndex]
    const adjustment = Math.abs(deviation) < 7
      ? 0
      : clamp(roundToQuarter(-deviation / 12), -1.5, 1.5)

    return {
      ...band,
      gain: clamp(roundToQuarter(band.gain + adjustment), -15, 15),
    }
  })

  return {
    candidateBands,
    candidateLowCutEnabled: lowCutEnabled || profile.lowCutEnabled,
    candidateLowCutFrequency: lowCutEnabled ? lowCutFrequency : profile.lowCutFrequency,
    combinedBands,
    confidence: Math.min(95, confidence),
    evidenceLabels,
    notes,
    blockedReason,
  }
}
