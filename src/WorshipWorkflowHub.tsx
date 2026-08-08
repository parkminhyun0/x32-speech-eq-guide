import { useMemo, useState } from 'react'
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Gauge,
  Headphones,
  Home,
  Mic2,
  Radio,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Volume2,
} from 'lucide-react'
import SingleTapButton from './SingleTapButton'
import './worship-workflow.css'

type Workspace = 'field' | 'broadcast'
type Experience = 'beginner' | 'advanced'
type BroadcastRoute = 'dedicated-bus' | 'matrix' | 'usb-card'

type GuideStep = {
  title: string
  purpose: string
  action: string
  verify: string
  x32: string
}

const FIELD_STEPS: GuideStep[] = [
  {
    title: '입력과 Gain 기준 만들기',
    purpose: 'EQ 전에 깨끗하고 충분한 원 신호를 확보합니다.',
    action: '화자가 실제 예배 음량으로 말할 때 입력 미터가 안정적으로 움직이고 빨간 Peak가 반복되지 않도록 Preamp Gain을 조정합니다.',
    verify: '작은 말은 묻히지 않고 큰 말에서도 클리핑 표시가 반복되지 않아야 합니다.',
    x32: '채널 SELECT → CONFIG/PREAMP → Gain · +48V 조건 확인',
  },
  {
    title: '채널 Tone EQ',
    purpose: '설교자·보컬·악기 자체의 먹먹함과 자극음을 정리합니다.',
    action: 'Low Cut을 먼저 확인하고, 한 번에 한 밴드만 작게 Cut 또는 Boost한 뒤 원음과 비교합니다.',
    verify: '소리가 얇아지거나 멀어지지 않으면서 말과 악기의 핵심이 더 또렷해야 합니다.',
    x32: '채널 SELECT → EQ VIEW → Low Cut → Freq → Gain → Q → Mode',
  },
  {
    title: 'Dynamics와 레벨 안정화',
    purpose: '작은 말과 큰 말의 차이를 완화하되 생동감을 보존합니다.',
    action: '컴프레서는 과도한 압축보다 큰 Peak를 부드럽게 제어하는 출발점으로 사용하고, Makeup Gain으로 무조건 크게 만들지 않습니다.',
    verify: '큰 발음에서만 Gain Reduction이 움직이고 숨소리·잔향이 과도하게 올라오지 않아야 합니다.',
    x32: '채널 SELECT → DYNAMICS VIEW → Threshold · Ratio · Attack · Release',
  },
  {
    title: '모니터와 하울링 분리',
    purpose: '채널 음색을 망가뜨리지 않고 무대 피드백 여유를 확보합니다.',
    action: '모니터 스피커 방향·마이크 지향·Send 레벨을 먼저 확인하고, 반복되는 피드백은 해당 Monitor Bus에서 좁게 다룹니다.',
    verify: '채널 EQ를 크게 훼손하지 않고 필요한 모니터 레벨을 유지할 수 있어야 합니다.',
    x32: 'SENDS ON FADER → 대상 Bus → Bus EQ/RTA · GEQ 확인',
  },
  {
    title: 'Main LR와 객석 균형',
    purpose: '한 자리만이 아니라 회중석 전체에서 균형을 확인합니다.',
    action: '중앙·좌·우·후면에서 같은 문장과 음악을 듣고, 공간 문제는 Main/System EQ에서 보수적으로 보정합니다.',
    verify: '앞좌석은 자극적이지 않고 후면은 말이 묻히지 않아야 합니다.',
    x32: 'Main LR SELECT → EQ/RTA → 여러 청취 위치 A/B 확인',
  },
]

