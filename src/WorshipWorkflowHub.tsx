import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Circle,
  Gauge,
  Headphones,
  Home,
  Layers3,
  Mic2,
  Radio,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Volume2,
} from 'lucide-react'
import SingleTapButton from './SingleTapButton'
import './worship-workflow.css'
import './worship-workflow-extended.css'

type Workspace = 'field' | 'broadcast'
type GuideDepth = 'guided' | 'deep'
type BroadcastRoute = 'dedicated-bus' | 'matrix' | 'usb-card'

type GuideStep = {
  title: string
  purpose: string
  action: string
  verify: string
  x32: string
  deep: string
}

type QuickLink = {
  id: string
  label: string
  Icon: typeof Home
  workspace?: Workspace
}

const FIELD_STEPS: GuideStep[] = [
  {
    title: '입력과 Gain 기준 만들기',
    purpose: 'EQ 전에 깨끗하고 충분한 원 신호를 확보합니다.',
    action: '화자와 연주자가 실제 예배 음량을 낼 때 입력 미터가 안정적으로 움직이고 빨간 Peak가 반복되지 않도록 Preamp Gain을 조정합니다.',
    verify: '작은 소리는 묻히지 않고 큰 소리에서도 클리핑 표시가 반복되지 않아야 합니다.',
    x32: '채널 SELECT → CONFIG/PREAMP → Gain · +48V 조건 · Source 확인',
    deep: 'Gain이 부족한 상태에서 EQ나 Compressor로 보상하면 노이즈와 잔향도 함께 커집니다. 입력 Source와 물리 연결을 먼저 확정합니다.',
  },
  {
    title: '채널 Tone EQ',
    purpose: '설교자·보컬·악기 자체의 먹먹함과 자극음을 정리합니다.',
    action: 'Low Cut을 먼저 확인하고 한 번에 한 밴드만 소폭 Cut 또는 Boost한 뒤 원음과 비교합니다.',
    verify: '소리가 얇아지거나 멀어지지 않으면서 말과 악기의 핵심이 더 또렷해야 합니다.',
    x32: '채널 SELECT → EQ VIEW → Low Cut → Freq → Gain → Q → Mode',
    deep: '채널 EQ는 소스의 음색을 다루고, 객석 또는 무대 공간의 반복 공진은 Main LR나 해당 Monitor Bus에서 분리해 처리합니다.',
  },
  {
    title: 'Dynamics와 레벨 안정화',
    purpose: '작은 말과 큰 말의 차이를 완화하되 생동감을 보존합니다.',
    action: 'Compressor는 큰 Peak를 부드럽게 제어하는 출발점으로 사용하고 Makeup Gain으로 무조건 크게 만들지 않습니다.',
    verify: '큰 발음이나 강한 연주에서만 Gain Reduction이 움직이고 숨소리·잔향이 과도하게 올라오지 않아야 합니다.',
    x32: '채널 SELECT → DYNAMICS VIEW → Threshold · Ratio · Attack · Release',
    deep: 'Attack이 너무 빠르면 자음과 악기 어택이 사라지고, Release가 너무 길면 다음 문장이나 음표까지 눌립니다. GR 움직임과 청감을 함께 확인합니다.',
  },
  {
    title: '모니터와 하울링 분리',
    purpose: '채널 음색을 망가뜨리지 않고 무대 피드백 여유를 확보합니다.',
    action: '모니터 스피커 방향·마이크 지향·Send 레벨을 먼저 확인하고 반복되는 피드백은 해당 Monitor Bus에서 좁게 다룹니다.',
    verify: '채널 EQ를 크게 훼손하지 않고 필요한 모니터 레벨을 유지할 수 있어야 합니다.',
    x32: 'SENDS ON FADER → 대상 Bus → Bus EQ/RTA · GEQ 확인',
    deep: '동일 채널이 여러 Monitor Bus로 갈 수 있으므로 어느 출력에서 피드백이 생기는지 먼저 식별합니다. 원인을 모른 채 Main LR를 깎지 않습니다.',
  },
  {
    title: 'Main LR와 객석 균형',
    purpose: '한 자리만이 아니라 회중석 전체에서 균형을 확인합니다.',
    action: '중앙·좌·우·후면에서 같은 문장과 음악을 듣고 공간 문제는 Main/System EQ에서 보수적으로 보정합니다.',
    verify: '앞좌석은 자극적이지 않고 후면은 말이 묻히지 않아야 합니다.',
    x32: 'Main LR SELECT → EQ/RTA → 중앙·좌·우·후면 A/B 확인',
    deep: '단일 위치 RTA의 깊은 딥을 Boost로 채우지 않습니다. 위치가 바뀌면 사라지는 딥은 위상·반사 문제일 가능성이 있어 다점 청취가 우선입니다.',
  },
]

