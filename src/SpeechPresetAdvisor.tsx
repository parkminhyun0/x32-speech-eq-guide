import { useMemo, useState } from 'react'
import SingleTapButton from './SingleTapButton'
import type { AnalysisResult, EqBand } from './types'

type PresetKey = 'natural' | 'warm' | 'clear'

type SpeechPresetAdvisorProps = {
  result: AnalysisResult | null
  eqBands: EqBand[]
}

const presets: Record<PresetKey, {
  name: string
  description: string
  lowCut: string
  goals: string[]
}> = {
  natural: {
    name: '자연스러운 설교',
    description: '과도한 보정 없이 원래 음색을 살리고, 먹먹함과 자극만 최소화합니다.',
    lowCut: '70–90Hz',
    goals: ['저역은 정돈', '250–400Hz는 중립', '2–4kHz는 소폭 유지'],
  },
  warm: {
    name: '따뜻한 설교',
    description: '목소리의 두께와 안정감을 조금 더 허용하되, 저중역이 답답해지지 않게 관리합니다.',
    lowCut: '65–85Hz',
    goals: ['120–200Hz 여유', '250–400Hz 과다 주의', '고역은 부드럽게'],
  },
  clear: {
    name: '명료한 설교',
    description: '자음과 단어 전달력을 우선하고, 장시간 청취 피로가 생기지 않도록 작은 폭으로 조정합니다.',
    lowCut: '80–100Hz',
    goals: ['저중역 절제', '1.5–3.5kHz 확보', '5kHz 이상 과다 금지'],
  },
}

function buildSuggestions(selected: PresetKey, result: AnalysisResult | null, bands: EqBand[]) {
  if (!result) return ['먼저 15–30초 측정을 완료하면 선택한 프리셋과 실측 결과를 비교합니다.']

  const resultText = [...result.findings, ...result.recommendations].join(' ')
  const lowMid = bands.find((band) => band.name.includes('Low Mid'))
  const highMid = bands.find((band) => band.name.includes('High Mid'))
  const high = bands.find((band) => band.name === 'High')
  const suggestions: string[] = []

  if (/저중역|먹먹|160~350Hz/.test(resultText)) {
    suggestions.push(`Low Mid ${lowMid?.frequency || 250}Hz를 현재 ${lowMid?.gain || 0}dB에서 1dB씩 낮춰 비교하세요.`)
  }
  if (/명료도.*부족|2\.8~5\.6kHz/.test(resultText)) {
    suggestions.push(`High Mid ${highMid?.frequency || 3200}Hz의 컷을 먼저 0dB 쪽으로 복원하고, 필요하면 +1dB만 시험하세요.`)
  }
  if (/고역.*강|치찰|5\.6~10kHz/.test(resultText)) {
    suggestions.push(`High ${high?.frequency || 8000}Hz를 현재 ${high?.gain || 0}dB에서 1dB 낮춰 청취 피로를 비교하세요.`)
  }
  if (/클리핑|피크가 높/.test(resultText)) suggestions.unshift('EQ보다 먼저 X32 입력 게인을 2dB 낮추고 같은 거리에서 재측정하세요.')
  if (/입력 레벨이 낮|평균 음량이 낮/.test(resultText)) suggestions.unshift('EQ보다 먼저 마이크 거리와 입력 게인을 확인하세요.')

  if (selected === 'warm' && !/저중역|먹먹/.test(resultText)) suggestions.push('따뜻함이 부족할 때만 120–180Hz를 +0.5~+1dB 범위에서 시험하세요.')
  if (selected === 'clear' && !/고역.*강|치찰/.test(resultText)) suggestions.push('명료도가 필요하면 2–3.2kHz를 +0.5~+1dB 범위에서 시험하세요.')
  if (selected === 'natural') suggestions.push('자연스러운 프리셋은 모든 밴드를 0dB에 가깝게 두고 문제 대역만 작게 조정합니다.')

  return suggestions.length ? suggestions.slice(0, 4) : ['현재 실측과 입력한 EQ 사이에 큰 충돌이 없습니다. 한 밴드씩만 변경해 재측정하세요.']
}

export default function SpeechPresetAdvisor({ result, eqBands }: SpeechPresetAdvisorProps) {
  const [selected, setSelected] = useState<PresetKey>('natural')
  const preset = presets[selected]
  const suggestions = useMemo(() => buildSuggestions(selected, result, eqBands), [selected, result, eqBands])

  return (
    <section id="speech-preset-advisor" className="panel speech-preset-panel">
      <div className="panel-heading compact">
        <div><span className="step">07</span><h2>설교 음색 프리셋</h2></div>
        <span className="preset-status">비교 기준</span>
      </div>
      <p className="preset-intro">프리셋은 자동 적용값이 아니라, 실측 결과를 해석하기 위한 목표 방향입니다.</p>
      <div className="preset-tabs" role="tablist" aria-label="설교 음색 프리셋">
        {(Object.entries(presets) as [PresetKey, typeof presets[PresetKey]][]).map(([key, value]) => (
          <SingleTapButton
            key={key}
            role="tab"
            aria-selected={key === selected}
            className={key === selected ? 'active' : ''}
            onActivate={() => setSelected(key)}
          >
            {value.name}
          </SingleTapButton>
        ))}
      </div>
      <div className="preset-summary">
        <div><span>선택 기준</span><strong>{preset.name}</strong><p>{preset.description}</p></div>
        <div className="preset-lowcut"><span>Low Cut 시작 범위</span><strong>{preset.lowCut}</strong></div>
      </div>
      <div className="preset-goals">{preset.goals.map((goal) => <span key={goal}>{goal}</span>)}</div>
      <div className="preset-suggestions">
        <h3>현재 측정·X32 설정에 대한 조정 후보</h3>
        {suggestions.map((item, index) => <div key={`${item}-${index}`}><span>{index + 1}</span><p>{item}</p></div>)}
      </div>
      <p className="preset-warning">한 번에 한 항목만 0.5–1dB씩 변경하고, 같은 문장으로 재측정하세요. 실제 객석 청취가 최종 기준입니다.</p>
    </section>
  )
}