const BROADCAST_STEPS: GuideStep[] = [
  {
    title: '방송 전용 Stereo Mix 만들기',
    purpose: '객석용 Main LR과 온라인 시청자용 믹스를 분리합니다.',
    action: '설교·찬양·반주·영상 소스를 방송 전용 Stereo Bus 또는 Matrix로 모으고 인코더에는 이 경로만 전달합니다.',
    verify: '객석 Fader를 바꿔도 방송 음량이 의도치 않게 크게 흔들리지 않아야 합니다.',
    x32: 'Stereo-linked Mix Bus 또는 Matrix → Routing/Card/Out 연결',
  },
  {
    title: '말소리를 기준점으로 고정',
    purpose: '휴대폰과 TV에서도 설교가 가장 먼저 이해되게 합니다.',
    action: '설교 마이크를 먼저 단독으로 맞춘 뒤 찬양·반주·공간 마이크를 그 아래에 쌓습니다. 말하는 동안 음악이 자음을 가리지 않는지 확인합니다.',
    verify: '작은 휴대폰 스피커에서도 문장이 끊김 없이 이해되어야 합니다.',
    x32: 'Broadcast Bus Sends → Speech anchor → Music/Ambience 상대 균형',
  },
  {
    title: '공간감은 별도 Ambience로 조절',
    purpose: '현장감은 살리되 잔향이 설교를 덮지 않게 합니다.',
    action: '회중·공간 마이크는 방송 믹스에만 필요한 만큼 추가하고, 설교 중에는 낮게, 찬양·박수 때는 자연스럽게 들리도록 조정합니다.',
    verify: '무음 구간의 HVAC·관객 잡음이 과도하게 올라오지 않아야 합니다.',
    x32: 'Ambience 채널 → Broadcast Bus 전용 Send · HPF · Gate 주의',
  },
  {
    title: '방송 Dynamics와 안전 Limiter',
    purpose: '시청자가 볼륨을 계속 조절하지 않도록 레벨을 안정화합니다.',
    action: 'Bus Compressor는 완만하게 사용하고 Limiter는 사고 방지용 최종 안전장치로 둡니다. 지속적인 강한 압축은 피합니다.',
    verify: '큰 찬양과 설교 Peak가 깨지지 않고 조용한 구간의 노이즈가 튀어나오지 않아야 합니다.',
    x32: 'Broadcast Bus Dynamics 또는 FX Insert → Encoder 입력 미터 확인',
  },
  {
    title: '모노 호환과 기기별 재생 확인',
    purpose: '스마트폰 한쪽 스피커에서도 소리가 사라지지 않게 합니다.',
    action: '방송 믹스를 Mono로 접어 들어보고, 이어폰·휴대폰·TV에서 각각 테스트합니다.',
    verify: '센터 보컬과 설교가 Mono에서 약해지거나 위상이 흔들리지 않아야 합니다.',
    x32: 'Stereo Bus L/R 위상·Pan 확인 → Encoder/모니터 Mono 체크',
  },
  {
    title: 'YouTube 인코더 최종 점검',
    purpose: '좋은 믹스가 전송 단계에서 손상되지 않도록 합니다.',
    action: '실제 예배와 비슷한 음성과 음악으로 비공개 테스트를 진행하고 YouTube Live Control Room의 스트림 상태를 확인합니다.',
    verify: '오디오 1개 스트림, Stereo 2채널, 클리핑 없음, 장시간 동기화 이상 없음이 확인되어야 합니다.',
    x32: 'X32 Output → 오디오 인터페이스/USB → Encoder → YouTube 비공개 테스트',
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
    summary: '설정은 빠르지만 객석 믹스 변화가 방송에도 많이 반영됩니다.',
    steps: ['Main LR를 Stereo Matrix로 전달', 'Matrix에서 방송 최종 EQ·Dynamics 보정', 'Matrix L/R를 인코더 출력으로 Routing', '현장 Fader 변경이 방송에 미치는 영향 확인'],
    caution: '현장과 방송의 요구가 크게 다르면 전용 Mix Bus 방식으로 전환하세요.',
  },
  'usb-card': {
    label: 'USB/Card 직접 송출',
    summary: '선택한 Bus 또는 Matrix를 컴퓨터·인코더로 직접 전달합니다.',
    steps: ['방송용 Bus/Matrix를 먼저 완성', 'Routing → Card/USB Out에 L/R 지정', '컴퓨터에서 정확한 X32 입력 채널 선택', 'OBS·인코더에서 Stereo·Sample Rate·Peak 확인'],
    caution: 'Main LR를 무심코 직접 보내면 객석 조정이 방송에 그대로 전달될 수 있습니다.',
  },
}

const CHECKLIST = [
  '방송 전용 Stereo 신호 경로를 확인했다.',
  '설교 마이크가 작은 휴대폰 스피커에서도 또렷하다.',
  '찬양·반주가 설교와 멘트를 가리지 않는다.',
  '공간 마이크의 잔향과 배경 노이즈가 과하지 않다.',
  'Mono로 접어도 보컬과 설교가 약해지지 않는다.',
  'Encoder 입력 Peak가 클리핑하지 않는다.',
  '실제 예배와 비슷한 비공개 송출 테스트를 완료했다.',
  'YouTube Live Control Room의 스트림 상태를 확인했다.',
]