const BROADCAST_STEPS: GuideStep[] = [
  {
    title: '방송 전용 Stereo Mix 만들기',
    purpose: '객석용 Main LR과 온라인 시청자용 믹스를 분리합니다.',
    action: '설교·찬양·반주·영상 소스를 방송 전용 Stereo Bus 또는 Matrix로 모으고 인코더에는 이 경로만 전달합니다.',
    verify: '객석 Fader를 바꿔도 방송 음량이 의도치 않게 크게 흔들리지 않아야 합니다.',
    x32: 'Stereo-linked Mix Bus 또는 Matrix → Routing/Card/Out 연결',
    deep: '전용 Bus는 현장과 방송의 상대 밸런스를 독립화하기 좋고, Matrix는 Main LR의 영향을 더 많이 받습니다. 교회 운용 인원과 목적에 맞춰 선택합니다.',
  },
  {
    title: '설교와 진행 음성을 기준점으로 고정',
    purpose: '휴대폰과 TV에서도 말이 가장 먼저 이해되게 합니다.',
    action: '설교 마이크를 먼저 단독으로 맞춘 뒤 찬양·반주·공간 마이크를 그 아래에 쌓습니다. 말하는 동안 음악이 자음을 가리지 않는지 확인합니다.',
    verify: '작은 휴대폰 스피커에서도 문장이 끊김 없이 이해되어야 합니다.',
    x32: 'Broadcast Bus Sends → Speech Anchor → Music/Ambience 상대 균형',
    deep: '방송 믹스의 기준점은 객석의 체감 음량이 아니라 인코더로 들어가는 말소리의 일관성입니다. 설교·사회·기도 마이크 사이의 레벨 차이도 함께 맞춥니다.',
  },
  {
    title: '찬양·악기·재생 소스를 계층화',
    purpose: '음악의 에너지와 가사 전달력을 유지하면서 말소리를 가리지 않게 합니다.',
    action: '보컬을 중심에 두고 리듬·화성·저역 악기를 차례로 쌓으며 영상 재생음과 BGM은 별도 레이어로 확인합니다.',
    verify: '보컬과 인도 멘트가 반주 안에서 사라지지 않고 저역이 휴대폰 재생에서 뭉개지지 않아야 합니다.',
    x32: '채널 Sends → Broadcast Bus → Vocal/Music/Playback 그룹별 Mute·Solo 비교',
    deep: '객석에서는 스피커와 실제 악기 소리가 합쳐지지만 방송은 콘솔 신호만 들립니다. 현장에서 작게 들리는 악기가 방송에서는 과할 수 있으므로 별도 밸런스가 필요합니다.',
  },
  {
    title: '공간감은 Ambience 레이어로 조절',
    purpose: '현장감은 살리되 잔향이 설교를 덮지 않게 합니다.',
    action: '회중·공간 마이크는 방송 믹스에 필요한 만큼만 추가하고 설교 중에는 낮게, 찬양·박수 때는 자연스럽게 들리도록 조정합니다.',
    verify: '무음 구간의 HVAC·관객 잡음이 과도하게 올라오지 않아야 합니다.',
    x32: 'Ambience 채널 → Broadcast Bus 전용 Send · HPF · Gate 주의',
    deep: '서로 떨어진 공간 마이크는 위상과 시간차가 생길 수 있습니다. Mono 전환 때 소리가 약해지면 Pan·극성·배치부터 확인합니다.',
  },
  {
    title: '방송 Dynamics와 최종 안전장치',
    purpose: '시청자가 볼륨을 계속 조절하지 않도록 레벨을 안정화합니다.',
    action: 'Bus Compressor는 완만하게 사용하고 Limiter는 사고 방지용 최종 안전장치로 둡니다. 지속적인 강한 압축은 피합니다.',
    verify: '큰 찬양과 설교 Peak가 깨지지 않고 조용한 구간의 노이즈가 튀어나오지 않아야 합니다.',
    x32: 'Broadcast Bus Dynamics 또는 FX Insert → Encoder 입력 미터 확인',
    deep: '채널 Compressor와 Bus Compressor를 중복으로 과하게 사용하면 펌핑과 잔향 상승이 생깁니다. 각 단계의 Gain Reduction 역할을 분리합니다.',
  },
  {
    title: '모노 호환·기기별 재생·비공개 송출',
    purpose: '스마트폰·이어폰·TV에서 안정적으로 재생되게 합니다.',
    action: '방송 믹스를 Mono로 접어 듣고 이어폰·휴대폰·TV에서 확인한 뒤 실제 예배와 비슷한 비공개 송출 테스트를 진행합니다.',
    verify: '센터 보컬과 설교가 Mono에서 약해지지 않고 클리핑·장시간 동기화 이상이 없어야 합니다.',
    x32: 'Stereo Bus L/R → USB/Interface → Encoder → YouTube Live Control Room',
    deep: '콘솔 미터가 정상이어도 오디오 인터페이스나 인코더 입력에서 다시 클리핑할 수 있습니다. X32 출력과 Encoder 입력 미터를 각각 확인합니다.',
  },
]

