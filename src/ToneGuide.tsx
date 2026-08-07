import { useState } from 'react'
import { ChevronDown, ChevronUp, Ear, Info, Waves } from 'lucide-react'
import './tone-guide.css'

type ToneBand = {
  range: string
  title: string
  role: string
  positive: string
  tooMuch: string
  tooLittle: string
  direction: string
}

const toneBands: ToneBand[] = [
  { range: '50–80Hz', title: '초저역·진동', role: '발걸음, 스탠드 진동, 파열음이 모이는 영역', positive: '직접적인 음색 기여는 적음', tooMuch: '웅웅거림과 불필요한 진동', tooLittle: '대부분 문제 없음', direction: '설교에서는 Low Cut으로 정리하는 경우가 많습니다.' },
  { range: '80–120Hz', title: '무게감', role: '목소리의 바닥과 안정감', positive: '든든하고 차분한 인상', tooMuch: '붕붕거리고 말이 느려 보임', tooLittle: '가볍고 얇은 목소리', direction: '남성 음성은 남기되 과도한 부스트는 피합니다.' },
  { range: '120–180Hz', title: '두께·온기', role: '가슴 울림과 음성의 두께', positive: '따뜻하고 포근한 톤', tooMuch: '답답하고 뭉친 느낌', tooLittle: '힘이 없고 메마른 느낌', direction: '0dB에서 시작하고 실제 음성에 따라 소폭 조정합니다.' },
  { range: '180–250Hz', title: '따뜻함의 경계', role: '온기와 먹먹함이 갈리는 영역', positive: '부드럽고 편안한 음색', tooMuch: '먹먹함과 공간 울림', tooLittle: '빈약하고 차가운 느낌', direction: '문제가 확인될 때만 -1~-2dB부터 시험합니다.' },
  { range: '250–400Hz', title: '먹먹함·박스톤', role: '작은 공간과 상자 같은 울림이 드러나는 영역', positive: '적당하면 음성의 몸통 유지', tooMuch: '상자 안에서 말하는 듯함', tooLittle: '목소리 중심이 사라짐', direction: '설교 음성에서 가장 자주 점검하는 감쇠 후보입니다.' },
  { range: '400–700Hz', title: '비음·중심', role: '말소리의 몸통과 비음', positive: '존재감과 밀도', tooMuch: '코맹맹이·전화기 같은 느낌', tooLittle: '멀고 비어 보이는 음성', direction: 'Q를 좁게 잡아 문제 주파수만 확인합니다.' },
  { range: '700Hz–1.2kHz', title: '말소리 중심축', role: '모음과 단어의 중심', positive: '앞으로 나오는 또렷함', tooMuch: '답답하고 코에 걸린 느낌', tooLittle: '말이 뒤로 물러남', direction: '큰 부스트보다 평탄하게 유지하는 편이 안전합니다.' },
  { range: '1.2–2kHz', title: '단어 인지', role: '말의 윤곽과 이해도', positive: '문장이 잘 들리고 집중이 쉬움', tooMuch: '딱딱하고 공격적인 인상', tooLittle: '말이 뭉개지고 거리감 발생', direction: '컷되어 있다면 먼저 0dB 쪽으로 복원합니다.' },
  { range: '2–3.2kHz', title: '명료도·자음', role: '자음과 발음 전달력의 핵심', positive: '또렷하고 멀리 전달됨', tooMuch: '귀가 아프고 피로함', tooLittle: '발음이 흐리고 설교가 묻힘', direction: '필요하면 +1~+2dB 정도의 작은 보강부터 시작합니다.' },
  { range: '3.2–5kHz', title: '선명도·피로감', role: '음성의 선명함과 존재감', positive: '깨끗하고 가까운 느낌', tooMuch: '쏘고 날카로운 음색', tooLittle: '탁하고 답답함', direction: '청중 피로감이 생기기 쉬워 과한 부스트를 피합니다.' },
  { range: '5–8kHz', title: '치찰음', role: 'ㅅ·ㅆ·ㅈ 계열 자음과 숨소리', positive: '맑고 깨끗한 느낌', tooMuch: '치찰음과 귀 따가움', tooLittle: '둔하고 막힌 느낌', direction: '치찰음이 확인될 때만 -1~-3dB를 시험합니다.' },
  { range: '8–12kHz', title: '공기감', role: '개방감과 섬세한 숨결', positive: '시원하고 열린 음색', tooMuch: '히스 노이즈와 피로감', tooLittle: '조금 답답하지만 말 전달에는 큰 문제 없음', direction: '설교에서는 장식적 영역이므로 과도한 부스트를 피합니다.' },
]

export default function ToneGuide() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section className="panel tone-guide-panel">
      <div className="tone-guide-heading">
        <div>
          <span className="step">04</span>
          <h2>설교 음색 가이드</h2>
          <p>각 대역을 눌러 음색의 역할과 올리거나 내렸을 때의 방향을 확인하세요.</p>
        </div>
        <Info size={22} />
      </div>

      <div className="tone-band-list">
        {toneBands.map((band, index) => {
          const isOpen = openIndex === index
          return (
            <article className={`tone-band-card ${isOpen ? 'is-open' : ''}`} key={band.range}>
              <button className="tone-band-trigger" onClick={() => setOpenIndex(isOpen ? null : index)} aria-expanded={isOpen}>
                <span className="tone-range">{band.range}</span>
                <span className="tone-title">{band.title}</span>
                {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
              {isOpen && (
                <div className="tone-band-detail">
                  <div><Waves size={18} /><p><strong>역할</strong>{band.role}</p></div>
                  <div><Ear size={18} /><p><strong>적당할 때</strong>{band.positive}</p></div>
                  <div className="tone-warning"><p><strong>너무 많으면</strong>{band.tooMuch}</p><p><strong>너무 적으면</strong>{band.tooLittle}</p></div>
                  <div className="tone-direction"><strong>조정 방향</strong><span>{band.direction}</span></div>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