const QUICK_LINKS = [
  { id: 'workflow-hub', label: '시작', Icon: Home },
  { id: 'source-workspace', label: '소스', Icon: Mic2 },
  { id: 'measurement-workspace', label: '측정', Icon: Gauge },
  { id: 'x32-eq-workspace', label: 'X32 EQ', Icon: SlidersHorizontal },
  { id: 'broadcast-workspace', label: '방송', Icon: Radio },
  { id: 'confidence-workspace', label: '검증', Icon: ShieldCheck },
]

export default function WorshipWorkflowHub() {
  const [workspace, setWorkspace] = useState<Workspace>('field')
  const [experience, setExperience] = useState<Experience>('beginner')
  const [route, setRoute] = useState<BroadcastRoute>('dedicated-bus')
  const [checks, setChecks] = useState<Record<number, boolean>>({})

  const completed = useMemo(() => CHECKLIST.filter((_, index) => checks[index]).length, [checks])
  const progress = Math.round((completed / CHECKLIST.length) * 100)
  const guide = workspace === 'field' ? FIELD_STEPS : BROADCAST_STEPS
  const routeInfo = ROUTES[route]

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section className="panel worship-workflow-hub" id="workflow-hub">
      <div className="workflow-heading">
        <div>
          <span className="step">WORSHIP SOUND OS</span>
          <h2>예배 현장과 유튜브 방송을 한 흐름으로 최적화합니다.</h2>
          <p>초보자는 순서대로 따라가고, 전문가는 X32 경로와 파라미터를 직접 확인할 수 있습니다. 앱은 실제 믹서를 자동 변경하지 않습니다.</p>
        </div>
        <div className="experience-switch" role="group" aria-label="사용 숙련도">
          <SingleTapButton className={experience === 'beginner' ? 'is-active' : ''} onActivate={() => setExperience('beginner')}><BookOpen size={18} />초보자</SingleTapButton>
          <SingleTapButton className={experience === 'advanced' ? 'is-active' : ''} onActivate={() => setExperience('advanced')}><SlidersHorizontal size={18} />전문가</SingleTapButton>
        </div>
      </div>

      <nav className="workflow-quick-nav" aria-label="기능 빠른 전환">
        {QUICK_LINKS.map(({ id, label, Icon }) => (
          <SingleTapButton key={id} onActivate={() => scrollTo(id)}>
            <Icon size={20} />
            <span>{label}</span>
          </SingleTapButton>
        ))}
      </nav>

      <div className="workspace-switch" role="group" aria-label="운영 목적 선택">
        <SingleTapButton className={workspace === 'field' ? 'is-active' : ''} onActivate={() => setWorkspace('field')}>
          <Volume2 size={21} /><span><strong>예배 현장 소리</strong><small>설교·보컬·악기·모니터·Main LR</small></span>
        </SingleTapButton>
        <SingleTapButton className={workspace === 'broadcast' ? 'is-active' : ''} onActivate={() => setWorkspace('broadcast')}>
          <Radio size={21} /><span><strong>유튜브 방송 믹스</strong><small>전용 Bus·말소리·Dynamics·Encoder</small></span>
        </SingleTapButton>
      </div>

      <div className="workflow-content" id={workspace === 'broadcast' ? 'broadcast-workspace' : undefined}>
        <div className="workflow-summary">
          <div><Route size={22} /><span><strong>{workspace === 'field' ? '현장 기준 흐름' : '방송 기준 흐름'}</strong><small>{workspace === 'field' ? 'Source → Gain → Channel EQ → Monitor → Main LR' : 'Source → Broadcast Bus/Matrix → Dynamics → Encoder → YouTube'}</small></span></div>
          <p>{experience === 'beginner' ? '각 단계의 완료 조건을 확인한 뒤 다음 단계로 이동하세요.' : '각 단계의 X32 메뉴 경로와 출력 지점을 함께 대조하세요.'}</p>
        </div>

        {workspace === 'broadcast' && (
          <div className="broadcast-route-builder">
            <div className="route-builder-heading"><Headphones size={21} /><div><strong>방송 신호 경로 선택</strong><span>교회 시스템에 맞는 방식을 선택하면 작업 순서가 바뀝니다.</span></div></div>
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
              <p><ShieldCheck size={17} />{routeInfo.caution}</p>
            </div>
          </div>
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
                  {experience === 'advanced' && <div><dt>X32 경로</dt><dd>{item.x32}</dd></div>}
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
              <p><strong>YouTube Live 전송 확인</strong> Stereo는 AAC 또는 MP3, 44.1kHz, 128kbps가 공식 권장값입니다. 업로드 영상은 48kHz Stereo AAC-LC·Opus를 권장하므로, 라이브와 녹화 업로드를 구분해 인코더를 설정하세요.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