const ROUTES: Record<BroadcastRoute, { label: string; summary: string; steps: string[]; caution: string }> = {
  'dedicated-bus': {
    label: '전용 Stereo Mix Bus',
    summary: '현장과 방송을 독립적으로 조절하기 좋은 기본 권장 구조입니다.',
    steps: ['사용하지 않는 Mix Bus 2개를 Stereo Link', '필요 채널을 방송 Bus로 Send', 'Bus EQ·Dynamics를 방송용으로 별도 조정', 'Bus L/R를 Card·Aux Out 또는 인터페이스로 Routing'],
    caution: 'Send Tap 위치와 Fader 연동 방식을 예배 전에 반드시 확인하세요.',
  },
  matrix: {
    label: 'Main LR → Matrix',
    summary: '설정은 빠르지만 객석 믹스 변화가 방송에도 더 많이 반영됩니다.',
    steps: ['Main LR를 Stereo Matrix로 전달', 'Matrix에서 방송 최종 EQ·Dynamics 보정', 'Matrix L/R를 인코더 출력으로 Routing', '현장 Fader 변경이 방송에 미치는 영향 확인'],
    caution: '현장과 방송의 요구가 크게 다르면 전용 Mix Bus 방식으로 전환하세요.',
  },
  'usb-card': {
    label: 'USB/Card 직접 송출',
    summary: '완성한 방송 Bus 또는 Matrix를 컴퓨터·인코더로 직접 전달합니다.',
    steps: ['방송용 Bus/Matrix를 먼저 완성', 'Routing → Card/USB Out에 L/R 지정', '컴퓨터에서 정확한 X32 입력 채널 선택', 'OBS·인코더에서 Stereo·Sample Rate·Peak 확인'],
    caution: 'Main LR를 무심코 직접 보내면 객석 조정이 방송에 그대로 전달될 수 있습니다.',
  },
}

const BROADCAST_LAYERS = [
  { title: 'Speech Anchor', role: '설교·사회·기도', action: '문장 이해도와 레벨 일관성을 먼저 확정', check: '휴대폰 작은 스피커에서도 또렷함' },
  { title: 'Vocal & Music', role: '찬양 보컬·악기', action: '보컬 중심으로 리듬·화성·저역을 계층화', check: '말과 가사가 반주에 가려지지 않음' },
  { title: 'Ambience', role: '회중·공간 마이크', action: '설교에는 낮게, 찬양·박수에는 자연스럽게', check: '잔향·HVAC·배경 소음이 과하지 않음' },
  { title: 'Playback', role: '영상·BGM·원격 소스', action: '방송 Bus 유입과 Stereo·Mono 상태를 별도 확인', check: '갑작스러운 레벨 변화와 위상 손실 없음' },
]

const CHECKLIST = [
  '방송 전용 Stereo 신호 경로를 확인했다.',
  '설교·사회·기도 마이크의 기준 레벨을 맞췄다.',
  '찬양·반주가 설교와 진행 멘트를 가리지 않는다.',
  '공간 마이크의 잔향과 배경 노이즈가 과하지 않다.',
  'Mono로 접어도 보컬과 설교가 약해지지 않는다.',
  'X32 출력과 Encoder 입력 모두 클리핑하지 않는다.',
  '이어폰·휴대폰·TV 재생을 각각 확인했다.',
  '실제 예배와 비슷한 비공개 송출 테스트를 완료했다.',
  'YouTube Live Control Room의 스트림 상태를 확인했다.',
]

const QUICK_LINKS: QuickLink[] = [
  { id: 'workflow-hub', label: '운영', Icon: Home },
  { id: 'source-workspace', label: '소스', Icon: Mic2 },
  { id: 'measurement-workspace', label: '측정', Icon: Gauge },
  { id: 'x32-eq-workspace', label: 'X32 EQ', Icon: SlidersHorizontal },
  { id: 'broadcast-workspace', label: '방송', Icon: Radio, workspace: 'broadcast' },
  { id: 'confidence-workspace', label: '검증', Icon: ShieldCheck },
]

export default function WorshipWorkflowHub() {
  const [workspace, setWorkspace] = useState<Workspace>('field')
  const [depth, setDepth] = useState<GuideDepth>('guided')
  const [route, setRoute] = useState<BroadcastRoute>('dedicated-bus')
  const [checks, setChecks] = useState<Record<number, boolean>>({})

  const completed = useMemo(() => CHECKLIST.filter((_, index) => checks[index]).length, [checks])
  const progress = Math.round((completed / CHECKLIST.length) * 100)
  const guide = workspace === 'field' ? FIELD_STEPS : BROADCAST_STEPS
  const routeInfo = ROUTES[route]

  function scrollTo(link: QuickLink) {
    if (link.workspace) setWorkspace(link.workspace)
    window.requestAnimationFrame(() => {
      window.setTimeout(() => document.getElementById(link.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
    })
  }

  return (
    <section className="panel worship-workflow-hub" id="workflow-hub">
      <div className="workflow-heading">
        <div>
          <span className="step">WORSHIP SOUND OS</span>
          <h2>전문 기능을 그대로 사용하면서 현장과 방송의 소리를 직관적으로 완성합니다.</h2>
          <p>기능을 단순화하거나 숨기지 않습니다. 가이드형은 전문 기능의 목적과 완료 조건을 연결하고, 심화형은 X32 신호 경로와 실패 위험까지 함께 보여줍니다.</p>
        </div>
        <div className="experience-switch" role="group" aria-label="안내 깊이">
          <SingleTapButton className={depth === 'guided' ? 'is-active' : ''} onActivate={() => setDepth('guided')}><BookOpen size={18} />가이드형</SingleTapButton>
          <SingleTapButton className={depth === 'deep' ? 'is-active' : ''} onActivate={() => setDepth('deep')}><SlidersHorizontal size={18} />심화형</SingleTapButton>
        </div>
      </div>

      <div className="workflow-depth-note">
        <Layers3 size={19} />
        <p><strong>모든 기능 유지</strong> 설교자·보컬·악기 프로필, 측정, X32 동일 배열 EQ, OCR, A/B 비교, 신뢰도, Live Monitor를 그대로 사용합니다.</p>
      </div>

      <nav className="workflow-quick-nav" aria-label="기능 빠른 전환">
        {QUICK_LINKS.map((link) => {
          const Icon = link.Icon
          return (
            <SingleTapButton key={link.id} onActivate={() => scrollTo(link)}>
              <Icon size={20} />
              <span>{link.label}</span>
            </SingleTapButton>
          )
        })}
      </nav>

      <div className="workspace-switch" role="group" aria-label="운영 목적 선택">
        <SingleTapButton className={workspace === 'field' ? 'is-active' : ''} onActivate={() => setWorkspace('field')}>
          <Volume2 size={21} /><span><strong>예배 현장 소리</strong><small>설교·보컬·악기·모니터·Main LR</small></span>
        </SingleTapButton>
        <SingleTapButton className={workspace === 'broadcast' ? 'is-active' : ''} onActivate={() => setWorkspace('broadcast')}>
          <Radio size={21} /><span><strong>유튜브 방송 믹스</strong><small>전용 Bus·말소리·음악·공간감·Encoder</small></span>
        </SingleTapButton>
      </div>

      <div className="workflow-content" id="broadcast-workspace">
        <div className="workflow-summary">
          <div><Route size={22} /><span><strong>{workspace === 'field' ? '현장 기준 흐름' : '방송 기준 흐름'}</strong><small>{workspace === 'field' ? 'Source → Gain → Channel EQ → Dynamics → Monitor → Main LR' : 'Source → Broadcast Bus/Matrix → Mix Layers → Dynamics → Encoder → YouTube'}</small></span></div>
          <p>{depth === 'guided' ? '모든 전문 항목을 목적·실행·완료 조건·X32 경로 순서로 확인합니다.' : '기본 순서에 신호 분리 이유와 실패 위험을 추가로 확인합니다.'}</p>
        </div>

        {workspace === 'broadcast' && (
          <>
            <div className="broadcast-route-builder">
              <div className="route-builder-heading"><Headphones size={21} /><div><strong>방송 신호 경로 선택</strong><span>교회 시스템과 운용 인원에 맞는 방식을 선택합니다.</span></div></div>
              <div className="route-options">
                {(Object.keys(ROUTES) as BroadcastRoute[]).map((routeId) => (
                  <SingleTapButton key={routeId} className={route === routeId ? 'is-active' : ''} onActivate={() => setRoute(routeId)}>
                    <strong>{ROUTES[routeId].label}</strong><span>{ROUTES[routeId].summary}</span>
                  </SingleTapButton>
                ))}
              </div>
              <div className="route-result">
                <div><strong>{routeInfo.label}</strong><span>{routeInfo.summary}</span></div>
                <ol>{routeInfo.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                <p><AlertTriangle size={17} />{routeInfo.caution}</p>
              </div>
            </div>

            <div className="broadcast-layer-section">
              <div className="broadcast-layer-heading"><Layers3 size={20} /><div><strong>방송 믹스 4개 레이어</strong><span>한꺼번에 올리지 않고 기준점부터 차례로 쌓습니다.</span></div></div>
              <div className="broadcast-layer-grid">
                {BROADCAST_LAYERS.map((layer, index) => (
                  <article className="broadcast-layer-card" key={layer.title}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <h3>{layer.title}</h3>
                    <p><strong>대상</strong>{layer.role}</p>
                    <p><strong>조정</strong>{layer.action}</p>
                    <p><strong>확인</strong>{layer.check}</p>
                  </article>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="workflow-step-grid">
          {guide.map((item, index) => (
            <article key={item.title} className="workflow-step-card">
              <span className="workflow-step-number">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h3>{item.title}</h3>
                <p className="workflow-purpose">{item.purpose}</p>
                <dl>
                  <div><dt>실행</dt><dd>{item.action}</dd></div>
                  <div><dt>완료 조건</dt><dd>{item.verify}</dd></div>
                  <div><dt>X32 경로</dt><dd>{item.x32}</dd></div>
                  {depth === 'deep' && <div className="deep-detail"><dt>심화</dt><dd>{item.deep}</dd></div>}
                </dl>
              </div>
            </article>
          ))}
        </div>

        {workspace === 'broadcast' && (
          <div className="broadcast-readiness">
            <div className="readiness-heading">
              <div><CheckCircle2 size={22} /><span><strong>방송 준비도</strong><small>{completed} / {CHECKLIST.length} 완료</small></span></div>
              <strong>{progress}%</strong>
            </div>
            <div className="readiness-progress"><span style={{ width: `${progress}%` }} /></div>
            <div className="readiness-list">
              {CHECKLIST.map((item, index) => (
                <label key={item}>
                  <input type="checkbox" checked={Boolean(checks[index])} onChange={(event) => setChecks((current) => ({ ...current, [index]: event.target.checked }))} />
                  {checks[index] ? <CheckCircle2 size={19} /> : <Circle size={19} />}
                  <span>{item}</span>
                </label>
              ))}
            </div>
            <div className="youtube-spec-note">
              <Radio size={20} />
              <p><strong>YouTube 전송 기준 구분</strong> 라이브 Stereo는 AAC 또는 MP3, 44.1kHz, 128kbps가 공식 권장 기준입니다. 녹화 영상 업로드는 48kHz Stereo AAC-LC 또는 Opus 권장 기준을 별도로 확인합니다. 실제 인코더와 YouTube Live Control Room에서 최종 검증하세요.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
